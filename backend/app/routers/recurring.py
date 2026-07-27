from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.models import InstallmentOccurrence, InstallmentStatus, Notification, RecurringPlan, User
from app.schemas_recurring import (
    InstallmentOut,
    InstallmentUpdate,
    PlanSummary,
    RecurringPlanCreate,
    RecurringPlanListOut,
    RecurringPlanOut,
    RecurringPlanUpdate,
)
from app.services.notifications import generate_renewal_notifications
from app.services.recurring import (
    compute_end_date,
    create_plan,
    exclude_due_date,
    plan_summary,
    refresh_overdue_statuses,
    regenerate_installments,
)

router = APIRouter(prefix="/api/recurring", tags=["recurring"])


def _plan_out(plan: RecurringPlan, include_installments: bool = True) -> RecurringPlanOut | RecurringPlanListOut:
    summary = PlanSummary(**plan_summary(plan))
    if include_installments:
        return RecurringPlanOut(
            id=plan.id,
            user_id=plan.user_id,
            name=plan.name,
            plan_kind=plan.plan_kind,
            entity_type=plan.entity_type,
            entity_id=plan.entity_id,
            frequency=plan.frequency,
            installment_amount=plan.installment_amount,
            start_date=plan.start_date,
            end_date=plan.end_date,
            term_years=plan.term_years,
            total_installments=plan.total_installments,
            is_active=plan.is_active,
            auto_notify=plan.auto_notify,
            notes=plan.notes,
            created_at=plan.created_at,
            summary=summary,
            installments=[InstallmentOut.model_validate(i) for i in (plan.installments or [])],
        )
    return RecurringPlanListOut(
        id=plan.id,
        user_id=plan.user_id,
        name=plan.name,
        plan_kind=plan.plan_kind,
        entity_type=plan.entity_type,
        entity_id=plan.entity_id,
        frequency=plan.frequency,
        installment_amount=plan.installment_amount,
        start_date=plan.start_date,
        end_date=plan.end_date,
        term_years=plan.term_years,
        total_installments=plan.total_installments,
        is_active=plan.is_active,
        auto_notify=plan.auto_notify,
        notes=plan.notes,
        created_at=plan.created_at,
        summary=summary,
    )


