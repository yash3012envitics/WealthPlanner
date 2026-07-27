from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.config import settings
from app.database import get_db
from app.models import KiteConnection, User
from app.schemas_kite import (
    KiteCredentialsIn,
    KiteLoginUrlOut,
    KiteSessionIn,
    KiteStatusOut,
    KiteSyncResultOut,
)
from app.services.kite_sync import (
    KiteSyncError,
    exchange_request_token,
    get_connection,
    invalidate_session,
    login_url,
    sync_investments,
)

router = APIRouter(prefix="/api/kite", tags=["kite"])


def _status_payload(connection: KiteConnection | None) -> KiteStatusOut:
    if not connection:
        return KiteStatusOut(
            connected=False,
            has_credentials=False,
            is_active=False,
            login_url=None,
        )
    url = None
    try:
        url = login_url(connection)
    except Exception:
        url = None
    return KiteStatusOut(
        connected=bool(connection.access_token and connection.is_active),
        has_credentials=True,
        is_active=bool(connection.is_active),
        kite_user_id=connection.kite_user_id,
        kite_user_name=connection.kite_user_name,
        last_synced_at=connection.last_synced_at,
        last_sync_status=connection.last_sync_status,
        last_sync_message=connection.last_sync_message,
        login_url=url,
    )


@router.get("/status", response_model=KiteStatusOut)
def kite_status(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return _status_payload(get_connection(db, current_user))


@router.post("/credentials", response_model=KiteStatusOut)
def save_credentials(
    payload: KiteCredentialsIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    connection = get_connection(db, current_user)
    if connection:
        connection.api_key = payload.api_key.strip()
        connection.api_secret = payload.api_secret.strip()
        # Changing keys invalidates the previous session
        connection.access_token = None
        connection.is_active = False
        connection.last_sync_status = "credentials_updated"
        connection.last_sync_message = "Credentials saved. Complete Kite login next."
    else:
        connection = KiteConnection(
            user_id=current_user.id,
            api_key=payload.api_key.strip(),
            api_secret=payload.api_secret.strip(),
            is_active=False,
            last_sync_status="credentials_saved",
            last_sync_message="Credentials saved. Complete Kite login next.",
        )
        db.add(connection)
    db.commit()
    db.refresh(connection)
    return _status_payload(connection)


@router.post("/credentials/from-env", response_model=KiteStatusOut)
def save_credentials_from_env(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if not settings.kite_api_key or not settings.kite_api_secret:
        raise HTTPException(
            status_code=400,
            detail="Set KITE_API_KEY and KITE_API_SECRET in backend/.env first",
        )
    return save_credentials(
        KiteCredentialsIn(api_key=settings.kite_api_key, api_secret=settings.kite_api_secret),
        current_user,
        db,
    )


@router.get("/login-url", response_model=KiteLoginUrlOut)
def get_login_url(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    connection = get_connection(db, current_user)
    if not connection:
        if settings.kite_api_key and settings.kite_api_secret:
            connection = KiteConnection(
                user_id=current_user.id,
                api_key=settings.kite_api_key,
                api_secret=settings.kite_api_secret,
                is_active=False,
            )
            db.add(connection)
            db.commit()
            db.refresh(connection)
        else:
            raise HTTPException(status_code=400, detail="Save Kite API credentials first")
    try:
        url = login_url(connection)
    except KiteSyncError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return KiteLoginUrlOut(
        login_url=url,
        redirect_hint=(
            "After Zerodha login you are redirected to your app redirect URL with ?request_token=...&status=success. "
            f"Configured hint: {settings.kite_redirect_url}"
        ),
    )


@router.post("/session", response_model=KiteStatusOut)
def create_session(
    payload: KiteSessionIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    connection = get_connection(db, current_user)
    if not connection:
        raise HTTPException(status_code=400, detail="Save Kite API credentials first")
    try:
        connection = exchange_request_token(db, connection, payload.request_token.strip())
    except KiteSyncError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return _status_payload(connection)


@router.post("/sync", response_model=KiteSyncResultOut)
def sync_kite_and_coin(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        result = sync_investments(db, current_user)
    except KiteSyncError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return KiteSyncResultOut(**result)


@router.delete("/session", status_code=status.HTTP_204_NO_CONTENT)
def disconnect_kite(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    connection = get_connection(db, current_user)
    if not connection:
        return None
    invalidate_session(db, connection)
    return None
