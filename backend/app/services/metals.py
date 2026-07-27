from __future__ import annotations

import time
from datetime import datetime, timezone

import httpx

from app.config import settings

TROY_OZ_GRAMS = 31.1034768

_cache: dict[str, object] = {"fetched_at": 0.0, "payload": None}


class MetalsPriceError(Exception):
    pass


def _grams_from_unit(quantity: float, unit: str | None) -> float:
    u = (unit or "grams").strip().lower()
    if u in {"g", "gram", "grams", "gm"}:
        return quantity
    if u in {"kg", "kilogram", "kilograms"}:
        return quantity * 1000.0
    if u in {"mg", "milligram", "milligrams"}:
        return quantity / 1000.0
    if u in {"tola", "tolas"}:
        return quantity * 11.6638038
    if u in {"oz", "ounce", "ounces", "troy_oz", "toz"}:
        return quantity * TROY_OZ_GRAMS
    # Default assume grams for metal holdings
    return quantity


def price_for_asset(*, metal: str, quantity: float, unit: str | None, purity_karat: float, prices: dict) -> float:
    grams = _grams_from_unit(quantity, unit)
    if metal == "gold":
        per_gram_24k = float(prices["gold_per_gram_24k"])
        karat = purity_karat or 24.0
        per_gram = per_gram_24k * (karat / 24.0)
    else:
        per_gram = float(prices["silver_per_gram"])
    return round(grams * per_gram, 2)


def _payload_from_oz(*, source: str, gold_oz_inr: float, silver_oz_inr: float, as_of: str | None = None) -> dict:
    gold_g = gold_oz_inr / TROY_OZ_GRAMS
    silver_g = silver_oz_inr / TROY_OZ_GRAMS
    return {
        "source": source,
        "currency": "INR",
        "as_of": as_of or datetime.now(timezone.utc).isoformat(),
        "gold_per_oz": round(gold_oz_inr, 2),
        "silver_per_oz": round(silver_oz_inr, 2),
        "gold_per_gram_24k": round(gold_g, 2),
        "gold_per_gram_22k": round(gold_g * (22 / 24), 2),
        "gold_per_gram_18k": round(gold_g * (18 / 24), 2),
        "silver_per_gram": round(silver_g, 2),
    }


async def _fetch_usd_inr(client: httpx.AsyncClient) -> float:
    """Live USD→INR from a free FX feed."""
    res = await client.get("https://open.er-api.com/v6/latest/USD")
    res.raise_for_status()
    data = res.json()
    rate = float((data.get("rates") or {}).get("INR") or 0)
    if rate <= 0:
        raise MetalsPriceError("USD/INR rate missing from FX feed")
    return rate


async def _fetch_from_gold_api_com() -> dict:
    """Free USD/oz spot (gold-api.com) converted to INR via open.er-api.com."""
    headers = {"User-Agent": "WealthPlanner/1.0", "Accept": "application/json"}
    async with httpx.AsyncClient(timeout=20.0, headers=headers) as client:
        gold_res = await client.get("https://api.gold-api.com/price/XAU")
        silver_res = await client.get("https://api.gold-api.com/price/XAG")
        gold_res.raise_for_status()
        silver_res.raise_for_status()
        usd_inr = await _fetch_usd_inr(client)
        gold = gold_res.json()
        silver = silver_res.json()

    gold_oz_usd = float(gold["price"])
    silver_oz_usd = float(silver["price"])
    as_of = gold.get("updatedAt") or datetime.now(timezone.utc).isoformat()
    return _payload_from_oz(
        source="gold-api.com + USD/INR",
        gold_oz_inr=gold_oz_usd * usd_inr,
        silver_oz_inr=silver_oz_usd * usd_inr,
        as_of=as_of,
    )


async def _fetch_from_goldapi() -> dict:
    if not settings.gold_api_key:
        raise MetalsPriceError("GOLD_API_KEY not configured")
    headers = {"x-access-token": settings.gold_api_key, "Accept": "application/json"}
    async with httpx.AsyncClient(timeout=20.0, base_url="https://www.goldapi.io") as client:
        gold_res = await client.get("/api/XAU/INR", headers=headers)
        silver_res = await client.get("/api/XAG/INR", headers=headers)
        gold_res.raise_for_status()
        silver_res.raise_for_status()
        gold = gold_res.json()
        silver = silver_res.json()

    gold_g = float(gold.get("price_gram_24k") or (float(gold["price"]) / TROY_OZ_GRAMS))
    silver_g = float(
        silver.get("price_gram_24k") or silver.get("price_gram") or (float(silver["price"]) / TROY_OZ_GRAMS)
    )
    return {
        "source": "goldapi.io",
        "currency": "INR",
        "as_of": datetime.now(timezone.utc).isoformat(),
        "gold_per_oz": round(float(gold.get("price") or gold_g * TROY_OZ_GRAMS), 2),
        "silver_per_oz": round(float(silver.get("price") or silver_g * TROY_OZ_GRAMS), 2),
        "gold_per_gram_24k": round(gold_g, 2),
        "gold_per_gram_22k": round(float(gold.get("price_gram_22k") or gold_g * (22 / 24)), 2),
        "gold_per_gram_18k": round(float(gold.get("price_gram_18k") or gold_g * (18 / 24)), 2),
        "silver_per_gram": round(silver_g, 2),
    }


async def fetch_india_metal_prices(*, force: bool = False) -> dict:
    now = time.time()
    cached = _cache.get("payload")
    fetched_at = float(_cache.get("fetched_at") or 0)
    if not force and cached and (now - fetched_at) < settings.metals_cache_seconds:
        return cached  # type: ignore[return-value]

    providers = []
    if settings.gold_api_key:
        providers.append(_fetch_from_goldapi)
    providers.append(_fetch_from_gold_api_com)

    errors: list[str] = []
    last_exc: Exception | None = None
    for provider in providers:
        try:
            payload = await provider()
            _cache["payload"] = payload
            _cache["fetched_at"] = now
            return payload
        except Exception as exc:  # noqa: BLE001 - try next provider
            last_exc = exc
            errors.append(f"{provider.__name__}: {exc}")
            continue

    raise MetalsPriceError("; ".join(errors) or str(last_exc) or "Unable to fetch metal prices")
