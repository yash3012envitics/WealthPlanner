import enum
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class InsuranceType(str, enum.Enum):
    health = "health"
    term = "term"
    life = "life"
    auto = "auto"
    home = "home"
    other = "other"


class InvestmentType(str, enum.Enum):
    stock = "stock"
    mutual_fund = "mutual_fund"
    etf = "etf"
    bond = "bond"
    other = "other"


class NotificationType(str, enum.Enum):
    renewal_due = "renewal_due"
    premium_due = "premium_due"
    installment_due = "installment_due"
    price_alert = "price_alert"
    general = "general"


class PaymentFrequency(str, enum.Enum):
    monthly = "monthly"
    quarterly = "quarterly"
    half_yearly = "half_yearly"
    yearly = "yearly"


class InstallmentStatus(str, enum.Enum):
    pending = "pending"
    paid = "paid"
    skipped = "skipped"
    overdue = "overdue"


class RecurringPlanKind(str, enum.Enum):
    premium = "premium"  # insurance / term plan premiums
    sip = "sip"  # mutual fund / investment SIP
    emi = "emi"  # liability EMI
    other = "other"


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    insurance_policies = relationship("InsurancePolicy", back_populates="owner", cascade="all, delete-orphan")
    investments = relationship("Investment", back_populates="owner", cascade="all, delete-orphan")
    properties = relationship("Property", back_populates="owner", cascade="all, delete-orphan")
    liabilities = relationship("Liability", back_populates="owner", cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="owner", cascade="all, delete-orphan")
    kite_connection = relationship(
        "KiteConnection",
        back_populates="owner",
        cascade="all, delete-orphan",
        uselist=False,
    )
    attachments = relationship("Attachment", back_populates="owner", cascade="all, delete-orphan")
    recurring_plans = relationship("RecurringPlan", back_populates="owner", cascade="all, delete-orphan")
    assets = relationship("Asset", back_populates="owner", cascade="all, delete-orphan")
    income_entries = relationship("IncomeEntry", back_populates="owner", cascade="all, delete-orphan")
    expense_entries = relationship("ExpenseEntry", back_populates="owner", cascade="all, delete-orphan")
    income_month_overrides = relationship(
        "IncomeMonthOverride", back_populates="owner", cascade="all, delete-orphan"
    )
    expense_month_overrides = relationship(
        "ExpenseMonthOverride", back_populates="owner", cascade="all, delete-orphan"
    )
    net_worth_goals = relationship("NetWorthGoal", back_populates="owner", cascade="all, delete-orphan")


class EntityType(str, enum.Enum):
    insurance = "insurance"
    investment = "investment"
    property = "property"
    liability = "liability"
    asset = "asset"


class AssetType(str, enum.Enum):
    gold = "gold"
    silver = "silver"
    fixed_deposit = "fixed_deposit"
    cash = "cash"
    home_payment = "home_payment"  # amount paid toward home / down payment
    ppf = "ppf"
    epf = "epf"
    nps = "nps"
    crypto = "crypto"
    other = "other"


class CashFlowFrequency(str, enum.Enum):
    weekly = "weekly"
    biweekly = "biweekly"
    monthly = "monthly"
    quarterly = "quarterly"
    yearly = "yearly"


class InsurancePolicy(Base):
    __tablename__ = "insurance_policies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    provider: Mapped[str] = mapped_column(String(255), nullable=False)
    policy_number: Mapped[str] = mapped_column(String(100), nullable=False)
    insurance_type: Mapped[InsuranceType] = mapped_column(Enum(InsuranceType), nullable=False)
    sum_assured: Mapped[float] = mapped_column(Float, default=0.0)
    premium_amount: Mapped[float] = mapped_column(Float, default=0.0)
    premium_frequency: Mapped[str] = mapped_column(String(50), default="yearly")
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    renewal_date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="insurance_policies")


