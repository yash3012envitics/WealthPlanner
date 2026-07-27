import calendar
from datetime import date, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import InstallmentOccurrence, InstallmentStatus, InsurancePolicy, Notification, RecurringPlan, User
from app.schemas import DashboardOut, MonthDues, NetWorthBreakdown, UpcomingInstallmentOut, UserOut
from app.services.networth import compute_net_worth
from app.services.notifications import generate_renewal_notifications, prune_stale_mutual_fund_alerts
from app.services.recurring import refresh_overdue_statuses

router = APIRouter(prefix="/api", tags=["dashboard"])

MONTH_NAMES = [
    "",
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
]


def _month_bounds(year: int, month: int) -> tuple[date, date]:
    last_day = calendar.monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def _shift_month(year: int, month: int, delta: int) -> tuple[int, int]:
    idx = year * 12 + (month - 1) + delta
    return idx // 12, idx % 12 + 1


def _dues_for_month(db: Session, user: User, year: int, month: int) -> MonthDues:
    start, end = _month_bounds(year, month)
    rows = (
        db.query(InstallmentOccurrence)
        .filter(
            InstallmentOccurrence.user_id == user.id,
            InstallmentOccurrence.status.in_([InstallmentStatus.pending, InstallmentStatus.overdue]),
            InstallmentOccurrence.due_date >= start,
            InstallmentOccurrence.due_date <= end,
        )
        .all()
    )
    total = round(sum(float(r.amount or 0) for r in rows), 2)
    return MonthDues(
        label=f"{MONTH_NAMES[month]} {year}",
        year=year,
        month=month,
        total_due=total,
        installment_count=len(rows),
    )


@router.get("/networth", response_model=NetWorthBreakdown)
def get_net_worth(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return compute_net_worth(db, current_user)


@router.get("/dashboard", response_model=DashboardOut)
def get_dashboard(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    generate_renewal_notifications(db, current_user)
    refresh_overdue_statuses(db, current_user)
    prune_stale_mutual_fund_alerts(db, current_user)
    today = date.today()
    next_year, next_month = _shift_month(today.year, today.month, 1)

    upcoming = (
        db.query(InsurancePolicy)
        .filter(
            InsurancePolicy.user_id == current_user.id,
            InsurancePolicy.renewal_date >= today,
            InsurancePolicy.renewal_date <= today + timedelta(days=30),
        )
        .order_by(InsurancePolicy.renewal_date.asc())
        .all()
    )
    # Pending/overdue installments from a few days overdue through end of next month
    _, next_month_end = _month_bounds(next_year, next_month)
    installment_rows = (
        db.query(InstallmentOccurrence, RecurringPlan)
        .join(RecurringPlan, RecurringPlan.id == InstallmentOccurrence.plan_id)
        .filter(
            InstallmentOccurrence.user_id == current_user.id,
            RecurringPlan.is_active.is_(True),
            InstallmentOccurrence.status.in_([InstallmentStatus.pending, InstallmentStatus.overdue]),
            InstallmentOccurrence.due_date >= today - timedelta(days=7),
            InstallmentOccurrence.due_date <= next_month_end,
        )
        .order_by(InstallmentOccurrence.due_date.asc())
        .limit(40)
        .all()
    )
    upcoming_installments = [
        UpcomingInstallmentOut(
            id=row.id,
            plan_id=plan.id,
            plan_name=plan.name,
            plan_kind=plan.plan_kind.value,
            due_date=row.due_date,
            amount=float(row.amount or 0),
            status=row.status.value,
            source=getattr(plan, "source", None) or "manual",
        )
        for row, plan in installment_rows
    ]

    notifications = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(12)
        .all()
    )
    unread = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id, Notification.is_read.is_(False))
        .count()
    )
    return DashboardOut(
        user=UserOut.model_validate(current_user),
        net_worth=compute_net_worth(db, current_user),
        upcoming_renewals=upcoming,
        upcoming_installments=upcoming_installments,
        dues_this_month=_dues_for_month(db, current_user, today.year, today.month),
        dues_next_month=_dues_for_month(db, current_user, next_year, next_month),
        unread_notifications=unread,
        recent_notifications=notifications,
    )
