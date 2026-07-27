import calendar
from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models import (
    EntityType,
    InstallmentOccurrence,
    InstallmentStatus,
    InsurancePolicy,
    Investment,
    InvestmentType,
    Liability,
    Notification,
    NotificationType,
    RecurringPlan,
    RecurringPlanKind,
    User,
)
from app.services.recurring import refresh_overdue_statuses

RENEWAL_WINDOW_DAYS = 30
MF_STALE_ALERT_DAYS = 30


def _end_of_next_month(today: date) -> date:
    if today.month == 12:
        year, month = today.year + 1, 1
    else:
        year, month = today.year, today.month + 1
    return date(year, month, calendar.monthrange(year, month)[1])


def _is_mutual_fund_plan(db: Session, plan: RecurringPlan | None) -> bool:
    if not plan:
        return False
    if plan.plan_kind == RecurringPlanKind.sip:
        return True
    if plan.entity_type == EntityType.investment and plan.entity_id:
        investment = (
            db.query(Investment)
            .filter(Investment.id == plan.entity_id, Investment.user_id == plan.user_id)
            .first()
        )
        if investment and investment.investment_type == InvestmentType.mutual_fund:
            return True
    return False


def prune_stale_mutual_fund_alerts(db: Session, user: User | None = None) -> int:
    """Remove mutual-fund / SIP alerts whose due date is more than 1 month old."""
    cutoff = date.today() - timedelta(days=MF_STALE_ALERT_DAYS)
    query = db.query(Notification).filter(
        Notification.notification_type == NotificationType.installment_due,
        Notification.due_date.isnot(None),
        Notification.due_date < cutoff,
    )
    if user is not None:
        query = query.filter(Notification.user_id == user.id)

    removed = 0
    for note in query.all():
        installment = None
        if note.related_entity == "installment" and note.related_id:
            installment = (
                db.query(InstallmentOccurrence)
                .filter(InstallmentOccurrence.id == note.related_id)
                .first()
            )
        plan = None
        if installment:
            plan = db.query(RecurringPlan).filter(RecurringPlan.id == installment.plan_id).first()
        is_mf = _is_mutual_fund_plan(db, plan) or (note.title or "").upper().startswith("SIP")
        if is_mf:
            db.delete(note)
            removed += 1

    if removed:
        db.commit()
    return removed


def generate_renewal_notifications(db: Session, user: User | None = None) -> int:
    """Create notifications for renewals, liability dues, and recurring installments."""
    today = date.today()
    window_end = today + timedelta(days=RENEWAL_WINDOW_DAYS)
    created = 0

    refresh_overdue_statuses(db, user)
    prune_stale_mutual_fund_alerts(db, user)

    policy_query = db.query(InsurancePolicy).filter(
        InsurancePolicy.renewal_date >= today,
        InsurancePolicy.renewal_date <= window_end,
    )
    if user is not None:
        policy_query = policy_query.filter(InsurancePolicy.user_id == user.id)

    for policy in policy_query.all():
        exists = (
            db.query(Notification)
            .filter(
                Notification.user_id == policy.user_id,
                Notification.related_entity == "insurance",
                Notification.related_id == policy.id,
                Notification.notification_type == NotificationType.renewal_due,
                Notification.due_date == policy.renewal_date,
            )
            .first()
        )
        if exists:
            continue

        days_left = (policy.renewal_date - today).days
        db.add(
            Notification(
                user_id=policy.user_id,
                title=f"Renewal due: {policy.name}",
                message=(
                    f"Your {policy.insurance_type.value} policy with {policy.provider} "
                    f"renews in {days_left} day(s) on {policy.renewal_date.isoformat()}. "
                    f"Premium: {policy.premium_amount:,.2f} ({policy.premium_frequency})."
                ),
                notification_type=NotificationType.renewal_due,
                related_entity="insurance",
                related_id=policy.id,
                due_date=policy.renewal_date,
            )
        )
        created += 1

    liability_query = db.query(Liability).filter(
        Liability.due_date.isnot(None),
        Liability.due_date >= today,
        Liability.due_date <= window_end,
    )
    if user is not None:
        liability_query = liability_query.filter(Liability.user_id == user.id)

    for liability in liability_query.all():
        exists = (
            db.query(Notification)
            .filter(
                Notification.user_id == liability.user_id,
                Notification.related_entity == "liability",
                Notification.related_id == liability.id,
                Notification.notification_type == NotificationType.premium_due,
                Notification.due_date == liability.due_date,
            )
            .first()
        )
        if exists:
            continue

        days_left = (liability.due_date - today).days
        db.add(
            Notification(
                user_id=liability.user_id,
                title=f"Payment due: {liability.name}",
                message=(
                    f"Liability '{liability.name}' has a due date in {days_left} day(s) "
                    f"({liability.due_date.isoformat()}). Outstanding: {liability.outstanding_amount:,.2f}."
                ),
                notification_type=NotificationType.premium_due,
                related_entity="liability",
                related_id=liability.id,
                due_date=liability.due_date,
            )
        )
        created += 1

    # Cover through end of next month so SIP dues for next cycle always alert
    installment_window_end = max(window_end, _end_of_next_month(today))
    installment_query = (
        db.query(InstallmentOccurrence)
        .join(RecurringPlan, RecurringPlan.id == InstallmentOccurrence.plan_id)
        .filter(
            RecurringPlan.is_active.is_(True),
            RecurringPlan.auto_notify.is_(True),
            InstallmentOccurrence.status.in_(
                [InstallmentStatus.pending, InstallmentStatus.overdue]
            ),
            InstallmentOccurrence.due_date >= today - timedelta(days=3),
            InstallmentOccurrence.due_date <= installment_window_end,
        )
    )
    if user is not None:
        installment_query = installment_query.filter(InstallmentOccurrence.user_id == user.id)

    mf_stale_cutoff = today - timedelta(days=MF_STALE_ALERT_DAYS)

    for installment in installment_query.all():
        plan = db.query(RecurringPlan).filter(RecurringPlan.id == installment.plan_id).first()
        if _is_mutual_fund_plan(db, plan) and installment.due_date < mf_stale_cutoff:
            continue

        exists = (
            db.query(Notification)
            .filter(
                Notification.user_id == installment.user_id,
                Notification.related_entity == "installment",
                Notification.related_id == installment.id,
                Notification.notification_type == NotificationType.installment_due,
                Notification.due_date == installment.due_date,
            )
            .first()
        )
        if exists:
            continue

        days_left = (installment.due_date - today).days
        timing = "overdue" if days_left < 0 else f"in {days_left} day(s)"
        kind = plan.plan_kind.value.upper() if plan else "INSTALLMENT"
        db.add(
            Notification(
                user_id=installment.user_id,
                title=f"{kind} due: {plan.name if plan else 'Installment'}",
                message=(
                    f"Installment #{installment.sequence_no} of "
                    f"'{plan.name if plan else 'plan'}' is {timing} "
                    f"on {installment.due_date.isoformat()}. "
                    f"Amount: {installment.amount:,.2f} "
                    f"({plan.frequency.value if plan else 'recurring'})."
                ),
                notification_type=NotificationType.installment_due,
                related_entity="installment",
                related_id=installment.id,
                due_date=installment.due_date,
            )
        )
        created += 1

    if created:
        db.commit()
    return created
