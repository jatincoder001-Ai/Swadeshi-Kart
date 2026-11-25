// ==========================================================================
// SwadeshiKart - 3-Platform Price Comparison Page (Blinkit vs Zepto vs Instamart)
// ==========================================================================
(function () {
  const searchInput = document.getElementById("compare-search");
  const clearBtn = document.getElementById("compare-clear");
  const suggestionsList = document.getElementById("compare-suggestions");
  const categoryPills = document.querySelectorAll("#compare-category-pills .cat-pill");
  const platFilterBtns = document.querySelectorAll(".plat-filter-btn");
  const refreshBtn = document.getElementById("refresh-prices-btn");
  const sourceBadge = document.getElementById("price-source-badge");
  const messageBox = document.getElementById("compare-message");
  const grid = document.getElementById("compare-grid");

  let currentQuery = typeof INITIAL_QUERY !== "undefined" ? INITIAL_QUERY : "";
  let currentCategory = typeof INITIAL_CATEGORY !== "undefined" ? INITIAL_CATEGORY : "";
  let currentCheapestFilter = "";
  let debounceTimer = null;

  function buildProductImg(p) {
    const imgWrap = document.createElement("div");
    imgWrap.className = "cmp-img-wrap";

    const img = document.createElement("img");
    img.alt = p.name;
    img.loading = "lazy";

    const showFallback = () => {
      img.onerror = null;
      img.style.display = "none";
      const fb = document.createElement("div");
      fb.className = "cmp-img-fallback";
      fb.textContent = p.brand ? p.brand.charAt(0) : "🛒";
      imgWrap.appendChild(fb);
    };

    const baseName = p.image ? p.image.replace(/\.[^/.]+$/, "") : String(p.id || "1");
    const formats = ["png", "jpg", "svg"];
    let idx = 0;
    img.src = `/static/images/${baseName}.${formats[idx]}`;
    img.onerror = () => {
      idx++;
      if (idx < formats.length) {
        img.src = `/static/images/${baseName}.${formats[idx]}`;
      } else {
        showFallback();
      }
    };

    imgWrap.appendChild(img);
    return imgWrap;
  }

  function renderProducts(data) {
    const products = data.products || [];
    const wins = data.win_counts || { blinkit: 0, zepto: 0, instamart: 0 };

    document.getElementById("win-total").textContent = products.length;
    document.getElementById("win-blinkit").textContent = wins.blinkit || 0;
    document.getElementById("win-zepto").textContent = wins.zepto || 0;
    document.getElementById("win-instamart").textContent = wins.instamart || 0;

    if (sourceBadge) {
      if (data.price_source === "live") {
        sourceBadge.textContent = "🟢 Live API Prices";
        sourceBadge.className = "price-source-badge is-live";
      } else if (data.price_source === "cached") {
        sourceBadge.textContent = "⚡ Cached Live Prices";
        sourceBadge.className = "price-source-badge is-live";
      } else {
        sourceBadge.textContent = "📦 Catalog Prices";
        sourceBadge.className = "price-source-badge";
      }
    }

    if (data.message) {
      messageBox.textContent = data.message;
      messageBox.hidden = false;
    } else if (products.length === 0) {
      messageBox.textContent = "No matching products found. Try searching for water, chips, biscuits, cleaning, or shampoo.";
      messageBox.hidden = false;
    } else {
      messageBox.hidden = true;
    }

    grid.innerHTML = "";

    products.forEach((p) => {
      const card = document.createElement("article");
      card.className = "cmp-card";

      // Header
      const header = document.createElement("div");
      header.className = "cmp-card-header";
      header.appendChild(buildProductImg(p));

      const meta = document.createElement("div");
      meta.className = "cmp-card-meta";

      const badgeRow = document.createElement("div");
      badgeRow.className = "cmp-badge-row";

      const originBadge = document.createElement("span");
      originBadge.className = p.type === "indian" ? "origin-pill indian" : "origin-pill foreign";
      originBadge.textContent = p.type === "indian" ? "🇮🇳 Indian" : `⚠️ ${p.country || "Imported"}`;

      const packBadge = document.createElement("span");
      packBadge.className = "pack-pill";
      packBadge.textContent = p.quantity || "";

      badgeRow.append(originBadge, packBadge);

      const title = document.createElement("h3");
      title.className = "cmp-card-title";
      title.textContent = p.name;

      const brand = document.createElement("div");
      brand.className = "cmp-card-brand";
      brand.textContent = p.brand;

      meta.append(badgeRow, title, brand);
      header.appendChild(meta);

      // Savings banner inside card
      const cheapestMeta = PLATFORMS_META[p.cheapest_platform] || { short: p.cheapest_platform, icon: "🏷️" };
      const savingsBar = document.createElement("div");
      savingsBar.className = "cmp-savings-bar";
      savingsBar.innerHTML = `<span>${cheapestMeta.icon} Cheapest on <strong>${cheapestMeta.short}</strong></span><span class="cmp-save-pill">Save ₹${Math.round(p.savings)} (${p.savings_pct}%)</span>`;

      // 3-Platform Price Rows
      const rows = document.createElement("div");
      rows.className = "cmp-platform-rows";

      ["blinkit", "zepto", "instamart"].forEach((pid) => {
        const pMeta = PLATFORMS_META[pid];
        const priceVal = p.prices[pid];
        const isWinner = p.cheapest_platform === pid;

        const row = document.createElement("div");
        row.className = `cmp-plat-row plat-${pid} ${isWinner ? "is-winner" : ""}`;

        const left = document.createElement("div");
        left.className = "cmp-plat-left";
        left.innerHTML = `<span class="cmp-plat-icon">${pMeta.icon}</span><span class="cmp-plat-name">${pMeta.short}</span><span class="cmp-plat-eta">${pMeta.eta}</span>`;

        const right = document.createElement("div");
        right.className = "cmp-plat-right";

        if (isWinner) {
          const winTag = document.createElement("span");
          winTag.className = "cheapest-tag";
          winTag.textContent = "CHEAPEST";
          right.appendChild(winTag);
        }

        const priceEl = document.createElement("span");
        priceEl.className = "cmp-plat-price";
        priceEl.textContent = `₹${Math.round(priceVal)}`;

        const linkEl = document.createElement("a");
        linkEl.className = "cmp-ext-link";
        linkEl.href = p.urls[pid] || "#";
        linkEl.target = "_blank";
        linkEl.rel = "noopener noreferrer";
        linkEl.title = `Open ${p.name} on ${pMeta.name}`;
        linkEl.textContent = "↗";

        right.append(priceEl, linkEl);
        row.append(left, right);
        rows.appendChild(row);
      });

      // Footer: Add to Cart or Qty Stepper
      const footer = document.createElement("div");
      footer.className = "cmp-card-footer";

      const inCartQty = window.SwadeshiCart ? window.SwadeshiCart.getQty(p.id) : 0;
      if (inCartQty > 0) {
        footer.appendChild(buildQtyControl(p, inCartQty));
      } else {
        const addBtn = document.createElement("button");
        addBtn.type = "button";
        addBtn.className = "btn-add-cart btn-full";
        addBtn.setAttribute("data-add-cart", p.id);
        addBtn.setAttribute("data-product-name", p.name);
        addBtn.innerHTML = `🛒 Add to Cart (₹${Math.round(p.cheapest_price)})`;
        footer.appendChild(addBtn);
      }

      card.append(header, savingsBar, rows, footer);
      grid.appendChild(card);
    });
  }

  function buildQtyControl(p, qty) {
    const wrap = document.createElement("div");
    wrap.className = "qty-stepper-full";

    const minus = document.createElement("button");
    minus.type = "button";
    minus.className = "qty-btn";
    minus.textContent = "−";
    minus.addEventListener("click", () => window.SwadeshiCart.setQty(p.id, qty - 1));

    const label = document.createElement("span");
    label.className = "qty-label";
    label.textContent = `${qty} in Cart`;

    const plus = document.createElement("button");
    plus.type = "button";
    plus.className = "qty-btn";
    plus.textContent = "+";
    plus.addEventListener("click", () => window.SwadeshiCart.setQty(p.id, qty + 1));

    wrap.append(minus, label, plus);
    return wrap;
  }

  let lastData = null;
  function loadCompare(refresh = false) {
    const params = new URLSearchParams();
    if (currentQuery) params.set("q", currentQuery);
    if (currentCategory) params.set("category", currentCategory);
    if (currentCheapestFilter) params.set("cheapest", currentCheapestFilter);
    if (refresh) params.set("refresh", "1");

    fetch(`/api/compare?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        lastData = data;
        renderProducts(data);
      })
      .catch(() => {
        messageBox.textContent = "Could not load comparison prices. Please try again.";
        messageBox.hidden = false;
      });
  }

  // Re-render card footers when cart changes
  window.addEventListener("sk:cart-updated", () => {
    if (lastData) renderProducts(lastData);
  });

  // Search input & suggestions
  if (searchInput) {
    searchInput.addEventListener("input", () => {
      const val = searchInput.value.trim();
      clearBtn.hidden = val.length === 0;
      currentQuery = val;

      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        loadCompare();
        if (val.length >= 1) {
          fetch(`/api/suggestions?q=${encodeURIComponent(val)}&limit=6`)
            .then((r) => r.json())
            .then((items) => {
              suggestionsList.innerHTML = "";
              if (!items || items.length === 0) {
                suggestionsList.hidden = true;
                return;
              }
              items.forEach((s) => {
                const li = document.createElement("li");
                li.className = "suggestion-item";
                li.innerHTML = `<div class="suggestion-left"><span class="suggestion-icon">${s.icon || "🛒"}</span><span class="suggestion-title">${s.label}</span></div><span class="suggestion-type-tag">${s.type || ""}</span>`;
                li.addEventListener("mousedown", (e) => {
                  e.preventDefault();
                  searchInput.value = s.query || s.label;
                  currentQuery = searchInput.value;
                  clearBtn.hidden = false;
                  suggestionsList.hidden = true;
                  loadCompare();
                });
                suggestionsList.appendChild(li);
              });
              suggestionsList.hidden = false;
            })
            .catch(() => {});
        } else {
          suggestionsList.hidden = true;
        }
      }, 180);
    });

    searchInput.addEventListener("blur", () => {
      setTimeout(() => {
        suggestionsList.hidden = true;
      }, 150);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      searchInput.value = "";
      currentQuery = "";
      clearBtn.hidden = true;
      suggestionsList.hidden = true;
      loadCompare();
    });
  }

  categoryPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      categoryPills.forEach((x) => x.classList.remove("active"));
      pill.classList.add("active");
      currentCategory = pill.dataset.catId || "";
      loadCompare();
    });
  });

  platFilterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      platFilterBtns.forEach((x) => x.classList.remove("active"));
      btn.classList.add("active");
      currentCheapestFilter = btn.dataset.platform || "";
      loadCompare();
    });
  });

  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      refreshBtn.disabled = true;
      refreshBtn.textContent = "⏳ Refreshing...";
      fetch("/api/prices/refresh", { method: "POST" })
        .then((r) => r.json())
        .then((res) => {
          loadCompare(true);
          if (window.SwadeshiCart) {
            window.SwadeshiCart.showToast(
              res.live_api_configured
                ? `🔄 Refreshed ${res.updated} product prices`
                : "📦 Catalog prices verified (configure PRICE_API_ENDPOINT for live API)"
            );
          }
        })
        .finally(() => {
          refreshBtn.disabled = false;
          refreshBtn.textContent = "🔄 Refresh Prices";
        });
    });
  }

  document.addEventListener("DOMContentLoaded", () => loadCompare());
})();
