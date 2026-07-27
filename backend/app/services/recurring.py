from __future__ import annotations

import calendar
import json
from datetime import date

from sqlalchemy.orm import Session

from app.models import (
    EntityType,
    InstallmentOccurrence,
    InstallmentStatus,
    PaymentFrequency,
    RecurringPlan,
    RecurringPlanKind,
    User,
)
from app.services.attachments import assert_entity_owned

FREQUENCY_MONTHS = {
    PaymentFrequency.monthly: 1,
    PaymentFrequency.quarterly: 3,
    PaymentFrequency.half_yearly: 6,
    PaymentFrequency.yearly: 12,
}


def add_months(d: date, months: int) -> date:
    year = d.year + (d.month - 1 + months) // 12
    month = (d.month - 1 + months) % 12 + 1
    day = min(d.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def compute_end_date(
    start: date,
    frequency: PaymentFrequency,
    *,
    term_years: float | None = None,
    total_installments: int | None = None,
) -> tuple[date, int]:
    step = FREQUENCY_MONTHS[frequency]
    if total_installments and total_installments > 0:
        count = total_installments
    elif term_years and term_years > 0:
        count = max(1, int(round((term_years * 12) / step)))
    else:
        raise ValueError("Provide term_years or total_installments")

    end = add_months(start, step * (count - 1))
    return end, count


def iter_due_dates(start: date, end: date, frequency: PaymentFrequency) -> list[date]:
    step = FREQUENCY_MONTHS[frequency]
    dates: list[date] = []
    current = start
    for _ in range(1200):
        if current > end:
            break
        dates.append(current)
        current = add_months(current, step)
    return dates


def get_excluded_dates(plan: RecurringPlan) -> set[date]:
    raw = getattr(plan, "excluded_due_dates", None) or ""
    if not raw.strip():
        return set()
    try:
        values = json.loads(raw)
    except json.JSONDecodeError:
        return set()
    excluded: set[date] = set()
    for value in values:
        try:
            excluded.add(date.fromisoformat(value))
        except ValueError:
            continue
    return excluded


def set_excluded_dates(plan: RecurringPlan, excluded: set[date]) -> None:
    plan.excluded_due_dates = json.dumps(sorted(d.isoformat() for d in excluded))


def exclude_due_date(plan: RecurringPlan, due: date) -> None:
    excluded = get_excluded_dates(plan)
    excluded.add(due)
    set_excluded_dates(plan, excluded)


def regenerate_installments(db: Session, plan: RecurringPlan) -> list[InstallmentOccurrence]:
    """Create/update child installment rows for every occurrence between start and end."""
    excluded = get_excluded_dates(plan)
    expected = [d for d in iter_due_dates(plan.start_date, plan.end_date, plan.frequency) if d not in excluded]
    plan.total_installments = len(expected)

    existing = (
        db.query(InstallmentOccurrence)
        .filter(InstallmentOccurrence.plan_id == plan.id)
        .all()
    )
    by_due = {row.due_date: row for row in existing}
    kept_ids: set[int] = set()
    today = date.today()

    for idx, due in enumerate(expected, start=1):
        row = by_due.get(due)
        if row:
            row.sequence_no = idx
            if row.status != InstallmentStatus.paid:
                row.amount = plan.installment_amount
                if due < today and row.status == InstallmentStatus.pending:
                    row.status = InstallmentStatus.overdue
                elif due >= today and row.status == InstallmentStatus.overdue:
                    row.status = InstallmentStatus.pending
            kept_ids.add(row.id)
        else:
            status = InstallmentStatus.overdue if due < today else InstallmentStatus.pending
            row = InstallmentOccurrence(
                plan_id=plan.id,
                user_id=plan.user_id,
                sequence_no=idx,
                due_date=due,
                amount=plan.installment_amount,
                status=status,
            )
            db.add(row)
            db.flush()
            kept_ids.add(row.id)

    for row in existing:
        if row.id not in kept_ids and row.status != InstallmentStatus.paid:
            db.delete(row)

    db.commit()
    return (
        db.query(InstallmentOccurrence)
        .filter(InstallmentOccurrence.plan_id == plan.id)
        .order_by(InstallmentOccurrence.due_date.asc())
        .all()
    )


def refresh_overdue_statuses(db: Session, user: User | None = None) -> int:
    today = date.today()
    query = db.query(InstallmentOccurrence).filter(
        InstallmentOccurrence.status == InstallmentStatus.pending,
        InstallmentOccurrence.due_date < today,
    )
    if user is not None:
        query = query.filter(InstallmentOccurrence.user_id == user.id)
    updated = 0
    for row in query.all():
        row.status = InstallmentStatus.overdue
        updated += 1
    if updated:
        db.commit()
    return updated


def create_plan(
    db: Session,
    user: User,
    *,
    name: str,
    plan_kind: RecurringPlanKind,
    frequency: PaymentFrequency,
    installment_amount: float,
    start_date: date,
    end_date: date | None = None,
    term_years: float | None = None,
    total_installments: int | None = None,
    entity_type: EntityType | None = None,
    entity_id: int | None = None,
    auto_notify: bool = True,
    notes: str | None = None,
) -> RecurringPlan:
    if entity_type is not None and entity_id is not None:
        assert_entity_owned(db, user, entity_type, entity_id)

    computed_count = None
    if end_date is None:
        end_date, computed_count = compute_end_date(
            start_date, frequency, term_years=term_years, total_installments=total_installments
        )
    else:
        computed_count = len(iter_due_dates(start_date, end_date, frequency))

    if end_date < start_date:
        raise ValueError("end_date must be on or after start_date")

    plan = RecurringPlan(
        user_id=user.id,
        name=name,
        plan_kind=plan_kind,
        entity_type=entity_type,
        entity_id=entity_id,
        frequency=frequency,
        installment_amount=installment_amount,
        start_date=start_date,
        end_date=end_date,
        term_years=term_years,
        total_installments=computed_count or 0,
        is_active=True,
        auto_notify=auto_notify,
        notes=notes,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    regenerate_installments(db, plan)
    db.refresh(plan)
    return plan


def plan_summary(plan: RecurringPlan) -> dict:
    installments = list(plan.installments or [])
    paid = [i for i in installments if i.status == InstallmentStatus.paid]
    pending = [i for i in installments if i.status in {InstallmentStatus.pending, InstallmentStatus.overdue}]
    paid_amount = sum((i.paid_amount if i.paid_amount is not None else i.amount) for i in paid)
    remaining_amount = sum(i.amount for i in pending)
    next_due = next(
        (i for i in installments if i.status in {InstallmentStatus.pending, InstallmentStatus.overdue}),
        None,
    )
    return {
        "paid_count": len(paid),
        "pending_count": len(pending),
        "skipped_count": len([i for i in installments if i.status == InstallmentStatus.skipped]),
        "paid_amount": round(paid_amount, 2),
        "remaining_amount": round(remaining_amount, 2),
        "next_due_date": next_due.due_date if next_due else None,
        "next_due_amount": next_due.amount if next_due else None,
    }
