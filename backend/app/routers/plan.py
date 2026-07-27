from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import User
from app.schemas import WealthPlanOut
from app.services.plan import compute_wealth_plan

router = APIRouter(prefix="/api/plan", tags=["plan"])


@router.get("", response_model=WealthPlanOut)
def get_wealth_plan(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return compute_wealth_plan(db, current_user)
