from __future__ import annotations

from calendar import month_name
from datetime import date, timedelta

from kiteconnect.exceptions import KiteException
from sqlalchemy.orm import Session

from app.models import (
    InstallmentOccurrence,
    InstallmentStatus,
    Investment,
    InvestmentType,
    NetWorthGoal,
    RecurringPlan,
    RecurringPlanKind,
    User,
)
from app.schemas import InvestOptionSlice, PlanMonthRow, PlanSipLine, WealthPlanOut
from app.services.cashflow import (
    default_monthly_expenses,
    default_monthly_income,
    resolve_expense_month,
    resolve_income_month,
    to_monthly,
)
from app.services.networth import compute_net_worth
from app.services.recurring import add_months

DEFAULT_ANNUAL_RETURN = 0.12

# Research-backed sleeves (India + global), diversified to raise odds of ~12% long-term CAGR.
# Anchors: India equities ~12–14% over ~20–35Y; Midcap TRI ~15% / 20Y; S&P500 INR ~15% / 20Y;
# Gold INR strong but cyclical; Debt ~7–8%. 2026 context: India earnings recovery, DII support,
# FII/geopolitics/oil volatility → keep US + gold hedges, avoid single-sleeve concentration.
_BASE_ALLOCATION = [
    {
        "key": "large_index",
        "label": "Nifty 50 / Large-cap index (TRI)",
        "risk": "moderate",
        "percent": 0.22,
        "expected_return": 0.125,
        "track_record": "~12.4–12.6% CAGR over ~20Y (Nifty 50 TRI); India equity ~13.6% since 1990s",
        "rationale": "Core India beta. Fairer valuations in 2026 after correction; domestic flows cushion FII swings.",
    },
    {
        "key": "flexi",
        "label": "Flexi / Multi-cap equity funds",
        "risk": "moderate",
        "percent": 0.18,
        "expected_return": 0.135,
        "track_record": "Long-horizon flexi/multi category often ~13–17% / 10Y; top funds ~13–15% / 20Y",
        "rationale": "Active diversification across market caps; historically helped compound above plain large-cap.",
    },
    {
        "key": "mid",
        "label": "Mid-cap equity (index or active)",
        "risk": "moderate_aggressive",
        "percent": 0.15,
        "expected_return": 0.15,
        "track_record": "Nifty Midcap 150 TRI ~14.6–15.5% CAGR / 20Y (higher drawdowns)",
        "rationale": "Raises probability of beating 12%, but capped at 15% to avoid cycle risk (midcaps still richer).",
    },
    {
        "key": "us_equity",
        "label": "US equity FoF / S&P 500 (INR)",
        "risk": "moderate",
        "percent": 0.15,
        "expected_return": 0.145,
        "track_record": "S&P 500 TR in INR ~14.9% CAGR / 20Y; strong 10–15Y global compounding",
        "rationale": "Global diversification vs India-only risk; benefits from USD assets & world earnings leaders.",
    },
    {
        "key": "large_mid",
        "label": "Large & Mid Cap / Nifty Next 50",
        "risk": "moderate",
        "percent": 0.12,
        "expected_return": 0.135,
        "track_record": "Large & mid / Nifty 100–Next50 sleeve historically between large and mid (~13%+ long term)",
        "rationale": "Bridge between quality large-caps and growth mid-caps; spreads single-index dependence.",
    },
    {
        "key": "gold",
        "label": "Gold ETF / FoF (INR hedge)",
        "risk": "safe",
        "percent": 0.10,
        "expected_return": 0.10,
        "track_record": "Gold INR ~11%+ long multi-decade; ~14–16% / 20Y in recent windows (cyclical)",
        "rationale": "Hedge for geopolitics, inflation and oil shocks that hit India as energy importer (2026 risk).",
    },
    {
        "key": "safe_debt",
        "label": "Arbitrage / short-duration debt",
        "risk": "safe",
        "percent": 0.08,
        "expected_return": 0.07,
        "track_record": "Debt/cash historically ~7–8.3% CAGR over long Indian horizons",
        "rationale": "Small ballast so you stay invested through equity drawdowns — improves realized 12% odds.",
    },
]

