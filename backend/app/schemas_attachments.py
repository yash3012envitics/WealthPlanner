from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models import EntityType


class AttachmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    entity_type: EntityType
    entity_id: int
    filename: str
    original_filename: str
    content_type: str
    size_bytes: int
    title: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime
    download_url: str


class AttachmentUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=255)
    notes: Optional[str] = None
