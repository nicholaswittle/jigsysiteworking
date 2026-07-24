import menuCatalog from "../config/menu-catalog.json";

const RESTAURANT_ID = "jigsys";
const SESSION_COOKIE = "wisense_staff_session";
const SESSION_SECONDS = 12 * 60 * 60;

export interface OrderingEnv {
  DB: D1Database;
  STAFF_PIN?: string;
  STAFF_SESSION_SECRET?: string;
}

type RestaurantSettings = {
  restaurantId: string;
  restaurantName: string;
  paused: boolean;
  prepMinutes: number;
  soldOut: string[];
  feeCents: number;
  taxRate: number;
  paymentMode: "manual" | "square";
  squareConnected: boolean;
};

type SubmittedItem = {
  name: string;
  productId: string;
  detail: string;
  price: number;
};

type CatalogProduct = {
  id: string;
  name: string;
  type: string;
  sizes: Array<{ label: string; price: number }>;
};

const MENU_BY_ID = new Map(
  (menuCatalog.products as CatalogProduct[]).map((product) => [product.id, product]),
);

type StoredOrderRow = {
  id: string;
  restaurant_id: string;
  public_token: string;
  status: string;
  submitted_at: string;
  updated_at: string;
  accepted_at: string | null;
  rejected_at: string | null;
  completed_at: string | null;
  printed_at: string | null;
  pickup_minutes: number;
  customer_json: string;
  notes: string;
  items_json: string;
  subtotal_cents: number;
  fee_cents: number;
  tax_cents: number;
  total_cents: number;
  payment_mode: string;
  payment_status: string;
};

const DEFAULT_SETTINGS: RestaurantSettings = {
  restaurantId: RESTAURANT_ID,
  restaurantName: "Jigsy's",
  paused: true,
  prepMinutes: 30,
  soldOut: [],
  feeCents: 99,
  taxRate: 0.06,
  paymentMode: "manual",
  squareConnected: false,
};

function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function cleanText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function cents(value: unknown) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return -1;
  return Math.round(number * 100);
}

function expectedItemCents(item: SubmittedItem) {
  const product = MENU_BY_ID.get(item.productId);
  if (!product || product.name !== item.name) return -1;
  const parts = item.detail.split(" · ").map((part) => part.trim()).filter(Boolean);
  const size = product.sizes.find((option) => option.label === parts[0]);
  if (!size) return -1;

  let expected = Math.round(size.price * 100);
  const optionParts = parts.slice(1).filter((part) => !part.startsWith("Note:"));

  if (product.type === "tray" && optionParts.length) {
    const toppings = optionParts[0].split(",").map((part) => part.trim()).filter(Boolean);
    if (toppings.length > 4 || toppings.some((topping) => !menuCatalog.toppings.includes(topping))) return -1;
    expected += toppings.length * 150;
  }

  if (product.type === "wings") {
    const sauce = optionParts[0];
    if (!sauce || !menuCatalog.sauces.includes(sauce)) return -1;
    const dressing = optionParts[1];
    if (dressing) {
      if (dressing !== "Ranch + $1.00" && dressing !== "Bleu cheese + $1.00") return -1;
      expected += 100;
    }
  }

  if (product.type === "salad") {
    const dressing = optionParts[0];
    if (!dressing || !menuCatalog.dressings.includes(dressing)) return -1;
  }

  return expected;
}

function randomToken() {
  return crypto.randomUUID().replaceAll("-", "");
}

function newOrderId() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const number = Array.from(bytes).reduce((sum, value) => (sum * 256 + value) % 1_000_000, 0);
  return `J${String(number).padStart(6, "0")}`;
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function base64Url(bytes: ArrayBuffer) {
  const binary = String.fromCharCode(...new Uint8Array(bytes));
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function hmac(value: string, secret: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(value)));
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function sessionSecret(env: OrderingEnv) {
  return env.STAFF_SESSION_SECRET || "local-development-session-secret-change-before-production";
}

