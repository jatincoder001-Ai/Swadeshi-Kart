"""
Multi-Platform Price Fetcher & Cart Optimizer for SwadeshiKart
==============================================================
Supports Blinkit, Zepto, and Swiggy Instamart.
Uses an optional live price API / HTTP adapter (via PRICE_API_ENDPOINT env var)
with TTL caching and graceful fallback to structured catalog prices in products.csv.
"""

import json
import os
import time
import urllib.parse
import urllib.request
from typing import Any

PLATFORMS = {
    "blinkit": {
        "id": "blinkit",
        "name": "Blinkit",
        "short": "Blinkit",
        "icon": "⚡",
        "color": "#f8cb46",
        "text_color": "#1c1c1c",
        "bg_tint": "#fefce8",
        "border_tint": "#fde047",
        "delivery_fee": 25,
        "free_above": 199,
        "eta": "10 mins",
        "search_base": "https://blinkit.com/s/?q=",
    },
    "zepto": {
        "id": "zepto",
        "name": "Zepto",
        "short": "Zepto",
        "icon": "🟣",
        "color": "#6d28d9",
        "text_color": "#ffffff",
        "bg_tint": "#f5f3ff",
        "border_tint": "#c4b5fd",
        "delivery_fee": 20,
        "free_above": 149,
        "eta": "11 mins",
        "search_base": "https://www.zeptonow.com/search?query=",
    },
    "instamart": {
        "id": "instamart",
        "name": "Swiggy Instamart",
        "short": "Instamart",
        "icon": "🟠",
        "color": "#fc8019",
        "text_color": "#ffffff",
        "bg_tint": "#fff7ed",
        "border_tint": "#fdba74",
        "delivery_fee": 30,
        "free_above": 249,
        "eta": "14 mins",
        "search_base": "https://www.swiggy.com/instamart/search?custom_back=true&query=",
    },
}

PLATFORM_ORDER = ["blinkit", "zepto", "instamart"]

_PRICE_CACHE: dict[str, dict[str, Any]] = {}
_CACHE_TTL_SECONDS = 300  # 5 minutes


def _parse_price(val: Any, default: float = 0.0) -> float:
    try:
        cleaned = str(val).replace("₹", "").replace(",", "").strip()
        return round(float(cleaned), 2) if cleaned else default
    except (ValueError, TypeError):
        return default


def build_platform_urls(product: dict) -> dict[str, str]:
    """Generate direct search/product URLs for Blinkit, Zepto, and Instamart."""
    name = str(product.get("name", "")).strip()
    query = urllib.parse.quote_plus(name)
    blinkit_link = str(product.get("link", "")).strip()
    return {
        "blinkit": blinkit_link if blinkit_link else f"{PLATFORMS['blinkit']['search_base']}{query}",
        "zepto": f"{PLATFORMS['zepto']['search_base']}{query}",
        "instamart": f"{PLATFORMS['instamart']['search_base']}{query}",
    }


def _fetch_from_live_api(product: dict) -> dict[str, float] | None:
    """
    Optional live price API hook.
    If PRICE_API_ENDPOINT is configured (e.g. a price-aggregator API returning
    {"blinkit": 45, "zepto": 42, "instamart": 47}), fetch live prices with a 2.5s timeout.
    """
    endpoint = os.environ.get("PRICE_API_ENDPOINT", "").strip()
    if not endpoint:
        return None

    pid = urllib.parse.quote(str(product.get("id", "")))
    name = urllib.parse.quote(str(product.get("name", "")))
    sep = "&" if "?" in endpoint else "?"
    url = f"{endpoint}{sep}id={pid}&q={name}"

    headers = {"User-Agent": "SwadeshiKart-PriceCompare/1.0", "Accept": "application/json"}
    api_key = os.environ.get("PRICE_API_KEY", "").strip()
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    try:
        req = urllib.request.Request(url, headers=headers, method="GET")
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            if resp.status == 200:
                payload = json.loads(resp.read().decode("utf-8"))
                parsed = {}
                for p in PLATFORM_ORDER:
                    if p in payload and payload[p] is not None:
                        val = _parse_price(payload[p], -1)
                        if val > 0:
                            parsed[p] = val
                if len(parsed) == 3:
                    return parsed
    except Exception:
        return None

    return None


