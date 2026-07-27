from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import EntityType, Property, User
from app.schemas import PropertyCreate, PropertyOut, PropertyUpdate
from app.services.attachments import attachment_counts, delete_attachments_for_entity

router = APIRouter(prefix="/api/properties", tags=["properties"])


def _to_out(item: Property, counts: dict[int, int] | None = None) -> PropertyOut:
    data = PropertyOut.model_validate(item)
    data.attachment_count = (counts or {}).get(item.id, 0)
    return data


@router.get("", response_model=list[PropertyOut])
def list_properties(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    counts = attachment_counts(db, current_user, EntityType.property)
    items = (
        db.query(Property)
        .filter(Property.user_id == current_user.id)
        .order_by(Property.name.asc())
        .all()
    )
    return [_to_out(i, counts) for i in items]


@router.post("", response_model=PropertyOut, status_code=status.HTTP_201_CREATED)
def create_property(
    payload: PropertyCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = Property(**payload.model_dump(), user_id=current_user.id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return _to_out(item)


@router.put("/{property_id}", response_model=PropertyOut)
def update_property(
    property_id: int,
    payload: PropertyUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = (
        db.query(Property)
        .filter(Property.id == property_id, Property.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Property not found")

    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    counts = attachment_counts(db, current_user, EntityType.property)
    return _to_out(item, counts)


@router.delete("/{property_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_property(
    property_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = (
        db.query(Property)
        .filter(Property.id == property_id, Property.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Property not found")
    delete_attachments_for_entity(
        db, current_user, entity_type=EntityType.property, entity_id=item.id
    )
    db.delete(item)
    db.commit()
