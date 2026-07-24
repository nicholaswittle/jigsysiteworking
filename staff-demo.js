(function () {
  "use strict";

  var demo = window.JigsyDemo;
  var filter = "New";
  var toast = document.getElementById("toast");
  var ticket = document.getElementById("printTicket");

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.setTimeout(function () { toast.classList.remove("is-visible"); }, 1800);
  }

  function updateSettings(patch) {
    var settings = Object.assign({}, demo.settings(), patch);
    demo.write(demo.keys.settings, settings);
    renderControls();
  }

  function renderControls() {
    var settings = demo.settings();
    var pause = document.getElementById("pauseToggle");
    pause.setAttribute("aria-checked", String(settings.paused));
    document.getElementById("prepOutput").textContent = settings.prepMinutes + " min";
    document.getElementById("soldOutList").innerHTML = demo.products.slice(0, 8).map(function (product) {
      var sold = settings.soldOut.indexOf(product.id) !== -1;
      return '<div class="sold-row"><span>' + demo.escapeHTML(product.name) + '</span>' +
        '<button type="button" data-sold="' + product.id + '" class="' + (sold ? "is-sold" : "") + '">' +
        (sold ? "Sold out" : "Available") + "</button></div>";
    }).join("");
  }

  function displayStatus(order) {
    return order.status === "New" ? "Waiting" : "Accepted";
  }

  function renderOrders() {
    var orders = demo.read(demo.keys.orders, []);
    var visible = orders.filter(function (order) {
      if (filter === "All") return true;
      return order.status === filter;
    });
    var list = document.getElementById("orderList");
    if (!visible.length) {
      list.innerHTML = '<div class="empty-state"><strong>No ' +
        (filter === "New" ? "waiting" : filter.toLowerCase()) +
        ' requests.</strong><br>Place a customer demo order or load the sample rush.</div>';
    } else {
      list.innerHTML = visible.map(function (order) {
        var submitted = new Date(order.submittedAt);
        var items = order.items.map(function (item) {
          return "<li><strong>" + demo.escapeHTML(item.name) + "</strong> - " + demo.escapeHTML(item.detail) + "</li>";
        }).join("");
        var action = order.status === "New"
          ? '<button type="button" data-accept="' + order.id + '" class="primary">Accept &amp; print ticket</button>'
          : '<button type="button" data-print="' + order.id + '">Reprint ticket</button>';
        return '<article class="order-card">' +
          '<div class="order-card-top"><div><span class="order-id">' + demo.escapeHTML(order.id) + '</span> ' +
          '<span class="status-badge" data-status="' + demo.escapeHTML(order.status) + '">' + displayStatus(order) + '</span></div>' +
          '<span class="order-time">' + submitted.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + ' · ' + order.pickupMinutes + ' min pickup</span></div>' +
          '<div class="order-card-body"><ul class="order-items">' + items + '</ul><div class="order-customer"><strong>' +
          demo.escapeHTML(order.customer.name) + '</strong><br>' + demo.escapeHTML(order.customer.phone) +
          (order.notes ? "<br>Note: " + demo.escapeHTML(order.notes) : "") +
          '<br><strong>' + demo.money(order.totals.total) + ' due at pickup</strong></div></div>' +
          '<div class="order-actions">' + action + '</div></article>';
      }).join("");
    }
    renderStats(orders);
  }

  function renderStats(orders) {
    var accepted = orders.filter(function (order) { return order.status === "Accepted"; });
    document.getElementById("statNew").textContent =
      String(orders.filter(function (order) { return order.status === "New"; }).length);
    document.getElementById("statAccepted").textContent = String(accepted.length);
    document.getElementById("statPrinted").textContent =
      String(accepted.filter(function (order) { return Boolean(order.printedAt); }).length);
    var sales = accepted.reduce(function (sum, order) { return sum + order.totals.total; }, 0);
    document.getElementById("statSales").textContent = demo.money(sales);
  }

  function ticketMarkup(order) {
    var submitted = new Date(order.submittedAt);
    var items = order.items.map(function (item) {
      return '<div class="ticket-item"><strong>' + demo.escapeHTML(item.name) + '</strong>' +
        '<span>' + demo.money(item.price) + '</span><small>' + demo.escapeHTML(item.detail) + '</small></div>';
    }).join("");
    return '<div class="ticket-center"><strong class="ticket-brand">JIGSY’S</strong><br>ONLINE PICKUP</div>' +
      '<div class="ticket-rule"></div>' +
      '<div class="ticket-big">' + demo.escapeHTML(order.id) + '</div>' +
      '<div><strong>ACCEPTED:</strong> ' + new Date(order.acceptedAt || Date.now()).toLocaleString() + '</div>' +
      '<div><strong>REQUESTED:</strong> ' + submitted.toLocaleString() + '</div>' +
      '<div><strong>PICKUP:</strong> About ' + order.pickupMinutes + ' minutes</div>' +
      '<div class="ticket-rule"></div>' +
      '<div><strong>' + demo.escapeHTML(order.customer.name) + '</strong></div>' +
      '<div>' + demo.escapeHTML(order.customer.phone) + '</div>' +
      (order.notes ? '<div class="ticket-note">NOTE: ' + demo.escapeHTML(order.notes) + '</div>' : "") +
      '<div class="ticket-rule"></div>' + items +
      '<div class="ticket-rule"></div>' +
      '<div class="ticket-total"><span>Food subtotal</span><strong>' + demo.money(order.totals.subtotal) + '</strong></div>' +
      '<div class="ticket-total"><span>Estimated tax</span><strong>' + demo.money(order.totals.tax) + '</strong></div>' +
      '<div class="ticket-total"><span>Online ordering fee</span><strong>' + demo.money(order.totals.fee) + '</strong></div>' +
      '<div class="ticket-total ticket-due"><span>DUE AT PICKUP</span><strong>' + demo.money(order.totals.total) + '</strong></div>' +
      '<div class="ticket-rule"></div>' +
      '<div class="ticket-center">COLLECT PAYMENT AT COUNTER<br>Demo ticket — no online payment</div>';
  }

  function printOrder(id, acceptFirst) {
    var orders = demo.read(demo.keys.orders, []);
    var order = orders.find(function (item) { return item.id === id; });
    if (!order) return;
    if (acceptFirst) {
      order.status = "Accepted";
      order.acceptedAt = new Date().toISOString();
    }
    order.printedAt = new Date().toISOString();
    demo.write(demo.keys.orders, orders);
    ticket.innerHTML = ticketMarkup(order);
    ticket.setAttribute("aria-hidden", "false");
    renderOrders();
    showToast(order.id + (acceptFirst ? " accepted. Opening ticket…" : " ticket ready."));
    window.setTimeout(function () { window.print(); }, 80);
  }

  function seedOrders() {
    var now = Date.now();
    var sample = [
      {
        id: "J40128", status: "New", submittedAt: new Date(now - 2 * 60000).toISOString(), pickupMinutes: 25,
        customer: { name: "Taylor R.", phone: "(717) 555-0142" }, notes: "Call when ready",
        items: [
          { name: "Chick Fil “J”", detail: "12 cuts", price: 27.99 },
          { name: "Jumbo Wings", detail: "10 wings · Garlic Parm · Ranch + $1.00", price: 13.99 }
        ],
        totals: { subtotal: 41.98, fee: 0.99, tax: 2.52, total: 45.49 }
      },
      {
        id: "J40116", status: "New", submittedAt: new Date(now - 8 * 60000).toISOString(), pickupMinutes: 30,
        customer: { name: "Morgan L.", phone: "(717) 555-0188" }, notes: "",
        items: [
          { name: "Traditional Red Tray", detail: "12 cuts · Pepperoni, Onion", price: 21.99 },
          { name: "Cheesy Bread", detail: "One order", price: 9.99 }
        ],
        totals: { subtotal: 31.98, fee: 0.99, tax: 1.92, total: 34.89 }
      },
      {
        id: "J40093", status: "Accepted", submittedAt: new Date(now - 14 * 60000).toISOString(), pickupMinutes: 25,
        acceptedAt: new Date(now - 12 * 60000).toISOString(), printedAt: new Date(now - 12 * 60000).toISOString(),
        customer: { name: "Chris D.", phone: "(717) 555-0114" }, notes: "Extra napkins",
        items: [
          { name: "Double White Tray", detail: "6 cuts", price: 18.99 },
          { name: "Fried Pickles", detail: "One order", price: 9.99 }
        ],
        totals: { subtotal: 28.98, fee: 0.99, tax: 1.74, total: 31.71 }
      }
    ];
    demo.write(demo.keys.orders, sample);
    renderOrders();
    showToast("Sample pickup requests loaded.");
  }

  document.getElementById("pauseToggle").addEventListener("click", function () {
    var paused = !demo.settings().paused;
    updateSettings({ paused: paused });
    showToast(paused ? "Online ordering paused." : "Online ordering reopened.");
  });
  document.getElementById("prepDown").addEventListener("click", function () {
    updateSettings({ prepMinutes: Math.max(10, demo.settings().prepMinutes - 5) });
  });
  document.getElementById("prepUp").addEventListener("click", function () {
    updateSettings({ prepMinutes: Math.min(90, demo.settings().prepMinutes + 5) });
  });
  document.getElementById("soldOutList").addEventListener("click", function (event) {
    var button = event.target.closest("[data-sold]");
    if (!button) return;
    var id = button.getAttribute("data-sold");
    var soldOut = demo.settings().soldOut.slice();
    var index = soldOut.indexOf(id);
    if (index === -1) soldOut.push(id); else soldOut.splice(index, 1);
    updateSettings({ soldOut: soldOut });
  });
  document.getElementById("orderList").addEventListener("click", function (event) {
    var accept = event.target.closest("[data-accept]");
    var reprint = event.target.closest("[data-print]");
    if (accept) printOrder(accept.getAttribute("data-accept"), true);
    if (reprint) printOrder(reprint.getAttribute("data-print"), false);
  });
  document.querySelector(".order-filters").addEventListener("click", function (event) {
    var button = event.target.closest("[data-filter]");
    if (!button) return;
    filter = button.getAttribute("data-filter");
    document.querySelectorAll("[data-filter]").forEach(function (item) {
      item.setAttribute("aria-pressed", String(item === button));
    });
    renderOrders();
  });
  document.getElementById("seedOrders").addEventListener("click", seedOrders);
  document.getElementById("resetDemo").addEventListener("click", function () {
    demo.write(demo.keys.orders, []);
    demo.write(demo.keys.cart, []);
    demo.write(demo.keys.settings, { paused: false, prepMinutes: 25, soldOut: [] });
    renderControls();
    renderOrders();
    showToast("Demo data reset.");
  });
  window.addEventListener("storage", function () { renderControls(); renderOrders(); });
  window.addEventListener("jigsy-demo-change", function () { renderControls(); renderOrders(); });

  var legacyOrders = demo.read(demo.keys.orders, []);
  var legacyChanged = false;
  legacyOrders.forEach(function (order) {
    if (order.status !== "New" && order.status !== "Accepted") {
      order.status = "Accepted";
      order.acceptedAt = order.acceptedAt || order.updatedAt || order.submittedAt;
      legacyChanged = true;
    }
  });
  if (legacyChanged) demo.write(demo.keys.orders, legacyOrders);

  renderControls();
  renderOrders();
})();
