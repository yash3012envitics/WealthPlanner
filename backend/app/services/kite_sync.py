from __future__ import annotations

from datetime import datetime
from typing import Any

from kiteconnect import KiteConnect
from kiteconnect.exceptions import KiteException
from sqlalchemy.orm import Session

from app.models import Investment, InvestmentType, KiteConnection, User
from app.services.coin_sips import apply_recent_mf_orders, upsert_coin_sips
from app.services.investment_upsert import classify_equity_symbol, upsert_investment
from app.services.notifications import generate_renewal_notifications


class KiteSyncError(Exception):
    """Raised when Kite/Coin sync cannot complete."""


def get_connection(db: Session, user: User) -> KiteConnection | None:
    return db.query(KiteConnection).filter(KiteConnection.user_id == user.id).first()


def build_client(connection: KiteConnection) -> KiteConnect:
    if not connection.api_key:
        raise KiteSyncError("Kite API key is not configured")
    kite = KiteConnect(api_key=connection.api_key)
    if connection.access_token:
        kite.set_access_token(connection.access_token)
    return kite


def login_url(connection: KiteConnection) -> str:
    return build_client(connection).login_url()


def exchange_request_token(db: Session, connection: KiteConnection, request_token: str) -> KiteConnection:
    kite = build_client(connection)
    try:
        data = kite.generate_session(request_token, api_secret=connection.api_secret)
    except KiteException as exc:
        raise KiteSyncError(str(exc)) from exc

    connection.access_token = data["access_token"]
    connection.kite_user_id = data.get("user_id")
    connection.kite_user_name = data.get("user_name")
    connection.is_active = True
    connection.last_sync_status = "authenticated"
    connection.last_sync_message = "Kite session created. Run sync to import holdings."
    db.commit()
    db.refresh(connection)
    return connection


def _classify_equity(holding: dict[str, Any]) -> InvestmentType:
    symbol = (holding.get("tradingsymbol") or "").upper()
    instrument = (holding.get("instrument_type") or "").upper()
    if instrument in {"ETF", "EQ"} and ("ETF" in symbol or symbol.endswith("BEES") or "IETF" in symbol):
        return InvestmentType.etf
    return classify_equity_symbol(symbol)


