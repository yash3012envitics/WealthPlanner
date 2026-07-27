from __future__ import annotations

from calendar import month_name
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.models import (
    ExpenseEntry,
    ExpenseMonthOverride,
    IncomeEntry,
    IncomeMonthOverride,
    User,
)


def to_monthly(amount: float, frequency) -> float:
    key = frequency.value if hasattr(frequency, "value") else str(frequency).lower()
    factor = {
        "weekly": 52 / 12,
        "biweekly": 26 / 12,
        "monthly": 1.0,
        "quarterly": 1 / 3,
        "half_yearly": 1 / 6,
        "yearly": 1 / 12,
    }.get(key, 1.0)
    return round(float(amount or 0) * float(factor), 2)


@dataclass
class ResolvedLine:
    entry_id: int | None
    override_id: int | None
    name: str
    category: str
    default_amount: float
    amount: float
    source: str  # "override" | "default" | "one_off"
    notes: str | None = None


@dataclass
class MonthCashflow:
    year: int
    month: int
    label: str
    income_total: float
    expense_total: float
    income_lines: list[ResolvedLine]
    expense_lines: list[ResolvedLine]


def resolve_income_month(db: Session, user: User, year: int, month: int) -> tuple[float, list[ResolvedLine]]:
    defaults = (
        db.query(IncomeEntry)
        .filter(IncomeEntry.user_id == user.id, IncomeEntry.is_active.is_(True))
        .order_by(IncomeEntry.name.asc())
        .all()
    )
    overrides = (
        db.query(IncomeMonthOverride)
        .filter(
            IncomeMonthOverride.user_id == user.id,
            IncomeMonthOverride.year == year,
            IncomeMonthOverride.month == month,
        )
        .all()
    )
    by_entry = {o.income_entry_id: o for o in overrides if o.income_entry_id is not None}
    one_offs = [o for o in overrides if o.income_entry_id is None]

    lines: list[ResolvedLine] = []
    total = 0.0
    for entry in defaults:
        default_amt = to_monthly(entry.amount, entry.frequency)
        override = by_entry.get(entry.id)
        if override is not None:
            amt = float(override.amount or 0)
            lines.append(
                ResolvedLine(
                    entry_id=entry.id,
                    override_id=override.id,
                    name=entry.name,
                    category=entry.category,
                    default_amount=default_amt,
                    amount=round(amt, 2),
                    source="override",
                    notes=override.notes,
                )
            )
            total += amt
        else:
            lines.append(
                ResolvedLine(
                    entry_id=entry.id,
                    override_id=None,
                    name=entry.name,
                    category=entry.category,
                    default_amount=default_amt,
                    amount=default_amt,
                    source="default",
                    notes=entry.notes,
                )
            )
            total += default_amt

    for override in one_offs:
        amt = float(override.amount or 0)
        lines.append(
            ResolvedLine(
                entry_id=None,
                override_id=override.id,
                name=override.name or "One-off income",
                category="one_off",
                default_amount=0.0,
                amount=round(amt, 2),
                source="one_off",
                notes=override.notes,
            )
        )
        total += amt

    return round(total, 2), lines


def resolve_expense_month(db: Session, user: User, year: int, month: int) -> tuple[float, list[ResolvedLine]]:
    defaults = (
        db.query(ExpenseEntry)
        .filter(ExpenseEntry.user_id == user.id, ExpenseEntry.is_active.is_(True))
        .order_by(ExpenseEntry.name.asc())
        .all()
    )
    overrides = (
        db.query(ExpenseMonthOverride)
        .filter(
            ExpenseMonthOverride.user_id == user.id,
            ExpenseMonthOverride.year == year,
            ExpenseMonthOverride.month == month,
        )
        .all()
    )
    by_entry = {o.expense_entry_id: o for o in overrides if o.expense_entry_id is not None}
    one_offs = [o for o in overrides if o.expense_entry_id is None]

    lines: list[ResolvedLine] = []
    total = 0.0
    for entry in defaults:
        default_amt = to_monthly(entry.amount, entry.frequency)
        override = by_entry.get(entry.id)
        if override is not None:
            amt = float(override.amount or 0)
            lines.append(
                ResolvedLine(
                    entry_id=entry.id,
                    override_id=override.id,
                    name=entry.name,
                    category=entry.category,
                    default_amount=default_amt,
                    amount=round(amt, 2),
                    source="override",
                    notes=override.notes,
                )
            )
            total += amt
        else:
            lines.append(
                ResolvedLine(
                    entry_id=entry.id,
                    override_id=None,
                    name=entry.name,
                    category=entry.category,
                    default_amount=default_amt,
                    amount=default_amt,
                    source="default",
                    notes=entry.notes,
                )
            )
            total += default_amt

    for override in one_offs:
        amt = float(override.amount or 0)
        lines.append(
            ResolvedLine(
                entry_id=None,
                override_id=override.id,
                name=override.name or "One-off expense",
                category="one_off",
                default_amount=0.0,
                amount=round(amt, 2),
                source="one_off",
                notes=override.notes,
            )
        )
        total += amt

    return round(total, 2), lines


def resolve_month_cashflow(db: Session, user: User, year: int, month: int) -> MonthCashflow:
    income_total, income_lines = resolve_income_month(db, user, year, month)
    expense_total, expense_lines = resolve_expense_month(db, user, year, month)
    return MonthCashflow(
        year=year,
        month=month,
        label=f"{month_name[month][:3]} {year}",
        income_total=income_total,
        expense_total=expense_total,
        income_lines=income_lines,
        expense_lines=expense_lines,
    )


def default_monthly_income(db: Session, user: User) -> float:
    rows = (
        db.query(IncomeEntry)
        .filter(IncomeEntry.user_id == user.id, IncomeEntry.is_active.is_(True))
        .all()
    )
    return round(sum(to_monthly(i.amount, i.frequency) for i in rows), 2)


def default_monthly_expenses(db: Session, user: User) -> float:
    rows = (
        db.query(ExpenseEntry)
        .filter(ExpenseEntry.user_id == user.id, ExpenseEntry.is_active.is_(True))
        .all()
    )
    return round(sum(to_monthly(e.amount, e.frequency) for e in rows), 2)
