from contextlib import asynccontextmanager
from datetime import datetime
import asyncio

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import Base, SessionLocal, engine
from app.routers import (
    assets,
    attachments,
    auth,
    cashflow,
    dashboard,
    expenses,
    goals,
    income,
    insurance,
    investments,
    kite,
    liabilities,
    notifications,
    plan,
    properties,
    recurring,
)
from app.schema_migrate import ensure_schema
from app.services.kite_sync import KiteSyncError, sync_investments as sync_kite_investments
from app.services.metals import MetalsPriceError, fetch_india_metal_prices, price_for_asset
from app.services.notifications import generate_renewal_notifications
from app.models import Asset, AssetType, KiteConnection, User

scheduler = BackgroundScheduler()


def _scan_renewals():
    db = SessionLocal()
    try:
        generate_renewal_notifications(db)
    finally:
        db.close()


def _auto_kite_sync():
    """Best-effort portfolio refresh for users with an active Kite session."""
    db = SessionLocal()
    try:
        connections = (
            db.query(KiteConnection)
            .filter(KiteConnection.is_active.is_(True), KiteConnection.access_token.isnot(None))
            .all()
        )
        for connection in connections:
            user = db.query(User).filter(User.id == connection.user_id).first()
            if not user:
                continue
            try:
                sync_kite_investments(db, user, connection)
            except KiteSyncError:
                # Access tokens expire daily (~6 AM IST); user must re-login.
                continue
    finally:
        db.close()


def _auto_metals_refresh():
    """Revalue gold/silver holdings from live INR spot prices."""
    try:
        prices = asyncio.run(fetch_india_metal_prices(force=True))
    except MetalsPriceError:
        return

    db = SessionLocal()
    try:
        metals = db.query(Asset).filter(Asset.asset_type.in_([AssetType.gold, AssetType.silver])).all()
        changed = False
        for item in metals:
            if not item.quantity:
                continue
            new_value = price_for_asset(
                metal=item.asset_type.value,
                quantity=item.quantity,
                unit=item.unit,
                purity_karat=getattr(item, "purity_karat", None) or 24,
                prices=prices,
            )
            if abs(float(item.current_value or 0) - new_value) > 0.009:
                item.current_value = new_value
                changed = True
        if changed:
            db.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
    ensure_schema()
    scheduler.add_job(_scan_renewals, "interval", hours=6, id="renewal_scan", replace_existing=True)
    if settings.kite_auto_sync_hours > 0:
        scheduler.add_job(
            _auto_kite_sync,
            "interval",
            hours=settings.kite_auto_sync_hours,
            id="kite_sync",
            replace_existing=True,
        )
    if settings.metals_auto_refresh_hours > 0:
        scheduler.add_job(
            _auto_metals_refresh,
            "interval",
            hours=settings.metals_auto_refresh_hours,
            id="metals_refresh",
            replace_existing=True,
        )
    scheduler.start()
    _scan_renewals()
    yield
    scheduler.shutdown(wait=False)


app = FastAPI(title=settings.app_name, version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins + ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(insurance.router)
app.include_router(investments.router)
app.include_router(kite.router)
app.include_router(properties.router)
app.include_router(assets.router)
app.include_router(liabilities.router)
app.include_router(income.router)
app.include_router(expenses.router)
app.include_router(cashflow.router)
app.include_router(goals.router)
app.include_router(plan.router)
app.include_router(attachments.router)
app.include_router(recurring.router)
app.include_router(notifications.router)
app.include_router(dashboard.router)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": settings.app_name, "time": datetime.utcnow().isoformat()}
