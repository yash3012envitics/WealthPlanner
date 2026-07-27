from __future__ import annotations

import calendar
from datetime import date, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.models import (
    EntityType,
    InstallmentOccurrence,
    InstallmentStatus,
    Investment,
    InvestmentType,
    PaymentFrequency,
    RecurringPlan,
    RecurringPlanKind,
    User,
)
from app.services.recurring import add_months, regenerate_installments


def _parse_date(value: Any) -> date | None:
    if value is None or value == "":
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    text = str(value).strip()
    if not text:
        return None
    # "2024-08-05" or "2024-08-05 10:00:00"
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        pass
    for fmt in ("%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(text[:10], fmt).date()
        except ValueError:
            continue
    return None


def _map_frequency(raw: Any) -> PaymentFrequency:
    key = str(raw or "monthly").strip().lower()
    if key in {"quarterly", "quarter"}:
        return PaymentFrequency.quarterly
    if key in {"halfyearly", "half_yearly", "half-yearly", "semi_annual", "semiannual"}:
        return PaymentFrequency.half_yearly
    if key in {"yearly", "annual", "annually"}:
        return PaymentFrequency.yearly
    # weekly/biweekly SIPs approximated as monthly for reminder calendar
    return PaymentFrequency.monthly


def _clamp_day(year: int, month: int, day: int) -> date:
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(max(int(day), 1), last))


def _next_due_from_day(today: date, day: int) -> date:
    candidate = _clamp_day(today.year, today.month, day)
    if candidate >= today:
        return candidate
    nxt = add_months(date(today.year, today.month, 1), 1)
    return _clamp_day(nxt.year, nxt.month, day)


def _sip_amount(sip: dict[str, Any]) -> float:
    for key in ("instalment_amount", "installment_amount", "amount"):
        if sip.get(key) not in (None, ""):
            try:
                return float(sip[key])
            except (TypeError, ValueError):
                continue
    return 0.0


def upsert_coin_sips(
    db: Session,
    user: User,
    sips: list[dict[str, Any]],
    *,
    investments_by_isin: dict[str, Investment],
) -> dict[str, int]:
    """
    Create/update RecurringPlan SIP rows from Coin mf_sips().
    Full MF transaction history is not available on Kite Connect — SIPs + recent orders drive dues.
    """
    today = date.today()
    created = updated = paused = 0
    seen_external: set[str] = set()

    for sip in sips:
        sip_id = str(sip.get("sip_id") or sip.get("sipId") or "").strip()
        if not sip_id:
            continue
        amount = _sip_amount(sip)
        if amount <= 0:
            continue

        tradingsymbol = str(sip.get("tradingsymbol") or sip.get("isin") or "").strip()
        fund_name = str(sip.get("fund") or tradingsymbol or "Mutual Fund SIP").strip()
        status = str(sip.get("status") or "").strip().upper()
        is_active = status in {"ACTIVE", "LIVE", ""}
        if status in {"CANCELLED", "CANCELED", "COMPLETE", "COMPLETED"}:
            is_active = False

        frequency = _map_frequency(sip.get("frequency"))
        instalment_day = int(sip.get("instalment_day") or sip.get("installment_day") or today.day)
        next_due = _parse_date(sip.get("next_instalment") or sip.get("next_installment"))
        last_paid = _parse_date(sip.get("last_instalment") or sip.get("last_installment"))

        if next_due is None:
            next_due = _next_due_from_day(today, instalment_day)

        # Only keep a short lookback — Kite Connect does not expose full MF purchase history
        start_date = add_months(next_due, -1)
        if last_paid:
            paid_cycle = _clamp_day(last_paid.year, last_paid.month, instalment_day)
            if paid_cycle >= add_months(today, -3) and paid_cycle < start_date:
                start_date = paid_cycle
        if start_date > next_due:
            start_date = next_due

        pending_left = sip.get("pending_instalments")
        total_instalments = sip.get("instalments")
        try:
            pending_left_n = int(pending_left) if pending_left not in (None, "") else None
        except (TypeError, ValueError):
            pending_left_n = None
        try:
            total_n = int(total_instalments) if total_instalments not in (None, "") else None
        except (TypeError, ValueError):
            total_n = None

        # Rolling horizon through next due + ~12 months (or remaining pending)
        step_months = {
            PaymentFrequency.monthly: 1,
            PaymentFrequency.quarterly: 3,
            PaymentFrequency.half_yearly: 6,
            PaymentFrequency.yearly: 12,
        }[frequency]
        # Coin often uses 999 / very large pending for open-ended SIPs
        if pending_left_n is not None and 0 < pending_left_n < 36:
            end_date = add_months(next_due, step_months * max(0, pending_left_n - 1))
        elif total_n is not None and 0 < total_n < 36:
            end_date = add_months(start_date, step_months * (total_n - 1))
            if end_date < next_due:
                end_date = add_months(next_due, step_months * 11)
        else:
            end_date = add_months(next_due, step_months * 11)

        if end_date < start_date:
            end_date = start_date

        investment = investments_by_isin.get(tradingsymbol) if tradingsymbol else None
        external_id = sip_id
        seen_external.add(external_id)

        plan = (
            db.query(RecurringPlan)
            .filter(
                RecurringPlan.user_id == user.id,
                RecurringPlan.source == "coin",
                RecurringPlan.external_id == external_id,
            )
            .first()
        )

        notes = (
            f"Synced from Coin SIP {sip_id}"
            + (f" · day={instalment_day}" if instalment_day else "")
            + (f" · next={next_due.isoformat()}" if next_due else "")
        )

        if plan is None:
            plan = RecurringPlan(
                user_id=user.id,
                name=f"SIP · {fund_name}",
                plan_kind=RecurringPlanKind.sip,
                entity_type=EntityType.investment if investment else None,
                entity_id=investment.id if investment else None,
                frequency=frequency,
                installment_amount=amount,
                start_date=start_date,
                end_date=end_date,
                term_years=None,
                total_installments=0,
                is_active=is_active,
                auto_notify=True,
                notes=notes,
                source="coin",
                external_id=external_id,
            )
            db.add(plan)
            db.flush()
            created += 1
        else:
            plan.name = f"SIP · {fund_name}"
            plan.frequency = frequency
            plan.installment_amount = amount
            plan.start_date = start_date
            plan.end_date = end_date
            plan.is_active = is_active
            plan.auto_notify = True
            plan.notes = notes
            if investment:
                plan.entity_type = EntityType.investment
                plan.entity_id = investment.id
            updated += 1
            if not is_active:
                paused += 1

        regenerate_installments(db, plan)

        # Mark historical dues as paid through last instalment date
        if last_paid:
            past = (
                db.query(InstallmentOccurrence)
                .filter(
                    InstallmentOccurrence.plan_id == plan.id,
                    InstallmentOccurrence.due_date <= last_paid,
                    InstallmentOccurrence.status != InstallmentStatus.paid,
                )
                .all()
            )
            for row in past:
                row.status = InstallmentStatus.paid
                row.paid_date = row.due_date
                row.paid_amount = row.amount

        # Ensure next due exists as pending/overdue
        if next_due and plan.is_active:
            row = (
                db.query(InstallmentOccurrence)
                .filter(
                    InstallmentOccurrence.plan_id == plan.id,
                    InstallmentOccurrence.due_date == next_due,
                )
                .first()
            )
            if row and row.status != InstallmentStatus.paid:
                row.amount = amount
                row.status = InstallmentStatus.overdue if next_due < today else InstallmentStatus.pending

    # Pause coin SIPs that disappeared from the API
    existing_coin = (
        db.query(RecurringPlan)
        .filter(RecurringPlan.user_id == user.id, RecurringPlan.source == "coin")
        .all()
    )
    for plan in existing_coin:
        if plan.external_id and plan.external_id not in seen_external and plan.is_active:
            plan.is_active = False
            paused += 1

    db.commit()
    return {"sip_created": created, "sip_updated": updated, "sip_paused": paused}


