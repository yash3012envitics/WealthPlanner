"""Seed default users and sample portfolio. Run: python -m app.seed"""

from datetime import date, timedelta

from app.auth import get_password_hash, get_user_by_email
from app.database import Base, SessionLocal, engine
from app.models import (
    InsurancePolicy,
    InsuranceType,
    Investment,
    InvestmentType,
    Liability,
    Property,
    User,
)
from app.services.notifications import generate_renewal_notifications

DEFAULT_EMAIL = "maulik@wealthplanner.app"
DEFAULT_PASSWORD = "demo1234"
DEFAULT_NAME = "Maulik"

EMPTY_EMAIL = "urvi@wealthplanner.app"
EMPTY_PASSWORD = "Envitcs@123"
EMPTY_NAME = "Urvi"

LEGACY_DEMO_EMAIL = "demo@wealthplanner.app"


def _ensure_user(db, *, email: str, full_name: str, password: str) -> User:
    user = get_user_by_email(db, email)
    if user:
        print(f"User already exists: {email}")
        return user
    user = User(
        email=email,
        full_name=full_name,
        hashed_password=get_password_hash(password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    print(f"Created user: {email} / {password}")
    return user


def _migrate_legacy_demo(db) -> User | None:
    """Rename demo@… to maulik@… if the old account still exists."""
    legacy = get_user_by_email(db, LEGACY_DEMO_EMAIL)
    if not legacy:
        return None
    existing = get_user_by_email(db, DEFAULT_EMAIL)
    if existing:
        print(f"Leaving legacy {LEGACY_DEMO_EMAIL} in place ({DEFAULT_EMAIL} already exists)")
        return None
    legacy.email = DEFAULT_EMAIL
    legacy.full_name = DEFAULT_NAME
    legacy.hashed_password = get_password_hash(DEFAULT_PASSWORD)
    db.commit()
    db.refresh(legacy)
    print(f"Renamed {LEGACY_DEMO_EMAIL} -> {DEFAULT_EMAIL}")
    return legacy


def _seed_sample_portfolio(db, user: User) -> None:
    if db.query(InsurancePolicy).filter(InsurancePolicy.user_id == user.id).count() == 0:
        today = date.today()
        policies = [
            InsurancePolicy(
                user_id=user.id,
                name="Family Health Cover",
                provider="HDFC Ergo",
                policy_number="HLTH-10021",
                insurance_type=InsuranceType.health,
                sum_assured=1000000,
                premium_amount=18500,
                premium_frequency="yearly",
                start_date=today - timedelta(days=300),
                renewal_date=today + timedelta(days=12),
                notes="Includes parents floater",
            ),
            InsurancePolicy(
                user_id=user.id,
                name="Term Protect 1Cr",
                provider="LIC",
                policy_number="TERM-88210",
                insurance_type=InsuranceType.term,
                sum_assured=10000000,
                premium_amount=14200,
                premium_frequency="yearly",
                start_date=today - timedelta(days=800),
                renewal_date=today + timedelta(days=45),
                notes="Coverage till age 65",
            ),
            InsurancePolicy(
                user_id=user.id,
                name="Car Comprehensive",
                provider="ICICI Lombard",
                policy_number="AUTO-44102",
                insurance_type=InsuranceType.auto,
                sum_assured=650000,
                premium_amount=9200,
                premium_frequency="yearly",
                start_date=today - timedelta(days=200),
                renewal_date=today + timedelta(days=25),
            ),
        ]
        db.add_all(policies)

    if db.query(Investment).filter(Investment.user_id == user.id).count() == 0:
        today = date.today()
        investments = [
            Investment(
                user_id=user.id,
                name="Reliance Industries",
                symbol="RELIANCE",
                investment_type=InvestmentType.stock,
                quantity=25,
                buy_price=2450,
                current_price=2980,
                purchase_date=today - timedelta(days=420),
            ),
            Investment(
                user_id=user.id,
                name="HDFC Bank",
                symbol="HDFCBANK",
                investment_type=InvestmentType.stock,
                quantity=40,
                buy_price=1520,
                current_price=1685,
                purchase_date=today - timedelta(days=210),
            ),
            Investment(
                user_id=user.id,
                name="Parag Parikh Flexi Cap",
                symbol="PPFAS",
                investment_type=InvestmentType.mutual_fund,
                quantity=320.45,
                buy_price=62.10,
                current_price=78.40,
                purchase_date=today - timedelta(days=560),
            ),
            Investment(
                user_id=user.id,
                name="Nifty 50 Index Fund",
                symbol="NIFTY50",
                investment_type=InvestmentType.mutual_fund,
                quantity=180.2,
                buy_price=185.0,
                current_price=214.5,
                purchase_date=today - timedelta(days=300),
            ),
        ]
        db.add_all(investments)

    if db.query(Property).filter(Property.user_id == user.id).count() == 0:
        db.add(
            Property(
                user_id=user.id,
                name="Pune Apartment",
                property_type="residential",
                address="Baner, Pune, MH",
                purchase_price=6500000,
                current_value=9200000,
                purchase_date=date.today() - timedelta(days=1400),
                notes="2BHK self-occupied",
            )
        )

    if db.query(Liability).filter(Liability.user_id == user.id).count() == 0:
        db.add(
            Liability(
                user_id=user.id,
                name="Home Loan",
                liability_type="home_loan",
                outstanding_amount=4200000,
                interest_rate=8.45,
                due_date=date.today() + timedelta(days=8),
                notes="EMI due early next month",
            )
        )


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        migrated = _migrate_legacy_demo(db)
        user = migrated or _ensure_user(
            db,
            email=DEFAULT_EMAIL,
            full_name=DEFAULT_NAME,
            password=DEFAULT_PASSWORD,
        )
        _seed_sample_portfolio(db, user)
        db.commit()
        created = generate_renewal_notifications(db, user)
        print(f"Sample portfolio ready for {DEFAULT_EMAIL}. Renewal notifications: {created}")

        # Empty account — no portfolio rows
        _ensure_user(
            db,
            email=EMPTY_EMAIL,
            full_name=EMPTY_NAME,
            password=EMPTY_PASSWORD,
        )
        print(f"Empty user ready: {EMPTY_EMAIL} (no seeded data)")
    finally:
        db.close()


if __name__ == "__main__":
    seed()