def get_platform_prices(product: dict, force_refresh: bool = False) -> dict[str, Any]:
    """Return Blinkit, Zepto, and Instamart prices + cheapest winner for a product."""
    pid = str(product.get("id", ""))
    now = time.time()

    if not force_refresh and pid in _PRICE_CACHE:
        cached = _PRICE_CACHE[pid]
        if now - cached["ts"] < _CACHE_TTL_SECONDS:
            result = dict(cached["data"])
            result["source"] = "cached" if cached["data"]["source"] == "live" else cached["data"]["source"]
            return result

    base_price = _parse_price(product.get("price", 0), 0.0)
    catalog_prices = {
        "blinkit": _parse_price(product.get("blinkit_price"), base_price),
        "zepto": _parse_price(product.get("zepto_price"), base_price),
        "instamart": _parse_price(product.get("instamart_price"), base_price),
    }

    live_prices = _fetch_from_live_api(product)
    if live_prices:
        prices = live_prices
        source = "live"
    else:
        prices = catalog_prices
        source = "catalog"

    cheapest_platform = min(PLATFORM_ORDER, key=lambda p: prices[p])
    highest_platform = max(PLATFORM_ORDER, key=lambda p: prices[p])
    cheapest_price = prices[cheapest_platform]
    highest_price = prices[highest_platform]
    savings = round(highest_price - cheapest_price, 2)
    savings_pct = int(round((savings / highest_price) * 100)) if highest_price > 0 else 0

    data = {
        "prices": prices,
        "urls": build_platform_urls(product),
        "cheapest_platform": cheapest_platform,
        "cheapest_price": cheapest_price,
        "highest_platform": highest_platform,
        "highest_price": highest_price,
        "savings": savings,
        "savings_pct": savings_pct,
        "source": source,
    }

    _PRICE_CACHE[pid] = {"ts": now, "data": data}
    return data


def enrich_product_comparison(product: dict, force_refresh: bool = False) -> dict[str, Any]:
    """Return a clean product dictionary enriched with multi-platform comparison data."""
    comp = get_platform_prices(product, force_refresh=force_refresh)
    enriched = dict(product)
    enriched.update({
        "prices": comp["prices"],
        "urls": comp["urls"],
        "cheapest_platform": comp["cheapest_platform"],
        "cheapest_price": comp["cheapest_price"],
        "highest_platform": comp["highest_platform"],
        "highest_price": comp["highest_price"],
        "savings": comp["savings"],
        "savings_pct": comp["savings_pct"],
        "price_source": comp["source"],
    })
    return enriched


