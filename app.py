import os
import pathlib
from flask import Flask, render_template, request, jsonify, redirect, url_for
import pandas as pd
from search_engine import SmartSearchEngine
from price_fetcher import (
    PLATFORMS,
    enrich_product_comparison,
    compare_cart,
)

app = Flask(__name__)

BASE_DIR = pathlib.Path(__file__).resolve().parent
CSV_PATH = BASE_DIR / "products.csv"

CATEGORY_META = {
    "water": {
        "id": "water",
        "name": "Water & Hydration",
        "icon": "💧",
        "tagline": "Pure mineral & packaged drinking water",
        "keywords": ["water", "mineral water", "packaged water", "drinking water", "hydration", "pani", "bottle", "aqua"],
    },
    "chips": {
        "id": "chips",
        "name": "Chips & Namkeen",
        "icon": "🍟",
        "tagline": "Crispy potato chips, wafers & Indian savouries",
        "keywords": ["chips", "potato chips", "wafers", "crisps", "namkeen", "snacks", "sev", "bhujia"],
    },
    "biscuits": {
        "id": "biscuits",
        "name": "Biscuits & Cookies",
        "icon": "🍪",
        "tagline": "Tea-time biscuits, cookies & crackers",
        "keywords": ["biscuits", "cookies", "biscuit", "biscuet", "biscute", "crackers", "bakery", "chai", "chocolate"],
    },
    "cleaning": {
        "id": "cleaning",
        "name": "Cleaning & Household",
        "icon": "🧼",
        "tagline": "Detergents, floor cleaners & dishwash essentials",
        "keywords": ["cleaning", "cleaner", "detergent", "dishwash", "floor cleaner", "toilet cleaner", "soap", "liquid", "surf", "vim", "lizol", "harpic", "colin", "ghadi", "exo"],
    },
    "shampoo": {
        "id": "shampoo",
        "name": "Shampoo & Hair Care",
        "icon": "🧴",
        "tagline": "Shampoos, cleansers & herbal hair care",
        "keywords": ["shampoo", "hair", "hair wash", "hair care", "cleanser", "anti dandruff", "conditioner"],
    },
}

_cache = {
    "mtime": 0,
    "df": None,
    "engine": None,
}


def load_data():
    """Load product data with cached reload on CSV modification and sync search engine."""
    if not CSV_PATH.exists():
        return pd.DataFrame(), None

    mtime = os.path.getmtime(CSV_PATH)
    if _cache["df"] is not None and _cache["mtime"] == mtime and _cache["engine"] is not None:
        return _cache["df"], _cache["engine"]

    df = pd.read_csv(CSV_PATH, dtype=str).fillna("")
    for col in ["type", "category", "keywords"]:
        if col in df.columns:
            df[col] = df[col].str.strip().str.lower()

    engine = SmartSearchEngine(CATEGORY_META)
    engine.fit(df)

    _cache["mtime"] = mtime
    _cache["df"] = df
    _cache["engine"] = engine
    return df, engine


def get_categories_list(df):
    """Return structured list of all categories with item counts."""
    categories = []
    for cat_id, meta in CATEGORY_META.items():
        subset = df[df["category"] == cat_id] if not df.empty else df
        foreign_count = len(subset[subset["type"] == "foreign"]) if not df.empty else 0
        indian_count = len(subset[subset["type"] == "indian"]) if not df.empty else 0
        categories.append({
            "id": cat_id,
            "name": meta["name"],
            "icon": meta["icon"],
            "tagline": meta["tagline"],
            "foreign_count": foreign_count,
            "indian_count": indian_count,
            "total_count": len(subset),
        })
    return categories


# ==========================================================================
# Multi-Page Views
# ==========================================================================

@app.route("/")
def home():
    """New Home Page with quick search, platform highlights, and featured deals."""
    df, engine = load_data()
    categories = get_categories_list(df)
    suggestions = engine.get_suggestions("", limit=10) if engine else []

    featured_deals = []
    if engine and engine.products:
        enriched = [enrich_product_comparison(p) for p in engine.products]
        enriched.sort(key=lambda x: x["savings_pct"], reverse=True)
        featured_deals = enriched[:6]

    return render_template(
        "home.html",
        active_page="home",
        categories=categories,
        suggestions=suggestions,
        featured_deals=featured_deals,
        platforms=PLATFORMS,
        total_products=len(df),
    )


@app.route("/compare")
def compare_page():
    """Dedicated Price Comparison page (Blinkit vs Zepto vs Swiggy Instamart)."""
    df, engine = load_data()
    categories = get_categories_list(df)
    suggestions = engine.get_suggestions("", limit=10) if engine else []
    initial_query = request.args.get("q", "").strip()
    initial_category = request.args.get("category", "").strip().lower()
    return render_template(
        "compare.html",
        active_page="compare",
        categories=categories,
        suggestions=suggestions,
        platforms=PLATFORMS,
        initial_query=initial_query,
        initial_category=initial_category,
    )


