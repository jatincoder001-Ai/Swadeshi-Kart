// ==========================================================================
// SwadeshiKart - Shared Smart Cart Manager (localStorage + Badge + Toast)
// ==========================================================================
(function () {
  const STORAGE_KEY = "swadeshikart_cart_v1";

  function readCart() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function writeCart(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    updateBadge();
    window.dispatchEvent(new CustomEvent("sk:cart-updated", { detail: { items } }));
  }

  function getTotalCount(items = readCart()) {
    return items.reduce((sum, item) => sum + (parseInt(item.qty, 10) || 1), 0);
  }

  function updateBadge() {
    const count = getTotalCount();
    const badge = document.getElementById("nav-cart-badge");
    if (badge) {
      badge.textContent = count;
      badge.hidden = count <= 0;
    }
    const toolbarCount = document.getElementById("toolbar-cart-count");
    if (toolbarCount) {
      toolbarCount.textContent = count;
    }
  }

  let toastTimer = null;
  function showToast(message) {
    const toast = document.getElementById("cart-toast");
    if (!toast) return;
    toast.textContent = message;
    toast.hidden = false;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove("show");
      toast.hidden = true;
    }, 2400);
  }

  const SwadeshiCart = {
    get: readCart,
    count: getTotalCount,
    getQty(id) {
      const found = readCart().find((x) => String(x.id) === String(id));
      return found ? found.qty : 0;
    },
    add(id, qty = 1, name = "Product") {
      const items = readCart();
      const pid = String(id);
      const existing = items.find((x) => String(x.id) === pid);
      if (existing) {
        existing.qty = Math.min(99, (parseInt(existing.qty, 10) || 1) + qty);
      } else {
        items.push({ id: pid, qty: Math.max(1, qty) });
      }
      writeCart(items);
      showToast(`✅ Added "${name}" to Smart Cart`);
    },
    setQty(id, qty) {
      const pid = String(id);
      let items = readCart();
      if (qty <= 0) {
        items = items.filter((x) => String(x.id) !== pid);
      } else {
        const existing = items.find((x) => String(x.id) === pid);
        if (existing) {
          existing.qty = Math.min(99, qty);
        } else {
          items.push({ id: pid, qty: Math.min(99, qty) });
        }
      }
      writeCart(items);
    },
    remove(id) {
      const pid = String(id);
      const items = readCart().filter((x) => String(x.id) !== pid);
      writeCart(items);
    },
    clear() {
      writeCart([]);
      showToast("🗑️ Smart Cart cleared");
    },
    updateBadge,
    showToast,
  };

  window.SwadeshiCart = SwadeshiCart;

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-add-cart]");
    if (!btn) return;
    const pid = btn.getAttribute("data-add-cart");
    const pname = btn.getAttribute("data-product-name") || "Product";
    if (pid) {
      SwadeshiCart.add(pid, 1, pname);
      const orig = btn.innerHTML;
      btn.classList.add("added-flash");
      btn.innerHTML = "✓ Added";
      setTimeout(() => {
        btn.classList.remove("added-flash");
        if (document.body.contains(btn)) btn.innerHTML = orig;
      }, 900);
    }
  });

  document.addEventListener("DOMContentLoaded", updateBadge);
})();