class Investment(Base):
    __tablename__ = "investments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    symbol: Mapped[str | None] = mapped_column(String(50), nullable=True)
    investment_type: Mapped[InvestmentType] = mapped_column(Enum(InvestmentType), nullable=False)
    quantity: Mapped[float] = mapped_column(Float, default=0.0)
    buy_price: Mapped[float] = mapped_column(Float, default=0.0)
    current_price: Mapped[float] = mapped_column(Float, default=0.0)
    purchase_date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Sync metadata — source is "manual", "kite", or "coin"
    source: Mapped[str] = mapped_column(String(50), default="manual", index=True)
    external_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    isin: Mapped[str | None] = mapped_column(String(32), nullable=True)
    exchange: Mapped[str | None] = mapped_column(String(20), nullable=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="investments")

    @property
    def current_value(self) -> float:
        return self.quantity * self.current_price

    @property
    def invested_value(self) -> float:
        return self.quantity * self.buy_price

    @property
    def gain_loss(self) -> float:
        return self.current_value - self.invested_value


class Property(Base):
    __tablename__ = "properties"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    property_type: Mapped[str] = mapped_column(String(100), default="residential")
    address: Mapped[str] = mapped_column(String(500), nullable=False)
    purchase_price: Mapped[float] = mapped_column(Float, default=0.0)
    current_value: Mapped[float] = mapped_column(Float, default=0.0)
    purchase_date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="properties")


class Asset(Base):
    """Other assets: gold, silver, FDs, cash, home payments, PPF, etc."""

    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    asset_type: Mapped[AssetType] = mapped_column(Enum(AssetType), nullable=False, index=True)
    quantity: Mapped[float] = mapped_column(Float, default=0.0)  # e.g. grams for gold/silver
    unit: Mapped[str | None] = mapped_column(String(50), nullable=True)  # grams, kg, units
    purity_karat: Mapped[float] = mapped_column(Float, default=24.0)  # 24 / 22 / 18 for gold
    purchase_value: Mapped[float] = mapped_column(Float, default=0.0)
    current_value: Mapped[float] = mapped_column(Float, default=0.0)
    purchase_date: Mapped[date] = mapped_column(Date, nullable=False)
    maturity_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    interest_rate: Mapped[float] = mapped_column(Float, default=0.0)
    institution: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="assets")


class Liability(Base):
    """Debts subtracted from net worth (home loan, personal loan, credit card, etc.)."""

    __tablename__ = "liabilities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    liability_type: Mapped[str] = mapped_column(String(100), default="loan")
    outstanding_amount: Mapped[float] = mapped_column(Float, default=0.0)
    interest_rate: Mapped[float] = mapped_column(Float, default=0.0)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="liabilities")


class KiteConnection(Base):
    """Per-user Zerodha Kite Connect credentials and session (covers Kite equity + Coin MF)."""

    __tablename__ = "kite_connections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), unique=True, nullable=False, index=True)
    api_key: Mapped[str] = mapped_column(String(100), nullable=False)
    api_secret: Mapped[str] = mapped_column(String(100), nullable=False)
    access_token: Mapped[str | None] = mapped_column(String(255), nullable=True)
    kite_user_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    kite_user_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_sync_status: Mapped[str | None] = mapped_column(String(50), nullable=True)
    last_sync_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    owner = relationship("User", back_populates="kite_connection")


class Attachment(Base):
    """Documents attached to insurance, investments, property, or liabilities."""

    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    entity_type: Mapped[EntityType] = mapped_column(Enum(EntityType), nullable=False, index=True)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(120), default="application/octet-stream")
    size_bytes: Mapped[int] = mapped_column(Integer, default=0)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="attachments")


class RecurringPlan(Base):
    """Master recurring schedule (premium / SIP / EMI) that auto-generates installment children."""

    __tablename__ = "recurring_plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    plan_kind: Mapped[RecurringPlanKind] = mapped_column(Enum(RecurringPlanKind), nullable=False)
    entity_type: Mapped[EntityType | None] = mapped_column(Enum(EntityType), nullable=True, index=True)
    entity_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    frequency: Mapped[PaymentFrequency] = mapped_column(Enum(PaymentFrequency), nullable=False)
    installment_amount: Mapped[float] = mapped_column(Float, default=0.0)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    term_years: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_installments: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    auto_notify: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Sync metadata — source is "manual", "kite", or "coin"
    source: Mapped[str] = mapped_column(String(50), default="manual", index=True)
    external_id: Mapped[str | None] = mapped_column(String(100), nullable=True, index=True)
    excluded_due_dates: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    owner = relationship("User", back_populates="recurring_plans")
    installments = relationship(
        "InstallmentOccurrence",
        back_populates="plan",
        cascade="all, delete-orphan",
        order_by="InstallmentOccurrence.due_date",
    )


