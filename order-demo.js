(function () {
  "use strict";

  var demo = window.JigsyDemo;
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
      : "Pickup demo available - estimated " + settings.prepMinutes + " minutes";
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
    var fee = cart.length ? 0.99 : 0;
    var tax = subtotal * 0.06;
    return { subtotal: subtotal, fee: fee, tax: tax, total: subtotal + fee + tax };
  }

  function renderCart() {
    document.getElementById("cartCount").textContent = String(cart.length);
    var items = document.getElementById("cartItems");
    if (!cart.length) {
      items.innerHTML = '<div class="empty-state"><strong>Your order is empty.</strong><br>Choose a tray, wings, or a starter to begin.</div>';
    } else {
      items.innerHTML = cart.map(function (item, index) {
        return '<article class="cart-item"><div class="cart-item-top"><div><h3>' + demo.escapeHTML(item.name) + '</h3>' +
          '<p>' + demo.escapeHTML(item.detail) + '</p></div><strong>' + demo.money(item.price) + '</strong></div>' +
          '<button class="remove-link" type="button" data-remove="' + index + '">Remove</button></article>';
      }).join("");
    }
    var t = totals();
    document.getElementById("cartSubtotal").textContent = demo.money(t.subtotal);
    document.getElementById("cartFee").textContent = demo.money(t.fee);
    document.getElementById("cartTax").textContent = demo.money(t.tax);
    document.getElementById("cartTotal").textContent = demo.money(t.total);
    document.getElementById("checkoutTotal").textContent = demo.money(t.total);
    document.getElementById("checkoutOpen").disabled = !cart.length || demo.settings().paused;
    demo.write(demo.keys.cart, cart);
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

  document.getElementById("checkoutOpen").addEventListener("click", function () {
    if (!cart.length || demo.settings().paused) return;
    closeCart();
    pickupOptions();
    openDialog(checkoutDialog);
  });

  document.getElementById("checkoutForm").addEventListener("submit", function (event) {
    event.preventDefault();
    var settings = demo.settings();
    if (settings.paused) {
      closeDialog(checkoutDialog);
      showToast("Staff paused online ordering.");
      renderServiceState();
      renderProducts();
      return;
    }
    var form = new FormData(event.currentTarget);
    var t = totals();
    var orders = demo.read(demo.keys.orders, []);
    var id = "J" + String(Date.now()).slice(-5);
    var order = {
      id: id,
      status: "New",
      submittedAt: new Date().toISOString(),
      pickupMinutes: Number(form.get("pickupTime")),
      customer: {
        name: String(form.get("customerName")),
        phone: String(form.get("customerPhone"))
      },
      notes: String(form.get("orderNotes") || ""),
      items: cart.slice(),
      totals: t
    };
    orders.unshift(order);
    demo.write(demo.keys.orders, orders);
    cart = [];
    renderCart();
    closeDialog(checkoutDialog);
    document.getElementById("successCopy").textContent =
      "Simulated order " + id + " is queued for pickup in about " + order.pickupMinutes +
      " minutes. Open the staff console to accept it, change prep status, or mark it ready.";
    openDialog(successDialog);
  });

  document.getElementById("cartOpen").addEventListener("click", openCart);
  document.getElementById("cartClose").addEventListener("click", closeCart);
  drawerBackdrop.addEventListener("click", closeCart);
  document.getElementById("itemDialogClose").addEventListener("click", function () { closeDialog(itemDialog); });
  document.getElementById("checkoutClose").addEventListener("click", function () { closeDialog(checkoutDialog); });
  document.getElementById("successClose").addEventListener("click", function () { closeDialog(successDialog); });
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
  });
  window.addEventListener("jigsy-demo-change", function (event) {
    if (event.detail.key === demo.keys.settings) {
      renderServiceState();
      renderProducts();
    }
  });

  renderTabs();
  renderProducts();
  renderServiceState();
  renderCart();
})();

