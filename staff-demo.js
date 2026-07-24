(function () {
  "use strict";

  var demo = window.JigsyDemo;
  var api = window.WiSenseOrdering;
  var filter = "New";
  var toast = document.getElementById("toast");
  var ticket = document.getElementById("printTicket");
  var ONLINE_ORDER_FEE = 0.99;
  var activeDay = dayKey(new Date());
  var selectedReportDay = activeDay;
  var activeAvailabilityCategory = demo.products[0].category;
  var ordersCache = [];
  var authenticated = false;
  var refreshBusy = false;
  var knownWaitingIds = new Set();

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.setTimeout(function () { toast.classList.remove("is-visible"); }, 1800);
  }

  async function updateSettings(patch) {
    try {
      await api.updateStaffSettings(patch);
      renderControls();
      setConnection(true);
    } catch (error) {
      handleStaffError(error);
    }
  }

  function renderControls() {
    var settings = demo.settings();
    var pause = document.getElementById("pauseToggle");
    pause.setAttribute("aria-checked", String(settings.paused));
    document.getElementById("prepOutput").textContent = settings.prepMinutes + " min";
    document.getElementById("paymentMode").textContent = settings.paymentMode === "square"
      ? "Square connected"
      : "Manual · pay at pickup";
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
    if (order.status === "Completed") return "Completed";
    if (order.status === "Cancelled") return "Cancelled";
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
    var orders = ordersCache;
    var todayOrders = ordersForDay(orders, activeDay);
    var visible = todayOrders.filter(function (order) {
      if (filter === "All") return true;
      return order.status === filter;
    });
    var list = document.getElementById("orderList");
    if (!visible.length) {
      list.innerHTML = '<div class="empty-state"><strong>No ' +
        (filter === "New" ? "waiting" : filter.toLowerCase()) +
        ' orders.</strong><br>New customer orders will appear here automatically.</div>';
    } else {
      list.innerHTML = visible.map(function (order) {
        var submitted = new Date(order.submittedAt);
        var items = order.items.map(function (item) {
          return "<li><strong>" + demo.escapeHTML(item.name) + "</strong> - " + demo.escapeHTML(item.detail) + "</li>";
        }).join("");
        var paymentLine = order.status === "Completed"
          ? demo.money(order.totals.total) + " paid · completed"
          : demo.money(order.totals.total) + " due at pickup";
        var action;
        if (order.status === "New") {
          action = '<button type="button" data-accept="' + order.id + '" class="primary">Accept &amp; print ticket</button>' +
            '<button type="button" data-reject="' + order.id + '" class="reject">Reject order</button>';
        } else if (order.status === "Accepted") {
          action = '<button type="button" data-complete="' + order.id + '" class="primary">Mark paid &amp; completed</button>' +
            '<button type="button" data-print="' + order.id + '">Reprint ticket</button>';
        } else if (order.status === "Completed") {
          action = '<button type="button" data-print="' + order.id + '">Reprint ticket</button>' +
            '<span class="fine-print">Completed orders count toward the WiSense fee report.</span>';
        } else {
          action = '<span class="fine-print">Rejected and cancelled orders remain in the daily report and do not earn a fee.</span>';
        }
        return '<article class="order-card">' +
          '<div class="order-card-top"><div><span class="order-id">' + demo.escapeHTML(order.id) + '</span> ' +
          '<span class="status-badge" data-status="' + demo.escapeHTML(order.status) + '">' + displayStatus(order) + '</span></div>' +
          '<span class="order-time">' + submitted.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) + ' · ' + order.pickupMinutes + ' min pickup</span></div>' +
          '<div class="order-card-body"><ul class="order-items">' + items + '</ul><div class="order-customer"><strong>' +
          demo.escapeHTML(order.customer.name) + '</strong><br>' + demo.escapeHTML(order.customer.phone) +
          (order.notes ? "<br>Note: " + demo.escapeHTML(order.notes) : "") +
          '<br><strong>' + paymentLine + '</strong></div></div>' +
          '<div class="order-actions">' + action + '</div></article>';
      }).join("");
    }
    renderStats(todayOrders, orders);
  }

  function renderStats(todayOrders, allOrders) {
    var completed = todayOrders.filter(function (order) { return order.status === "Completed"; });
    document.getElementById("statNew").textContent =
      String(todayOrders.filter(function (order) { return order.status === "New"; }).length);
    document.getElementById("statAccepted").textContent =
      String(todayOrders.filter(function (order) { return order.status === "Accepted"; }).length);
    document.getElementById("statRejected").textContent =
      String(todayOrders.filter(function (order) { return order.status === "Rejected"; }).length);
    var fees = completed.reduce(function (sum, order) {
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
    var completed = chronological.filter(function (order) { return order.status === "Completed"; });
    var rejected = chronological.filter(function (order) { return order.status === "Rejected"; });
    var fees = completed.reduce(function (sum, order) {
      return sum + Number(order.totals.fee || ONLINE_ORDER_FEE);
    }, 0);
    var sales = completed.reduce(function (sum, order) {
      return sum + Number(order.totals.total || 0);
    }, 0);
    document.getElementById("reportCount").textContent = String(completed.length);
    document.getElementById("reportRejected").textContent = String(rejected.length);
    document.getElementById("reportFees").textContent = demo.money(fees);
    document.getElementById("reportSales").textContent = demo.money(sales);
    document.getElementById("reportPeriod").textContent =
      chronological.length + " request" + (chronological.length === 1 ? "" : "s") +
      " received on " + new Date(selectedReportDay + "T12:00:00").toLocaleDateString() + ".";
    document.getElementById("reportRows").innerHTML = chronological.length
      ? chronological.map(function (order) {
          var completedOrder = order.status === "Completed";
          return "<tr><td>" + new Date(order.submittedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) +
            "</td><td><strong>" + demo.escapeHTML(order.id) + "</strong></td><td>" +
            displayStatus(order) + "</td><td>" + demo.money(order.totals.total) + "</td><td>" +
            demo.money(completedOrder ? (order.totals.fee || ONLINE_ORDER_FEE) : 0) + "</td></tr>";
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
    var completed = chronological.filter(function (order) { return order.status === "Completed"; });
    var rejected = chronological.filter(function (order) { return order.status === "Rejected"; });
    var waiting = chronological.filter(function (order) { return order.status === "New"; });
    var fees = completed.reduce(function (sum, order) {
      return sum + Number(order.totals.fee || ONLINE_ORDER_FEE);
    }, 0);
    var sales = completed.reduce(function (sum, order) {
      return sum + Number(order.totals.total || 0);
    }, 0);
    var rows = chronological.map(function (order) {
      return '<div class="ticket-total"><span>' + demo.escapeHTML(order.id) + ' · ' +
        new Date(order.submittedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) +
        '</span><strong>' + displayStatus(order).toUpperCase() + "</strong></div>" +
        '<div class="ticket-total"><small>' + demo.money(order.totals.total) +
        ' order</small><small>' + (order.status === "Completed" ? demo.money(order.totals.fee || ONLINE_ORDER_FEE) : "$0.00") +
        " fee</small></div>";
    }).join("");
    return '<div class="ticket-center"><strong class="ticket-brand">JIGSY’S</strong><br>FULL-DAY ONLINE ORDER REPORT</div>' +
      '<div class="ticket-rule"></div>' +
      '<div><strong>REPORT DATE:</strong> ' + new Date(selectedReportDay + "T12:00:00").toLocaleDateString() + '</div>' +
      '<div><strong>PRINTED:</strong> ' + new Date().toLocaleString() + '</div>' +
      '<div><strong>RECEIVED:</strong> ' + chronological.length + '</div>' +
      '<div><strong>IN PROGRESS:</strong> ' + accepted.length + ' &nbsp; <strong>COMPLETED:</strong> ' + completed.length + '</div>' +
      '<div><strong>REJECTED:</strong> ' + rejected.length + '</div>' +
      '<div><strong>STILL WAITING:</strong> ' + waiting.length + '</div>' +
      '<div class="ticket-rule"></div>' +
      (rows || '<div class="ticket-center">NO ONLINE REQUESTS</div>') +
      '<div class="ticket-rule"></div>' +
      '<div class="ticket-total"><span>Completed order value</span><strong>' + demo.money(sales) + '</strong></div>' +
      '<div class="ticket-total ticket-due"><span>WISENSE FEES</span><strong>' + demo.money(fees) + '</strong></div>' +
      '<div class="ticket-center">$0.99 per completed and paid online order</div>' +
      '<div class="ticket-rule"></div>' +
      '<div class="ticket-center">Jigsy’s collects customer payment at pickup.<br>Only completed orders earn a fee.</div>';
  }

  function printDailyReport() {
    ticket.innerHTML = reportMarkup(ordersCache);
    ticket.setAttribute("aria-hidden", "false");
    showToast("Opening full-day report…");
    window.setTimeout(function () { window.print(); }, 80);
  }

  async function rejectOrder(id) {
    if (!window.confirm("Reject " + id + "? It will remain in the daily report with a $0.00 WiSense fee.")) return;
    var order = ordersCache.find(function (item) { return item.id === id; });
    if (!order || order.status !== "New") return;
    try {
      await api.updateOrder(id, "reject");
      await refreshStaffData();
      showToast(id + " rejected. No fee added.");
    } catch (error) {
      handleStaffError(error);
    }
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
      '<div class="ticket-center">COLLECT PAYMENT AT COUNTER<br>MARK PAID / COMPLETED AFTER PAYMENT</div>';
  }

  async function printOrder(id, acceptFirst) {
    var order = ordersCache.find(function (item) { return item.id === id; });
    if (!order) return;
    try {
      if (acceptFirst) {
        order = await api.updateOrder(id, "accept");
      }
      await api.updateOrder(id, "print");
    } catch (error) {
      handleStaffError(error);
      return;
    }
    ticket.innerHTML = ticketMarkup(order);
    ticket.setAttribute("aria-hidden", "false");
    await refreshStaffData();
    showToast(order.id + (acceptFirst ? " accepted. Opening ticket…" : " ticket ready."));
    window.setTimeout(function () { window.print(); }, 80);
  }

  async function completeOrder(id) {
    if (!window.confirm("Mark " + id + " paid and completed? This adds the $0.99 WiSense fee to the report.")) return;
    try {
      await api.updateOrder(id, "complete");
      await refreshStaffData();
      showToast(id + " marked paid and completed.");
    } catch (error) {
      handleStaffError(error);
    }
  }

  function setConnection(connected) {
    var status = document.getElementById("connectionStatus");
    status.textContent = connected ? "Live · checking for orders" : "Connection interrupted";
    status.classList.toggle("is-offline", !connected);
  }

  function showAuth(message) {
    authenticated = false;
    document.getElementById("staffAuth").hidden = false;
    document.getElementById("staffAuthError").textContent = message || "";
    document.getElementById("staffPin").focus();
  }

  function handleStaffError(error) {
    setConnection(false);
    if (error && error.status === 401) {
      showAuth("Your staff session ended. Enter the passcode again.");
      return;
    }
    showToast(error && error.message ? error.message : "The ordering service could not be reached.");
  }

  function playOrderAlert(order) {
    try {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        var context = new AudioContext();
        var oscillator = context.createOscillator();
        var gain = context.createGain();
        oscillator.frequency.value = 880;
        gain.gain.setValueAtTime(0.16, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.7);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.7);
      }
    } catch {
      // Browser sound support varies; the visible queue remains authoritative.
    }
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("New Jigsy's order " + order.id, {
        body: order.customer.name + " · " + demo.money(order.totals.total) + " due at pickup",
        tag: order.id
      });
    }
    showToast("New order " + order.id + " received.");
  }

  async function refreshStaffData(silent) {
    if (!authenticated || refreshBusy) return;
    refreshBusy = true;
    try {
      var result = await Promise.all([api.loadStaffSettings(), api.loadStaffOrders()]);
      var nextOrders = result[1];
      if (!silent) {
        nextOrders.filter(function (order) {
          return order.status === "New" && !knownWaitingIds.has(order.id);
        }).forEach(playOrderAlert);
      }
      ordersCache = nextOrders;
      knownWaitingIds = new Set(nextOrders.filter(function (order) {
        return order.status === "New";
      }).map(function (order) { return order.id; }));
      renderControls();
      renderOrders();
      setConnection(true);
    } catch (error) {
      handleStaffError(error);
    } finally {
      refreshBusy = false;
    }
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
    var complete = event.target.closest("[data-complete]");
    if (accept) printOrder(accept.getAttribute("data-accept"), true);
    if (reject) rejectOrder(reject.getAttribute("data-reject"));
    if (reprint) printOrder(reprint.getAttribute("data-print"), false);
    if (complete) completeOrder(complete.getAttribute("data-complete"));
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
  document.getElementById("ordersTab").addEventListener("click", function () { showStaffView("orders"); });
  document.getElementById("menuTab").addEventListener("click", function () { showStaffView("menu"); });
  document.getElementById("reportTab").addEventListener("click", function () { showStaffView("report"); });
  document.getElementById("reportDate").addEventListener("change", function (event) {
    selectedReportDay = event.target.value;
    renderReport(ordersCache);
  });
  document.getElementById("printReport").addEventListener("click", printDailyReport);
  document.getElementById("staffLoginForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    var form = event.currentTarget;
    var button = form.querySelector('button[type="submit"]');
    var pin = document.getElementById("staffPin").value;
    button.disabled = true;
    button.textContent = "Opening…";
    document.getElementById("staffAuthError").textContent = "";
    try {
      await api.staffLogin(pin);
      authenticated = true;
      document.getElementById("staffAuth").hidden = true;
      document.getElementById("staffPin").value = "";
      await refreshStaffData(true);
    } catch (error) {
      document.getElementById("staffAuthError").textContent = error.message;
    } finally {
      button.disabled = false;
      button.textContent = "Open console";
    }
  });
  document.getElementById("staffLogout").addEventListener("click", async function () {
    await api.staffLogout().catch(function () {});
    ordersCache = [];
    knownWaitingIds = new Set();
    renderOrders();
    showAuth("");
  });
  document.getElementById("enableAlerts").addEventListener("click", async function (event) {
    var alertButton = event.currentTarget;
    if (!("Notification" in window)) {
      showToast("This browser does not support system notifications.");
      return;
    }
    var permission = await Notification.requestPermission();
    alertButton.textContent = permission === "granted" ? "Alerts enabled" : "Alerts blocked";
    showToast(permission === "granted"
      ? "New-order browser alerts are enabled."
      : "Allow notifications in the browser settings to receive alerts.");
  });
  window.addEventListener("storage", function () { renderControls(); });
  async function bootStaffConsole() {
    try {
      await api.staffSession();
      authenticated = true;
      document.getElementById("staffAuth").hidden = true;
      await refreshStaffData(true);
    } catch {
      showAuth("");
    }
  }

  bootStaffConsole();
  window.setInterval(function () { refreshStaffData(false); }, 4000);
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
