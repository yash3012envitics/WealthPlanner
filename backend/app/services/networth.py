from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models import Asset, InsurancePolicy, Investment, Liability, Property, User
from app.schemas import NetWorthBreakdown


def compute_net_worth(db: Session, user: User) -> NetWorthBreakdown:
    investments = db.query(Investment).filter(Investment.user_id == user.id).all()
    properties = db.query(Property).filter(Property.user_id == user.id).all()
    assets = db.query(Asset).filter(Asset.user_id == user.id).all()
    policies = db.query(InsurancePolicy).filter(InsurancePolicy.user_id == user.id).all()
    liabilities = db.query(Liability).filter(Liability.user_id == user.id).all()

    investments_total = sum(i.quantity * i.current_price for i in investments)
    properties_total = sum(p.current_value for p in properties)
    other_assets_total = sum(a.current_value for a in assets)
    insurance_cash_value = 0.0
    total_liabilities = sum(li.outstanding_amount for li in liabilities)
    total_assets = investments_total + properties_total + other_assets_total + insurance_cash_value

    return NetWorthBreakdown(
        investments=round(investments_total, 2),
        properties=round(properties_total, 2),
        other_assets=round(other_assets_total, 2),
        insurance_cash_value=round(insurance_cash_value, 2),
        total_assets=round(total_assets, 2),
        total_liabilities=round(total_liabilities, 2),
        net_worth=round(total_assets - total_liabilities, 2),
        as_of=datetime.now(timezone.utc),
        investment_count=len(investments),
        property_count=len(properties),
        asset_count=len(assets),
        insurance_count=len(policies),
        liability_count=len(liabilities),
    )
