from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import ExpenseEntry, ExpenseMonthOverride, IncomeEntry, IncomeMonthOverride, User
from app.schemas import MonthCashflowOut, MonthOverrideOut, MonthOverrideUpsert, ResolvedCashflowLine
from app.services.cashflow import (
    default_monthly_expenses,
    default_monthly_income,
    resolve_month_cashflow,
)

router = APIRouter(prefix="/api/cashflow", tags=["cashflow"])


def _validate_ym(year: int, month: int) -> None:
    if year < 2000 or year > 2100:
        raise HTTPException(status_code=400, detail="Year out of range")
    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Month must be 1–12")


def _income_override_out(item: IncomeMonthOverride) -> MonthOverrideOut:
    return MonthOverrideOut(
        id=item.id,
        user_id=item.user_id,
        entry_id=item.income_entry_id,
        year=item.year,
        month=item.month,
        amount=item.amount,
        name=item.name,
        notes=item.notes,
        created_at=item.created_at,
    )


def _expense_override_out(item: ExpenseMonthOverride) -> MonthOverrideOut:
    return MonthOverrideOut(
        id=item.id,
        user_id=item.user_id,
        entry_id=item.expense_entry_id,
        year=item.year,
        month=item.month,
        amount=item.amount,
        name=item.name,
        notes=item.notes,
        created_at=item.created_at,
    )


@router.get("/month", response_model=MonthCashflowOut)
def get_month_cashflow(
    year: int = Query(...),
    month: int = Query(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _validate_ym(year, month)
    resolved = resolve_month_cashflow(db, current_user, year, month)
    return MonthCashflowOut(
        year=resolved.year,
        month=resolved.month,
        label=resolved.label,
        income_total=resolved.income_total,
        expense_total=resolved.expense_total,
        default_income_total=default_monthly_income(db, current_user),
        default_expense_total=default_monthly_expenses(db, current_user),
        income_lines=[ResolvedCashflowLine(**line.__dict__) for line in resolved.income_lines],
        expense_lines=[ResolvedCashflowLine(**line.__dict__) for line in resolved.expense_lines],
    )


@router.put("/income/{year}/{month}", response_model=MonthOverrideOut)
def upsert_income_month(
    year: int,
    month: int,
    payload: MonthOverrideUpsert,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _validate_ym(year, month)
    if payload.entry_id is not None:
        entry = (
            db.query(IncomeEntry)
            .filter(IncomeEntry.id == payload.entry_id, IncomeEntry.user_id == current_user.id)
            .first()
        )
        if not entry:
            raise HTTPException(status_code=404, detail="Income default not found")
        existing = (
            db.query(IncomeMonthOverride)
            .filter(
                IncomeMonthOverride.user_id == current_user.id,
                IncomeMonthOverride.year == year,
                IncomeMonthOverride.month == month,
                IncomeMonthOverride.income_entry_id == payload.entry_id,
            )
            .first()
        )
    else:
        if not (payload.name or "").strip():
            raise HTTPException(status_code=400, detail="Name is required for one-off income")
        existing = None

    if existing:
        existing.amount = payload.amount
        existing.notes = payload.notes
        if payload.name:
            existing.name = payload.name
        db.commit()
        db.refresh(existing)
        return _income_override_out(existing)

    item = IncomeMonthOverride(
        user_id=current_user.id,
        income_entry_id=payload.entry_id,
        year=year,
        month=month,
        amount=payload.amount,
        name=payload.name,
        notes=payload.notes,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _income_override_out(item)


@router.put("/expenses/{year}/{month}", response_model=MonthOverrideOut)
def upsert_expense_month(
    year: int,
    month: int,
    payload: MonthOverrideUpsert,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _validate_ym(year, month)
    if payload.entry_id is not None:
        entry = (
            db.query(ExpenseEntry)
            .filter(ExpenseEntry.id == payload.entry_id, ExpenseEntry.user_id == current_user.id)
            .first()
        )
        if not entry:
            raise HTTPException(status_code=404, detail="Expense default not found")
        existing = (
            db.query(ExpenseMonthOverride)
            .filter(
                ExpenseMonthOverride.user_id == current_user.id,
                ExpenseMonthOverride.year == year,
                ExpenseMonthOverride.month == month,
                ExpenseMonthOverride.expense_entry_id == payload.entry_id,
            )
            .first()
        )
    else:
        if not (payload.name or "").strip():
            raise HTTPException(status_code=400, detail="Name is required for one-off expense")
        existing = None

    if existing:
        existing.amount = payload.amount
        existing.notes = payload.notes
        if payload.name:
            existing.name = payload.name
        db.commit()
        db.refresh(existing)
        return _expense_override_out(existing)

    item = ExpenseMonthOverride(
        user_id=current_user.id,
        expense_entry_id=payload.entry_id,
        year=year,
        month=month,
        amount=payload.amount,
        name=payload.name,
        notes=payload.notes,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return _expense_override_out(item)


@router.delete("/income-overrides/{override_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_income_override(
    override_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = (
        db.query(IncomeMonthOverride)
        .filter(IncomeMonthOverride.id == override_id, IncomeMonthOverride.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Income month override not found")
    db.delete(item)
    db.commit()


@router.delete("/expense-overrides/{override_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_expense_override(
    override_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = (
        db.query(ExpenseMonthOverride)
        .filter(
            ExpenseMonthOverride.id == override_id,
            ExpenseMonthOverride.user_id == current_user.id,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Expense month override not found")
    db.delete(item)
    db.commit()