def compare_cart(items: list[dict], product_lookup: dict[str, dict]) -> dict[str, Any]:
    """
    Compare a multi-product cart across Blinkit, Zepto, and Swiggy Instamart.
    Computes both:
      1. Single-platform totals (buying the entire cart from one app)
      2. Split-cart optimal strategy (buying each item from its cheapest app)
    """
    line_items = []
    subtotals = {p: 0.0 for p in PLATFORM_ORDER}
    split_groups: dict[str, list[dict]] = {p: [] for p in PLATFORM_ORDER}
    split_subtotals = {p: 0.0 for p in PLATFORM_ORDER}
    total_qty = 0

    for entry in items:
        pid = str(entry.get("id", "")).strip()
        try:
            qty = max(1, min(99, int(entry.get("qty", 1))))
        except (ValueError, TypeError):
            qty = 1

        product = product_lookup.get(pid)
        if not product:
            continue

        comp = get_platform_prices(product)
        prices = comp["prices"]
        item_totals = {p: round(prices[p] * qty, 2) for p in PLATFORM_ORDER}

        for p in PLATFORM_ORDER:
            subtotals[p] = round(subtotals[p] + item_totals[p], 2)

        best_p = comp["cheapest_platform"]
        split_subtotals[best_p] = round(split_subtotals[best_p] + item_totals[best_p], 2)

        line_item = {
            "id": pid,
            "name": product.get("name", ""),
            "brand": product.get("brand", ""),
            "quantity_label": product.get("quantity", ""),
            "category": product.get("category", ""),
            "image": product.get("image", ""),
            "type": product.get("type", ""),
            "qty": qty,
            "unit_prices": prices,
            "line_totals": item_totals,
            "urls": comp["urls"],
            "cheapest_platform": best_p,
            "cheapest_unit_price": comp["cheapest_price"],
            "cheapest_line_total": item_totals[best_p],
            "item_savings": round((comp["highest_price"] - comp["cheapest_price"]) * qty, 2),
        }
        line_items.append(line_item)
        split_groups[best_p].append(line_item)
        total_qty += qty

    if not line_items:
        return {
            "empty": True,
            "items": [],
            "total_items": 0,
            "total_qty": 0,
            "platform_summary": {},
            "single_winner": None,
            "split_cart": None,
        }

    platform_summary = {}
    for p in PLATFORM_ORDER:
        meta = PLATFORMS[p]
        sub = subtotals[p]
        fee = 0.0 if sub >= meta["free_above"] else float(meta["delivery_fee"])
        platform_summary[p] = {
            "id": p,
            "name": meta["name"],
            "short": meta["short"],
            "icon": meta["icon"],
            "eta": meta["eta"],
            "subtotal": sub,
            "delivery_fee": fee,
            "free_above": meta["free_above"],
            "free_delivery_unlocked": sub >= meta["free_above"],
            "amount_for_free_delivery": round(max(0.0, meta["free_above"] - sub), 2),
            "total": round(sub + fee, 2),
        }

    # Single-platform winner based on total (items + delivery) and also subtotal
    single_winner_id = min(PLATFORM_ORDER, key=lambda p: platform_summary[p]["total"])
    single_worst_id = max(PLATFORM_ORDER, key=lambda p: platform_summary[p]["total"])
    single_winner = platform_summary[single_winner_id]
    single_worst = platform_summary[single_worst_id]
    single_savings = round(single_worst["total"] - single_winner["total"], 2)

    # Split-cart optimal calculation
    split_item_subtotal = round(sum(split_subtotals[p] for p in PLATFORM_ORDER), 2)
    split_delivery_total = 0.0
    split_platforms_used = []
    for p in PLATFORM_ORDER:
        if split_groups[p]:
            meta = PLATFORMS[p]
            p_sub = split_subtotals[p]
            p_fee = 0.0 if p_sub >= meta["free_above"] else float(meta["delivery_fee"])
            split_delivery_total = round(split_delivery_total + p_fee, 2)
            split_platforms_used.append({
                "id": p,
                "name": meta["name"],
                "short": meta["short"],
                "icon": meta["icon"],
                "item_count": len(split_groups[p]),
                "subtotal": p_sub,
                "delivery_fee": p_fee,
                "total": round(p_sub + p_fee, 2),
                "items": split_groups[p],
            })

    split_grand_total = round(split_item_subtotal + split_delivery_total, 2)
    best_single_subtotal = min(subtotals.values())
    split_item_savings_vs_single = round(best_single_subtotal - split_item_subtotal, 2)
    split_net_savings_vs_single = round(single_winner["total"] - split_grand_total, 2)

    return {
        "empty": False,
        "items": line_items,
        "total_items": len(line_items),
        "total_qty": total_qty,
        "platform_summary": platform_summary,
        "single_winner": {
            "platform": single_winner_id,
            "name": single_winner["name"],
            "short": single_winner["short"],
            "icon": single_winner["icon"],
            "subtotal": single_winner["subtotal"],
            "delivery_fee": single_winner["delivery_fee"],
            "total": single_winner["total"],
            "savings_vs_worst": single_savings,
            "worst_platform_name": single_worst["short"],
        },
        "split_cart": {
            "item_subtotal": split_item_subtotal,
            "delivery_total": split_delivery_total,
            "grand_total": split_grand_total,
            "item_savings_vs_best_single": split_item_savings_vs_single,
            "net_savings_vs_best_single": split_net_savings_vs_single,
            "recommended": split_net_savings_vs_single > 0,
            "platforms": split_platforms_used,
        },
    }