def _get_plan(db: Session, user: User, plan_id: int) -> RecurringPlan:
    plan = (
        db.query(RecurringPlan)
        .options(joinedload(RecurringPlan.installments))
        .filter(RecurringPlan.id == plan_id, RecurringPlan.user_id == user.id)
        .first()
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Recurring plan not found")
    return plan


@router.get("/plans", response_model=list[RecurringPlanListOut])
def list_plans(
    entity_type: str | None = None,
    entity_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    refresh_overdue_statuses(db, current_user)
    query = (
        db.query(RecurringPlan)
        .options(joinedload(RecurringPlan.installments))
        .filter(RecurringPlan.user_id == current_user.id)
    )
    if entity_type:
        query = query.filter(RecurringPlan.entity_type == entity_type)
    if entity_id is not None:
        query = query.filter(RecurringPlan.entity_id == entity_id)
    plans = query.order_by(RecurringPlan.start_date.desc()).all()
    return [_plan_out(p, include_installments=False) for p in plans]


@router.post("/plans", response_model=RecurringPlanOut, status_code=status.HTTP_201_CREATED)
def create_recurring_plan(
    payload: RecurringPlanCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.end_date is None and payload.term_years is None and payload.total_installments is None:
        raise HTTPException(
            status_code=400,
            detail="Provide end_date, term_years, or total_installments so installments can be generated",
        )
    try:
        plan = create_plan(
            db,
            current_user,
            name=payload.name,
            plan_kind=payload.plan_kind,
            frequency=payload.frequency,
            installment_amount=payload.installment_amount,
            start_date=payload.start_date,
            end_date=payload.end_date,
            term_years=payload.term_years,
            total_installments=payload.total_installments,
            entity_type=payload.entity_type,
            entity_id=payload.entity_id,
            auto_notify=payload.auto_notify,
            notes=payload.notes,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    plan = _get_plan(db, current_user, plan.id)
    generate_renewal_notifications(db, current_user)
    return _plan_out(plan)


@router.get("/plans/{plan_id}", response_model=RecurringPlanOut)
def get_plan(plan_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    refresh_overdue_statuses(db, current_user)
    return _plan_out(_get_plan(db, current_user, plan_id))


@router.put("/plans/{plan_id}", response_model=RecurringPlanOut)
def update_plan(
    plan_id: int,
    payload: RecurringPlanUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    plan = _get_plan(db, current_user, plan_id)
    data = payload.model_dump(exclude_unset=True)
    regenerate = data.pop("regenerate", True)

    for key, value in data.items():
        setattr(plan, key, value)

    # Recompute end if term/total changed and end not explicitly set
    if payload.end_date is None and (payload.term_years is not None or payload.total_installments is not None):
        try:
            plan.end_date, plan.total_installments = compute_end_date(
                plan.start_date,
                plan.frequency,
                term_years=plan.term_years,
                total_installments=payload.total_installments or plan.total_installments,
            )
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    db.commit()
    if regenerate:
        regenerate_installments(db, plan)
    db.refresh(plan)
    plan = _get_plan(db, current_user, plan.id)
    generate_renewal_notifications(db, current_user)
    return _plan_out(plan)


@router.post("/plans/{plan_id}/regenerate", response_model=RecurringPlanOut)
def regenerate_plan(
    plan_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    plan = _get_plan(db, current_user, plan_id)
    regenerate_installments(db, plan)
    generate_renewal_notifications(db, current_user)
    return _plan_out(_get_plan(db, current_user, plan_id))


@router.delete("/plans/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_plan(plan_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    plan = _get_plan(db, current_user, plan_id)
    db.delete(plan)
    db.commit()


@router.get("/installments", response_model=list[InstallmentOut])
def list_installments(
    status_filter: InstallmentStatus | None = None,
    upcoming_days: int | None = 30,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    refresh_overdue_statuses(db, current_user)
    query = db.query(InstallmentOccurrence).filter(InstallmentOccurrence.user_id == current_user.id)
    if status_filter:
        query = query.filter(InstallmentOccurrence.status == status_filter)
    if upcoming_days is not None:
        today = date.today()
        from datetime import timedelta

        query = query.filter(
            InstallmentOccurrence.due_date >= today - timedelta(days=7),
            InstallmentOccurrence.due_date <= today + timedelta(days=upcoming_days),
        )
    rows = query.order_by(InstallmentOccurrence.due_date.asc()).all()
    return [InstallmentOut.model_validate(r) for r in rows]


@router.patch("/installments/{installment_id}", response_model=InstallmentOut)
def update_installment(
    installment_id: int,
    payload: InstallmentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = (
        db.query(InstallmentOccurrence)
        .filter(InstallmentOccurrence.id == installment_id, InstallmentOccurrence.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Installment not found")

    data = payload.model_dump(exclude_unset=True)
    if data.get("status") == InstallmentStatus.paid and "paid_date" not in data:
        data["paid_date"] = date.today()
    if data.get("status") == InstallmentStatus.paid and "paid_amount" not in data:
        data["paid_amount"] = item.amount
    if data.get("status") in {InstallmentStatus.pending, InstallmentStatus.overdue, InstallmentStatus.skipped}:
        data.setdefault("paid_date", None)
        if data["status"] != InstallmentStatus.paid:
            data["paid_amount"] = data.get("paid_amount")

    for key, value in data.items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return InstallmentOut.model_validate(item)


@router.delete("/installments/{installment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_installment(
    installment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = (
        db.query(InstallmentOccurrence)
        .filter(InstallmentOccurrence.id == installment_id, InstallmentOccurrence.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Installment not found")

    plan_id = item.plan_id
    due_date = item.due_date
    (
        db.query(Notification)
        .filter(
            Notification.user_id == current_user.id,
            Notification.related_entity == "installment",
            Notification.related_id == installment_id,
        )
        .delete(synchronize_session=False)
    )
    db.delete(item)
    db.commit()

    plan = (
        db.query(RecurringPlan)
        .filter(RecurringPlan.id == plan_id, RecurringPlan.user_id == current_user.id)
        .first()
    )
    if plan:
        exclude_due_date(plan, due_date)
        remaining = (
            db.query(InstallmentOccurrence)
            .filter(InstallmentOccurrence.plan_id == plan.id)
            .count()
        )
        plan.total_installments = remaining
        db.commit()
