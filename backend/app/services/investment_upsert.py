from __future__ import annotations

from datetime import date, datetime

from sqlalchemy.orm import Session

from app.models import Investment, InvestmentType


def upsert_investment(
    db: Session,
    *,
    user_id: int,
    source: str,
    external_id: str,
    name: str,
    symbol: str | None,
    investment_type: InvestmentType,
    quantity: float,
    buy_price: float,
    current_price: float,
    isin: str | None,
    exchange: str | None,
    notes: str | None,
    synced_at: datetime,
) -> tuple[str, Investment]:
    existing = (
        db.query(Investment)
        .filter(
            Investment.user_id == user_id,
            Investment.source == source,
            Investment.external_id == external_id,
        )
        .first()
    )

    if existing:
        existing.name = name
        existing.symbol = symbol
        existing.investment_type = investment_type
        existing.quantity = quantity
        existing.buy_price = buy_price
        existing.current_price = current_price
        existing.isin = isin
        existing.exchange = exchange
        existing.notes = notes
        existing.last_synced_at = synced_at
        return "updated", existing

    item = Investment(
        user_id=user_id,
        name=name,
        symbol=symbol,
        investment_type=investment_type,
        quantity=quantity,
        buy_price=buy_price,
        current_price=current_price,
        purchase_date=date.today(),
        notes=notes,
        source=source,
        external_id=external_id,
        isin=isin,
        exchange=exchange,
        last_synced_at=synced_at,
    )
    db.add(item)
    return "created", item


def classify_equity_symbol(symbol: str | None) -> InvestmentType:
    s = (symbol or "").upper()
    if "ETF" in s or s.endswith("BEES") or "IETF" in s:
        return InvestmentType.etf
    return InvestmentType.stock
