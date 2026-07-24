(function () {
  "use strict";

  var demo = window.JigsyDemo;
  var filter = "Open";
  var toast = document.getElementById("toast");
  var OPEN = ["New", "Accepted", "Preparing", "Ready"];

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

  function statusButton(order, label, status, primary) {
    if (order.status === status) return "";
    return '<button type="button" data-order="' + order.id + '" data-status="' + status + '" class="' +
      (primary ? "primary" : "") + '">' + label + "</button>";
  }

  function renderOrders() {
    var orders = demo.read(demo.keys.orders, []);
    var visible = orders.filter(function (order) {
      if (filter === "All") return true;
      if (filter === "Open") return OPEN.indexOf(order.status) !== -1;
      return order.status === "Completed" || order.status === "Cancelled";
    });
    var list = document.getElementById("orderList");
    if (!visible.length) {
      list.innerHTML = '<div class="empty-state"><strong>No ' + filter.toLowerCase() + ' orders.</strong><br>Place a customer demo order or load the sample rush.</div>';
    } else {
      list.innerHTML = visible.map(function (order) {
        var submitted = new Date(order.submittedAt);
        var items = order.items.map(function (item) {
          return "<li><strong>" + demo.escapeHTML(item.name) + "</strong> - " + demo.escapeHTML(item.detail) + "</li>";
        }).join("");
        return '<article class="order-card">' +
          '<div class="order-card-top"><div><span class="order-id">' + demo.escapeHTML(order.id) + '</span> ' +
          '<span class="status-badge" data-status="' + demo.escapeHTML(order.status) + '">' + demo.escapeHTML(order.status) + '</span></div>' +
          '<span class="order-time">' + submitted.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + ' · ' + order.pickupMinutes + ' min pickup</span></div>' +
          '<div class="order-card-body"><ul class="order-items">' + items + '</ul><div class="order-customer"><strong>' +
          demo.escapeHTML(order.customer.name) + '</strong><br>' + demo.escapeHTML(order.customer.phone) +
          (order.notes ? "<br>Note: " + demo.escapeHTML(order.notes) : "") + '<br><strong>' + demo.money(order.totals.total) + '</strong></div></div>' +
          '<div class="order-actions">' +
            statusButton(order, "Accept", "Accepted", order.status === "New") +
            statusButton(order, "Start preparing", "Preparing", order.status === "Accepted") +
            statusButton(order, "Mark ready", "Ready", order.status === "Preparing") +
            statusButton(order, "Complete pickup", "Completed", order.status === "Ready") +
            statusButton(order, "Cancel", "Cancelled", false) +
          '</div></article>';
      }).join("");
    }
    renderStats(orders);
  }

  function renderStats(orders) {
    document.getElementById("statNew").textContent = String(orders.filter(function (o) { return o.status === "New"; }).length);
    document.getElementById("statProgress").textContent = String(orders.filter(function (o) { return o.status === "Accepted" || o.status === "Preparing"; }).length);
    document.getElementById("statReady").textContent = String(orders.filter(function (o) { return o.status === "Ready"; }).length);
    var sales = orders.filter(function (o) { return o.status !== "Cancelled"; }).reduce(function (sum, order) { return sum + order.totals.total; }, 0);
    document.getElementById("statSales").textContent = demo.money(sales);
  }

  function updateOrder(id, status) {
    var orders = demo.read(demo.keys.orders, []);
    var order = orders.find(function (item) { return item.id === id; });
    if (!order) return;
    order.status = status;
    order.updatedAt = new Date().toISOString();
    demo.write(demo.keys.orders, orders);
    renderOrders();
    showToast(id + " marked " + status.toLowerCase() + ".");
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
        id: "J40116", status: "Accepted", submittedAt: new Date(now - 8 * 60000).toISOString(), pickupMinutes: 30,
        customer: { name: "Morgan L.", phone: "(717) 555-0188" }, notes: "",
        items: [
          { name: "Traditional Red Tray", detail: "12 cuts · Pepperoni, Onion", price: 21.99 },
          { name: "Cheesy Bread", detail: "One order", price: 9.99 }
        ],
        totals: { subtotal: 31.98, fee: 0.99, tax: 1.92, total: 34.89 }
      },
      {
        id: "J40093", status: "Preparing", submittedAt: new Date(now - 14 * 60000).toISOString(), pickupMinutes: 25,
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
    showToast("Sample rush loaded.");
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
    var button = event.target.closest("[data-order][data-status]");
    if (button) updateOrder(button.getAttribute("data-order"), button.getAttribute("data-status"));
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

  renderControls();
  renderOrders();
})();

