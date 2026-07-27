from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import EntityType, Investment, User
from app.schemas import InvestmentCreate, InvestmentOut, InvestmentUpdate
from app.services.attachments import attachment_counts, delete_attachments_for_entity

router = APIRouter(prefix="/api/investments", tags=["investments"])


def _to_out(item: Investment, counts: dict[int, int] | None = None) -> InvestmentOut:
    invested = float(item.invested_value or 0)
    gain = float(item.gain_loss or 0)
    pct = round((gain / invested) * 100, 2) if invested else 0.0
    return InvestmentOut(
        id=item.id,
        user_id=item.user_id,
        name=item.name,
        symbol=item.symbol,
        investment_type=item.investment_type,
        quantity=item.quantity,
        buy_price=item.buy_price,
        current_price=item.current_price,
        purchase_date=item.purchase_date,
        notes=item.notes,
        current_value=item.current_value,
        invested_value=item.invested_value,
        gain_loss=item.gain_loss,
        gain_loss_pct=pct,
        source=getattr(item, "source", None) or "manual",
        external_id=getattr(item, "external_id", None),
        isin=getattr(item, "isin", None),
        exchange=getattr(item, "exchange", None),
        last_synced_at=getattr(item, "last_synced_at", None),
        created_at=item.created_at,
        attachment_count=(counts or {}).get(item.id, 0),
    )


@router.get("", response_model=list[InvestmentOut])
def list_investments(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    counts = attachment_counts(db, current_user, EntityType.investment)
    items = (
        db.query(Investment)
        .filter(Investment.user_id == current_user.id)
        .order_by(Investment.name.asc())
        .all()
    )
    return [_to_out(i, counts) for i in items]


@router.post("", response_model=InvestmentOut, status_code=status.HTTP_201_CREATED)
def create_investment(
    payload: InvestmentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = Investment(**payload.model_dump(), user_id=current_user.id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _to_out(item)


@router.put("/{investment_id}", response_model=InvestmentOut)
def update_investment(
    investment_id: int,
    payload: InvestmentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = (
        db.query(Investment)
        .filter(Investment.id == investment_id, Investment.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Investment not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    counts = attachment_counts(db, current_user, EntityType.investment)
    return _to_out(item, counts)


@router.delete("/{investment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_investment(
    investment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = (
        db.query(Investment)
        .filter(Investment.id == investment_id, Investment.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Investment not found")
    delete_attachments_for_entity(
        db, current_user, entity_type=EntityType.investment, entity_id=item.id
    )
    db.delete(item)
    db.commit()
