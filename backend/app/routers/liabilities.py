from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import EntityType, Liability, User
from app.schemas import LiabilityCreate, LiabilityOut, LiabilityUpdate
from app.services.attachments import attachment_counts, delete_attachments_for_entity
from app.services.notifications import generate_renewal_notifications

router = APIRouter(prefix="/api/liabilities", tags=["liabilities"])


def _to_out(item: Liability, counts: dict[int, int] | None = None) -> LiabilityOut:
    data = LiabilityOut.model_validate(item)
    data.attachment_count = (counts or {}).get(item.id, 0)
    return data


@router.get("", response_model=list[LiabilityOut])
def list_liabilities(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    counts = attachment_counts(db, current_user, EntityType.liability)
    items = (
        db.query(Liability)
        .filter(Liability.user_id == current_user.id)
        .order_by(Liability.name.asc())
        .all()
    )
    return [_to_out(i, counts) for i in items]


@router.post("", response_model=LiabilityOut, status_code=status.HTTP_201_CREATED)
def create_liability(
    payload: LiabilityCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = Liability(**payload.model_dump(), user_id=current_user.id)
    db.add(item)
    db.commit()
    db.refresh(item)
    generate_renewal_notifications(db, current_user)
    return _to_out(item)


@router.put("/{liability_id}", response_model=LiabilityOut)
def update_liability(
    liability_id: int,
    payload: LiabilityUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = (
        db.query(Liability)
        .filter(Liability.id == liability_id, Liability.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Liability not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    generate_renewal_notifications(db, current_user)
    counts = attachment_counts(db, current_user, EntityType.liability)
    return _to_out(item, counts)


@router.delete("/{liability_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_liability(
    liability_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = (
        db.query(Liability)
        .filter(Liability.id == liability_id, Liability.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Liability not found")
    delete_attachments_for_entity(
        db, current_user, entity_type=EntityType.liability, entity_id=item.id
    )
    db.delete(item)
    db.commit()
