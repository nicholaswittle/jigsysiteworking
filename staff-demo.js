(function () {
  "use strict";

  var demo = window.JigsyDemo;
  var filter = "New";
  var toast = document.getElementById("toast");
  var ticket = document.getElementById("printTicket");
  var ONLINE_ORDER_FEE = 0.99;
  var activeDay = dayKey(new Date());
  var selectedReportDay = activeDay;
  var activeAvailabilityCategory = demo.products[0].category;

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
    renderAvailability(settings);
  }

  function renderAvailability(settings) {
    var categories = Array.from(new Set(demo.products.map(function (product) { return product.category; })));
    if (categories.indexOf(activeAvailabilityCategory) === -1) activeAvailabilityCategory = categories[0];
    var categoryProducts = demo.products.filter(function (product) {
      return product.category === activeAvailabilityCategory;
    });
    var available = categoryProducts.filter(function (product) {
      return settings.soldOut.indexOf(product.id) === -1;
    }).length;
    document.getElementById("availabilityCount").textContent =
      available + " of " + categoryProducts.length + " available · " + demo.products.length + " total items";
    document.getElementById("availabilityTabs").innerHTML = categories.map(function (category) {
      return '<button type="button" class="availability-tab" role="tab" data-availability-category="' +
        demo.escapeHTML(category) + '" aria-selected="' + String(category === activeAvailabilityCategory) + '">' +
        demo.escapeHTML(category) + "</button>";
    }).join("");
    document.getElementById("menuAvailability").innerHTML =
      '<section class="availability-group"><h3>' + demo.escapeHTML(activeAvailabilityCategory) + '</h3><div class="availability-grid">' +
        categoryProducts.map(function (product) {
          var sold = settings.soldOut.indexOf(product.id) !== -1;
          return '<button type="button" data-sold="' + product.id + '" class="availability-item' +
            (sold ? " is-sold" : "") + '" aria-pressed="' + String(sold) + '">' +
            '<span><strong>' + demo.escapeHTML(product.name) + '</strong><small>' +
            demo.escapeHTML(product.description) + '</small></span><b>' +
            (sold ? "Ordering off" : "Available") + "</b></button>";
        }).join("") + "</div></section>";
  }

  function displayStatus(order) {
    if (order.status === "New") return "Waiting";
    if (order.status === "Rejected") return "Rejected";
    return "Accepted";
  }

  function dayKey(value) {
    var date = value instanceof Date ? value : new Date(value);
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0")
    ].join("-");
  }

  function dayLabel(key) {
    var date = new Date(key + "T12:00:00");
    if (key === dayKey(new Date())) return "Today — " + date.toLocaleDateString();
    var yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (key === dayKey(yesterday)) return "Yesterday — " + date.toLocaleDateString();
    return date.toLocaleDateString([], { weekday: "short", year: "numeric", month: "short", day: "numeric" });
  }

  function ordersForDay(orders, key) {
    return orders.filter(function (order) { return dayKey(order.submittedAt) === key; });
  }

  function renderOrders() {
    var orders = demo.read(demo.keys.orders, []);
    var todayOrders = ordersForDay(orders, activeDay);
    var visible = todayOrders.filter(function (order) {
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
        var action;
        if (order.status === "New") {
          action = '<button type="button" data-accept="' + order.id + '" class="primary">Accept &amp; print ticket</button>' +
            '<button type="button" data-reject="' + order.id + '" class="reject">Reject order</button>';
        } else if (order.status === "Accepted") {
          action = '<button type="button" data-print="' + order.id + '">Reprint ticket</button>';
        } else {
          action = '<span class="fine-print">Rejected orders are kept in the daily report and do not earn a fee.</span>';
        }
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
    renderStats(todayOrders, orders);
  }

  function renderStats(todayOrders, allOrders) {
    var accepted = todayOrders.filter(function (order) { return order.status === "Accepted"; });
    document.getElementById("statNew").textContent =
      String(todayOrders.filter(function (order) { return order.status === "New"; }).length);
    document.getElementById("statAccepted").textContent = String(accepted.length);
    document.getElementById("statRejected").textContent =
      String(todayOrders.filter(function (order) { return order.status === "Rejected"; }).length);
    var fees = accepted.reduce(function (sum, order) {
      return sum + Number(order.totals.fee || ONLINE_ORDER_FEE);
    }, 0);
    document.getElementById("statFees").textContent = demo.money(fees);
    renderReport(allOrders);
  }

  function renderReport(orders) {
    var dates = Array.from(new Set([activeDay].concat(orders.map(function (order) {
      return dayKey(order.submittedAt);
    })))).sort().reverse();
    if (dates.indexOf(selectedReportDay) === -1) selectedReportDay = activeDay;
    var select = document.getElementById("reportDate");
    select.innerHTML = dates.map(function (key) {
      return '<option value="' + key + '"' + (key === selectedReportDay ? " selected" : "") + ">" +
        demo.escapeHTML(dayLabel(key)) + "</option>";
    }).join("");

    var chronological = ordersForDay(orders, selectedReportDay).sort(function (a, b) {
      return new Date(a.submittedAt) - new Date(b.submittedAt);
    });
    var accepted = chronological.filter(function (order) { return order.status === "Accepted"; });
    var rejected = chronological.filter(function (order) { return order.status === "Rejected"; });
    var fees = accepted.reduce(function (sum, order) {
      return sum + Number(order.totals.fee || ONLINE_ORDER_FEE);
    }, 0);
    var sales = accepted.reduce(function (sum, order) {
      return sum + Number(order.totals.total || 0);
    }, 0);
    document.getElementById("reportCount").textContent = String(accepted.length);
    document.getElementById("reportRejected").textContent = String(rejected.length);
    document.getElementById("reportFees").textContent = demo.money(fees);
    document.getElementById("reportSales").textContent = demo.money(sales);
    document.getElementById("reportPeriod").textContent =
      chronological.length + " request" + (chronological.length === 1 ? "" : "s") +
      " received on " + new Date(selectedReportDay + "T12:00:00").toLocaleDateString() + ".";
    document.getElementById("reportRows").innerHTML = chronological.length
      ? chronological.map(function (order) {
          var acceptedOrder = order.status === "Accepted";
          return "<tr><td>" + new Date(order.submittedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) +
            "</td><td><strong>" + demo.escapeHTML(order.id) + "</strong></td><td>" +
            displayStatus(order) + "</td><td>" + demo.money(order.totals.total) + "</td><td>" +
            demo.money(acceptedOrder ? (order.totals.fee || ONLINE_ORDER_FEE) : 0) + "</td></tr>";
        }).join("")
      : '<tr><td colspan="5" class="report-empty">No online requests were received on this date.</td></tr>';
  }

  function showStaffView(view) {
    var showOrders = view === "orders";
    var showMenu = view === "menu";
    var showReport = view === "report";
    document.getElementById("ordersView").hidden = !showOrders;
    document.getElementById("menuView").hidden = !showMenu;
    document.getElementById("reportView").hidden = !showReport;
    document.getElementById("ordersTab").setAttribute("aria-selected", String(showOrders));
    document.getElementById("menuTab").setAttribute("aria-selected", String(showMenu));
    document.getElementById("reportTab").setAttribute("aria-selected", String(showReport));
  }

  function reportMarkup(orders) {
    var chronological = ordersForDay(orders, selectedReportDay).sort(function (a, b) {
      return new Date(a.submittedAt) - new Date(b.submittedAt);
    });
    var accepted = chronological.filter(function (order) { return order.status === "Accepted"; });
    var rejected = chronological.filter(function (order) { return order.status === "Rejected"; });
    var waiting = chronological.filter(function (order) { return order.status === "New"; });
    var fees = accepted.reduce(function (sum, order) {
      return sum + Number(order.totals.fee || ONLINE_ORDER_FEE);
    }, 0);
    var sales = accepted.reduce(function (sum, order) {
      return sum + Number(order.totals.total || 0);
    }, 0);
    var rows = chronological.map(function (order) {
      return '<div class="ticket-total"><span>' + demo.escapeHTML(order.id) + ' · ' +
        new Date(order.submittedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) +
        '</span><strong>' + displayStatus(order).toUpperCase() + "</strong></div>" +
        '<div class="ticket-total"><small>' + demo.money(order.totals.total) +
        ' order</small><small>' + (order.status === "Accepted" ? demo.money(order.totals.fee || ONLINE_ORDER_FEE) : "$0.00") +
        " fee</small></div>";
    }).join("");
    return '<div class="ticket-center"><strong class="ticket-brand">JIGSY’S</strong><br>FULL-DAY ONLINE ORDER REPORT</div>' +
      '<div class="ticket-rule"></div>' +
      '<div><strong>REPORT DATE:</strong> ' + new Date(selectedReportDay + "T12:00:00").toLocaleDateString() + '</div>' +
      '<div><strong>PRINTED:</strong> ' + new Date().toLocaleString() + '</div>' +
      '<div><strong>RECEIVED:</strong> ' + chronological.length + '</div>' +
      '<div><strong>ACCEPTED:</strong> ' + accepted.length + ' &nbsp; <strong>REJECTED:</strong> ' + rejected.length + '</div>' +
      '<div><strong>STILL WAITING:</strong> ' + waiting.length + '</div>' +
      '<div class="ticket-rule"></div>' +
      (rows || '<div class="ticket-center">NO ONLINE REQUESTS</div>') +
      '<div class="ticket-rule"></div>' +
      '<div class="ticket-total"><span>Accepted order value</span><strong>' + demo.money(sales) + '</strong></div>' +
      '<div class="ticket-total ticket-due"><span>WISENSE FEES</span><strong>' + demo.money(fees) + '</strong></div>' +
      '<div class="ticket-center">$0.99 per accepted online order</div>' +
      '<div class="ticket-rule"></div>' +
      '<div class="ticket-center">Jigsy’s collects customer payment at pickup.<br>Rejected and waiting orders earn no fee.</div>';
  }

  function printDailyReport() {
    var orders = demo.read(demo.keys.orders, []);
    ticket.innerHTML = reportMarkup(orders);
    ticket.setAttribute("aria-hidden", "false");
    showToast("Opening full-day report…");
    window.setTimeout(function () { window.print(); }, 80);
  }

  function rejectOrder(id) {
    if (!window.confirm("Reject " + id + "? It will remain in the daily report with a $0.00 WiSense fee.")) return;
    var orders = demo.read(demo.keys.orders, []);
    var order = orders.find(function (item) { return item.id === id; });
    if (!order || order.status !== "New") return;
    order.status = "Rejected";
    order.rejectedAt = new Date().toISOString();
    demo.write(demo.keys.orders, orders);
    renderOrders();
    showToast(id + " rejected. No fee added.");
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
  document.getElementById("menuAvailability").addEventListener("click", function (event) {
    var button = event.target.closest("[data-sold]");
    if (!button) return;
    var id = button.getAttribute("data-sold");
    var soldOut = demo.settings().soldOut.slice();
    var index = soldOut.indexOf(id);
    if (index === -1) soldOut.push(id); else soldOut.splice(index, 1);
    updateSettings({ soldOut: soldOut });
  });
  document.getElementById("availabilityTabs").addEventListener("click", function (event) {
    var button = event.target.closest("[data-availability-category]");
    if (!button) return;
    activeAvailabilityCategory = button.getAttribute("data-availability-category");
    renderAvailability(demo.settings());
  });
  document.getElementById("orderList").addEventListener("click", function (event) {
    var accept = event.target.closest("[data-accept]");
    var reject = event.target.closest("[data-reject]");
    var reprint = event.target.closest("[data-print]");
    if (accept) printOrder(accept.getAttribute("data-accept"), true);
    if (reject) rejectOrder(reject.getAttribute("data-reject"));
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
  document.getElementById("ordersTab").addEventListener("click", function () { showStaffView("orders"); });
  document.getElementById("menuTab").addEventListener("click", function () { showStaffView("menu"); });
  document.getElementById("reportTab").addEventListener("click", function () { showStaffView("report"); });
  document.getElementById("reportDate").addEventListener("change", function (event) {
    selectedReportDay = event.target.value;
    renderReport(demo.read(demo.keys.orders, []));
  });
  document.getElementById("printReport").addEventListener("click", printDailyReport);
  document.getElementById("resetDemo").addEventListener("click", function () {
    demo.write(demo.keys.orders, []);
    demo.write(demo.keys.cart, []);
    demo.write(demo.keys.customerOrder, null);
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
    if (order.status !== "New" && order.status !== "Accepted" && order.status !== "Rejected") {
      order.status = "Accepted";
      order.acceptedAt = order.acceptedAt || order.updatedAt || order.submittedAt;
      legacyChanged = true;
    }
  });
  if (legacyChanged) demo.write(demo.keys.orders, legacyOrders);

  renderControls();
  renderOrders();
  window.setInterval(function () {
    var today = dayKey(new Date());
    if (today === activeDay) return;
    activeDay = today;
    selectedReportDay = today;
    filter = "New";
    document.querySelectorAll("[data-filter]").forEach(function (item) {
      item.setAttribute("aria-pressed", String(item.getAttribute("data-filter") === "New"));
    });
    renderOrders();
    showToast("New day started. Yesterday’s orders moved to Daily reports.");
  }, 60000);
})();
