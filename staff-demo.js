(function () {
  "use strict";

  var demo = window.JigsyDemo;
  var api = window.WiSenseOrdering;
  var filter = "New";
  var toast = document.getElementById("toast");
  var ticket = document.getElementById("printTicket");
  var activeDay = dayKey(new Date());
  var selectedReportDay = activeDay;
  var activeAvailabilityCategory = demo.products[0].category;
  var ordersCache = [];
  var authenticated = false;
  var refreshBusy = false;
  // A waiting order keeps re-alerting until staff accept or reject it.
  var ALERT_REPEAT_MS = 30000;
  var ALERT_ESCALATE_MS = 120000;
  var alertedAt = new Map();
  var waitingSince = new Map();
  var audioContext = null;
  var alertTracks = {};
  var unlockPromise = null;
  var wakeLock = null;

  var toastTimer = null;
  function showToast(message, holdMs) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toast.classList.remove("is-visible");
    }, holdMs || 5000);
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

  function shortIdentifier(value) {
    if (!value) return "—";
    if (value.length <= 14) return value;
    return value.slice(0, 7) + "…" + value.slice(-5);
  }

  function renderSquareStatus(status) {
    var connected = Boolean(status && status.connected);
    var configured = Boolean(status && status.configured);
    var checkoutEnabled = connected && status.paymentMode === "square";
    var badge = document.getElementById("squareStatusBadge");
    var title = document.getElementById("squareStatusTitle");
    var copy = document.getElementById("squareStatusCopy");
    var details = document.getElementById("squareDetails");
    var connect = document.getElementById("connectSquare");
    var disconnect = document.getElementById("disconnectSquare");
    var checkoutControl = document.getElementById("squareCheckoutControl");
    var checkoutBadge = document.getElementById("squareCheckoutBadge");
    var checkoutButton = document.getElementById("toggleSquareCheckout");

    badge.textContent = connected
      ? (checkoutEnabled ? "Connected · Checkout on" : "Connected · Checkout off")
      : (configured ? "Ready to connect" : "Setup needed");
    badge.classList.toggle("is-connected", connected);
    title.textContent = connected
      ? "Square Sandbox is connected"
      : (configured ? "Authorize a Square test business" : "Square Sandbox needs site configuration");
    copy.textContent = connected
      ? (checkoutEnabled
          ? "Test-card checkout is active. Square captures the authorized Sandbox payment only when staff accepts the order."
          : "The website can securely identify the test merchant and location. Customer checkout is still pay at pickup.")
      : (configured
          ? "You will sign in on Square’s own page and choose the sandbox test business. WiSense never sees the Square password."
          : "The protected Square application values are missing from this deployment.");
    details.hidden = !connected;
    connect.hidden = connected || !configured;
    disconnect.hidden = !connected;
    checkoutControl.hidden = !connected;
    checkoutBadge.textContent = checkoutEnabled ? "Checkout on" : "Checkout off";
    checkoutBadge.classList.toggle("is-connected", checkoutEnabled);
    checkoutButton.textContent = checkoutEnabled ? "Return to pay at pickup" : "Enable test checkout";
    checkoutButton.setAttribute("data-enabled", String(checkoutEnabled));
    if (connected) {
      document.getElementById("squareLocation").textContent = status.locationName || "Square test location";
      document.getElementById("squareMerchant").textContent = shortIdentifier(status.merchantId);
      document.getElementById("squareExpires").textContent = status.expiresAt
        ? new Date(status.expiresAt).toLocaleDateString()
        : "Not provided";
    }
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
    if (order.status === "Refunded") return "Refunded";
    if (order.status === "Unpaid") return "Not paid";
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
        var paymentLine;
        if (order.paymentMode === "square") {
          paymentLine = order.paymentStatus === "refunded"
            ? demo.money(order.totals.total) + " Sandbox refunded"
            : order.paymentStatus === "authorized"
              ? demo.money(order.totals.total) + " Sandbox authorized · capture on accept"
              : order.paymentStatus === "completed"
                ? demo.money(order.totals.total) + " Sandbox captured"
                : demo.money(order.totals.total) + " Sandbox authorization voided";
        } else {
          paymentLine = order.status === "Completed"
            ? demo.money(order.totals.total) + " paid · completed"
            : demo.money(order.totals.total) + " due at pickup";
        }
        var refundable = order.paymentMode === "square" && order.paymentStatus === "completed";
        var refundButton = refundable
          ? '<button type="button" data-refund="' + order.id + '" class="reject">Refund payment</button>'
          : "";
        var action;
        if (order.status === "New") {
          action = '<button type="button" data-accept="' + order.id + '" class="primary">Accept order</button>' +
            '<button type="button" data-reject="' + order.id + '" class="reject">Reject order</button>';
        } else if (order.status === "Accepted") {
          action = '<button type="button" data-print="' + order.id + '">Print ticket</button>' + refundButton;
        } else if (order.status === "Completed") {
          action = '<button type="button" data-print="' + order.id + '">Print ticket</button>' + refundButton +
            '<button type="button" data-unpaid="' + order.id + '" class="reject">Didn’t pay</button>' +
            '<span class="fine-print">Mark “Didn’t pay” if the customer never picked up.</span>';
        } else if (order.status === "Unpaid") {
          action = '<button type="button" data-markpaid="' + order.id + '" class="primary">Mark as paid</button>' +
            '<span class="fine-print">Customer did not pick up or pay.</span>';
        } else if (order.status === "Refunded") {
          action = '<span class="fine-print">Refunded orders remain in the daily report.</span>';
        } else {
          action = '<span class="fine-print">Rejected and cancelled orders remain in the daily report.</span>';
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
      String(todayOrders.filter(function (order) { return order.status === "Completed"; }).length);
    document.getElementById("statRejected").textContent =
      String(todayOrders.filter(function (order) { return order.status === "Rejected"; }).length);
    var salesToday = completed.reduce(function (sum, order) {
      return sum + Number(order.totals.total || 0);
    }, 0);
    document.getElementById("statFees").textContent = demo.money(salesToday);
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
    var sales = completed.reduce(function (sum, order) {
      return sum + Number(order.totals.total || 0);
    }, 0);
    document.getElementById("reportCount").textContent = String(completed.length);
    document.getElementById("reportRejected").textContent = String(rejected.length);
    document.getElementById("reportSales").textContent = demo.money(sales);
    document.getElementById("reportPeriod").textContent =
      chronological.length + " request" + (chronological.length === 1 ? "" : "s") +
      " received on " + new Date(selectedReportDay + "T12:00:00").toLocaleDateString() + ".";
    document.getElementById("reportRows").innerHTML = chronological.length
      ? chronological.map(function (order) {
          return "<tr><td>" + new Date(order.submittedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) +
            "</td><td><strong>" + demo.escapeHTML(order.id) + "</strong></td><td>" +
            displayStatus(order) + "</td><td>" + demo.money(order.totals.total) + "</td></tr>";
        }).join("")
      : '<tr><td colspan="4" class="report-empty">No online requests were received on this date.</td></tr>';

    renderMonthTotals(orders);
  }

  // Totals for the calendar month containing the selected report date.
  function monthTotals(orders, monthKey) {
    var inMonth = orders.filter(function (order) {
      return dayKey(order.submittedAt).slice(0, 7) === monthKey;
    });
    var completed = inMonth.filter(function (order) { return order.status === "Completed"; });
    return {
      requests: inMonth.length,
      completed: completed.length,
      unpaid: inMonth.filter(function (order) { return order.status === "Unpaid"; }).length,
      sales: completed.reduce(function (sum, order) {
        return sum + Number(order.totals.total || 0);
      }, 0)
    };
  }

  function monthLabel(monthKey) {
    return new Date(monthKey + "-01T12:00:00")
      .toLocaleDateString([], { month: "long", year: "numeric" });
  }

  function renderMonthTotals(orders) {
    var monthKey = selectedReportDay.slice(0, 7);
    var totals = monthTotals(orders, monthKey);
    document.getElementById("reportMonthHeading").textContent = monthLabel(monthKey);
    document.getElementById("reportMonthSales").textContent = demo.money(totals.sales);
    document.getElementById("reportMonthCount").textContent = String(totals.completed);
    document.getElementById("reportMonthUnpaid").textContent = String(totals.unpaid);
    document.getElementById("reportMonthNote").textContent =
      totals.requests + " online request" + (totals.requests === 1 ? "" : "s") + " received this month";
  }

  function showStaffView(view) {
    var showOrders = view === "orders";
    var showMenu = view === "menu";
    var showReport = view === "report";
    var showPayments = view === "payments";
    document.getElementById("ordersView").hidden = !showOrders;
    document.getElementById("menuView").hidden = !showMenu;
    document.getElementById("reportView").hidden = !showReport;
    document.getElementById("paymentsView").hidden = !showPayments;
    document.getElementById("ordersTab").setAttribute("aria-selected", String(showOrders));
    document.getElementById("menuTab").setAttribute("aria-selected", String(showMenu));
    document.getElementById("reportTab").setAttribute("aria-selected", String(showReport));
    document.getElementById("paymentsTab").setAttribute("aria-selected", String(showPayments));
  }

  function reportMarkup(orders) {
    var chronological = ordersForDay(orders, selectedReportDay).sort(function (a, b) {
      return new Date(a.submittedAt) - new Date(b.submittedAt);
    });
    var month = monthTotals(orders, selectedReportDay.slice(0, 7));
    var accepted = chronological.filter(function (order) { return order.status === "Accepted"; });
    var completed = chronological.filter(function (order) { return order.status === "Completed"; });
    var rejected = chronological.filter(function (order) { return order.status === "Rejected"; });
    var waiting = chronological.filter(function (order) { return order.status === "New"; });
    var sales = completed.reduce(function (sum, order) {
      return sum + Number(order.totals.total || 0);
    }, 0);
    var rows = chronological.map(function (order) {
      return '<div class="ticket-total"><span>' + demo.escapeHTML(order.id) + ' · ' +
        new Date(order.submittedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) +
        '</span><strong>' + displayStatus(order).toUpperCase() + "</strong></div>" +
        '<div class="ticket-total"><small>' + demo.money(order.totals.total) +
        ' order</small><small>' + displayStatus(order).toLowerCase() + "</small></div>";
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
      '<div class="ticket-rule"></div>' +
      '<div class="ticket-center">' + monthLabel(selectedReportDay.slice(0, 7)).toUpperCase() + ' TO DATE</div>' +
      '<div class="ticket-total"><span>Completed orders</span><strong>' + month.completed + '</strong></div>' +
      '<div class="ticket-total"><span>Not paid</span><strong>' + month.unpaid + '</strong></div>' +
      '<div class="ticket-total ticket-due"><span>Month order value</span><strong>' + demo.money(month.sales) + '</strong></div>' +
      '<div class="ticket-rule"></div>' +
      '<div class="ticket-center">Jigsy’s collects customer payment at pickup.</div>';
  }

  function printDailyReport() {
    ticket.innerHTML = reportMarkup(ordersCache);
    ticket.setAttribute("aria-hidden", "false");
    showToast("Opening full-day report…");
    window.setTimeout(function () { window.print(); }, 80);
  }

  async function rejectOrder(id) {
    if (!window.confirm("Reject " + id + "? It stays in the daily report as rejected.")) return;
    var order = ordersCache.find(function (item) { return item.id === id; });
    if (!order || order.status !== "New") return;
    try {
      await api.updateOrder(id, "reject");
      await refreshStaffData();
      showToast(id + " rejected.");
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
      (order.totals.fee ? '<div class="ticket-total"><span>Online ordering fee</span><strong>' + demo.money(order.totals.fee) + '</strong></div>' : "") +
      '<div class="ticket-total ticket-due"><span>' +
        (order.paymentMode === "square" ? "SQUARE SANDBOX CAPTURED" : "DUE AT PICKUP") +
        '</span><strong>' + demo.money(order.totals.total) + '</strong></div>' +
      '<div class="ticket-rule"></div>' +
      '<div class="ticket-center">' +
        (order.paymentMode === "square"
          ? "TEST PAYMENT CAPTURED WHEN ACCEPTED<br>NO PAYMENT DUE AT COUNTER"
          : "COLLECT PAYMENT AT COUNTER<br>MARK PAID / COMPLETED AFTER PAYMENT") +
        "</div>";
  }

  async function acceptOrder(id) {
    try {
      await api.updateOrder(id, "accept");
      await refreshStaffData();
      showToast(id + " accepted. Print the ticket for the kitchen.");
    } catch (error) {
      handleStaffError(error);
    }
  }

  async function printOrder(id) {
    var order = ordersCache.find(function (item) { return item.id === id; });
    if (!order) return;
    try {
      await api.updateOrder(id, "print");
    } catch (error) {
      handleStaffError(error);
      return;
    }
    ticket.innerHTML = ticketMarkup(order);
    ticket.setAttribute("aria-hidden", "false");
    await refreshStaffData();
    showToast(order.id + " ticket ready.");
    window.setTimeout(function () { window.print(); }, 80);
  }

  async function completeOrder(id) {
    var order = ordersCache.find(function (item) { return item.id === id; });
    var prompt = order && order.paymentMode === "square"
      ? "Mark " + id + " completed? Its Sandbox payment was already captured when accepted."
      : "Mark " + id + " paid and completed?";
    if (!window.confirm(prompt)) return;
    try {
      await api.updateOrder(id, "complete");
      await refreshStaffData();
      showToast(id + " marked paid and completed.");
    } catch (error) {
      handleStaffError(error);
    }
  }

  async function refundOrder(id) {
    var order = ordersCache.find(function (item) { return item.id === id; });
    if (!order || order.paymentMode !== "square" || order.paymentStatus !== "completed") return;
    if (!window.confirm(
      "Refund " + id + "? This returns the full " + demo.money(order.totals.total) +
      " Square Sandbox payment."
    )) return;
    try {
      await api.updateOrder(id, "refund");
      await refreshStaffData();
      showToast(id + " refunded.");
    } catch (error) {
      handleStaffError(error);
    }
  }

  async function markUnpaid(id) {
    if (!window.confirm("Mark " + id + " as not paid? It will be recorded as a no-show.")) return;
    try {
      await api.updateOrder(id, "unpaid");
      await refreshStaffData();
      showToast(id + " marked not paid.");
    } catch (error) {
      handleStaffError(error);
    }
  }

  async function markPaid(id) {
    try {
      await api.updateOrder(id, "markpaid");
      await refreshStaffData();
      showToast(id + " marked paid.");
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

  // Browsers only start audio inside a user gesture, and they consider the
  // gesture spent after the first `await`. So the context is created and resumed
  // synchronously on the very first interaction anywhere on the page.
  function ensureAudioContext() {
    try {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      if (!audioContext) audioContext = new Ctor();
      if (audioContext.state === "suspended") audioContext.resume();
      return audioContext;
    } catch {
      return null;
    }
  }

  // Browsers suspend an AudioContext while its tab is hidden, which silenced the
  // repeat alarm exactly when staff were looking elsewhere. Media elements keep
  // playing in background tabs, so the alert tone is a generated WAV played
  // through an <audio> element, with Web Audio kept only as a fallback.
  function buildBeepTrack(beeps, frequency) {
    var rate = 22050;
    var beepSeconds = 0.3;
    var gapSeconds = 0.14;
    var totalSamples = Math.round(rate * (beeps * beepSeconds + (beeps - 1) * gapSeconds));
    var bytes = new ArrayBuffer(44 + totalSamples * 2);
    var view = new DataView(bytes);
    var writeText = function (offset, text) {
      for (var index = 0; index < text.length; index += 1) {
        view.setUint8(offset + index, text.charCodeAt(index));
      }
    };
    writeText(0, "RIFF");
    view.setUint32(4, 36 + totalSamples * 2, true);
    writeText(8, "WAVEfmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, rate, true);
    view.setUint32(28, rate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeText(36, "data");
    view.setUint32(40, totalSamples * 2, true);

    var beepSamples = Math.round(rate * beepSeconds);
    var strideSamples = Math.round(rate * (beepSeconds + gapSeconds));
    for (var sample = 0; sample < totalSamples; sample += 1) {
      var position = sample % strideSamples;
      var amplitude = 0;
      if (position < beepSamples) {
        var seconds = position / rate;
        // Short fade in/out keeps the tone from clicking.
        var envelope = Math.min(1, seconds / 0.01, (beepSeconds - seconds) / 0.05);
        amplitude = Math.sin(2 * Math.PI * frequency * seconds) * 0.6 * Math.max(0, envelope);
      }
      view.setInt16(44 + sample * 2, amplitude * 32767, true);
    }
    return URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
  }

  function alertTrack(urgent) {
    var key = urgent ? "urgent" : "normal";
    if (!alertTracks[key]) {
      var element = new Audio(buildBeepTrack(urgent ? 3 : 1, urgent ? 988 : 880));
      element.preload = "auto";
      alertTracks[key] = element;
    }
    return alertTracks[key];
  }

  // Priming each element inside a gesture lets later alerts play on their own.
  // The prime must finish before any real alert plays, otherwise it can pause or
  // mute the alert mid-tone, so callers share this one promise.
  function unlockAudio() {
    if (unlockPromise) return unlockPromise;
    ensureAudioContext();
    unlockPromise = Promise.all(["normal", "urgent"].map(function (key) {
      var element = alertTrack(key === "urgent");
      element.muted = true;
      var started = element.play();
      return Promise.resolve(started)
        .then(function () {
          element.pause();
          element.currentTime = 0;
          element.muted = false;
        })
        .catch(function () {
          element.muted = false;
        });
    }));
    return unlockPromise;
  }
  ["pointerdown", "keydown"].forEach(function (type) {
    window.addEventListener(type, unlockAudio, { capture: true });
  });

  function playWebAudioFallback(count) {
    var context = ensureAudioContext();
    if (!context) return false;
    try {
      for (var index = 0; index < count; index += 1) {
        var start = context.currentTime + 0.05 + index * 0.44;
        var oscillator = context.createOscillator();
        var gain = context.createGain();
        oscillator.type = "square";
        oscillator.frequency.value = count > 1 ? 988 : 880;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.45, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.32);
      }
      return context.state === "running";
    } catch {
      return false;
    }
  }

  // Returns false only when the browser refuses to play at all, so callers can
  // tell staff that sound is blocked instead of failing silently.
  function playBeeps(count) {
    var element = alertTrack(count > 1);
    // Wait for any in-flight prime so it cannot mute or pause this tone.
    Promise.resolve(unlockPromise).then(function () {
      try {
        element.muted = false;
        element.currentTime = 0;
        var started = element.play();
        if (started && started.catch) {
          started.catch(function () { playWebAudioFallback(count); });
        }
      } catch {
        playWebAudioFallback(count);
      }
    });
    return true;
  }

  function playOrderAlert(order, options) {
    var repeat = Boolean(options && options.repeat);
    var urgent = Boolean(options && options.urgent);
    playBeeps(urgent ? 3 : 1);
    if (navigator.vibrate) {
      try {
        navigator.vibrate(urgent ? [200, 100, 200, 100, 200] : 200);
      } catch {
        // Vibration is a nicety; ignore unsupported devices.
      }
    }
    if ("Notification" in window && Notification.permission === "granted") {
      var waitingMinutes = Math.round((Date.now() - (waitingSince.get(order.id) || Date.now())) / 60000);
      new Notification(
        (urgent ? "Still waiting · " : repeat ? "Waiting · " : "New Jigsy's order ") + order.id,
        {
          body: order.customer.name + " · " + demo.money(order.totals.total) +
            (repeat && waitingMinutes >= 1 ? " · waiting " + waitingMinutes + " min" : ""),
          tag: order.id,
          renotify: true,
          // Stay on screen until staff dismiss it instead of auto-hiding.
          requireInteraction: true
        },
      );
    }
    showToast(
      repeat
        ? order.id + " still needs a response."
        : "New order " + order.id + " received.",
    );
  }

  // Alerts every waiting order on arrival, then repeats until it is accepted or
  // rejected. Escalates to a louder pattern once an order has waited too long.
  function reviewWaitingAlerts(orders) {
    var now = Date.now();
    var waitingIds = new Set();
    orders.forEach(function (order) {
      if (order.status !== "New") return;
      waitingIds.add(order.id);
      if (!waitingSince.has(order.id)) waitingSince.set(order.id, now);
      var last = alertedAt.get(order.id);
      if (last && now - last < ALERT_REPEAT_MS) return;
      playOrderAlert(order, {
        repeat: Boolean(last),
        urgent: now - waitingSince.get(order.id) >= ALERT_ESCALATE_MS,
      });
      alertedAt.set(order.id, now);
    });
    // Accepting or rejecting an order is the acknowledgement: stop tracking it.
    alertedAt.forEach(function (_value, id) {
      if (!waitingIds.has(id)) alertedAt.delete(id);
    });
    waitingSince.forEach(function (_value, id) {
      if (!waitingIds.has(id)) waitingSince.delete(id);
    });
  }

  // Keeps the kitchen tablet awake so the queue and its alarms stay live.
  async function requestWakeLock() {
    if (!("wakeLock" in navigator) || wakeLock) return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", function () { wakeLock = null; });
    } catch {
      // Wake lock is unavailable on some browsers; ignore.
    }
  }

  async function refreshStaffData(silent) {
    if (!authenticated || refreshBusy) return;
    refreshBusy = true;
    try {
      var result = await Promise.all([api.loadStaffSettings(), api.loadStaffOrders()]);
      var nextOrders = result[1];
      if (silent) {
        // First load after sign-in: adopt the existing queue without alarming.
        var startedAt = Date.now();
        nextOrders.forEach(function (order) {
          if (order.status !== "New") return;
          waitingSince.set(order.id, startedAt);
          alertedAt.set(order.id, startedAt);
        });
      } else {
        reviewWaitingAlerts(nextOrders);
      }
      ordersCache = nextOrders;
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
    var refund = event.target.closest("[data-refund]");
    var unpaid = event.target.closest("[data-unpaid]");
    var markpaid = event.target.closest("[data-markpaid]");
    if (accept) acceptOrder(accept.getAttribute("data-accept"));
    if (reject) rejectOrder(reject.getAttribute("data-reject"));
    if (reprint) printOrder(reprint.getAttribute("data-print"));
    if (complete) completeOrder(complete.getAttribute("data-complete"));
    if (refund) refundOrder(refund.getAttribute("data-refund"));
    if (unpaid) markUnpaid(unpaid.getAttribute("data-unpaid"));
    if (markpaid) markPaid(markpaid.getAttribute("data-markpaid"));
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
  document.getElementById("paymentsTab").addEventListener("click", function () { showStaffView("payments"); });
  document.getElementById("connectSquare").addEventListener("click", async function (event) {
    var button = event.currentTarget;
    button.disabled = true;
    button.textContent = "Opening Square…";
    try {
      var result = await api.beginSquareConnect();
      window.location.assign(result.authorizeUrl);
    } catch (error) {
      handleStaffError(error);
      button.disabled = false;
      button.textContent = "Connect Square Sandbox";
    }
  });
  document.getElementById("disconnectSquare").addEventListener("click", async function (event) {
    if (!window.confirm("Disconnect this Square Sandbox test account? Customer payment will remain set to pay at pickup.")) return;
    var button = event.currentTarget;
    button.disabled = true;
    try {
      var result = await api.disconnectSquare();
      renderSquareStatus(result.status);
      await api.loadStaffSettings();
      renderControls();
      showToast("Square Sandbox disconnected.");
    } catch (error) {
      handleStaffError(error);
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById("toggleSquareCheckout").addEventListener("click", async function (event) {
    var button = event.currentTarget;
    var currentlyEnabled = button.getAttribute("data-enabled") === "true";
    var nextEnabled = !currentlyEnabled;
    var question = nextEnabled
      ? "Enable Square Sandbox test-card checkout? No real cards or money can be used."
      : "Turn off Sandbox card checkout and return customers to pay at pickup?";
    if (!window.confirm(question)) return;
    button.disabled = true;
    try {
      var result = await api.setSquarePaymentMode(nextEnabled);
      if (result.settings) {
        demo.write(demo.keys.settings, result.settings);
        await api.loadStaffSettings();
      }
      renderSquareStatus(result.status);
      renderControls();
      showToast(nextEnabled ? "Square Sandbox test checkout enabled." : "Customer checkout returned to pay at pickup.");
    } catch (error) {
      handleStaffError(error);
    } finally {
      button.disabled = false;
    }
  });
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
      requestWakeLock();
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
    alertedAt.clear();
    waitingSince.clear();
    if (wakeLock) {
      wakeLock.release().catch(function () {});
      wakeLock = null;
    }
    renderOrders();
    showAuth("");
  });
  document.getElementById("enableAlerts").addEventListener("click", async function (event) {
    var alertButton = event.currentTarget;
    // This tap is the gesture that unlocks audio and the screen wake lock. Both
    // must happen before any `await`, which would spend the gesture.
    var unlocking = unlockAudio();
    requestWakeLock();
    // Safari only honours a permission request during the gesture itself, so
    // start it before the awaits below spend it.
    var permissionRequest = null;
    if ("Notification" in window) {
      try {
        permissionRequest = Notification.requestPermission();
      } catch {
        permissionRequest = null;
      }
    }
    await unlocking;
    var element = alertTrack(false);
    var audible = true;
    try {
      element.muted = false;
      element.currentTime = 0;
      await element.play();
    } catch {
      audible = playWebAudioFallback(1);
    }
    if (!audible) {
      alertButton.dataset.alerts = "blocked";
      alertButton.textContent = "Sound blocked";
      showToast("Sound is blocked by this browser. Allow audio for this site, then tap again.");
      return;
    }
    if (!permissionRequest) {
      alertButton.dataset.alerts = "on";
      alertButton.textContent = "Alerts on";
      showToast("Sound alerts are on. This browser does not support system notifications.");
      return;
    }
    var permission = await permissionRequest;
    var granted = permission === "granted";
    alertButton.dataset.alerts = granted ? "on" : "blocked";
    alertButton.textContent = granted ? "Alerts on" : "Alerts blocked";
    showToast(granted
      ? "Alerts on. Waiting orders repeat every 30 seconds until answered."
      : "Sound alerts are on. Allow notifications in browser settings for banners.");
  });
  // Screen wake locks drop whenever the tab is hidden; take it back on return.
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && authenticated) requestWakeLock();
  });
  window.addEventListener("storage", function () { renderControls(); });
  async function bootStaffConsole() {
    try {
      await api.staffSession();
      authenticated = true;
      document.getElementById("staffAuth").hidden = true;
      var squareResult = await Promise.all([refreshStaffData(true), api.loadSquareStatus()]);
      renderSquareStatus(squareResult[1]);
      var squareQuery = new URLSearchParams(window.location.search);
      if (squareQuery.get("square") === "connected") {
        showStaffView("payments");
        showToast("Square Sandbox connected.");
        window.history.replaceState({}, "", window.location.pathname);
      } else if (squareQuery.get("square") === "error") {
        showStaffView("payments");
        showToast(squareQuery.get("message") || "Square could not be connected.");
        window.history.replaceState({}, "", window.location.pathname);
      }
    } catch {
      showAuth("");
    }
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {
        /* The offline shell is a progressive enhancement; ignore registration failures. */
      });
    });
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