def apply_recent_mf_orders(
    db: Session,
    user: User,
    orders: list[dict[str, Any]],
) -> int:
    """Mark matching SIP installments paid using Coin orders from the last ~7 days."""
    marked = 0
    for order in orders:
        status = str(order.get("status") or "").strip().upper()
        txn = str(order.get("transaction_type") or order.get("transactionType") or "").strip().upper()
        if txn and txn not in {"BUY", "PURCHASE"}:
            continue
        if status and status not in {"COMPLETE", "COMPLETED", "RECEIVED", "SUCCESS", "FINISHED"}:
            continue

        amount = 0.0
        if order.get("amount") not in (None, ""):
            try:
                amount = float(order["amount"])
            except (TypeError, ValueError):
                amount = 0.0
        if amount <= 0 and order.get("quantity") not in (None, "") and order.get("average_price") not in (None, ""):
            try:
                amount = float(order["quantity"]) * float(order["average_price"])
            except (TypeError, ValueError):
                amount = 0.0
        if amount <= 0:
            continue

        paid_on = (
            _parse_date(order.get("order_timestamp"))
            or _parse_date(order.get("exchange_timestamp"))
            or _parse_date(order.get("order_date"))
            or _parse_date(order.get("date"))
        )
        if paid_on is None:
            continue

        isin = str(order.get("tradingsymbol") or order.get("isin") or "").strip()
        investment = None
        if isin:
            investment = (
                db.query(Investment)
                .filter(
                    Investment.user_id == user.id,
                    Investment.source == "coin",
                    Investment.investment_type == InvestmentType.mutual_fund,
                    Investment.isin == isin,
                )
                .first()
            )

        # Find nearest pending/overdue installment within ±10 days for matching SIP plan
        q = (
            db.query(InstallmentOccurrence)
            .join(RecurringPlan, RecurringPlan.id == InstallmentOccurrence.plan_id)
            .filter(
                InstallmentOccurrence.user_id == user.id,
                RecurringPlan.source == "coin",
                RecurringPlan.plan_kind == RecurringPlanKind.sip,
                InstallmentOccurrence.status.in_(
                    [InstallmentStatus.pending, InstallmentStatus.overdue]
                ),
                InstallmentOccurrence.due_date >= add_months(paid_on, -1),
                InstallmentOccurrence.due_date <= add_months(paid_on, 1),
            )
        )
        if investment:
            q = q.filter(RecurringPlan.entity_id == investment.id)

        candidates = q.order_by(InstallmentOccurrence.due_date.asc()).all()
        # Prefer amount match within 1 rupee, else closest due date
        best = None
        best_score = None
        for row in candidates:
            amount_delta = abs(float(row.amount or 0) - amount)
            day_delta = abs((row.due_date - paid_on).days)
            score = (0 if amount_delta < 1 else amount_delta) + day_delta
            if best is None or score < best_score:
                best = row
                best_score = score
        if best is None:
            continue
        best.status = InstallmentStatus.paid
        best.paid_date = paid_on
        best.paid_amount = amount
        marked += 1

    if marked:
        db.commit()
    return marked
