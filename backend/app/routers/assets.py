from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Asset, AssetType, EntityType, User
from app.schemas import AssetCreate, AssetOut, AssetUpdate
from app.services.attachments import attachment_counts, delete_attachments_for_entity
from app.services.metals import MetalsPriceError, fetch_india_metal_prices, price_for_asset

router = APIRouter(prefix="/api/assets", tags=["assets"])


class MetalsPricesOut(BaseModel):
    source: str
    currency: str
    as_of: str
    gold_per_oz: float
    silver_per_oz: float
    gold_per_gram_24k: float
    gold_per_gram_22k: float
    gold_per_gram_18k: float
    silver_per_gram: float


class MetalsRefreshOut(BaseModel):
    prices: MetalsPricesOut
    updated: int
    assets: list[AssetOut]


def _to_out(item: Asset, counts: dict[int, int] | None = None) -> AssetOut:
    data = AssetOut.model_validate(item)
    data.attachment_count = (counts or {}).get(item.id, 0)
    data.purity_karat = getattr(item, "purity_karat", None) or 24
    return data


@router.get("", response_model=list[AssetOut])
def list_assets(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    counts = attachment_counts(db, current_user, EntityType.asset)
    items = (
        db.query(Asset)
        .filter(Asset.user_id == current_user.id)
        .order_by(Asset.name.asc())
        .all()
    )
    return [_to_out(i, counts) for i in items]


@router.get("/metals/prices", response_model=MetalsPricesOut)
async def get_metal_prices(_current_user: User = Depends(get_current_user)):
    try:
        return MetalsPricesOut(**(await fetch_india_metal_prices()))
    except MetalsPriceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@router.post("/metals/refresh", response_model=MetalsRefreshOut)
async def refresh_metal_assets(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        prices = await fetch_india_metal_prices(force=True)
    except MetalsPriceError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    metals = (
        db.query(Asset)
        .filter(
            Asset.user_id == current_user.id,
            Asset.asset_type.in_([AssetType.gold, AssetType.silver]),
        )
        .all()
    )
    updated = 0
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
            updated += 1
    if updated:
        db.commit()
    for item in metals:
        db.refresh(item)

    counts = attachment_counts(db, current_user, EntityType.asset)
    return MetalsRefreshOut(
        prices=MetalsPricesOut(**prices),
        updated=updated,
        assets=[_to_out(i, counts) for i in metals],
    )


@router.post("", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
def create_asset(
    payload: AssetCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = Asset(**payload.model_dump(), user_id=current_user.id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _to_out(item)


@router.put("/{asset_id}", response_model=AssetOut)
def update_asset(
    asset_id: int,
    payload: AssetUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = (
        db.query(Asset)
        .filter(Asset.id == asset_id, Asset.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Asset not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    counts = attachment_counts(db, current_user, EntityType.asset)
    return _to_out(item, counts)


@router.delete("/{asset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_asset(
    asset_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = (
        db.query(Asset)
        .filter(Asset.id == asset_id, Asset.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Asset not found")
    delete_attachments_for_entity(db, current_user, entity_type=EntityType.asset, entity_id=item.id)
    db.delete(item)
    db.commit()
