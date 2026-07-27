from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import EntityType, InsurancePolicy, User
from app.schemas import InsuranceCreate, InsuranceOut, InsuranceUpdate
from app.services.attachments import attachment_counts, delete_attachments_for_entity
from app.services.notifications import generate_renewal_notifications

router = APIRouter(prefix="/api/insurance", tags=["insurance"])


def _to_out(item: InsurancePolicy, counts: dict[int, int] | None = None) -> InsuranceOut:
    data = InsuranceOut.model_validate(item)
    data.attachment_count = (counts or {}).get(item.id, 0)
    return data


@router.get("", response_model=list[InsuranceOut])
def list_policies(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    counts = attachment_counts(db, current_user, EntityType.insurance)
    items = (
        db.query(InsurancePolicy)
        .filter(InsurancePolicy.user_id == current_user.id)
        .order_by(InsurancePolicy.renewal_date.asc())
        .all()
    )
    return [_to_out(i, counts) for i in items]


@router.get("/upcoming", response_model=list[InsuranceOut])
def upcoming_renewals(
    days: int = 30,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = date.today()
    counts = attachment_counts(db, current_user, EntityType.insurance)
    items = (
        db.query(InsurancePolicy)
        .filter(
            InsurancePolicy.user_id == current_user.id,
            InsurancePolicy.renewal_date >= today,
            InsurancePolicy.renewal_date <= today + timedelta(days=days),
        )
        .order_by(InsurancePolicy.renewal_date.asc())
        .all()
    )
    return [_to_out(i, counts) for i in items]


@router.post("", response_model=InsuranceOut, status_code=status.HTTP_201_CREATED)
def create_policy(
    payload: InsuranceCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    policy = InsurancePolicy(**payload.model_dump(), user_id=current_user.id)
    db.add(policy)
    db.commit()
    db.refresh(policy)
    generate_renewal_notifications(db, current_user)
    return _to_out(policy)


@router.get("/{policy_id}", response_model=InsuranceOut)
def get_policy(
    policy_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    policy = (
        db.query(InsurancePolicy)
        .filter(InsurancePolicy.id == policy_id, InsurancePolicy.user_id == current_user.id)
        .first()
    )
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    counts = attachment_counts(db, current_user, EntityType.insurance)
    return _to_out(policy, counts)


@router.put("/{policy_id}", response_model=InsuranceOut)
def update_policy(
    policy_id: int,
    payload: InsuranceUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    policy = (
        db.query(InsurancePolicy)
        .filter(InsurancePolicy.id == policy_id, InsurancePolicy.user_id == current_user.id)
        .first()
    )
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(policy, key, value)
    db.commit()
    db.refresh(policy)
    generate_renewal_notifications(db, current_user)
    counts = attachment_counts(db, current_user, EntityType.insurance)
    return _to_out(policy, counts)


@router.delete("/{policy_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_policy(
    policy_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    policy = (
        db.query(InsurancePolicy)
        .filter(InsurancePolicy.id == policy_id, InsurancePolicy.user_id == current_user.id)
        .first()
    )
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    delete_attachments_for_entity(
        db, current_user, entity_type=EntityType.insurance, entity_id=policy.id
    )
    db.delete(policy)
    db.commit()
