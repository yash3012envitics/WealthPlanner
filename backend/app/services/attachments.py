from __future__ import annotations

import re
import uuid
from pathlib import Path

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    Attachment,
    Asset,
    EntityType,
    InsurancePolicy,
    Investment,
    Liability,
    Property,
    User,
)

ENTITY_MODELS = {
    EntityType.insurance: InsurancePolicy,
    EntityType.investment: Investment,
    EntityType.property: Property,
    EntityType.liability: Liability,
    EntityType.asset: Asset,
}


def uploads_root() -> Path:
    root = Path(settings.upload_dir)
    if not root.is_absolute():
        # Resolve relative to backend working directory
        root = Path.cwd() / root
    root.mkdir(parents=True, exist_ok=True)
    return root


def _safe_stem(name: str) -> str:
    stem = Path(name).stem
    cleaned = re.sub(r"[^A-Za-z0-9._-]+", "_", stem).strip("._")
    return cleaned[:80] or "document"


def assert_entity_owned(db: Session, user: User, entity_type: EntityType, entity_id: int):
    model = ENTITY_MODELS.get(entity_type)
    if not model:
        raise HTTPException(status_code=400, detail="Unsupported entity type")
    item = db.query(model).filter(model.id == entity_id, model.user_id == user.id).first()
    if not item:
        raise HTTPException(status_code=404, detail=f"{entity_type.value} record not found")
    return item


async def save_upload(
    db: Session,
    user: User,
    *,
    entity_type: EntityType,
    entity_id: int,
    file: UploadFile,
    title: str | None = None,
    notes: str | None = None,
) -> Attachment:
    assert_entity_owned(db, user, entity_type, entity_id)

    original = file.filename or "document"
    suffix = Path(original).suffix.lower()
    if suffix not in settings.allowed_upload_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"File type '{suffix or 'unknown'}' not allowed. Allowed: {', '.join(settings.allowed_upload_extensions)}",
        )

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"File exceeds max size of {settings.max_upload_bytes // (1024 * 1024)} MB",
        )

    stored_name = f"{uuid.uuid4().hex}_{_safe_stem(original)}{suffix}"
    relative_dir = Path(str(user.id)) / entity_type.value / str(entity_id)
    absolute_dir = uploads_root() / relative_dir
    absolute_dir.mkdir(parents=True, exist_ok=True)
    absolute_path = absolute_dir / stored_name
    absolute_path.write_bytes(data)

    attachment = Attachment(
        user_id=user.id,
        entity_type=entity_type,
        entity_id=entity_id,
        filename=stored_name,
        original_filename=original,
        content_type=file.content_type or "application/octet-stream",
        size_bytes=len(data),
        title=title or Path(original).stem,
        notes=notes,
        storage_path=str(relative_dir / stored_name).replace("\\", "/"),
    )
    db.add(attachment)
    db.commit()
    db.refresh(attachment)
    return attachment


def list_attachments(
    db: Session,
    user: User,
    *,
    entity_type: EntityType | None = None,
    entity_id: int | None = None,
) -> list[Attachment]:
    query = db.query(Attachment).filter(Attachment.user_id == user.id)
    if entity_type is not None:
        query = query.filter(Attachment.entity_type == entity_type)
    if entity_id is not None:
        query = query.filter(Attachment.entity_id == entity_id)
    return query.order_by(Attachment.created_at.desc()).all()


def get_owned_attachment(db: Session, user: User, attachment_id: int) -> Attachment:
    item = (
        db.query(Attachment)
        .filter(Attachment.id == attachment_id, Attachment.user_id == user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Attachment not found")
    return item


def absolute_path_for(attachment: Attachment) -> Path:
    path = uploads_root() / attachment.storage_path
    if not path.exists():
        raise HTTPException(status_code=404, detail="File missing on disk")
    return path


def delete_attachment(db: Session, user: User, attachment_id: int) -> None:
    item = get_owned_attachment(db, user, attachment_id)
    path = uploads_root() / item.storage_path
    db.delete(item)
    db.commit()
    if path.exists():
        path.unlink(missing_ok=True)


def delete_attachments_for_entity(
    db: Session,
    user: User,
    *,
    entity_type: EntityType,
    entity_id: int,
) -> None:
    items = list_attachments(db, user, entity_type=entity_type, entity_id=entity_id)
    for item in items:
        path = uploads_root() / item.storage_path
        db.delete(item)
        if path.exists():
            path.unlink(missing_ok=True)
    if items:
        db.commit()


def attachment_counts(db: Session, user: User, entity_type: EntityType) -> dict[int, int]:
    rows = (
        db.query(Attachment.entity_id, Attachment.id)
        .filter(Attachment.user_id == user.id, Attachment.entity_type == entity_type)
        .all()
    )
    counts: dict[int, int] = {}
    for entity_id, _ in rows:
        counts[entity_id] = counts.get(entity_id, 0) + 1
    return counts
