(function () {
  "use strict";

  function menuItem(id, name, category, description, type, sizePairs, badge) {
    return {
      id: id,
      name: name,
      category: category,
      description: description,
      badge: badge || category,
      type: type,
      sizes: sizePairs.map(function (pair) {
        return { label: pair[0], price: pair[1] };
      })
    };
  }

  var PRODUCTS = [
    menuItem("traditional-red", "Traditional Red Tray", "House trays", "Sauce and cheese on Jigsy's Old Forge steel-pan crust.", "tray", [["3 cuts", 7.49], ["6 cuts", 14.99], ["12 cuts", 18.99]], "House style"),
    menuItem("single-white", "Single White Tray", "House trays", "Single crust and cheese with no red sauce.", "tray", [["3 cuts", 8.49], ["6 cuts", 15.99], ["12 cuts", 20.99]], "Old Forge"),
    menuItem("double-white", "Double White Tray", "House trays", "Stuffed double crust with cheese.", "tray", [["6 cuts", 18.99], ["12 cuts", 26.99]], "Local favorite"),

    menuItem("tomato-garlic-specialty", "Tomato & Garlic", "Specialty trays", "Cheese, tomato, and fresh garlic.", "specialty", [["3 cuts", 10.99], ["6 cuts", 16.49], ["12 cuts", 24.99]]),
    menuItem("chick-fil-j", "Chick Fil “J”", "Specialty trays", "Buttery garlic sauce, crispy chicken, sliced pickles, and cheese.", "specialty", [["3 cuts", 11.99], ["6 cuts", 18.49], ["12 cuts", 27.99]], "House signature"),
    menuItem("chicken-bacon-ranch", "Chicken Bacon Ranch", "Specialty trays", "Cheese, house-made ranch, grilled chicken, and crispy bacon.", "specialty", [["3 cuts", 10.99], ["6 cuts", 17.49], ["12 cuts", 26.99]]),
    menuItem("buffalo-chicken-specialty", "Buffalo Chicken", "Specialty trays", "Hot sauce, cheese, and crispy chicken.", "specialty", [["3 cuts", 10.99], ["6 cuts", 17.49], ["12 cuts", 26.99]]),
    menuItem("meatlovers", "Meatlovers", "Specialty trays", "Sauce, cheese, ham, pepperoni, sausage, and bacon.", "specialty", [["3 cuts", 10.99], ["6 cuts", 17.49], ["12 cuts", 26.99]]),
    menuItem("spinach-tomato", "Spinach & Tomato", "Specialty trays", "Cheese, spinach, and tomato.", "specialty", [["3 cuts", 10.99], ["6 cuts", 16.49], ["12 cuts", 24.99]]),
    menuItem("meatball-specialty", "Meatball", "Specialty trays", "Sauce, cheese, house-made meatballs, and fresh parmesan.", "specialty", [["3 cuts", 11.99], ["6 cuts", 18.99], ["12 cuts", 28.99]]),
    menuItem("chicken-bruschetta-specialty", "Chicken Bruschetta", "Specialty trays", "Light sauce, cheese, chicken, tomato, spinach, red onion, and garlic.", "specialty", [["3 cuts", 10.99], ["6 cuts", 17.49], ["12 cuts", 26.99]]),
    menuItem("hot-oil-pepperoni", "Hot Oil Pepperoni", "Specialty trays", "Sauce, cheese, pepperoni, and Calabrian pepper oil.", "specialty", [["3 cuts", 10.99], ["6 cuts", 17.49], ["12 cuts", 26.99]]),
    menuItem("rustico-specialty", "Rustico", "Specialty trays", "Cheese, pepperoni, sausage, green pepper, mushroom, and onion.", "specialty", [["3 cuts", 10.99], ["6 cuts", 17.49], ["12 cuts", 26.99]]),
    menuItem("hawaiian", "Hawaiian", "Specialty trays", "Cheese, ham, and pineapple.", "specialty", [["3 cuts", 10.99], ["6 cuts", 17.49], ["12 cuts", 26.99]]),

    menuItem("buffalo-chicken-gourmet", "Buffalo Chicken", "Gourmet trays", "Double crust with hot sauce, crispy chicken, and cheese.", "specialty", [["6 cuts", 20.49], ["12 cuts", 30.99]], "Double crust"),
    menuItem("rustico-gourmet", "Rustico", "Gourmet trays", "Double crust with cheese, pepperoni, sausage, green pepper, mushroom, and onion.", "specialty", [["6 cuts", 20.49], ["12 cuts", 30.99]], "Double crust"),
    menuItem("tomato-garlic-gourmet", "Tomato & Garlic", "Gourmet trays", "Double crust with cheese, tomato, and garlic.", "specialty", [["6 cuts", 19.49], ["12 cuts", 29.99]], "Double crust"),
    menuItem("broccoli-gourmet", "Broccoli", "Gourmet trays", "Double crust with cheese and broccoli.", "specialty", [["6 cuts", 19.49], ["12 cuts", 29.99]], "Double crust"),
    menuItem("pierogi-gourmet", "Pierogi", "Gourmet trays", "Double crust with cheese, pierogi, butter, and onion.", "specialty", [["6 cuts", 20.49], ["12 cuts", 30.99]], "Double crust"),

    menuItem("jumbo-wings", "Jumbo Wings", "Wings", "Choose a count and one of Jigsy's classic or house sauces.", "wings", [["5 wings", 7.99], ["10 wings", 12.99], ["20 wings", 25.99], ["30 wings", 34.99]], "Simply the Best 2023"),

    menuItem("traditional-stromboli", "Traditional Stromboli", "Stromboli & flatbreads", "Ham, pepperoni, sausage, onion, mushroom, green and sweet peppers, and hot peppers.", "simple", [["One order", 18.99]]),
    menuItem("cheesesteak-stromboli", "Cheesesteak Stromboli", "Stromboli & flatbreads", "Cheesesteak, onion, mushroom, and green peppers.", "simple", [["One order", 19.99]]),
    menuItem("buffalo-chicken-stromboli", "Buffalo Chicken Stromboli", "Stromboli & flatbreads", "Crispy chicken, hot sauce, and cheese.", "simple", [["One order", 19.99]]),
    menuItem("veggie-stromboli", "Veggie Stromboli", "Stromboli & flatbreads", "Tomato, spinach, garlic, and cheese.", "simple", [["One order", 18.99]]),
    menuItem("traditional-red-flatbread", "Traditional Red Flatbread", "Stromboli & flatbreads", "Sauce and cheese.", "simple", [["One order", 10.99]]),
    menuItem("bbq-chicken-flatbread", "BBQ Chicken Flatbread", "Stromboli & flatbreads", "BBQ sauce, cheese, grilled chicken, red onion, and ranch.", "simple", [["One order", 12.49]]),
    menuItem("chicken-bruschetta-flatbread", "Chicken Bruschetta Flatbread", "Stromboli & flatbreads", "Light sauce, chicken, cheese, tomato, spinach, red onion, and garlic.", "simple", [["One order", 12.49]]),
    menuItem("veggie-flatbread", "Veggie Flatbread", "Stromboli & flatbreads", "Spinach, tomato, garlic, and cheese.", "simple", [["One order", 11.49]]),

    menuItem("starter-antipasto", "Antipasto", "Starters", "Lettuce, ham, salami, cheese, pepperoni, tomato, onion, peppers, and black olive.", "simple", [["One order", 17.99]]),
    menuItem("house-meatballs", "House-Made Meatballs", "Starters", "Hand-rolled with sauce, cheese, and a side of bread.", "simple", [["One order", 11.99]]),
    menuItem("pepperoni-bread", "Pepperoni Bread", "Starters", "Stuffed with pepperoni and cheese with a side of sauce.", "simple", [["One order", 12.99]]),
    menuItem("cheesy-bread", "Cheesy Bread", "Starters", "Cheese, fresh garlic, seasonings, and a side of sauce.", "simple", [["One order", 9.99]]),
    menuItem("buffalo-chicken-cheese-fries", "Buffalo Chicken Cheese Fries", "Starters", "Crispy buffalo chicken, cheese, celery, and house-made bleu cheese.", "simple", [["One order", 12.99]]),
    menuItem("fried-pickles", "Fried Pickles", "Starters", "Crispy fried pickle chips with house-made ranch.", "simple", [["One order", 9.99]]),
    menuItem("mozzarella-sticks", "Mozzarella Sticks", "Starters", "Served with a side of sauce.", "simple", [["One order", 8.99]]),
    menuItem("boneless-wings", "Boneless Wings", "Starters", "Choose any wing sauce; celery, ranch, or bleu cheese available.", "wings", [["One order", 10.99]]),
    menuItem("fries", "Fries", "Starters", "Add cheese or bacon in the item note.", "simple", [["One order", 7.99]]),
    menuItem("pierogi", "Potato & Cheese Pierogi", "Starters", "Six pierogi with butter and onions.", "simple", [["6 pierogi", 8.99]], "Local favorite"),

    menuItem("italian-chopped-salad", "Italian Chopped Salad", "Salads", "Lettuce, salami, pepperoni, cheese, chickpeas, and carrot.", "salad", [["Full salad", 14.99]]),
    menuItem("antipasto", "Antipasto Salad", "Salads", "Lettuce, ham, salami, cheese, pepperoni, tomato, onion, peppers, and black olive.", "salad", [["Full salad", 17.99]]),
    menuItem("caesar-salad", "Caesar Salad", "Salads", "Lettuce, fresh grated parmesan, and house-made croutons.", "salad", [["Full salad", 14.99]]),
    menuItem("chicken-bacon-ranch-salad", "Chicken Bacon Ranch Salad", "Salads", "Lettuce, chicken, bacon, tomato, cheese, and egg.", "salad", [["Full salad", 14.99]]),
    menuItem("greek-salad", "Greek Salad", "Salads", "Lettuce, tomato, cucumber, black olive, onion, and feta.", "salad", [["Full salad", 14.99]]),
    menuItem("grilled-chicken-salad", "Grilled Chicken Salad", "Salads", "Lettuce, chicken, cheese, tomato, cucumber, and onion.", "salad", [["Full salad", 14.99]]),
    menuItem("summer-salad", "Summer Salad (Seasonal)", "Salads", "Lettuce, pineapple, orange, strawberry, blueberry, walnut, and chicken.", "salad", [["Full salad", 15.99]]),
    menuItem("tossed-salad", "Tossed Salad", "Salads", "Lettuce, tomato, onion, cucumber, black olive, and cheese.", "salad", [["Full salad", 7.99]]),

    menuItem("italian-sub", "Italian Sub", "Subs & platters", "Ham, salami, provolone, lettuce, tomato, onion, peppers, oil, and vinegar.", "simple", [["One sub", 12.99]]),
    menuItem("meatball-cheese-sub", "Meatball & Cheese Sub", "Subs & platters", "House-made meatballs, sauce, and cheese.", "simple", [["One sub", 14.99]]),
    menuItem("cheesesteak-sub", "Cheesesteak Sub", "Subs & platters", "Sliced ribeye and cheese.", "simple", [["One sub", 14.99]]),
    menuItem("kids-chicken-fries", "Kids Chicken & Fries", "Subs & platters", "Two chicken strips with fries.", "simple", [["One order", 8.99]]),
    menuItem("chicken-strips-fries", "Chicken Strips & Fries", "Subs & platters", "Four chicken strips with fries.", "simple", [["One order", 12.99]]),
    menuItem("soup-of-day", "Soup of the Day", "Subs & platters", "Ask staff about today's soup.", "simple", [["Cup", 5.99], ["Bowl", 7.99]])
  ];

  var TOPPINGS = [
    "Pepperoni", "Sausage", "Ham", "Green pepper", "Sweet pepper",
    "Hot pepper", "Onion", "Tomato", "Mushroom", "Broccoli",
    "Bacon", "Chicken", "Pineapple", "Spinach", "Garlic"
  ];
  var SAUCES = [
    "Hot", "Mild", "BBQ", "Old Bay", "Honey BBQ", "Teriyaki",
    "Classic Buffalo", "Garlic Parm", "Spicy Bleu Cheese", "Spicy Ranch",
    "Chicken Bacon Ranch", "Salt & Vinegar", "Buffalo Bay", "Hot Garlic", "Sweet Heat"
  ];
  var DRESSINGS = [
    "House Italian", "House Ranch", "House Bleu Cheese",
    "Thousand Island", "Caesar"
  ];
  var KEYS = {
    cart: "jigsyDemoCart",
    orders: "jigsyDemoOrders",
    settings: "jigsyDemoSettings",
    customerOrder: "jigsyDemoCustomerOrder"
  };

  function read(key, fallback) {
    try {
      var value = JSON.parse(localStorage.getItem(key));
      return value === null ? fallback : value;
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("jigsy-demo-change", { detail: { key: key } }));
  }

  function settings() {
    return Object.assign({
      paused: true,
      prepMinutes: 30,
      soldOut: [],
      fee: 0,
      taxRate: 0.06,
      paymentMode: "manual",
      squareConnected: false
    }, read(KEYS.settings, {}));
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
