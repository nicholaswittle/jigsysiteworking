(function () {
  "use strict";

  var demo = window.JigsyDemo;
  var api = window.WiSenseOrdering;
  var cart = demo.read(demo.keys.cart, []);
  var activeCategory = "All";
  var activeProduct = null;
  var activeSizeIndex = 0;
  var selectedToppings = [];
  var selectedSauce = "";
  var selectedDressing = "";
  var TOPPING_PRICE = 1.5;

  var grid = document.getElementById("productGrid");
  var tabs = document.getElementById("categoryTabs");
  var itemDialog = document.getElementById("itemDialog");
  var checkoutDialog = document.getElementById("checkoutDialog");
  var successDialog = document.getElementById("successDialog");
  var modalBackdrop = document.getElementById("modalBackdrop");
  var cartDrawer = document.getElementById("cartDrawer");
  var drawerBackdrop = document.getElementById("drawerBackdrop");
  var toast = document.getElementById("toast");
  var statusLoading = false;
  var squareConfig = { enabled: false };
  var squareCard = null;
  var squareCardKey = "";
  var squareInitializing = null;

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add("is-visible");
    window.setTimeout(function () { toast.classList.remove("is-visible"); }, 1800);
  }

  function openDialog(dialog) {
    modalBackdrop.classList.add("is-open");
    dialog.classList.add("is-open");
    dialog.setAttribute("aria-hidden", "false");
  }

  function closeDialog(dialog) {
    dialog.classList.remove("is-open");
    dialog.setAttribute("aria-hidden", "true");
    if (!document.querySelector(".dialog.is-open")) modalBackdrop.classList.remove("is-open");
  }

  function openCart() {
    cartDrawer.classList.add("is-open");
    drawerBackdrop.classList.add("is-open");
    cartDrawer.setAttribute("aria-hidden", "false");
  }

  function closeCart() {
    cartDrawer.classList.remove("is-open");
    drawerBackdrop.classList.remove("is-open");
    cartDrawer.setAttribute("aria-hidden", "true");
  }

  function categories() {
    return ["All"].concat(Array.from(new Set(demo.products.map(function (p) { return p.category; }))));
  }

  function renderTabs() {
    tabs.innerHTML = categories().map(function (category) {
      return '<button class="category-tab" type="button" data-category="' + demo.escapeHTML(category) +
        '" aria-pressed="' + String(category === activeCategory) + '">' + demo.escapeHTML(category) + "</button>";
    }).join("");
  }

  function renderProducts() {
    var settings = demo.settings();
    var products = demo.products.filter(function (product) {
      return activeCategory === "All" || product.category === activeCategory;
    });
    grid.innerHTML = products.map(function (product) {
      var sold = settings.soldOut.indexOf(product.id) !== -1;
      var from = Math.min.apply(null, product.sizes.map(function (size) { return size.price; }));
      return '<article class="product-card' + (sold ? " is-sold-out" : "") + '">' +
        '<div class="product-card-body">' +
          '<div class="product-meta"><span>' + demo.escapeHTML(product.badge) + '</span><span>' + demo.escapeHTML(product.category) + '</span></div>' +
          '<h3>' + demo.escapeHTML(product.name) + '</h3>' +
          '<p>' + demo.escapeHTML(product.description) + '</p>' +
        '</div>' +
        '<div class="product-card-footer">' +
          '<span class="price">From ' + demo.money(from) + '</span>' +
          '<button class="add-button" type="button" data-product="' + product.id + '"' + (sold || settings.paused ? " disabled" : "") + '>' +
            (sold ? "Sold out" : settings.paused ? "Paused" : "Customize") +
          '</button>' +
        '</div>' +
      '</article>';
    }).join("");
  }

  function renderServiceState() {
    var settings = demo.settings();
    var state = document.getElementById("serviceState");
    var copy = document.getElementById("serviceStateText");
    state.classList.toggle("is-paused", settings.paused);
    copy.textContent = settings.paused
      ? "Online pickup paused by staff"
      : "About " + settings.prepMinutes + " minutes";
    renderPaymentMode();
  }

  function squareCheckoutEnabled() {
    return demo.settings().paymentMode === "square" && Boolean(squareConfig.enabled);
  }

  function renderPaymentMode() {
    var squareEnabled = squareCheckoutEnabled();
    document.getElementById("orderingHeroCopy").textContent = squareEnabled
      ? "Enter a Square Sandbox test card. Your total is authorized when sent, captured only if Jigsy’s accepts, and voided if they reject it."
      : "Send a pickup request without entering a card. Jigsy's accepts it, prints a kitchen ticket, and collects payment at the counter.";
    document.getElementById("cartTotalLabel").textContent = squareEnabled
      ? "Sandbox authorization total"
      : "Estimated due at pickup";
    document.getElementById("checkoutTotalLabel").textContent = squareEnabled
      ? "Sandbox authorization total"
      : "Estimated due at pickup";
    document.getElementById("cartPaymentCopy").textContent = squareEnabled
      ? "Square authorizes this test total now. Accept captures it; Reject voids it. The $0.99 fee counts only after the order is completed."
      : "The 99-cent fee is included in completed online pickup orders. Rejected orders do not incur the fee. Jigsy's collects the full amount at pickup.";
    document.getElementById("checkoutNotice").textContent = squareEnabled
      ? "Square Sandbox only: the test total is authorized when you send the request, captured only if staff accepts, and voided if rejected."
      : "Pay at pickup: no card details are requested. Jigsy's would accept the request and print a kitchen ticket before the order is confirmed.";
    document.getElementById("squareCardSection").hidden = !squareEnabled;
    document.getElementById("checkoutSubmit").textContent = squareEnabled
      ? "Authorize test card & send"
      : "Send pickup request";
  }

  async function destroySquareCard() {
    if (!squareCard) return;
    try {
      await squareCard.destroy();
    } catch {
      // The Square element may already have been removed during a page refresh.
    }
    squareCard = null;
    squareCardKey = "";
  }

  async function ensureSquareCard() {
    if (!squareCheckoutEnabled()) return null;
    var key = squareConfig.applicationId + ":" + squareConfig.locationId;
    if (squareCard && squareCardKey === key) return squareCard;
    if (squareInitializing) return squareInitializing;
    squareInitializing = (async function () {
      if (!window.Square) throw new Error("Square Sandbox card entry could not load.");
      await destroySquareCard();
      var payments = window.Square.payments(squareConfig.applicationId, squareConfig.locationId);
      var card = await payments.card();
      await card.attach("#squareCard");
      squareCard = card;
      squareCardKey = key;
      return card;
    })();
    try {
      return await squareInitializing;
    } finally {
      squareInitializing = null;
    }
  }

  async function refreshSquareConfig() {
    try {
      var next = await api.loadPublicSquareConfig();
      var changed = squareConfig.applicationId !== next.applicationId
        || squareConfig.locationId !== next.locationId
        || squareConfig.enabled !== next.enabled;
      squareConfig = next;
      if (changed && !next.enabled) await destroySquareCard();
    } catch {
      squareConfig = { enabled: false };
      await destroySquareCard();
    }
    renderPaymentMode();
  }

  async function renderOrderStatus() {
    var reference = demo.read(demo.keys.customerOrder, null);
    var panel = document.getElementById("orderStatusPanel");
    if (!reference || !reference.id || !reference.token) {
      panel.hidden = true;
      return;
    }
    if (statusLoading) return;
    statusLoading = true;
    var order;
    try {
      order = await api.loadOrder(reference.id, reference.token);
    } catch (error) {
      if (error.status === 404) {
        demo.write(demo.keys.customerOrder, null);
        panel.hidden = true;
      }
      statusLoading = false;
      return;
    }
    statusLoading = false;
    panel.hidden = false;
    var card = document.getElementById("orderStatusCard");
    var badge = document.getElementById("orderStatusBadge");
    var title = document.getElementById("orderStatusTitle");
    var copy = document.getElementById("orderStatusCopy");
    card.setAttribute("data-status", order.status);
    if (order.status === "Completed") {
      badge.textContent = "Completed";
      title.textContent = order.id + " is complete";
      copy.textContent = order.paymentMode === "square"
        ? "This order and its Square Sandbox test payment are complete. Thank you for testing Jigsy’s direct ordering."
        : "This order was marked paid and completed. Thank you for ordering directly from Jigsy’s.";
    } else if (order.status === "Accepted") {
      badge.textContent = "Accepted";
      title.textContent = order.id + " is confirmed";
      copy.textContent = order.paymentMode === "square"
        ? "Jigsy’s accepted your order and captured the Square Sandbox test payment. Plan for pickup in about " +
          order.pickupMinutes + " minutes."
        : "Jigsy’s accepted your order. Plan for pickup in about " +
          order.pickupMinutes + " minutes and pay " + demo.money(order.totals.total) + " at the counter.";
    } else if (order.status === "Rejected" || order.status === "Cancelled") {
      badge.textContent = "Not accepted";
      title.textContent = order.id + " could not be accepted";
      copy.textContent = order.paymentMode === "square"
        ? "Jigsy’s was unable to take this request. The Square Sandbox authorization was voided and no test payment was captured."
        : "Jigsy’s was unable to take this request. You will not be charged the online ordering fee. Please call the restaurant if you need help.";
    } else {
      badge.textContent = "Waiting";
      title.textContent = order.id + " was sent to Jigsy’s";
      copy.textContent = "This request is not confirmed yet. Keep this page open—the status will change here when staff accepts or rejects it.";
    }
  }

  function optionMarkup(product) {
    var html = '<div class="field"><span class="field-label">Choose size</span><div class="choice-grid">';
    product.sizes.forEach(function (size, index) {
      html += '<label class="choice"><input type="radio" name="size" value="' + index + '"' +
        (index === 0 ? " checked" : "") + '> <span>' + demo.escapeHTML(size.label) + ' - ' + demo.money(size.price) + '</span></label>';
    });
    html += "</div></div>";

    if (product.type === "tray") {
      html += '<div class="field"><span class="field-label">Add toppings - up to 4 (' + demo.money(TOPPING_PRICE) + ' each)</span><div class="choice-grid">';
      demo.toppings.forEach(function (topping) {
        html += '<label class="choice"><input type="checkbox" name="topping" value="' + demo.escapeHTML(topping) + '"> <span>' + demo.escapeHTML(topping) + '</span></label>';
      });
      html += "</div></div>";
    }
    if (product.type === "wings") {
      html += '<div class="field"><label for="sauceChoice">Wing sauce</label><select id="sauceChoice" required><option value="">Choose a sauce</option>' +
        demo.sauces.map(function (sauce) { return '<option>' + demo.escapeHTML(sauce) + '</option>'; }).join("") +
        '</select></div><div class="field"><label for="wingDip">Dressing</label><select id="wingDip"><option value="">No dressing</option><option>Ranch + $1.00</option><option>Bleu cheese + $1.00</option></select></div>';
    }
    if (product.type === "salad") {
      html += '<div class="field"><label for="dressingChoice">Dressing</label><select id="dressingChoice" required><option value="">Choose dressing</option>' +
        demo.dressings.map(function (dressing) { return '<option>' + demo.escapeHTML(dressing) + '</option>'; }).join("") + '</select></div>';
    }
    html += '<div class="field"><label for="itemNote">Item note</label><input id="itemNote" placeholder="Example: sauce on the side"></div>';
    return html;
  }

  function itemTotal() {
    if (!activeProduct) return 0;
    var total = activeProduct.sizes[activeSizeIndex].price;
    if (activeProduct.type === "tray") total += selectedToppings.length * TOPPING_PRICE;
    if (activeProduct.type === "wings" && selectedDressing) total += 1;
    return total;
  }

  function updateItemPrice() {
    document.getElementById("itemPrice").textContent = demo.money(itemTotal());
  }

  function openProduct(productId) {
    activeProduct = demo.products.find(function (product) { return product.id === productId; });
    if (!activeProduct) return;
    activeSizeIndex = 0;
    selectedToppings = [];
    selectedSauce = "";
    selectedDressing = "";
    document.getElementById("itemDialogTitle").textContent = activeProduct.name;
    document.getElementById("itemOptions").innerHTML = optionMarkup(activeProduct);
    updateItemPrice();
    openDialog(itemDialog);
  }

  function totals() {
    var subtotal = cart.reduce(function (sum, item) { return sum + item.price; }, 0);
    var settings = demo.settings();
    var fee = cart.length ? Number(settings.fee || 0.99) : 0;
    var tax = subtotal * Number(settings.taxRate || 0.06);
    return { subtotal: subtotal, fee: fee, tax: tax, total: subtotal + fee + tax };
  }

  function unavailableCartItems() {
    var soldOut = demo.settings().soldOut;
    return cart.filter(function (item) { return soldOut.indexOf(item.productId) !== -1; });
  }

  function renderCart() {
    document.getElementById("cartCount").textContent = String(cart.length);
    var items = document.getElementById("cartItems");
    if (!cart.length) {
      items.innerHTML = '<div class="empty-state"><strong>Your order is empty.</strong><br>Choose a tray, wings, or a starter to begin.</div>';
    } else {
      items.innerHTML = cart.map(function (item, index) {
        var unavailable = demo.settings().soldOut.indexOf(item.productId) !== -1;
        return '<article class="cart-item' + (unavailable ? " is-unavailable" : "") +
          '"><div class="cart-item-top"><div><h3>' + demo.escapeHTML(item.name) + '</h3>' +
          '<p>' + demo.escapeHTML(item.detail) + (unavailable ? " · Sold out — remove to continue" : "") +
          '</p></div><strong>' + demo.money(item.price) + '</strong></div>' +
          '<button class="remove-link" type="button" data-remove="' + index + '">Remove</button></article>';
      }).join("");
    }
    var t = totals();
    document.getElementById("cartSubtotal").textContent = demo.money(t.subtotal);
    document.getElementById("cartFee").textContent = demo.money(t.fee);
    document.getElementById("cartTax").textContent = demo.money(t.tax);
    document.getElementById("cartTotal").textContent = demo.money(t.total);
    document.getElementById("checkoutTotal").textContent = demo.money(t.total);
    document.getElementById("checkoutOpen").disabled =
      !cart.length || demo.settings().paused || unavailableCartItems().length > 0;
    demo.write(demo.keys.cart, cart);
    renderPaymentMode();
  }

  function pickupOptions() {
    var settings = demo.settings();
    var increments = [0, 15, 30, 45];
    document.getElementById("pickupTime").innerHTML = increments.map(function (add, index) {
      var minutes = settings.prepMinutes + add;
      return '<option value="' + minutes + '">' + (index === 0 ? "ASAP - about " : "") + minutes + " minutes</option>";
    }).join("");
  }

  tabs.addEventListener("click", function (event) {
    var button = event.target.closest("[data-category]");
    if (!button) return;
    activeCategory = button.getAttribute("data-category");
    renderTabs();
    renderProducts();
  });

  grid.addEventListener("click", function (event) {
    var button = event.target.closest("[data-product]");
    if (button) openProduct(button.getAttribute("data-product"));
  });

  document.getElementById("itemOptions").addEventListener("change", function (event) {
    if (event.target.name === "size") activeSizeIndex = Number(event.target.value);
    if (event.target.name === "topping") {
      var checked = Array.from(document.querySelectorAll('input[name="topping"]:checked'));
      if (checked.length > 4) {
        event.target.checked = false;
        showToast("Choose up to four toppings.");
      }
      selectedToppings = Array.from(document.querySelectorAll('input[name="topping"]:checked')).map(function (input) { return input.value; });
    }
    if (event.target.id === "sauceChoice") selectedSauce = event.target.value;
    if (event.target.id === "wingDip") selectedDressing = event.target.value;
    if (event.target.id === "dressingChoice") selectedDressing = event.target.value;
    updateItemPrice();
  });

  document.getElementById("itemForm").addEventListener("submit", function (event) {
    event.preventDefault();
    if (activeProduct.type === "wings" && !selectedSauce) {
      showToast("Choose a wing sauce.");
      return;
    }
    if (activeProduct.type === "salad" && !selectedDressing) {
      showToast("Choose a dressing.");
      return;
    }
    var detail = [activeProduct.sizes[activeSizeIndex].label];
    if (selectedToppings.length) detail.push(selectedToppings.join(", "));
    if (selectedSauce) detail.push(selectedSauce);
    if (selectedDressing) detail.push(selectedDressing);
    var note = document.getElementById("itemNote").value.trim();
    if (note) detail.push("Note: " + note);
    cart.push({
      name: activeProduct.name,
      productId: activeProduct.id,
      detail: detail.join(" · "),
      price: itemTotal()
    });
    renderCart();
    closeDialog(itemDialog);
    showToast(activeProduct.name + " added.");
  });

  document.getElementById("cartItems").addEventListener("click", function (event) {
    var button = event.target.closest("[data-remove]");
    if (!button) return;
    cart.splice(Number(button.getAttribute("data-remove")), 1);
    renderCart();
  });

  document.getElementById("checkoutOpen").addEventListener("click", async function () {
    if (!cart.length || demo.settings().paused) return;
    if (unavailableCartItems().length) {
      showToast("Remove sold-out items before continuing.");
      renderCart();
      return;
    }
    closeCart();
    pickupOptions();
    openDialog(checkoutDialog);
    if (squareCheckoutEnabled()) {
      document.getElementById("squareCardError").textContent = "";
      try {
        await ensureSquareCard();
      } catch (error) {
        document.getElementById("squareCardError").textContent = error.message;
        showToast(error.message);
      }
    }
  });

  document.getElementById("checkoutForm").addEventListener("submit", async function (event) {
    event.preventDefault();
    var checkoutForm = event.currentTarget;
    var submitButton = checkoutForm.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    submitButton.textContent = squareCheckoutEnabled() ? "Authorizing test card…" : "Sending…";
    var settings = demo.settings();
    if (settings.paused) {
      closeDialog(checkoutDialog);
      showToast("Staff paused online ordering.");
      renderServiceState();
      renderProducts();
      submitButton.disabled = false;
      renderPaymentMode();
      return;
    }
    if (unavailableCartItems().length) {
      closeDialog(checkoutDialog);
      showToast("An item just sold out. Remove it before continuing.");
      renderProducts();
      renderCart();
      submitButton.disabled = false;
      renderPaymentMode();
      return;
    }
    var form = new FormData(checkoutForm);
    var submittedOrder = {
      pickupMinutes: Number(form.get("pickupTime")),
      customer: {
        name: String(form.get("customerName")),
        phone: String(form.get("customerPhone"))
      },
      notes: String(form.get("orderNotes") || ""),
      items: cart.slice()
    };
    if (squareCheckoutEnabled()) {
      try {
        var card = await ensureSquareCard();
        if (!card) throw new Error("Square Sandbox card entry is unavailable.");
        var nameParts = submittedOrder.customer.name.trim().split(/\s+/);
        var tokenResult = await card.tokenize({
          amount: totals().total.toFixed(2),
          billingContact: {
            givenName: nameParts[0] || submittedOrder.customer.name,
            familyName: nameParts.slice(1).join(" "),
            phone: submittedOrder.customer.phone,
            countryCode: "US"
          },
          currencyCode: "USD",
          intent: "CHARGE",
          customerInitiated: true,
          sellerKeyedIn: false
        });
        if (tokenResult.status !== "OK" || !tokenResult.token) {
          throw new Error("Check the Sandbox test card information and try again.");
        }
        submittedOrder.paymentSourceId = tokenResult.token;
      } catch (error) {
        submitButton.disabled = false;
        renderPaymentMode();
        document.getElementById("squareCardError").textContent = error.message;
        showToast(error.message);
        return;
      }
    }
    var order;
    try {
      order = await api.submitOrder(submittedOrder);
    } catch (error) {
      submitButton.disabled = false;
      renderPaymentMode();
      showToast(error.message);
      if (error.status === 409) {
        await api.loadPublicSettings().catch(function () {});
        renderServiceState();
        renderProducts();
      }
      return;
    }
    demo.write(demo.keys.customerOrder, { id: order.id, token: order.publicToken });
    cart = [];
    renderCart();
    renderOrderStatus();
    closeDialog(checkoutDialog);
    document.getElementById("successCopy").textContent =
      order.paymentMode === "square"
        ? "Pickup request " + order.id + " is waiting for Jigsy’s. The Sandbox total is authorized and will be captured only if staff accepts."
        : "Pickup request " + order.id + " is waiting for Jigsy’s. Keep this page available to see when it is accepted or declined.";
    openDialog(successDialog);
    checkoutForm.reset();
    if (squareCard) await squareCard.clear().catch(function () {});
    submitButton.disabled = false;
    renderPaymentMode();
  });

  document.getElementById("cartOpen").addEventListener("click", openCart);
  document.getElementById("cartClose").addEventListener("click", closeCart);
  drawerBackdrop.addEventListener("click", closeCart);
  document.getElementById("itemDialogClose").addEventListener("click", function () { closeDialog(itemDialog); });
  document.getElementById("checkoutClose").addEventListener("click", function () { closeDialog(checkoutDialog); });
  document.getElementById("successClose").addEventListener("click", function () { closeDialog(successDialog); });
  document.getElementById("successDone").addEventListener("click", function () {
    closeDialog(successDialog);
    document.getElementById("orderStatusPanel").scrollIntoView({ behavior: "smooth", block: "center" });
  });
  modalBackdrop.addEventListener("click", function () {
    document.querySelectorAll(".dialog.is-open").forEach(function (dialog) { closeDialog(dialog); });
  });
  document.addEventListener("keydown", function (event) {
    if (event.key !== "Escape") return;
    closeCart();
    document.querySelectorAll(".dialog.is-open").forEach(function (dialog) { closeDialog(dialog); });
  });
  window.addEventListener("storage", function () {
    renderServiceState();
    renderProducts();
    renderCart();
    renderOrderStatus();
  });
  window.addEventListener("jigsy-demo-change", function (event) {
    if (event.detail.key === demo.keys.settings) {
      renderServiceState();
      renderProducts();
      renderCart();
    }
    if (event.detail.key === demo.keys.orders || event.detail.key === demo.keys.customerOrder) {
      renderOrderStatus();
    }
  });

  async function refreshPublicSettings() {
    try {
      await api.loadPublicSettings();
    } catch {
      demo.write(demo.keys.settings, {
        paused: true,
        prepMinutes: 30,
        soldOut: [],
        fee: 0.99,
        taxRate: 0.06,
        paymentMode: "manual"
      });
    }
    renderServiceState();
    renderProducts();
    renderCart();
    await refreshSquareConfig();
  }

  renderTabs();
  renderProducts();
  renderServiceState();
  renderCart();
  renderOrderStatus();
  refreshPublicSettings();
  window.setInterval(function () {
    refreshPublicSettings();
    renderOrderStatus();
  }, 5000);
})();