_MARKET_CONTEXT_NOTE = (
    "Options ranked for maximizing the chance of ~12% long-term CAGR using ~20–35Y India/global track "
    "records (Nifty TRI ~12.5%, midcaps higher but volatile, S&P500 INR ~15%, gold hedge, light debt). "
    "2026 backdrop: India earnings recovery + DII support vs FII/geopolitics/oil volatility — hence US equity "
    "+ gold hedges and no sleeve above ~22%. Past returns ≠ future; illustrative, not advice."
)


def _classify_sip_bucket(name: str) -> str:
    text = (name or "").lower()
    if any(k in text for k in ("gold", "silver", "commodity")):
        return "gold"
    if any(k in text for k in ("debt", "liquid", "arbitrage", "gilt", "overnight", "bond")):
        return "safe_debt"
    if any(k in text for k in ("s&p", "nasdaq", "us ", "usa", "international", "global", "fof")):
        return "us_equity"
    if any(k in text for k in ("next 50", "large & mid", "large and mid", "largemid")):
        return "large_mid"
    if any(k in text for k in ("small cap", "smallcap")):
        return "mid"
    if any(k in text for k in ("mid cap", "midcap", "mid-cap")):
        return "mid"
    if any(k in text for k in ("nifty 50", "nifty50", "sensex", "large cap", "largecap")) and "mid" not in text:
        return "large_index"
    if any(k in text for k in ("nifty", "index")) and "mid" not in text and "next" not in text:
        return "large_index"
    if any(k in text for k in ("flexi", "multi cap", "multicap", "focused", "value", "elss")):
        return "flexi"
    return "flexi"


def _existing_sip_weights(sip_lines: list[PlanSipLine]) -> dict[str, float]:
    totals: dict[str, float] = {}
    for line in sip_lines:
        key = _classify_sip_bucket(line.name)
        totals[key] = totals.get(key, 0.0) + float(line.monthly_amount or 0)
    overall = sum(totals.values()) or 1.0
    return {k: v / overall for k, v in totals.items()}