@app.route("/cart")
def cart_page():
    """Dedicated Multi-Product Smart Cart Optimizer page."""
    df, engine = load_data()
    categories = get_categories_list(df)
    quick_add = []
    if engine and engine.products:
        quick_add = [enrich_product_comparison(p) for p in engine.products[:8]]
    return render_template(
        "cart.html",
        active_page="cart",
        categories=categories,
        platforms=PLATFORMS,
        quick_add=quick_add,
    )


@app.route("/swadeshi")
def swadeshi_page():
    """Redirect legacy /swadeshi route to the unified Compare & Swadeshi page."""
    return redirect(url_for("compare_page", **request.args))


# ==========================================================================
# JSON APIs
# ==========================================================================

@app.route("/categories")
def categories():
    df, _ = load_data()
    return jsonify(get_categories_list(df))


@app.route("/api/suggestions")
def suggestions():
    """Real-time autocomplete and smart suggestion API with typo-tolerance."""
    q = request.args.get("q", "").strip()
    limit = int(request.args.get("limit", 8))
    _, engine = load_data()
    if not engine:
        return jsonify([])
    return jsonify(engine.get_suggestions(q, limit=limit))


@app.route("/search")
def search():
    """Hybrid search endpoint preserving side-by-side Foreign and Indian product pairing."""
    query = request.args.get("q", "").strip()
    category = request.args.get("category", "").strip().lower()
    df, engine = load_data()

    if not engine:
        return jsonify(
            category=CATEGORY_META.get(category, {"id": category, "name": category.title(), "icon": "🛒", "tagline": ""}),
            stats={"avg_foreign": 0, "avg_indian": 0, "min_indian": 0, "max_foreign": 0, "savings_pct": 0},
            foreign=[],
            indian=[],
            message="",
            total_matches=0,
        )

    results = engine.search(query=query, category_filter=category)
    # Also enrich with platform prices so Swadeshi cards can show cheapest platform / Add to Cart
    results["foreign"] = [enrich_product_comparison(p) for p in results.get("foreign", [])]
    results["indian"] = [enrich_product_comparison(p) for p in results.get("indian", [])]
    return jsonify(results)


@app.route("/api/compare")
def api_compare():
    """
    Search & filter products with Blinkit, Zepto, and Swiggy Instamart prices.
    Supports: ?q=query&category=cat_id&platform=all|blinkit|zepto|instamart&refresh=1
    """
    query = request.args.get("q", "").strip()
    category = request.args.get("category", "").strip().lower()
    cheapest_filter = request.args.get("cheapest", "").strip().lower()
    force_refresh = request.args.get("refresh", "0") == "1"

    _, engine = load_data()
    if not engine:
        return jsonify({"products": [], "total": 0, "platforms": PLATFORMS, "message": ""})

    if query or category:
        res = engine.search(query=query, category_filter=category)
        raw_items = res.get("foreign", []) + res.get("indian", [])
        # Deduplicate while preserving search score order
        seen_ids = set()
        ordered = []
        raw_items.sort(key=lambda x: x.get("_score", 0), reverse=True)
        for item in raw_items:
            pid = str(item.get("id"))
            if pid not in seen_ids:
                seen_ids.add(pid)
                ordered.append(item)
        message = res.get("message", "")
    else:
        ordered = list(engine.products)
        message = ""

    enriched = [enrich_product_comparison(p, force_refresh=force_refresh) for p in ordered]

    if cheapest_filter in PLATFORMS:
        enriched = [p for p in enriched if p["cheapest_platform"] == cheapest_filter]

    # Count how many products each platform wins
    win_counts = {pid: 0 for pid in PLATFORMS}
    for p in enriched:
        win_counts[p["cheapest_platform"]] += 1

    sources = {p["price_source"] for p in enriched}
    price_source = "live" if "live" in sources else ("cached" if "cached" in sources else "catalog")

    return jsonify({
        "products": enriched,
        "total": len(enriched),
        "win_counts": win_counts,
        "platforms": PLATFORMS,
        "price_source": price_source,
        "message": message,
    })


@app.route("/api/compare-cart", methods=["POST"])
def api_compare_cart():
    """
    Compare a multi-product cart across Blinkit, Zepto, and Instamart.
    Request JSON: {"items": [{"id": "1", "qty": 2}, ...]}
    """
    payload = request.get_json(silent=True) or {}
    items = payload.get("items", [])
    _, engine = load_data()
    if not engine:
        return jsonify({"empty": True, "items": [], "total_items": 0, "total_qty": 0})

    result = compare_cart(items, engine.product_lookup)
    return jsonify(result)


@app.route("/api/prices/refresh", methods=["POST"])
def api_refresh_prices():
    """Refresh platform prices (uses live API if PRICE_API_ENDPOINT is configured, else catalog)."""
    _, engine = load_data()
    if not engine:
        return jsonify({"ok": False, "source": "none", "updated": 0})

    live_count = 0
    for p in engine.products:
        res = enrich_product_comparison(p, force_refresh=True)
        if res["price_source"] == "live":
            live_count += 1

    return jsonify({
        "ok": True,
        "updated": len(engine.products),
        "live_count": live_count,
        "source": "live" if live_count > 0 else "catalog",
        "live_api_configured": bool(os.environ.get("PRICE_API_ENDPOINT", "").strip()),
    })


if __name__ == "__main__":
    app.run(debug=True)
