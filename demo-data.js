(function () {
  "use strict";

  var PRODUCTS = [
    {
      id: "traditional-red",
      name: "Traditional Red Tray",
      category: "Trays",
      description: "Old Forge red: sauce and cheese, baked in a steel pan.",
      badge: "House style",
      type: "tray",
      sizes: [
        { label: "3 cuts", price: 7.49 },
        { label: "6 cuts", price: 14.99 },
        { label: "12 cuts", price: 18.99 }
      ]
    },
    {
      id: "single-white",
      name: "Single White Tray",
      category: "Trays",
      description: "Single crust and cheese, no red sauce.",
      badge: "Old Forge",
      type: "tray",
      sizes: [
        { label: "3 cuts", price: 8.49 },
        { label: "6 cuts", price: 15.99 },
        { label: "12 cuts", price: 20.99 }
      ]
    },
    {
      id: "double-white",
      name: "Double White Tray",
      category: "Trays",
      description: "Stuffed double crust with cheese.",
      badge: "Local favorite",
      type: "tray",
      sizes: [
        { label: "6 cuts", price: 18.99 },
        { label: "12 cuts", price: 26.99 }
      ]
    },
    {
      id: "chick-fil-j",
      name: "Chick Fil “J”",
      category: "Specialty",
      description: "Garlic sauce, crispy chicken, sliced pickles, and cheese.",
      badge: "House signature",
      type: "specialty",
      sizes: [
        { label: "3 cuts", price: 11.99 },
        { label: "6 cuts", price: 18.49 },
        { label: "12 cuts", price: 27.99 }
      ]
    },
    {
      id: "chicken-bacon-ranch",
      name: "Chicken Bacon Ranch",
      category: "Specialty",
      description: "Cheese, house ranch, grilled chicken, and crispy bacon.",
      badge: "Specialty tray",
      type: "specialty",
      sizes: [
        { label: "3 cuts", price: 10.99 },
        { label: "6 cuts", price: 17.49 },
        { label: "12 cuts", price: 26.99 }
      ]
    },
    {
      id: "hot-oil-pepperoni",
      name: "Hot Oil Pepperoni",
      category: "Specialty",
      description: "Sauce, cheese, pepperoni, and Calabrian pepper oil.",
      badge: "Specialty tray",
      type: "specialty",
      sizes: [
        { label: "3 cuts", price: 10.99 },
        { label: "6 cuts", price: 17.49 },
        { label: "12 cuts", price: 26.99 }
      ]
    },
    {
      id: "jumbo-wings",
      name: "Jumbo Wings",
      category: "Wings",
      description: "Choose a count and one of Jigsy's classic or house sauces.",
      badge: "Simply the Best 2023",
      type: "wings",
      sizes: [
        { label: "5 wings", price: 7.99 },
        { label: "10 wings", price: 12.99 },
        { label: "20 wings", price: 25.99 },
        { label: "30 wings", price: 34.99 }
      ]
    },
    {
      id: "cheesy-bread",
      name: "Cheesy Bread",
      category: "Starters",
      description: "Cheese, fresh garlic, seasonings, and a side of sauce.",
      badge: "To start",
      type: "simple",
      sizes: [{ label: "One order", price: 9.99 }]
    },
    {
      id: "fried-pickles",
      name: "Fried Pickles",
      category: "Starters",
      description: "Crispy fried pickle chips with house-made ranch.",
      badge: "To start",
      type: "simple",
      sizes: [{ label: "One order", price: 9.99 }]
    },
    {
      id: "pierogi",
      name: "Potato & Cheese Pierogi",
      category: "Starters",
      description: "Six pierogi with butter and onions.",
      badge: "Local favorite",
      type: "simple",
      sizes: [{ label: "6 pierogi", price: 8.99 }]
    },
    {
      id: "antipasto",
      name: "Antipasto Salad",
      category: "Salads",
      description: "Lettuce, ham, salami, cheese, pepperoni, tomato, onion, peppers, and black olive.",
      badge: "Greens",
      type: "salad",
      sizes: [{ label: "Full salad", price: 17.99 }]
    },
    {
      id: "grilled-chicken-salad",
      name: "Grilled Chicken Salad",
      category: "Salads",
      description: "Lettuce, chicken, cheese, tomato, cucumber, and onion.",
      badge: "Greens",
      type: "salad",
      sizes: [{ label: "Full salad", price: 14.99 }]
    }
  ];

  var TOPPINGS = [
    "Pepperoni", "Sausage", "Ham", "Green pepper", "Sweet pepper",
    "Hot pepper", "Onion", "Tomato", "Mushroom", "Broccoli",
    "Bacon", "Chicken", "Pineapple", "Spinach", "Garlic"
  ];
  var SAUCES = [
    "Mild", "Hot", "BBQ", "Honey BBQ", "Teriyaki", "Garlic Parm",
    "Spicy Bleu Cheese", "Spicy Ranch", "Buffalo Bay", "Hot Garlic", "Sweet Heat"
  ];
  var DRESSINGS = ["House Italian", "House Ranch", "House Bleu Cheese", "Thousand Island", "Caesar"];
  var KEYS = {
    cart: "jigsyDemoCart",
    orders: "jigsyDemoOrders",
    settings: "jigsyDemoSettings"
  };

  function read(key, fallback) {
    try {
      var value = JSON.parse(localStorage.getItem(key));
      return value === null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("jigsy-demo-change", { detail: { key: key } }));
  }

  function settings() {
    return Object.assign({ paused: false, prepMinutes: 25, soldOut: [] }, read(KEYS.settings, {}));
  }

  function money(value) {
    return "$" + Number(value).toFixed(2);
  }

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  window.JigsyDemo = {
    products: PRODUCTS,
    toppings: TOPPINGS,
    sauces: SAUCES,
    dressings: DRESSINGS,
    keys: KEYS,
    read: read,
    write: write,
    settings: settings,
    money: money,
    escapeHTML: escapeHTML
  };
})();

