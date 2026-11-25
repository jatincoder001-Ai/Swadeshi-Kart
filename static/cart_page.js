// ==========================================================================
// SwadeshiKart - Smart Cart Optimizer Page
// ==========================================================================
(function () {
  const emptyState = document.getElementById("cart-empty-state");
  const dashboard = document.getElementById("cart-dashboard");
  const verdictTitle = document.getElementById("verdict-title");
  const verdictSubtitle = document.getElementById("verdict-subtitle");
  const totalsGrid = document.getElementById("platform-totals-grid");
  const splitSection = document.getElementById("split-cart-section");
  const tableBody = document.getElementById("cart-table-body");
  const itemSummary = document.getElementById("cart-item-summary");
  const clearCartBtn = document.getElementById("clear-cart-btn");

  function loadCartComparison() {
    const items = window.SwadeshiCart ? window.SwadeshiCart.get() : [];
    if (!items.length) {
      emptyState.hidden = false;
      dashboard.hidden = true;
      return;
    }

    fetch("/api/compare-cart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.empty) {
          emptyState.hidden = false;
          dashboard.hidden = true;
          return;
        }
        emptyState.hidden = true;
        dashboard.hidden = false;
        renderDashboard(data);
      })
      .catch((err) => {
        console.error("Cart compare error:", err);
      });
  }

  function renderDashboard(data) {
    const winner = data.single_winner;
    const split = data.split_cart;

    // 1. Verdict Banner
    if (split && split.recommended) {
      verdictTitle.innerHTML = `Best Single App: <strong>${winner.icon} ${winner.name}</strong> (₹${Math.round(winner.total)}) • Split Cart saves even more: <strong>₹${Math.round(split.grand_total)}</strong>`;
      verdictSubtitle.textContent = `Buying all items on ${winner.short} saves ₹${Math.round(winner.savings_vs_worst)} vs ${winner.worst_platform_name}. Or split across apps to save an extra ₹${Math.round(split.net_savings_vs_best_single)}!`;
    } else {
      verdictTitle.innerHTML = `Buy your entire cart on <strong>${winner.icon} ${winner.name}</strong> for <strong>₹${Math.round(winner.total)}</strong>`;
      verdictSubtitle.textContent = `You save ₹${Math.round(winner.savings_vs_worst)} compared to ${winner.worst_platform_name} (including delivery fees).`;
    }

    // 2. 3-Platform Total Cards
    totalsGrid.innerHTML = "";
    ["blinkit", "zepto", "instamart"].forEach((pid) => {
      const p = data.platform_summary[pid];
      const isWinner = winner.platform === pid;

      const card = document.createElement("div");
      card.className = `plat-total-card plat-${pid} ${isWinner ? "is-winner" : ""}`;

      const freeNote = p.free_delivery_unlocked
        ? `<span class="free-del-badge">✅ Free Delivery Unlocked</span>`
        : `<span class="del-progress-note">Add ₹${Math.round(p.amount_for_free_delivery)} more for free delivery</span>`;

      card.innerHTML = `
        <div class="plat-total-head">
          <div class="plat-total-name">${p.icon} ${p.name}</div>
          ${isWinner ? '<span class="winner-crown-badge">🏆 BEST SINGLE APP</span>' : `<span class="eta-pill">⏱ ${p.eta}</span>`}
        </div>
        <div class="plat-total-amount">₹${Math.round(p.total)}</div>
        <div class="plat-total-breakdown">
          <div><span>Items Subtotal</span><span>₹${Math.round(p.subtotal)}</span></div>
          <div><span>Delivery Fee</span><span>${p.delivery_fee === 0 ? "FREE" : "₹" + Math.round(p.delivery_fee)}</span></div>
        </div>
        ${freeNote}
      `;
      totalsGrid.appendChild(card);
    });

    // 3. Split Cart Strategy Section
    if (split && split.platforms) {
      const splitBadge = split.recommended
        ? `<span class="split-badge-win">💡 Saves extra ₹${Math.round(split.net_savings_vs_best_single)} net!</span>`
        : `<span class="split-badge-note">Item subtotal ₹${Math.round(split.item_subtotal)} + ₹${Math.round(split.delivery_total)} delivery across ${split.platforms.length} apps</span>`;

      let groupsHtml = split.platforms
        .map((grp) => {
          const itemNames = grp.items.map((it) => `${it.name} (×${it.qty})`).join(", ");
          return `
            <div class="split-group-card plat-${grp.id}">
              <div class="split-group-head">
                <strong>${grp.icon} ${grp.short} (${grp.item_count} ${grp.item_count === 1 ? "item" : "items"})</strong>
                <span class="split-group-total">₹${Math.round(grp.total)}</span>
              </div>
              <p class="split-group-items">${itemNames}</p>
              <div class="split-group-meta">Items: ₹${Math.round(grp.subtotal)} • Delivery: ${grp.delivery_fee === 0 ? "FREE" : "₹" + Math.round(grp.delivery_fee)}</div>
            </div>
          `;
        })
        .join("");

      splitSection.innerHTML = `
        <div class="split-header-row">
          <div>
            <h3>🔀 Split-Cart Strategy (Lowest Price Per Item)</h3>
            <p class="split-sub">Buy each product from whichever app sells it cheapest • Total: <strong>₹${Math.round(split.grand_total)}</strong></p>
          </div>
          ${splitBadge}
        </div>
        <div class="split-groups-grid">${groupsHtml}</div>
      `;
    }

    // 4. Item-by-Item Table
    itemSummary.textContent = `${data.total_items} products (${data.total_qty} units)`;
    tableBody.innerHTML = "";

    data.items.forEach((item) => {
      const tr = document.createElement("tr");
      const bestMeta = PLATFORMS_META[item.cheapest_platform] || { short: item.cheapest_platform, icon: "" };

      tr.innerHTML = `
        <td>
          <div class="cart-prod-cell">
            <strong>${item.name}</strong>
            <span>${item.brand} • ${item.quantity_label}</span>
          </div>
        </td>
        <td>
          <div class="table-qty-control">
            <button type="button" class="qty-btn-sm" data-dec="${item.id}" data-cur="${item.qty}">−</button>
            <span>${item.qty}</span>
            <button type="button" class="qty-btn-sm" data-inc="${item.id}" data-cur="${item.qty}">+</button>
          </div>
        </td>
        <td class="${item.cheapest_platform === "blinkit" ? "cell-cheapest" : ""}">
          <a href="${item.urls.blinkit}" target="_blank" rel="noopener noreferrer">₹${Math.round(item.line_totals.blinkit)}</a>
        </td>
        <td class="${item.cheapest_platform === "zepto" ? "cell-cheapest" : ""}">
          <a href="${item.urls.zepto}" target="_blank" rel="noopener noreferrer">₹${Math.round(item.line_totals.zepto)}</a>
        </td>
        <td class="${item.cheapest_platform === "instamart" ? "cell-cheapest" : ""}">
          <a href="${item.urls.instamart}" target="_blank" rel="noopener noreferrer">₹${Math.round(item.line_totals.instamart)}</a>
        </td>
        <td>
          <span class="best-item-pill">${bestMeta.icon} ${bestMeta.short} (₹${Math.round(item.cheapest_line_total)})</span>
        </td>
        <td>
          <button type="button" class="btn-remove-item" data-rem="${item.id}" title="Remove item">✕</button>
        </td>
      `;
      tableBody.appendChild(tr);
    });
  }

  tableBody.addEventListener("click", (e) => {
    const dec = e.target.closest("[data-dec]");
    const inc = e.target.closest("[data-inc]");
    const rem = e.target.closest("[data-rem]");
    if (dec) {
      window.SwadeshiCart.setQty(dec.dataset.dec, parseInt(dec.dataset.cur, 10) - 1);
    } else if (inc) {
      window.SwadeshiCart.setQty(inc.dataset.inc, parseInt(inc.dataset.cur, 10) + 1);
    } else if (rem) {
      window.SwadeshiCart.remove(rem.dataset.rem);
    }
  });

  if (clearCartBtn) {
    clearCartBtn.addEventListener("click", () => {
      window.SwadeshiCart.clear();
    });
  }

  window.addEventListener("sk:cart-updated", loadCartComparison);
  document.addEventListener("DOMContentLoaded", loadCartComparison);
})();
