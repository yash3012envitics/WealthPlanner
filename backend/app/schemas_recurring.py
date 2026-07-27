from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.models import (
    EntityType,
    InstallmentStatus,
    PaymentFrequency,
    RecurringPlanKind,
)


class RecurringPlanCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    plan_kind: RecurringPlanKind
    frequency: PaymentFrequency
    installment_amount: float = Field(gt=0)
    start_date: date
    end_date: Optional[date] = None
    term_years: Optional[float] = Field(default=None, gt=0)
    total_installments: Optional[int] = Field(default=None, gt=0)
    entity_type: Optional[EntityType] = None
    entity_id: Optional[int] = None
    auto_notify: bool = True
    notes: Optional[str] = None


class RecurringPlanUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)
    plan_kind: Optional[RecurringPlanKind] = None
    frequency: Optional[PaymentFrequency] = None
    installment_amount: Optional[float] = Field(default=None, gt=0)
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    term_years: Optional[float] = Field(default=None, gt=0)
    total_installments: Optional[int] = Field(default=None, gt=0)
    entity_type: Optional[EntityType] = None
    entity_id: Optional[int] = None
    is_active: Optional[bool] = None
    auto_notify: Optional[bool] = None
    notes: Optional[str] = None
    regenerate: bool = True


class InstallmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    plan_id: int
    user_id: int
    sequence_no: int
    due_date: date
    amount: float
    status: InstallmentStatus
    paid_date: Optional[date] = None
    paid_amount: Optional[float] = None
    notes: Optional[str] = None
    created_at: datetime


class InstallmentUpdate(BaseModel):
    status: Optional[InstallmentStatus] = None
    paid_date: Optional[date] = None
    paid_amount: Optional[float] = None
    notes: Optional[str] = None
    amount: Optional[float] = Field(default=None, gt=0)


class PlanSummary(BaseModel):
    paid_count: int
    pending_count: int
    skipped_count: int
    paid_amount: float
    remaining_amount: float
    next_due_date: Optional[date] = None
    next_due_amount: Optional[float] = None


class RecurringPlanOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    name: str
    plan_kind: RecurringPlanKind
    entity_type: Optional[EntityType] = None
    entity_id: Optional[int] = None
    frequency: PaymentFrequency
    installment_amount: float
    start_date: date
    end_date: date
    term_years: Optional[float] = None
    total_installments: int
    is_active: bool
    auto_notify: bool
    notes: Optional[str] = None
    created_at: datetime
    summary: PlanSummary
    installments: list[InstallmentOut] = []


class RecurringPlanListOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    name: str
    plan_kind: RecurringPlanKind
    entity_type: Optional[EntityType] = None
    entity_id: Optional[int] = None
    frequency: PaymentFrequency
    installment_amount: float
    start_date: date
    end_date: date
    term_years: Optional[float] = None
    total_installments: int
    is_active: bool
    auto_notify: bool
    notes: Optional[str] = None
    created_at: datetime
    summary: PlanSummary
