from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class KiteCredentialsIn(BaseModel):
    api_key: str = Field(min_length=4, max_length=100)
    api_secret: str = Field(min_length=4, max_length=100)


class KiteSessionIn(BaseModel):
    request_token: str = Field(min_length=6, max_length=255)


class KiteStatusOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    connected: bool
    has_credentials: bool
    is_active: bool
    kite_user_id: Optional[str] = None
    kite_user_name: Optional[str] = None
    last_synced_at: Optional[datetime] = None
    last_sync_status: Optional[str] = None
    last_sync_message: Optional[str] = None
    login_url: Optional[str] = None


class KiteLoginUrlOut(BaseModel):
    login_url: str
    redirect_hint: str


class KiteSyncResultOut(BaseModel):
    created: int
    updated: int
    removed: int
    equity_count: int
    mutual_fund_count: int
    sip_count: int = 0
    sip_created: int = 0
    sip_updated: int = 0
    sip_paused: int = 0
    orders_marked_paid: int = 0
    synced_at: datetime
    status: str
    message: str
    warnings: list[str] = []