class InstallmentOccurrence(Base):
    """Child payment occurrence under a recurring plan (auto-generated)."""

    __tablename__ = "installment_occurrences"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    plan_id: Mapped[int] = mapped_column(ForeignKey("recurring_plans.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    sequence_no: Mapped[int] = mapped_column(Integer, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    amount: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[InstallmentStatus] = mapped_column(
        Enum(InstallmentStatus), default=InstallmentStatus.pending, index=True
    )
    paid_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    paid_amount: Mapped[float | None] = mapped_column(Float, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    plan = relationship("RecurringPlan", back_populates="installments")


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    notification_type: Mapped[NotificationType] = mapped_column(Enum(NotificationType), nullable=False)
    related_entity: Mapped[str | None] = mapped_column(String(100), nullable=True)
    related_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="notifications")


class IncomeEntry(Base):
    """Regular income stream (salary, rent, freelance, etc.)."""

    __tablename__ = "income_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[float] = mapped_column(Float, default=0.0)
    frequency: Mapped[CashFlowFrequency] = mapped_column(
        Enum(CashFlowFrequency), default=CashFlowFrequency.monthly, index=True
    )
    category: Mapped[str] = mapped_column(String(100), default="salary")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="income_entries")
    month_overrides = relationship(
        "IncomeMonthOverride", back_populates="income_entry", cascade="all, delete-orphan"
    )


class ExpenseEntry(Base):
    """Regular living expense (rent, groceries, utilities, etc.)."""

    __tablename__ = "expense_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    amount: Mapped[float] = mapped_column(Float, default=0.0)
    frequency: Mapped[CashFlowFrequency] = mapped_column(
        Enum(CashFlowFrequency), default=CashFlowFrequency.monthly, index=True
    )
    category: Mapped[str] = mapped_column(String(100), default="living")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="expense_entries")
    month_overrides = relationship(
        "ExpenseMonthOverride", back_populates="expense_entry", cascade="all, delete-orphan"
    )


class IncomeMonthOverride(Base):
    """Actual income for a specific calendar month. Falls back to IncomeEntry default when missing."""

    __tablename__ = "income_month_overrides"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    # When set, overrides that recurring stream for year/month. When null, one-off for the month.
    income_entry_id: Mapped[int | None] = mapped_column(
        ForeignKey("income_entries.id"), nullable=True, index=True
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    month: Mapped[int] = mapped_column(Integer, nullable=False, index=True)  # 1-12
    amount: Mapped[float] = mapped_column(Float, default=0.0)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="income_month_overrides")
    income_entry = relationship("IncomeEntry", back_populates="month_overrides")


class ExpenseMonthOverride(Base):
    """Actual expense for a specific calendar month. Falls back to ExpenseEntry default when missing."""

    __tablename__ = "expense_month_overrides"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    expense_entry_id: Mapped[int | None] = mapped_column(
        ForeignKey("expense_entries.id"), nullable=True, index=True
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    month: Mapped[int] = mapped_column(Integer, nullable=False, index=True)  # 1-12
    amount: Mapped[float] = mapped_column(Float, default=0.0)
    name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="expense_month_overrides")
    expense_entry = relationship("ExpenseEntry", back_populates="month_overrides")


class NetWorthGoal(Base):
    """Target net worth to reach by a given date."""

    __tablename__ = "net_worth_goals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), default="Net worth target")
    target_amount: Mapped[float] = mapped_column(Float, nullable=False)
    target_date: Mapped[date] = mapped_column(Date, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Assumed market CAGR used by the Plan tab (e.g. 0.12 = 12%)
    expected_annual_return: Mapped[float] = mapped_column(Float, default=0.12)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    owner = relationship("User", back_populates="net_worth_goals")
