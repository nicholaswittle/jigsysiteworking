(function () {
  "use strict";

  async function request(path, options) {
    var response = await fetch(path, Object.assign({
      credentials: "same-origin",
      headers: { "content-type": "application/json" }
    }, options || {}));
    var data = await response.json().catch(function () {
      return { error: "The ordering service returned an unreadable response." };
    });
    if (!response.ok) {
      var error = new Error(data.error || "The ordering service could not complete the request.");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function updateLocalSettings(settings) {
    var local = {
      paused: Boolean(settings.paused),
      prepMinutes: Number(settings.prepMinutes || 30),
      soldOut: Array.isArray(settings.soldOut) ? settings.soldOut : [],
      fee: Number(settings.fee || 0.99),
      taxRate: Number(settings.taxRate || 0.06),
      paymentMode: settings.paymentMode || "manual",
      squareConnected: Boolean(settings.squareConnected)
    };
    window.JigsyDemo.write(window.JigsyDemo.keys.settings, local);
    return local;
  }

  window.WiSenseOrdering = {
    async loadPublicSettings() {
      var data = await request("/api/public/settings");
      return updateLocalSettings(data.settings);
    },
    async submitOrder(order) {
      return (await request("/api/orders", {
        method: "POST",
        body: JSON.stringify(order)
      })).order;
    },
    async loadOrder(id, token) {
      return (await request("/api/orders/" + encodeURIComponent(id) + "?token=" + encodeURIComponent(token))).order;
    },
    async staffSession() {
      return request("/api/staff/session");
    },
    async staffLogin(pin) {
      return request("/api/staff/login", {
        method: "POST",
        body: JSON.stringify({ pin: pin })
      });
    },
    async staffLogout() {
      return request("/api/staff/logout", { method: "POST", body: "{}" });
    },
    async loadStaffOrders() {
      return (await request("/api/staff/orders?days=90")).orders;
    },
    async loadStaffSettings() {
      var data = await request("/api/staff/settings");
      return updateLocalSettings(data.settings);
    },
    async updateStaffSettings(patch) {
      var data = await request("/api/staff/settings", {
        method: "PATCH",
        body: JSON.stringify(patch)
      });
      return updateLocalSettings(data.settings);
    },
    async updateOrder(id, action) {
      return (await request("/api/staff/orders/" + encodeURIComponent(id), {
        method: "PATCH",
        body: JSON.stringify({ action: action })
      })).order;
    }
  };
})();
