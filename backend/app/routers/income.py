from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import IncomeEntry, User
from app.schemas import IncomeCreate, IncomeOut, IncomeUpdate
from app.services.cashflow import to_monthly

router = APIRouter(prefix="/api/income", tags=["income"])


def _to_out(item: IncomeEntry) -> IncomeOut:
    data = IncomeOut.model_validate(item)
    data.monthly_amount = to_monthly(item.amount, item.frequency)
    return data


@router.get("", response_model=list[IncomeOut])
def list_income(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = (
        db.query(IncomeEntry)
        .filter(IncomeEntry.user_id == current_user.id)
        .order_by(IncomeEntry.name.asc())
        .all()
    )
    return [_to_out(i) for i in items]


@router.post("", response_model=IncomeOut, status_code=status.HTTP_201_CREATED)
def create_income(
    payload: IncomeCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = IncomeEntry(**payload.model_dump(), user_id=current_user.id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _to_out(item)


@router.put("/{income_id}", response_model=IncomeOut)
def update_income(
    income_id: int,
    payload: IncomeUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = (
        db.query(IncomeEntry)
        .filter(IncomeEntry.id == income_id, IncomeEntry.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Income entry not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return _to_out(item)


@router.delete("/{income_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_income(
    income_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = (
        db.query(IncomeEntry)
        .filter(IncomeEntry.id == income_id, IncomeEntry.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Income entry not found")
    db.delete(item)
    db.commit()