def build_invest_options(
    amount: float,
    sip_lines: list[PlanSipLine] | None = None,
    *,
    target_return: float = DEFAULT_ANNUAL_RETURN,
) -> tuple[list[InvestOptionSlice], float]:
    """
    Pick the best diversified 5–7 sleeves for additional invest, tilted to maximize
    probability of ~12% long-term return (India + global history, current macro).
    """
    amount = max(0.0, float(amount or 0))
    weights = {row["key"]: float(row["percent"]) for row in _BASE_ALLOCATION}
    meta = {row["key"]: row for row in _BASE_ALLOCATION}

    existing = _existing_sip_weights(sip_lines or [])
    # Cut sleeves already heavy in current SIPs; prefer underweight growth/global sleeves
    for key, share in existing.items():
        if key not in weights:
            continue
        if share >= 0.30:
            cut = min(weights[key] * 0.5, max(0.0, weights[key] - 0.06))
            if cut <= 0:
                continue
            weights[key] -= cut
            prefer = [k for k in ("us_equity", "flexi", "large_mid", "mid", "gold", "safe_debt", "large_index") if k != key and k in weights]
            prefer.sort(key=lambda k: existing.get(k, 0.0))
            chunk = cut / max(len(prefer), 1)
            for r in prefer:
                weights[r] += chunk

    # Cap any sleeve at 22% — maximize 12% odds via diversification, not concentration
    max_sleeve = 0.22
    for _ in range(5):
        overweight = {k: w - max_sleeve for k, w in weights.items() if w > max_sleeve}
        if not overweight:
            break
        excess = sum(overweight.values())
        for k in overweight:
            weights[k] = max_sleeve
        under = [k for k, w in weights.items() if w < max_sleeve]
        if not under:
            break
        add = excess / len(under)
        for k in under:
            weights[k] = min(max_sleeve, weights[k] + add)

    total_w = sum(weights.values()) or 1.0
    weights = {k: w / total_w for k, w in weights.items()}
    blended = sum(weights[k] * float(meta[k]["expected_return"]) for k in weights)

    # If blended < target, shift from debt/gold into mid + US + flexi (still capped)
    if blended + 0.002 < target_return:
        donors = ["safe_debt", "gold"]
        receivers = ["mid", "us_equity", "flexi"]
        for donor in donors:
            if blended >= target_return:
                break
            room = max(0.0, weights.get(donor, 0) - 0.05)
            shift = min(0.03, room)
            if shift <= 0:
                continue
            weights[donor] -= shift
            for r in receivers:
                if weights[r] < max_sleeve:
                    take = min(shift / len(receivers), max_sleeve - weights[r])
                    weights[r] += take
                    shift -= take
            if shift > 0:
                weights[donor] += shift
            blended = sum(weights[k] * float(meta[k]["expected_return"]) for k in weights)

    total_w = sum(weights.values()) or 1.0
    weights = {k: w / total_w for k, w in weights.items()}
    blended = sum(weights[k] * float(meta[k]["expected_return"]) for k in weights)

    raw = []
    for key in sorted(weights.keys(), key=lambda k: weights[k], reverse=True):
        pct = weights[key]
        if pct < 0.04:  # drop tiny residual sleeves → keep 5–7 meaningful options
            continue
        raw.append(
            {
                "key": key,
                "label": meta[key]["label"],
                "risk": meta[key]["risk"],
                "percent": round(pct * 100, 1),
                "amount": round(amount * pct, 2) if amount else 0.0,
                "expected_return": float(meta[key]["expected_return"]),
                "track_record": meta[key].get("track_record"),
                "rationale": meta[key].get("rationale"),
            }
        )

    # Renormalize percents if some sleeves dropped
    pct_sum = sum(r["percent"] for r in raw) or 1.0
    for r in raw:
        r["percent"] = round(r["percent"] * 100.0 / pct_sum, 1)
        r["amount"] = round(amount * r["percent"] / 100.0, 2) if amount else 0.0
    if amount > 0 and raw:
        drift = round(amount - sum(r["amount"] for r in raw), 2)
        raw[0]["amount"] = round(raw[0]["amount"] + drift, 2)

    # Keep top 7 by weight
    raw = raw[:7]
    blended = sum((r["percent"] / 100.0) * r["expected_return"] for r in raw) if raw else blended

    options = [
        InvestOptionSlice(
            label=r["label"],
            risk=r["risk"],
            percent=r["percent"],
            amount=r["amount"],
            expected_return=r["expected_return"],
            track_record=r.get("track_record"),
            rationale=r.get("rationale"),
        )
        for r in raw
    ]
    return options, round(blended, 4)


def months_between(start: date, end: date) -> int:
    if end <= start:
        return 0
    years = end.year - start.year
    months = end.month - start.month
    total = years * 12 + months
    if end.day > start.day:
        total += 1
    return max(total, 1) if end > start and total == 0 else max(total, 0)


def active_goal(db: Session, user: User) -> NetWorthGoal | None:
    return (
        db.query(NetWorthGoal)
        .filter(NetWorthGoal.user_id == user.id, NetWorthGoal.is_active.is_(True))
        .order_by(NetWorthGoal.target_date.asc())
        .first()
    )


def _line_source_label(lines) -> str:
    sources = {line.source for line in lines}
    if sources <= {"default"}:
        return "defaults"
    if "default" in sources and (("override" in sources) or ("one_off" in sources)):
        return "mixed"
    return "overrides"


def monthly_rate(annual_return: float) -> float:
    return max(0.0, float(annual_return or 0)) / 12.0


def future_value(present: float, months: int, annual_return: float) -> float:
    """Compound present value for `months` at expected annual return."""
    if months <= 0:
        return round(present, 2)
    rm = monthly_rate(annual_return)
    if rm <= 0:
        return round(present, 2)
    return round(present * ((1.0 + rm) ** months), 2)