async function createSession(env: OrderingEnv) {
  const expires = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = `${RESTAURANT_ID}.${expires}.${randomToken().slice(0, 16)}`;
  return `${payload}.${await hmac(payload, sessionSecret(env))}`;
}

async function validSession(request: Request, env: OrderingEnv) {
  const value = cookieValue(request, SESSION_COOKIE);
  const parts = value.split(".");
  if (parts.length !== 4 || parts[0] !== RESTAURANT_ID) return false;
  const payload = parts.slice(0, 3).join(".");
  const expires = Number(parts[1]);
  if (!Number.isFinite(expires) || expires <= Math.floor(Date.now() / 1000)) return false;
  return constantTimeEqual(parts[3], await hmac(payload, sessionSecret(env)));
}

function validSameOrigin(request: Request) {
  if (request.method === "GET" || request.method === "HEAD") return true;
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

async function ensureSchema(env: OrderingEnv) {
  await env.DB.batch([
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS restaurant_settings (
        restaurant_id TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        restaurant_id TEXT NOT NULL,
        public_token TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        submitted_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        accepted_at TEXT,
        rejected_at TEXT,
        completed_at TEXT,
        printed_at TEXT,
        pickup_minutes INTEGER NOT NULL,
        customer_json TEXT NOT NULL,
        notes TEXT NOT NULL,
        items_json TEXT NOT NULL,
        subtotal_cents INTEGER NOT NULL,
        fee_cents INTEGER NOT NULL,
        tax_cents INTEGER NOT NULL,
        total_cents INTEGER NOT NULL,
        payment_mode TEXT NOT NULL,
        payment_status TEXT NOT NULL
      )
    `),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS orders_restaurant_submitted_idx ON orders (restaurant_id, submitted_at DESC)",
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS orders_restaurant_status_idx ON orders (restaurant_id, status, submitted_at DESC)",
    ),
  ]);
}

async function getSettings(env: OrderingEnv) {
  await ensureSchema(env);
  const row = await env.DB.prepare(
    "SELECT value_json FROM restaurant_settings WHERE restaurant_id = ?",
  ).bind(RESTAURANT_ID).first<{ value_json: string }>();

  if (row) {
    try {
      const value = JSON.parse(row.value_json) as Partial<RestaurantSettings>;
      return { ...DEFAULT_SETTINGS, ...value, restaurantId: RESTAURANT_ID };
    } catch {
      // Replace malformed configuration with safe defaults below.
    }
  }

  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO restaurant_settings (restaurant_id, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(restaurant_id) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `).bind(RESTAURANT_ID, JSON.stringify(DEFAULT_SETTINGS), now).run();
  return { ...DEFAULT_SETTINGS };
}

async function saveSettings(env: OrderingEnv, settings: RestaurantSettings) {
  const now = new Date().toISOString();
  await env.DB.prepare(`
    INSERT INTO restaurant_settings (restaurant_id, value_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(restaurant_id) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
  `).bind(RESTAURANT_ID, JSON.stringify(settings), now).run();
}

function publicSettings(settings: RestaurantSettings) {
  return {
    restaurantId: settings.restaurantId,
    restaurantName: settings.restaurantName,
    paused: settings.paused,
    prepMinutes: settings.prepMinutes,
    soldOut: settings.soldOut,
    fee: settings.feeCents / 100,
    taxRate: settings.taxRate,
    paymentMode: settings.paymentMode,
    squareConnected: settings.squareConnected,
  };
}

function rowToOrder(row: StoredOrderRow, includePrivate = true) {
  const order = {
    id: row.id,
    status: row.status,
    submittedAt: row.submitted_at,
    updatedAt: row.updated_at,
    acceptedAt: row.accepted_at,
    rejectedAt: row.rejected_at,
    completedAt: row.completed_at,
    printedAt: row.printed_at,
    pickupMinutes: row.pickup_minutes,
    paymentMode: row.payment_mode,
    paymentStatus: row.payment_status,
    totals: {
      subtotal: row.subtotal_cents / 100,
      fee: row.fee_cents / 100,
      tax: row.tax_cents / 100,
      total: row.total_cents / 100,
    },
  };
  if (!includePrivate) return order;
  return {
    ...order,
    customer: JSON.parse(row.customer_json),
    notes: row.notes,
    items: JSON.parse(row.items_json),
  };
}

async function login(request: Request, env: OrderingEnv) {
  const body = await request.json().catch(() => ({})) as { pin?: unknown };
  const supplied = cleanText(body.pin, 64);
  const expected = env.STAFF_PIN || "2468";
  const suppliedHash = await hmac(supplied, sessionSecret(env));
  const expectedHash = await hmac(expected, sessionSecret(env));
  if (!constantTimeEqual(suppliedHash, expectedHash)) {
    return json({ error: "That staff passcode did not work." }, 401);
  }
  const session = await createSession(env);
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return json(
    { ok: true, restaurantId: RESTAURANT_ID },
    200,
    {
      "set-cookie": `${SESSION_COOKIE}=${encodeURIComponent(session)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_SECONDS}${secure}`,
    },
  );
}

function logout(request: Request) {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return json(
    { ok: true },
    200,
    { "set-cookie": `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${secure}` },
  );
}

async function createOrder(request: Request, env: OrderingEnv) {
  const settings = await getSettings(env);
  if (settings.paused) return json({ error: "Online ordering is currently paused." }, 409);

  const body = await request.json().catch(() => ({})) as {
    customer?: { name?: unknown; phone?: unknown };
    notes?: unknown;
    pickupMinutes?: unknown;
    items?: unknown;
  };
  const name = cleanText(body.customer?.name, 80);
  const phone = cleanText(body.customer?.phone, 30);
  const phoneDigits = phone.replace(/\D/g, "");
  const notes = cleanText(body.notes, 500);
  const pickupMinutes = Math.round(Number(body.pickupMinutes));
  const items = Array.isArray(body.items) ? body.items.slice(0, 40) as SubmittedItem[] : [];

  if (name.length < 2) return json({ error: "Enter the customer's name." }, 400);
  if (phoneDigits.length < 10) return json({ error: "Enter a complete phone number." }, 400);
  if (!Number.isFinite(pickupMinutes) || pickupMinutes < settings.prepMinutes || pickupMinutes > 180) {
    return json({ error: "Choose an available pickup time." }, 400);
  }
  if (!items.length) return json({ error: "Add at least one menu item." }, 400);

  const normalizedItems: SubmittedItem[] = [];
  let subtotalCents = 0;
  for (const raw of items) {
    const item = {
      name: cleanText(raw?.name, 120),
      productId: cleanText(raw?.productId, 120),
      detail: cleanText(raw?.detail, 500),
      price: Number(raw?.price),
    };
    const itemCents = cents(item.price);
    const catalogCents = expectedItemCents(item);
    if (!item.name || !item.productId || !item.detail || itemCents < 0 || itemCents > 100_000) {
      return json({ error: "One of the menu items is invalid. Please rebuild the order." }, 400);
    }
    if (catalogCents < 0 || itemCents !== catalogCents) {
      return json({ error: `${item.name} no longer matches the verified menu price. Please add it again.` }, 409);
    }
    if (settings.soldOut.includes(item.productId)) {
      return json({ error: `${item.name} is no longer available.` }, 409);
    }
    subtotalCents += itemCents;
    normalizedItems.push({ ...item, price: itemCents / 100 });
  }
  if (subtotalCents < 1 || subtotalCents > 250_000) {
    return json({ error: "The order total is outside the supported range." }, 400);
  }

  const feeCents = settings.feeCents;
  const taxCents = Math.round(subtotalCents * settings.taxRate);
  const totalCents = subtotalCents + feeCents + taxCents;
  const now = new Date().toISOString();
  const publicToken = randomToken();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = newOrderId();
    try {
      await env.DB.prepare(`
        INSERT INTO orders (
          id, restaurant_id, public_token, status, submitted_at, updated_at,
          pickup_minutes, customer_json, notes, items_json, subtotal_cents,
          fee_cents, tax_cents, total_cents, payment_mode, payment_status
        ) VALUES (?, ?, ?, 'New', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        RESTAURANT_ID,
        publicToken,
        now,
        now,
        pickupMinutes,
        JSON.stringify({ name, phone }),
        notes,
        JSON.stringify(normalizedItems),
        subtotalCents,
        feeCents,
        taxCents,
        totalCents,
        settings.paymentMode,
        settings.paymentMode === "manual" ? "due_at_pickup" : "authorization_required",
      ).run();
      return json({
        order: {
          id,
          publicToken,
          status: "New",
          submittedAt: now,
          pickupMinutes,
          paymentMode: settings.paymentMode,
          paymentStatus: settings.paymentMode === "manual" ? "due_at_pickup" : "authorization_required",
          totals: {
            subtotal: subtotalCents / 100,
            fee: feeCents / 100,
            tax: taxCents / 100,
            total: totalCents / 100,
          },
        },
      }, 201);
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
  return json({ error: "Could not create an order number. Please try again." }, 500);
}

async function publicOrderStatus(url: URL, env: OrderingEnv, id: string) {
  await ensureSchema(env);
  const token = url.searchParams.get("token") ?? "";
  if (!token) return json({ error: "Order access token is required." }, 401);
  const row = await env.DB.prepare(
    "SELECT * FROM orders WHERE restaurant_id = ? AND id = ? AND public_token = ?",
  ).bind(RESTAURANT_ID, id, token).first<StoredOrderRow>();
  if (!row) return json({ error: "Order not found." }, 404);
  return json({ order: rowToOrder(row, false) });
}

async function staffOrders(url: URL, env: OrderingEnv) {
  await ensureSchema(env);
  const days = Math.min(90, Math.max(1, Number(url.searchParams.get("days") ?? 31)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const result = await env.DB.prepare(
    "SELECT * FROM orders WHERE restaurant_id = ? AND submitted_at >= ? ORDER BY submitted_at DESC LIMIT 1000",
  ).bind(RESTAURANT_ID, since).all<StoredOrderRow>();
  return json({ orders: (result.results ?? []).map((row) => rowToOrder(row, true)) });
}

async function updateOrder(request: Request, env: OrderingEnv, id: string) {
  const body = await request.json().catch(() => ({})) as { action?: unknown };
  const action = cleanText(body.action, 30);
  const now = new Date().toISOString();

  const transitions: Record<string, { from: string[]; to: string; timeField?: string; paymentStatus?: string }> = {
    accept: { from: ["New"], to: "Accepted", timeField: "accepted_at" },
    reject: { from: ["New"], to: "Rejected", timeField: "rejected_at", paymentStatus: "cancelled" },
    complete: { from: ["Accepted"], to: "Completed", timeField: "completed_at", paymentStatus: "completed" },
    cancel: { from: ["Accepted"], to: "Cancelled", timeField: "rejected_at", paymentStatus: "cancelled" },
  };

  if (action === "print") {
    const result = await env.DB.prepare(
      "UPDATE orders SET printed_at = ?, updated_at = ? WHERE restaurant_id = ? AND id = ?",
    ).bind(now, now, RESTAURANT_ID, id).run();
    if (!result.meta.changes) return json({ error: "Order not found." }, 404);
  } else {
    const transition = transitions[action];
    if (!transition) return json({ error: "Unknown order action." }, 400);
    const placeholders = transition.from.map(() => "?").join(", ");
    const timeAssignment = transition.timeField ? `, ${transition.timeField} = ?` : "";
    const paymentAssignment = transition.paymentStatus ? ", payment_status = ?" : "";
    const values: unknown[] = [transition.to, now];
    if (transition.timeField) values.push(now);
    if (transition.paymentStatus) values.push(transition.paymentStatus);
    values.push(RESTAURANT_ID, id, ...transition.from);
    const result = await env.DB.prepare(`
      UPDATE orders
      SET status = ?, updated_at = ?${timeAssignment}${paymentAssignment}
      WHERE restaurant_id = ? AND id = ? AND status IN (${placeholders})
    `).bind(...values).run();
    if (!result.meta.changes) {
      return json({ error: "The order changed before this action was applied. Refresh and try again." }, 409);
    }
  }

  const row = await env.DB.prepare(
    "SELECT * FROM orders WHERE restaurant_id = ? AND id = ?",
  ).bind(RESTAURANT_ID, id).first<StoredOrderRow>();
  return json({ order: row ? rowToOrder(row, true) : null });
}

async function updateSettings(request: Request, env: OrderingEnv) {
  const current = await getSettings(env);
  const body = await request.json().catch(() => ({})) as {
    paused?: unknown;
    prepMinutes?: unknown;
    soldOut?: unknown;
  };
  const next: RestaurantSettings = { ...current };
  if (typeof body.paused === "boolean") next.paused = body.paused;
  if (body.prepMinutes !== undefined) {
    const prep = Math.round(Number(body.prepMinutes) / 5) * 5;
    if (!Number.isFinite(prep) || prep < 10 || prep > 90) {
      return json({ error: "Prep time must be between 10 and 90 minutes." }, 400);
    }
    next.prepMinutes = prep;
  }
  if (body.soldOut !== undefined) {
    if (!Array.isArray(body.soldOut) || body.soldOut.length > 500) {
      return json({ error: "Menu availability is invalid." }, 400);
    }
    next.soldOut = Array.from(new Set(body.soldOut.map((value) => cleanText(value, 120)).filter(Boolean)));
  }
  await saveSettings(env, next);
  return json({ settings: publicSettings(next) });
}

export async function handleOrderingApi(request: Request, env: OrderingEnv): Promise<Response> {
  const url = new URL(request.url);
  if (!validSameOrigin(request)) return json({ error: "Cross-site request blocked." }, 403);

  try {
    if (url.pathname === "/api/health" && request.method === "GET") {
      await ensureSchema(env);
      return json({ ok: true, service: "wisense-ordering", restaurantId: RESTAURANT_ID });
    }
    if (url.pathname === "/api/public/settings" && request.method === "GET") {
      return json({ settings: publicSettings(await getSettings(env)) });
    }
    if (url.pathname === "/api/orders" && request.method === "POST") {
      return createOrder(request, env);
    }
    const publicOrderMatch = url.pathname.match(/^\/api\/orders\/([^/]+)$/);
    if (publicOrderMatch && request.method === "GET") {
      return publicOrderStatus(url, env, decodeURIComponent(publicOrderMatch[1]));
    }
    if (url.pathname === "/api/staff/login" && request.method === "POST") {
      return login(request, env);
    }
    if (url.pathname === "/api/staff/logout" && request.method === "POST") {
      return logout(request);
    }

    if (url.pathname.startsWith("/api/staff/")) {
      if (!(await validSession(request, env))) return json({ error: "Staff sign-in required." }, 401);
      if (url.pathname === "/api/staff/session" && request.method === "GET") {
        return json({ authenticated: true, restaurantId: RESTAURANT_ID });
      }
      if (url.pathname === "/api/staff/orders" && request.method === "GET") {
        return staffOrders(url, env);
      }
      if (url.pathname === "/api/staff/settings" && request.method === "GET") {
        return json({ settings: publicSettings(await getSettings(env)) });
      }
      if (url.pathname === "/api/staff/settings" && request.method === "PATCH") {
        return updateSettings(request, env);
      }
      const staffOrderMatch = url.pathname.match(/^\/api\/staff\/orders\/([^/]+)$/);
      if (staffOrderMatch && request.method === "PATCH") {
        return updateOrder(request, env, decodeURIComponent(staffOrderMatch[1]));
      }
    }

    return json({ error: "API route not found." }, 404);
  } catch (error) {
    console.error("Ordering API error", error);
    return json({ error: "The ordering service had a problem. Please try again." }, 500);
  }
}