def sync_investments(db: Session, user: User, connection: KiteConnection | None = None) -> dict[str, Any]:
    """Pull equity holdings from Kite and mutual funds from Coin, upsert into investments."""
    connection = connection or get_connection(db, user)
    if not connection:
        raise KiteSyncError("Connect Kite credentials first")
    if not connection.access_token or not connection.is_active:
        raise KiteSyncError("Kite session missing. Complete login to obtain an access token.")

    kite = build_client(connection)
    synced_at = datetime.utcnow()
    created = updated = removed = 0
    errors: list[str] = []
    seen_keys: set[tuple[str, str]] = set()

    try:
        equity_holdings = kite.holdings() or []
    except KiteException as exc:
        connection.is_active = False
        connection.last_sync_status = "error"
        connection.last_sync_message = f"Equity holdings failed: {exc}"
        db.commit()
        raise KiteSyncError(
            "Kite session expired or invalid. Re-login via /api/kite/login-url and exchange a new request_token."
        ) from exc

    for holding in equity_holdings:
        quantity = float(holding.get("quantity") or 0) + float(holding.get("t1_quantity") or 0)
        if quantity <= 0:
            continue
        symbol = holding.get("tradingsymbol") or ""
        exchange = holding.get("exchange") or ""
        external_id = f"{exchange}:{symbol}" if exchange else symbol
        if not external_id:
            continue
        seen_keys.add(("kite", external_id))
        action, _ = upsert_investment(
            db,
            user_id=user.id,
            source="kite",
            external_id=external_id,
            name=symbol,
            symbol=symbol,
            investment_type=_classify_equity(holding),
            quantity=quantity,
            buy_price=float(holding.get("average_price") or 0),
            current_price=float(holding.get("last_price") or 0),
            isin=holding.get("isin"),
            exchange=exchange or None,
            notes=f"Synced from Kite · product={holding.get('product') or 'CNC'}",
            synced_at=synced_at,
        )
        if action == "created":
            created += 1
        else:
            updated += 1

    try:
        mf_holdings = kite.mf_holdings() or []
    except KiteException as exc:
        errors.append(f"Coin mutual fund holdings failed: {exc}")
        mf_holdings = []

    for holding in mf_holdings:
        quantity = float(holding.get("quantity") or 0)
        if quantity <= 0:
            continue
        isin = holding.get("tradingsymbol") or holding.get("isin") or ""
        folio = holding.get("folio") or "default"
        external_id = f"{isin}:{folio}" if isin else folio
        if not external_id:
            continue
        seen_keys.add(("coin", external_id))
        fund_name = holding.get("fund") or isin or "Mutual Fund"
        action, _ = upsert_investment(
            db,
            user_id=user.id,
            source="coin",
            external_id=external_id,
            name=fund_name,
            symbol=isin or None,
            investment_type=InvestmentType.mutual_fund,
            quantity=quantity,
            buy_price=float(holding.get("average_price") or 0),
            current_price=float(holding.get("last_price") or 0),
            isin=isin or None,
            exchange="MF",
            notes=f"Synced from Coin · folio={folio} · NAV date={holding.get('last_price_date') or 'n/a'}",
            synced_at=synced_at,
        )
        if action == "created":
            created += 1
        else:
            updated += 1

    # Remove previously synced rows that disappeared from Kite/Coin
    existing_synced = (
        db.query(Investment)
        .filter(Investment.user_id == user.id, Investment.source.in_(["kite", "coin"]))
        .all()
    )
    for item in existing_synced:
        key = (item.source, item.external_id or "")
        if key not in seen_keys:
            db.delete(item)
            removed += 1

    db.flush()

    # Coin SIPs → recurring plans + installment dues (full MF history is not on Kite Connect)
    sip_stats = {"sip_created": 0, "sip_updated": 0, "sip_paused": 0, "sip_count": 0, "orders_marked_paid": 0}
    try:
        mf_sips = kite.mf_sips() or []
    except KiteException as exc:
        errors.append(f"Coin SIPs failed: {exc}")
        mf_sips = []

    investments_by_isin: dict[str, Investment] = {}
    coin_mfs = (
        db.query(Investment)
        .filter(
            Investment.user_id == user.id,
            Investment.source == "coin",
            Investment.investment_type == InvestmentType.mutual_fund,
        )
        .all()
    )
    for inv in coin_mfs:
        if inv.isin:
            investments_by_isin[inv.isin] = inv
        if inv.symbol:
            investments_by_isin[inv.symbol] = inv

    if mf_sips:
        sip_stats.update(
            upsert_coin_sips(db, user, mf_sips, investments_by_isin=investments_by_isin)
        )
        sip_stats["sip_count"] = len(mf_sips)

    try:
        mf_orders = kite.mf_orders() or []
    except KiteException as exc:
        errors.append(f"Coin MF orders failed: {exc}")
        mf_orders = []

    if mf_orders:
        sip_stats["orders_marked_paid"] = apply_recent_mf_orders(db, user, mf_orders)

    generate_renewal_notifications(db, user)

    sip_msg = (
        f" SIPs: {sip_stats['sip_created']} new plans, {sip_stats['sip_updated']} updated"
        f" ({sip_stats['sip_count']} from Coin)"
        + (f", {sip_stats['orders_marked_paid']} recent payments matched" if sip_stats["orders_marked_paid"] else "")
        + (f", {sip_stats['sip_paused']} paused" if sip_stats["sip_paused"] else "")
        + "."
    )
    connection.last_synced_at = synced_at
    connection.last_sync_status = "ok" if not errors else "partial"
    connection.last_sync_message = (
        f"Synced {created} new, {updated} updated, {removed} removed holdings."
        + sip_msg
        + ((" " + "; ".join(errors)) if errors else "")
    )
    connection.is_active = True
    db.commit()

    return {
        "created": created,
        "updated": updated,
        "removed": removed,
        "equity_count": len([k for k in seen_keys if k[0] == "kite"]),
        "mutual_fund_count": len([k for k in seen_keys if k[0] == "coin"]),
        "sip_count": sip_stats["sip_count"],
        "sip_created": sip_stats["sip_created"],
        "sip_updated": sip_stats["sip_updated"],
        "sip_paused": sip_stats["sip_paused"],
        "orders_marked_paid": sip_stats["orders_marked_paid"],
        "synced_at": synced_at,
        "status": connection.last_sync_status,
        "message": connection.last_sync_message,
        "warnings": errors,
    }


def invalidate_session(db: Session, connection: KiteConnection) -> None:
    if connection.access_token:
        try:
            kite = build_client(connection)
            kite.invalidate_access_token(connection.access_token)
        except Exception:
            pass
    connection.access_token = None
    connection.is_active = False
    connection.last_sync_status = "disconnected"
    connection.last_sync_message = "Kite session cleared"
    db.commit()