def required_monthly_invest(
    present: float,
    target: float,
    months: int,
    annual_return: float,
) -> float:
    """
    Monthly SIP needed so: present*(1+r)^n + SIP * ((1+r)^n - 1)/r = target.
    """
    if months <= 0:
        return 0.0
    gap = float(target) - float(present)
    if gap <= 0:
        return 0.0

    rm = monthly_rate(annual_return)
    if rm <= 0:
        return round(gap / months, 2)

    grown = float(present) * ((1.0 + rm) ** months)
    need_from_sips = float(target) - grown
    if need_from_sips <= 0:
        return 0.0
    factor = ((1.0 + rm) ** months - 1.0) / rm
    if factor <= 0:
        return round(need_from_sips / months, 2)
    return round(need_from_sips / factor, 2)


def project_with_sip(
    present: float,
    monthly_sip: float,
    months: int,
    annual_return: float,
) -> float:
    """End value after `months` of compounding + end-of-month SIP contributions."""
    value = float(present)
    rm = monthly_rate(annual_return)
    sip = float(monthly_sip or 0)
    for _ in range(max(0, months)):
        value = value * (1.0 + rm) + sip
    return round(value, 2)


def refresh_coin_sips_if_possible(db: Session, user: User) -> str | None:
    """Pull active Coin SIPs into RecurringPlan when a Kite session is available."""
    from app.services.coin_sips import upsert_coin_sips
    from app.services.kite_sync import KiteSyncError, build_client, get_connection

    connection = get_connection(db, user)
    if not connection or not connection.access_token or not connection.is_active:
        return None
    try:
        kite = build_client(connection)
        sips = kite.mf_sips() or []
    except (KiteException, KiteSyncError, Exception) as exc:
        return f"Could not refresh Coin SIPs for plan: {exc}"

    if not sips:
        return None

    investments_by_isin: dict[str, Investment] = {}
    for inv in (
        db.query(Investment)
        .filter(
            Investment.user_id == user.id,
            Investment.source == "coin",
            Investment.investment_type == InvestmentType.mutual_fund,
        )
        .all()
    ):
        if inv.isin:
            investments_by_isin[inv.isin] = inv
        if inv.symbol:
            investments_by_isin[inv.symbol] = inv

    upsert_coin_sips(db, user, sips, investments_by_isin=investments_by_isin)
    return None


def resolve_active_sips(db: Session, user: User) -> tuple[float, list[PlanSipLine]]:
    """Active SIP plans (Coin + manual), normalized to monthly amounts."""
    today = date.today()
    plans = (
        db.query(RecurringPlan)
        .filter(
            RecurringPlan.user_id == user.id,
            RecurringPlan.is_active.is_(True),
            RecurringPlan.plan_kind == RecurringPlanKind.sip,
        )
        .all()
    )
    lines: list[PlanSipLine] = []
    total = 0.0
    for plan in plans:
        monthly = to_monthly(plan.installment_amount, plan.frequency)
        if monthly <= 0:
            continue
        next_due = (
            db.query(InstallmentOccurrence)
            .filter(
                InstallmentOccurrence.plan_id == plan.id,
                InstallmentOccurrence.status.in_(
                    [InstallmentStatus.pending, InstallmentStatus.overdue]
                ),
                InstallmentOccurrence.due_date >= today - timedelta(days=7),
            )
            .order_by(InstallmentOccurrence.due_date.asc())
            .first()
        )
        lines.append(
            PlanSipLine(
                name=plan.name,
                monthly_amount=monthly,
                frequency=plan.frequency.value if hasattr(plan.frequency, "value") else str(plan.frequency),
                source=getattr(plan, "source", None) or "manual",
                next_due=next_due.due_date if next_due else None,
            )
        )
        total += monthly

    lines.sort(key=lambda x: x.monthly_amount, reverse=True)
    return round(total, 2), lines


