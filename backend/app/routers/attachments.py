from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import EntityType, User
from app.schemas_attachments import AttachmentOut, AttachmentUpdate
from app.services.attachments import (
    absolute_path_for,
    delete_attachment,
    get_owned_attachment,
    list_attachments,
    save_upload,
)

router = APIRouter(prefix="/api/attachments", tags=["attachments"])


def _to_out(item) -> AttachmentOut:
    return AttachmentOut(
        id=item.id,
        user_id=item.user_id,
        entity_type=item.entity_type,
        entity_id=item.entity_id,
        filename=item.filename,
        original_filename=item.original_filename,
        content_type=item.content_type,
        size_bytes=item.size_bytes,
        title=item.title,
        notes=item.notes,
        created_at=item.created_at,
        download_url=f"/api/attachments/{item.id}/download",
    )


@router.get("", response_model=list[AttachmentOut])
def get_attachments(
    entity_type: EntityType | None = None,
    entity_id: int | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    items = list_attachments(db, current_user, entity_type=entity_type, entity_id=entity_id)
    return [_to_out(i) for i in items]


@router.post("", response_model=AttachmentOut, status_code=status.HTTP_201_CREATED)
async def upload_attachment(
    entity_type: EntityType = Form(...),
    entity_id: int = Form(...),
    title: str | None = Form(None),
    notes: str | None = Form(None),
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = await save_upload(
        db,
        current_user,
        entity_type=entity_type,
        entity_id=entity_id,
        file=file,
        title=title,
        notes=notes,
    )
    return _to_out(item)


@router.patch("/{attachment_id}", response_model=AttachmentOut)
def update_attachment_meta(
    attachment_id: int,
    payload: AttachmentUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = get_owned_attachment(db, current_user, attachment_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return _to_out(item)


@router.get("/{attachment_id}/download")
def download_attachment(
    attachment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = get_owned_attachment(db, current_user, attachment_id)
    path = absolute_path_for(item)
    return FileResponse(
        path,
        media_type=item.content_type,
        filename=item.original_filename,
    )


@router.delete("/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_attachment(
    attachment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    delete_attachment(db, current_user, attachment_id)
    return None
