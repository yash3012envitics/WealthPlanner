from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models import AssetType, CashFlowFrequency, InsuranceType, InvestmentType, NotificationType


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=6, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: EmailStr
    full_name: str
    created_at: datetime


class InsuranceBase(BaseModel):
    name: str
    provider: str
    policy_number: str
    insurance_type: InsuranceType
    sum_assured: float = 0
    premium_amount: float = 0
    premium_frequency: str = "yearly"
    start_date: date
    renewal_date: date
    notes: Optional[str] = None


class InsuranceCreate(InsuranceBase):
    pass


class InsuranceUpdate(BaseModel):
    name: Optional[str] = None
    provider: Optional[str] = None
    policy_number: Optional[str] = None
    insurance_type: Optional[InsuranceType] = None
    sum_assured: Optional[float] = None
    premium_amount: Optional[float] = None
    premium_frequency: Optional[str] = None
    start_date: Optional[date] = None
    renewal_date: Optional[date] = None
    notes: Optional[str] = None


class InsuranceOut(InsuranceBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_at: datetime
    attachment_count: int = 0


class InvestmentBase(BaseModel):
    name: str
    symbol: Optional[str] = None
    investment_type: InvestmentType
    quantity: float = 0
    buy_price: float = 0
    current_price: float = 0
    purchase_date: date
    notes: Optional[str] = None


class InvestmentCreate(InvestmentBase):
    pass


class InvestmentUpdate(BaseModel):
    name: Optional[str] = None
    symbol: Optional[str] = None
    investment_type: Optional[InvestmentType] = None
    quantity: Optional[float] = None
    buy_price: Optional[float] = None
    current_price: Optional[float] = None
    purchase_date: Optional[date] = None
    notes: Optional[str] = None


class InvestmentOut(InvestmentBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    current_value: float
    invested_value: float
    gain_loss: float
    gain_loss_pct: float = 0
    source: str = "manual"
    external_id: Optional[str] = None
    isin: Optional[str] = None
    exchange: Optional[str] = None
    last_synced_at: Optional[datetime] = None
    created_at: datetime
    attachment_count: int = 0


class PropertyBase(BaseModel):
    name: str
    property_type: str = "residential"
    address: str
    purchase_price: float = 0
    current_value: float = 0
    purchase_date: date
    notes: Optional[str] = None


class PropertyCreate(PropertyBase):
    pass


class PropertyUpdate(BaseModel):
    name: Optional[str] = None
    property_type: Optional[str] = None
    address: Optional[str] = None
    purchase_price: Optional[float] = None
    current_value: Optional[float] = None
    purchase_date: Optional[date] = None
    notes: Optional[str] = None


class PropertyOut(PropertyBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_at: datetime
    attachment_count: int = 0


class LiabilityBase(BaseModel):
    name: str
    liability_type: str = "loan"
    outstanding_amount: float = 0
    interest_rate: float = 0
    due_date: Optional[date] = None
    notes: Optional[str] = None


class LiabilityCreate(LiabilityBase):
    pass


class LiabilityUpdate(BaseModel):
    name: Optional[str] = None
    liability_type: Optional[str] = None
    outstanding_amount: Optional[float] = None
    interest_rate: Optional[float] = None
    due_date: Optional[date] = None
    notes: Optional[str] = None


class LiabilityOut(LiabilityBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_at: datetime
    attachment_count: int = 0


class AssetBase(BaseModel):
    name: str
    asset_type: AssetType
    quantity: float = 0
    unit: Optional[str] = None
    purity_karat: float = 24
    purchase_value: float = 0
    current_value: float = 0
    purchase_date: date
    maturity_date: Optional[date] = None
    interest_rate: float = 0
    institution: Optional[str] = None
    notes: Optional[str] = None


class AssetCreate(AssetBase):
    pass


class AssetUpdate(BaseModel):
    name: Optional[str] = None
    asset_type: Optional[AssetType] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    purity_karat: Optional[float] = None
    purchase_value: Optional[float] = None
    current_value: Optional[float] = None
    purchase_date: Optional[date] = None
    maturity_date: Optional[date] = None
    interest_rate: Optional[float] = None
    institution: Optional[str] = None
    notes: Optional[str] = None


class AssetOut(AssetBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_at: datetime
    attachment_count: int = 0


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    title: str
    message: str
    notification_type: NotificationType
    related_entity: Optional[str] = None
    related_id: Optional[int] = None
    is_read: bool
    due_date: Optional[date] = None
    created_at: datetime


class NetWorthBreakdown(BaseModel):
    investments: float
    properties: float
    other_assets: float = 0
    insurance_cash_value: float
    total_assets: float
    total_liabilities: float
    net_worth: float
    as_of: datetime
    investment_count: int
    property_count: int
    asset_count: int = 0
    insurance_count: int
    liability_count: int


class MonthDues(BaseModel):
    label: str
    year: int
    month: int
    total_due: float
    installment_count: int


class UpcomingInstallmentOut(BaseModel):
    id: int
    plan_id: int
    plan_name: str
    plan_kind: str
    due_date: date
    amount: float
    status: str
    source: Optional[str] = None


class DashboardOut(BaseModel):
    user: UserOut
    net_worth: NetWorthBreakdown
    upcoming_renewals: list[InsuranceOut]
    upcoming_installments: list[UpcomingInstallmentOut] = []
    dues_this_month: MonthDues
    dues_next_month: MonthDues
    unread_notifications: int
    recent_notifications: list[NotificationOut]


# --- Cashflow & planning ---


class IncomeBase(BaseModel):
    name: str
    amount: float = 0
    frequency: CashFlowFrequency = CashFlowFrequency.monthly
    category: str = "salary"
    is_active: bool = True
    notes: Optional[str] = None


class IncomeCreate(IncomeBase):
    pass


class IncomeUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    frequency: Optional[CashFlowFrequency] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class IncomeOut(IncomeBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_at: datetime
    monthly_amount: float = 0


class ExpenseBase(BaseModel):
    name: str
    amount: float = 0
    frequency: CashFlowFrequency = CashFlowFrequency.monthly
    category: str = "living"
    is_active: bool = True
    notes: Optional[str] = None


class ExpenseCreate(ExpenseBase):
    pass


class ExpenseUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    frequency: Optional[CashFlowFrequency] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None


class ExpenseOut(ExpenseBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_at: datetime
    monthly_amount: float = 0


class MonthOverrideUpsert(BaseModel):
    """Set actual amount for a calendar month. Link to a default entry, or leave entry_id null for one-off."""

    entry_id: Optional[int] = None
    amount: float
    name: Optional[str] = None
    notes: Optional[str] = None


class MonthOverrideOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    entry_id: Optional[int] = None
    year: int
    month: int
    amount: float
    name: Optional[str] = None
    notes: Optional[str] = None
    created_at: datetime


class ResolvedCashflowLine(BaseModel):
    entry_id: Optional[int] = None
    override_id: Optional[int] = None
    name: str
    category: str
    default_amount: float
    amount: float
    source: str  # override | default | one_off
    notes: Optional[str] = None


class MonthCashflowOut(BaseModel):
    year: int
    month: int
    label: str
    income_total: float
    expense_total: float
    default_income_total: float
    default_expense_total: float
    income_lines: list[ResolvedCashflowLine]
    expense_lines: list[ResolvedCashflowLine]


class NetWorthGoalBase(BaseModel):
    name: str = "Net worth target"
    target_amount: float
    target_date: date
    is_active: bool = True
    notes: Optional[str] = None
    expected_annual_return: float = Field(default=0.12, ge=0, le=0.5)


class NetWorthGoalCreate(NetWorthGoalBase):
    pass


class NetWorthGoalUpdate(BaseModel):
    name: Optional[str] = None
    target_amount: Optional[float] = None
    target_date: Optional[date] = None
    is_active: Optional[bool] = None
    notes: Optional[str] = None
    expected_annual_return: Optional[float] = Field(default=None, ge=0, le=0.5)


class NetWorthGoalOut(NetWorthGoalBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    created_at: datetime


class PlanSipLine(BaseModel):
    name: str
    monthly_amount: float
    frequency: str
    source: str
    next_due: Optional[date] = None


class InvestOptionSlice(BaseModel):
    label: str
    risk: str  # safe | moderate | moderate_aggressive
    percent: float
    amount: float
    expected_return: float
    track_record: Optional[str] = None
    rationale: Optional[str] = None


class PlanMonthRow(BaseModel):
    year: int
    month: int
    label: str
    income: float
    expenses: float
    income_source: str  # "defaults" | "mixed" | "overrides"
    expense_source: str
    monthly_invested: float = 0  # current active SIP total
    other_invest: float = 0  # non-SIP investments (e.g. insurance premiums)
    suggested_spend: float  # expenses + other_invest + SIP
    suggested_invest: float  # extra invest beyond SIP (after spend + EMI)
    invest_delta_vs_current_sip: float
    invest_options: list[InvestOptionSlice] = []
    projected_net_worth: float


class WealthPlanOut(BaseModel):
    current_net_worth: float
    target_amount: Optional[float] = None
    target_date: Optional[date] = None
    months_remaining: int = 0
    gap: float = 0
    expected_annual_return: float = 0.12
    monthly_income: float = 0
    monthly_expenses: float = 0
    default_monthly_income: float = 0
    default_monthly_expenses: float = 0
    monthly_sip: float = 0
    monthly_other_invest: float = 0  # premiums etc. (non-SIP)
    sip_lines: list[PlanSipLine] = []
    monthly_emi: float = 0
    monthly_premiums: float = 0
    monthly_committed_outflows: float = 0
    surplus: float = 0
    required_monthly_invest: float = 0
    suggested_monthly_invest: float = 0
    suggested_invest_delta: float = 0
    suggested_monthly_spend: float = 0  # expenses + other_invest + SIP
    projected_net_worth_at_target: float = 0
    invest_options: list[InvestOptionSlice] = []
    invest_options_blended_return: float = 0.12
    invest_options_note: str = ""
    on_track: bool = False
    feasible: bool = False
    summary: str = ""
    warnings: list[str] = []
    months: list[PlanMonthRow] = []
