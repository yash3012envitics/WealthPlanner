from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import NetWorthGoal, User
from app.schemas import NetWorthGoalCreate, NetWorthGoalOut, NetWorthGoalUpdate

router = APIRouter(prefix="/api/goals", tags=["goals"])


@router.get("", response_model=list[NetWorthGoalOut])
def list_goals(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return (
        db.query(NetWorthGoal)
        .filter(NetWorthGoal.user_id == current_user.id)
        .order_by(NetWorthGoal.target_date.asc())
        .all()
    )


@router.get("/active", response_model=NetWorthGoalOut | None)
def get_active_goal(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = (
        db.query(NetWorthGoal)
        .filter(NetWorthGoal.user_id == current_user.id, NetWorthGoal.is_active.is_(True))
        .order_by(NetWorthGoal.target_date.asc())
        .first()
    )
    return item


@router.post("", response_model=NetWorthGoalOut, status_code=status.HTTP_201_CREATED)
def create_goal(
    payload: NetWorthGoalCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if payload.is_active:
        db.query(NetWorthGoal).filter(
            NetWorthGoal.user_id == current_user.id,
            NetWorthGoal.is_active.is_(True),
        ).update({"is_active": False})
    item = NetWorthGoal(**payload.model_dump(), user_id=current_user.id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.put("/{goal_id}", response_model=NetWorthGoalOut)
def update_goal(
    goal_id: int,
    payload: NetWorthGoalUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = (
        db.query(NetWorthGoal)
        .filter(NetWorthGoal.id == goal_id, NetWorthGoal.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Goal not found")

    data = payload.model_dump(exclude_unset=True)
    if data.get("is_active") is True:
        db.query(NetWorthGoal).filter(
            NetWorthGoal.user_id == current_user.id,
            NetWorthGoal.id != goal_id,
            NetWorthGoal.is_active.is_(True),
        ).update({"is_active": False})

    for key, value in data.items():
        setattr(item, key, value)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(
    goal_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    item = (
        db.query(NetWorthGoal)
        .filter(NetWorthGoal.id == goal_id, NetWorthGoal.user_id == current_user.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Goal not found")
    db.delete(item)
    db.commit()