def compute_wealth_plan(db: Session, user: User) -> WealthPlanOut:
    sip_warning = refresh_coin_sips_if_possible(db, user)

    nw = compute_net_worth(db, user)
    current = float(nw.net_worth)
    goal = active_goal(db, user)

    default_income = default_monthly_income(db, user)
    default_expenses = default_monthly_expenses(db, user)

    today = date.today()
    monthly_income, income_lines = resolve_income_month(db, user, today.year, today.month)
    monthly_expenses, expense_lines = resolve_expense_month(db, user, today.year, today.month)

    monthly_sip, sip_lines = resolve_active_sips(db, user)

    plans = (
        db.query(RecurringPlan)
        .filter(RecurringPlan.user_id == user.id, RecurringPlan.is_active.is_(True))
        .all()
    )
    monthly_emi = round(
        sum(
            to_monthly(p.installment_amount, p.frequency)
            for p in plans
            if p.plan_kind == RecurringPlanKind.emi
        ),
        2,
    )
    monthly_premiums = round(
        sum(
            to_monthly(p.installment_amount, p.frequency)
            for p in plans
            if p.plan_kind == RecurringPlanKind.premium
        ),
        2,
    )
    # SIP is a committed monthly outflow; other invest = insurance premiums (non-SIP)
    other_invest = round(monthly_premiums, 2)
    committed = round(monthly_expenses + monthly_emi + other_invest + monthly_sip, 2)
    surplus = round(monthly_income - committed, 2)
    # Spend = living expenses + other invest (premiums) + SIP
    base_spend = round(monthly_expenses + other_invest + monthly_sip, 2)

    annual_return = DEFAULT_ANNUAL_RETURN
    if goal is not None:
        annual_return = float(getattr(goal, "expected_annual_return", None) or DEFAULT_ANNUAL_RETURN)

    warnings: list[str] = []
    if sip_warning:
        warnings.append(sip_warning)
    if default_income <= 0 and monthly_income <= 0:
        warnings.append("Add regular income (and optional month overrides) so the plan can size spend and invest.")
    if default_expenses <= 0 and monthly_expenses <= 0:
        warnings.append("Add regular expenses (and optional month overrides) for a realistic spend budget.")
    if any(line.source != "default" for line in income_lines + expense_lines):
        warnings.append(
            f"{month_name[today.month][:3]} {today.year} uses month-specific amounts where entered; "
            "other months fall back to your defaults unless overridden."
        )
    if monthly_sip <= 0:
        mf_count = (
            db.query(Investment)
            .filter(
                Investment.user_id == user.id,
                Investment.investment_type == InvestmentType.mutual_fund,
            )
            .count()
        )
        if mf_count > 0:
            warnings.append(
                f"You have {mf_count} mutual fund holding(s) but no active SIP schedule. "
                "Sync Kite/Coin (or add SIP plans under Recurring) so Plan can count monthly invested amount."
            )

    if goal is None:
        warnings.append("Set a net worth target (amount + date) to unlock the full plan.")
        empty_options, blended = build_invest_options(0, sip_lines, target_return=annual_return)
        return WealthPlanOut(
            current_net_worth=current,
            expected_annual_return=annual_return,
            monthly_income=monthly_income,
            monthly_expenses=monthly_expenses,
            default_monthly_income=default_income,
            default_monthly_expenses=default_expenses,
            monthly_sip=monthly_sip,
            monthly_other_invest=other_invest,
            sip_lines=sip_lines,
            monthly_emi=monthly_emi,
            monthly_premiums=monthly_premiums,
            monthly_committed_outflows=committed,
            surplus=surplus,
            suggested_monthly_invest=0,
            suggested_invest_delta=0,
            suggested_monthly_spend=base_spend,
            projected_net_worth_at_target=current,
            invest_options=empty_options,
            invest_options_blended_return=blended,
            invest_options_note=_MARKET_CONTEXT_NOTE,
            summary="Set a target net worth by date to see month-by-month invest and spend guidance.",
            warnings=warnings,
        )

    months_left = months_between(today, goal.target_date)
    gap = round(float(goal.target_amount) - current, 2)

    if months_left <= 0:
        warnings.append("Target date is today or in the past — update the target date.")
        months_left = 1

    required_total = required_monthly_invest(current, float(goal.target_amount), months_left, annual_return)
    # Additional invest beyond current SIPs
    required_extra = round(max(0.0, required_total - monthly_sip), 2)
    grown_only = future_value(current, months_left, annual_return)
    if grown_only >= float(goal.target_amount) and gap > 0:
        warnings.append(
            f"At {annual_return * 100:.1f}% assumed market return, existing net worth alone "
            f"could reach about ₹{grown_only:,.0f} by the target date."
        )

    schedule_months = min(months_left, 120)
    month_cash: list[tuple[int, int, float, float, str, str]] = []
    cursor = today.replace(day=1)
    for _ in range(schedule_months):
        inc, inc_lines = resolve_income_month(db, user, cursor.year, cursor.month)
        exp, exp_lines = resolve_expense_month(db, user, cursor.year, cursor.month)
        month_cash.append(
            (
                cursor.year,
                cursor.month,
                inc,
                exp,
                _line_source_label(inc_lines),
                _line_source_label(exp_lines),
            )
        )
        cursor = add_months(cursor, 1)

    deficits = 0
    for _, _, inc, exp, _, _ in month_cash:
        # Free cash after Spend (exp + other invest + SIP) and EMI
        month_spend = exp + other_invest + monthly_sip
        month_surplus = inc - month_spend - monthly_emi
        if required_extra > 0 and month_surplus + 0.009 < required_extra:
            deficits += 1

    avg_surplus = (
        round(
            sum(
                (inc - (exp + other_invest + monthly_sip) - monthly_emi)
                for _, _, inc, exp, _, _ in month_cash
            )
            / max(len(month_cash), 1),
            2,
        )
        if month_cash
        else surplus
    )
    affordable_extra = max(0.0, avg_surplus)

    if required_extra <= 0:
        suggested_extra = 0.0
        on_track = True
        feasible = True
        if gap <= 0:
            summary = (
                f"You are already at or above your ₹{goal.target_amount:,.0f} target. "
                f"Spend (expenses + other invest + SIP) is ₹{base_spend:,.0f}/mo; no extra invest needed."
            )
        else:
            summary = (
                f"Current SIPs (₹{monthly_sip:,.0f}/mo) plus {annual_return * 100:.1f}% market growth "
                f"cover the target — no additional monthly invest needed."
            )
    elif affordable_extra >= required_extra and deficits == 0:
        suggested_extra = required_extra
        feasible = True
        on_track = True
        summary = ""
    elif affordable_extra >= required_extra:
        suggested_extra = required_extra
        feasible = True
        on_track = False
        warnings.append(
            f"{deficits} month(s) have lower surplus than the ₹{required_extra:,.0f}/mo extra invest target — "
            "review those months' overrides or cut expenses."
        )
        summary = ""
    else:
        suggested_extra = affordable_extra
        feasible = False
        on_track = False
        total_invest = monthly_sip + affordable_extra
        projected_affordable = project_with_sip(current, total_invest, months_left, annual_return)
        warnings.append(
            f"Average surplus after Spend + EMI (₹{avg_surplus:,.0f}/mo) is below the ₹{required_extra:,.0f}/mo "
            f"extra invest needed at {annual_return * 100:.1f}% assumed return."
        )
        summary = (
            f"After Spend (expenses + premiums + SIP = ₹{base_spend:,.0f}/mo) and EMI, "
            f"you can add at most ₹{affordable_extra:,.0f}/mo, "
            f"reaching about ₹{projected_affordable:,.0f} by the target date "
            f"(short of ₹{goal.target_amount:,.0f}). Cut expenses, raise income, or extend the date."
        )

    # suggested_monthly_invest = additional beyond SIP, after Spend + EMI
    suggested_invest = round(suggested_extra, 2)
    invest_delta = suggested_invest
    total_monthly_invest = round(monthly_sip + suggested_invest, 2)
    projected_at_target = project_with_sip(current, total_monthly_invest, months_left, annual_return)
    on_track = projected_at_target + 0.5 >= float(goal.target_amount) and feasible

    if required_extra > 0 and feasible and not summary:
        ret_note = f" with {annual_return * 100:.1f}% assumed market compounding"
        if suggested_invest > 0:
            summary = (
                f"To reach ₹{goal.target_amount:,.0f} by {goal.target_date.isoformat()}{ret_note}, "
                f"keep Spend at expenses + other invest + SIP (₹{base_spend:,.0f}/mo) and add about "
                f"₹{suggested_invest:,.0f}/mo extra invest "
                f"(total market invest ₹{total_monthly_invest:,.0f}/mo with SIPs). "
                f"Projected NW ≈ ₹{projected_at_target:,.0f}."
            )
        else:
            summary = (
                f"Stay the course: current SIPs of ₹{monthly_sip:,.0f}/mo{ret_note} "
                f"hit ₹{goal.target_amount:,.0f} by {goal.target_date.isoformat()} "
                f"(projected ≈ ₹{projected_at_target:,.0f})."
            )

    # Spend column = expenses + other invest + SIP (does not include EMI or extra suggested invest)
    suggested_spend = base_spend

    plan_options, blended_return = build_invest_options(
        suggested_invest, sip_lines, target_return=annual_return
    )

    rows: list[PlanMonthRow] = []
    projected = current
    rm = monthly_rate(annual_return)
    for year, month, inc, exp, inc_src, exp_src in month_cash:
        month_spend = round(exp + other_invest + monthly_sip, 2)
        month_surplus = max(0.0, inc - month_spend - monthly_emi)
        if suggested_invest <= month_surplus + 0.009:
            month_extra = suggested_invest
        else:
            month_extra = month_surplus
        month_total_invest = round(monthly_sip + month_extra, 2)
        projected = round(projected * (1.0 + rm) + month_total_invest, 2)
        month_options, _ = build_invest_options(month_extra, sip_lines, target_return=annual_return)
        rows.append(
            PlanMonthRow(
                year=year,
                month=month,
                label=f"{month_name[month][:3]} {year}",
                income=inc,
                expenses=exp,
                income_source=inc_src,
                expense_source=exp_src,
                monthly_invested=monthly_sip,
                other_invest=other_invest,
                suggested_spend=month_spend,
                suggested_invest=round(month_extra, 2),
                invest_delta_vs_current_sip=round(month_extra, 2),
                invest_options=month_options,
                projected_net_worth=projected,
            )
        )

    if months_left > schedule_months:
        warnings.append(f"Showing first {schedule_months} months of a {months_left}-month plan.")

    warnings.append(
        f"Projections assume {annual_return * 100:.1f}% annual market return (editable on Target). "
        "Actual returns vary. Suggested invest is on top of current SIPs; SIPs are included in monthly spend."
    )
    warnings.append(
        f"Suggested invest options (best 5–7) target ~{blended_return * 100:.1f}% blended long-term return "
        "using India + global multi-decade track records; sleeves capped for diversification. "
        "Illustrative only — not personalized advice."
    )

    return WealthPlanOut(
        current_net_worth=current,
        target_amount=float(goal.target_amount),
        target_date=goal.target_date,
        months_remaining=months_left,
        gap=gap,
        expected_annual_return=annual_return,
        monthly_income=monthly_income,
        monthly_expenses=monthly_expenses,
        default_monthly_income=default_income,
        default_monthly_expenses=default_expenses,
        monthly_sip=monthly_sip,
        monthly_other_invest=other_invest,
        sip_lines=sip_lines,
        monthly_emi=monthly_emi,
        monthly_premiums=monthly_premiums,
        monthly_committed_outflows=committed,
        surplus=surplus,
        required_monthly_invest=required_total,
        suggested_monthly_invest=suggested_invest,
        suggested_invest_delta=invest_delta,
        suggested_monthly_spend=suggested_spend,
        projected_net_worth_at_target=projected_at_target,
        invest_options=plan_options,
        invest_options_blended_return=blended_return,
        invest_options_note=_MARKET_CONTEXT_NOTE,
        on_track=on_track,
        feasible=feasible,
        summary=summary,
        warnings=warnings,
        months=rows,
    )
