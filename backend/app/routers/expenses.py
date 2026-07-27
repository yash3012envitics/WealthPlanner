from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import ExpenseEntry, User
from app.schemas import ExpenseCreate, ExpenseOut, ExpenseUpdate
from app.services.cashflow import to_monthly

router = APIRouter(prefix="/api/expenses", tags=["expenses"])


def _to_out(item: ExpenseEntry) -> ExpenseOut:
    data = ExpenseOut.model_validate(item)
    data.monthly_amount = to_monthly(item.amount, item.frequency)
    return data


@router.get("", response_model=list[ExpenseOut])
def list_expenses(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    items = (
        db.query(ExpenseEntry)
        .filter(ExpenseEntry.user_id == current_user.id)
        .order_by(ExpenseEntry.name.asc())
        .all()
    )
    return [_to_out(i) for i in items]


@router.post("", response_model=ExpenseOut, status_code=status.HTTP_201_CREATED)
def create_expense(
    payload: ExpenseCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = ExpenseEntry(**payload.model_dump(), user_id=current_user.id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _to_out(item)


@router.put("/{expense_id}", response_model=ExpenseOut)
def update_expense(
    expense_id: int,
    payload: ExpenseUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = (
        db.query(ExpenseEntry)
        .filter(ExpenseEntry.id == expense_id, ExpenseEntry.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Expense entry not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return _to_out(item)


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense(
    expense_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = (
        db.query(ExpenseEntry)
        .filter(ExpenseEntry.id == expense_id, ExpenseEntry.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Expense entry not found")
    db.delete(item)
    db.commit()
