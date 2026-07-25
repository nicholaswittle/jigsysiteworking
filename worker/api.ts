import menuCatalog from "../config/menu-catalog.json";

const RESTAURANT_ID = "jigsys";
const SESSION_COOKIE = "wisense_staff_session";
const SQUARE_STATE_COOKIE = "wisense_square_oauth";
const SESSION_SECONDS = 12 * 60 * 60;
const SQUARE_API_VERSION = "2026-07-15";
const SQUARE_SCOPES = [
  "MERCHANT_PROFILE_READ",
  "ITEMS_READ",
  "ORDERS_READ",
  "ORDERS_WRITE",
  "PAYMENTS_READ",
  "PAYMENTS_WRITE",
];

export interface OrderingEnv {
  DB: D1Database;
  STAFF_PIN?: string;
  STAFF_SESSION_SECRET?: string;
  SQUARE_ENV?: string;
  SQUARE_APPLICATION_ID?: string;
  SQUARE_APPLICATION_SECRET?: string;
  SQUARE_TOKEN_ENCRYPTION_KEY?: string;
  SQUARE_REDIRECT_URI?: string;
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
  square_payment_id: string | null;
  square_refund_id: string | null;
  square_order_id: string | null;
};

type SquareConnectionRow = {
  restaurant_id: string;
  environment: string;
  merchant_id: string;
  location_id: string;
  location_name: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  expires_at: string;
  scopes_json: string;
  connected_at: string;
  updated_at: string;
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

function base64UrlBytes(value: string) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
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

function squareConfigured(env: OrderingEnv) {
  return Boolean(
    env.SQUARE_APPLICATION_ID
    && env.SQUARE_APPLICATION_SECRET
    && env.SQUARE_TOKEN_ENCRYPTION_KEY
    && env.SQUARE_REDIRECT_URI,
  );
}

function squareBaseUrl(env: OrderingEnv) {
  return env.SQUARE_ENV === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

async function squareEncryptionKey(env: OrderingEnv) {
  const raw = env.SQUARE_TOKEN_ENCRYPTION_KEY ?? "";
  const bytes = /^[a-f0-9]{64}$/i.test(raw)
    ? Uint8Array.from(raw.match(/.{2}/g) ?? [], (pair) => Number.parseInt(pair, 16))
    : new TextEncoder().encode(raw);
  const digest = bytes.length === 32 ? bytes : new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptSquareToken(value: string, env: OrderingEnv) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await squareEncryptionKey(env),
    new TextEncoder().encode(value),
  );
  return `${base64Url(iv.buffer)}.${base64Url(encrypted)}`;
}

async function decryptSquareToken(value: string, env: OrderingEnv) {
  const [ivValue, encryptedValue] = value.split(".");
  if (!ivValue || !encryptedValue) throw new Error("Stored Square token is invalid.");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlBytes(ivValue) },
    await squareEncryptionKey(env),
    base64UrlBytes(encryptedValue),
  );
  return new TextDecoder().decode(decrypted);
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
        payment_status TEXT NOT NULL,
        square_payment_id TEXT,
        square_refund_id TEXT,
        square_order_id TEXT
      )
    `),
    env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS square_connections (
        restaurant_id TEXT PRIMARY KEY,
        environment TEXT NOT NULL,
        merchant_id TEXT NOT NULL,
        location_id TEXT NOT NULL,
        location_name TEXT NOT NULL,
        access_token_encrypted TEXT NOT NULL,
        refresh_token_encrypted TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        scopes_json TEXT NOT NULL,
        connected_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS orders_restaurant_submitted_idx ON orders (restaurant_id, submitted_at DESC)",
    ),
    env.DB.prepare(
      "CREATE INDEX IF NOT EXISTS orders_restaurant_status_idx ON orders (restaurant_id, status, submitted_at DESC)",
    ),
  ]);
  const orderColumns = await env.DB.prepare("PRAGMA table_info(orders)").all<{ name: string }>();
  const columnNames = new Set((orderColumns.results ?? []).map((column) => column.name));
  for (const column of ["square_payment_id", "square_refund_id", "square_order_id"]) {
    if (columnNames.has(column)) continue;
    try {
      await env.DB.prepare(`ALTER TABLE orders ADD COLUMN ${column} TEXT`).run();
    } catch (error) {
      if (!String(error).toLowerCase().includes("duplicate column")) throw error;
    }
  }
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
    squarePaymentId: includePrivate ? row.square_payment_id : undefined,
    squareRefundId: includePrivate ? row.square_refund_id : undefined,
    squareOrderId: includePrivate ? row.square_order_id : undefined,
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
    paymentSourceId?: unknown;
  };
  const name = cleanText(body.customer?.name, 80);
  const phone = cleanText(body.customer?.phone, 30);
  const phoneDigits = phone.replace(/\D/g, "");
  const notes = cleanText(body.notes, 500);
  const pickupMinutes = Math.round(Number(body.pickupMinutes));
  const items = Array.isArray(body.items) ? body.items.slice(0, 40) as SubmittedItem[] : [];
  const paymentSourceId = cleanText(body.paymentSourceId, 512);

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
  const squareMode = settings.paymentMode === "square";

  if (squareMode) {
    if (env.SQUARE_ENV === "production") {
      return json({ error: "Live card payments have not been approved for this pilot." }, 409);
    }
    if (!settings.squareConnected || !(await getSquareConnection(env))) {
      return json({ error: "Square Sandbox checkout is temporarily unavailable." }, 409);
    }
    if (!paymentSourceId) {
      return json({ error: "Enter the Square Sandbox test card before sending the order." }, 400);
    }
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const id = newOrderId();
    try {
      await env.DB.prepare(`
        INSERT INTO orders (
          id, restaurant_id, public_token, status, submitted_at, updated_at,
          pickup_minutes, customer_json, notes, items_json, subtotal_cents,
          fee_cents, tax_cents, total_cents, payment_mode, payment_status,
          square_payment_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        id,
        RESTAURANT_ID,
        publicToken,
        squareMode ? "PaymentPending" : "New",
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
        squareMode ? "authorizing" : "due_at_pickup",
        null,
      ).run();

      let squarePaymentId: string | null = null;
      if (squareMode) {
        try {
          squarePaymentId = await authorizeSquarePayment(env, {
            id,
            sourceId: paymentSourceId,
            totalCents,
          });
          await env.DB.prepare(`
            UPDATE orders
            SET status = 'New', payment_status = 'authorized',
                square_payment_id = ?, updated_at = ?
            WHERE restaurant_id = ? AND id = ? AND status = 'PaymentPending'
          `).bind(squarePaymentId, new Date().toISOString(), RESTAURANT_ID, id).run();
        } catch (error) {
          await env.DB.prepare(
            "DELETE FROM orders WHERE restaurant_id = ? AND id = ? AND status = 'PaymentPending'",
          ).bind(RESTAURANT_ID, id).run();
          if (error instanceof SquarePaymentError) {
            return json({ error: error.message }, error.status);
          }
          throw error;
        }
      }

      return json({
        order: {
          id,
          publicToken,
          status: "New",
          submittedAt: now,
          pickupMinutes,
          paymentMode: settings.paymentMode,
          paymentStatus: squareMode ? "authorized" : "due_at_pickup",
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
    "SELECT * FROM orders WHERE restaurant_id = ? AND submitted_at >= ? AND status != 'PaymentPending' ORDER BY submitted_at DESC LIMIT 1000",
  ).bind(RESTAURANT_ID, since).all<StoredOrderRow>();
  return json({ orders: (result.results ?? []).map((row) => rowToOrder(row, true)) });
}

async function updateOrder(request: Request, env: OrderingEnv, id: string) {
  const body = await request.json().catch(() => ({})) as { action?: unknown };
  const action = cleanText(body.action, 30);
  const now = new Date().toISOString();
  let squareOrderError: string | undefined;
  const existing = await env.DB.prepare(
    "SELECT * FROM orders WHERE restaurant_id = ? AND id = ?",
  ).bind(RESTAURANT_ID, id).first<StoredOrderRow>();
  if (!existing) return json({ error: "Order not found." }, 404);

  const transitions: Record<string, { from: string[]; to: string; timeField?: string; paymentStatus?: string }> = {
    accept: {
      from: ["New"],
      to: "Accepted",
      timeField: "accepted_at",
      paymentStatus: existing.payment_mode === "square" ? "completed" : undefined,
    },
    reject: { from: ["New"], to: "Rejected", timeField: "rejected_at", paymentStatus: "cancelled" },
    complete: { from: ["Accepted"], to: "Completed", timeField: "completed_at", paymentStatus: "completed" },
    cancel: { from: ["Accepted"], to: "Cancelled", timeField: "rejected_at", paymentStatus: "cancelled" },
  };

  if (action === "print") {
    const result = await env.DB.prepare(
      "UPDATE orders SET printed_at = ?, updated_at = ? WHERE restaurant_id = ? AND id = ?",
    ).bind(now, now, RESTAURANT_ID, id).run();
    if (!result.meta.changes) return json({ error: "Order not found." }, 404);
  } else if (action === "refund") {
    if (existing.payment_mode !== "square") {
      return json({ error: "Only Square Sandbox payments can be refunded." }, 409);
    }
    if (!existing.square_payment_id || existing.payment_status !== "completed") {
      return json({ error: "This order has no captured Square payment to refund." }, 409);
    }
    if (existing.square_refund_id || existing.status === "Refunded") {
      return json({ error: "This order was already refunded." }, 409);
    }
    if (existing.status !== "Accepted" && existing.status !== "Completed") {
      return json({ error: "Only accepted or completed orders can be refunded." }, 409);
    }
    let refundId: string;
    try {
      refundId = await refundSquarePayment(env, {
        id: existing.id,
        paymentId: existing.square_payment_id,
        totalCents: existing.total_cents,
      });
    } catch (error) {
      if (error instanceof SquarePaymentError) return json({ error: error.message }, error.status);
      throw error;
    }
    const result = await env.DB.prepare(`
      UPDATE orders
      SET status = 'Refunded', payment_status = 'refunded', square_refund_id = ?, updated_at = ?
      WHERE restaurant_id = ? AND id = ? AND status IN ('Accepted', 'Completed')
    `).bind(refundId, now, RESTAURANT_ID, id).run();
    if (!result.meta.changes) {
      return json({ error: "The order changed before this action was applied. Refresh and try again." }, 409);
    }
  } else {
    const transition = transitions[action];
    if (!transition) return json({ error: "Unknown order action." }, 400);
    if (!transition.from.includes(existing.status)) {
      return json({ error: "The order changed before this action was applied. Refresh and try again." }, 409);
    }
    if (existing.payment_mode === "square" && action === "cancel") {
      return json({ error: "A captured Square payment cannot be cancelled. Use Refund to return the Sandbox payment." }, 409);
    }
    if (existing.payment_mode === "square" && (action === "accept" || action === "reject")) {
      if (!existing.square_payment_id || existing.payment_status !== "authorized") {
        return json({ error: "This order does not have a valid Square authorization." }, 409);
      }
      try {
        await settleSquarePayment(
          env,
          existing.square_payment_id,
          action === "accept" ? "complete" : "cancel",
        );
      } catch (error) {
        if (error instanceof SquarePaymentError) return json({ error: error.message }, error.status);
        throw error;
      }
    }
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
    // On acceptance, push the order into the connected Square account so it prints
    // on the restaurant's Square system and staff take payment there. Non-fatal:
    // the order is still accepted (and the app ticket still prints) if Square fails.
    if (action === "accept" && !existing.square_order_id) {
      const connection = await getSquareConnection(env);
      if (connection) {
        try {
          const squareOrderId = await createSquareOrder(env, existing, connection);
          await env.DB.prepare(
            "UPDATE orders SET square_order_id = ? WHERE restaurant_id = ? AND id = ?",
          ).bind(squareOrderId, RESTAURANT_ID, id).run();
        } catch (error) {
          console.error("Square order creation failed", error);
          squareOrderError = error instanceof SquarePaymentError
            ? error.message
            : "The order was accepted but could not be sent to Square.";
        }
      }
    }
  }

  const row = await env.DB.prepare(
    "SELECT * FROM orders WHERE restaurant_id = ? AND id = ?",
  ).bind(RESTAURANT_ID, id).first<StoredOrderRow>();
  return json({ order: row ? rowToOrder(row, true) : null, squareOrderError });
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

async function getSquareConnection(env: OrderingEnv) {
  await ensureSchema(env);
  return env.DB.prepare(
    "SELECT * FROM square_connections WHERE restaurant_id = ?",
  ).bind(RESTAURANT_ID).first<SquareConnectionRow>();
}

class SquarePaymentError extends Error {
  status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "SquarePaymentError";
    this.status = status;
  }
}

type SquareErrorPayload = {
  errors?: Array<{ code?: string; detail?: string; category?: string }>;
};

function squarePaymentMessage(payload: SquareErrorPayload, fallback: string) {
  const code = payload.errors?.[0]?.code ?? "";
  const messages: Record<string, string> = {
    CARD_DECLINED: "The Sandbox test card was declined.",
    GENERIC_DECLINE: "The Sandbox test card was declined.",
    VERIFY_CVV_FAILURE: "The Sandbox test card security code was not accepted.",
    VERIFY_POSTAL_CODE_FAILURE: "The Sandbox test postal code was not accepted.",
    EXPIRATION_FAILURE: "The Sandbox test card expiration date was not accepted.",
    CARD_TOKEN_EXPIRED: "The Sandbox card entry expired. Enter the test card again.",
    CARD_TOKEN_USED: "That Sandbox card entry was already submitted. Enter it again.",
  };
  return messages[code] ?? fallback;
}

async function squareAccessToken(
  env: OrderingEnv,
  connection: SquareConnectionRow,
  forceRefresh = false,
) {
  if (!squareConfigured(env)) throw new SquarePaymentError("Square Sandbox is not configured.", 503);
  const refreshedAt = new Date(connection.updated_at).getTime();
  const expiresAt = new Date(connection.expires_at).getTime();
  const shouldRefresh = forceRefresh
    || !Number.isFinite(refreshedAt)
    || !Number.isFinite(expiresAt)
    || Date.now() - refreshedAt > 6 * 24 * 60 * 60 * 1000
    || expiresAt - Date.now() < 7 * 24 * 60 * 60 * 1000;
  if (!shouldRefresh) return decryptSquareToken(connection.access_token_encrypted, env);

  const currentRefreshToken = await decryptSquareToken(connection.refresh_token_encrypted, env);
  const response = await fetch(`${squareBaseUrl(env)}/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Square-Version": SQUARE_API_VERSION,
    },
    body: JSON.stringify({
      client_id: env.SQUARE_APPLICATION_ID,
      client_secret: env.SQUARE_APPLICATION_SECRET,
      grant_type: "refresh_token",
      refresh_token: currentRefreshToken,
      redirect_uri: env.SQUARE_REDIRECT_URI,
    }),
  });
  const data = await response.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_at?: string;
  } & SquareErrorPayload;
  if (!response.ok || !data.access_token || !data.expires_at) {
    console.error("Square OAuth refresh failed", response.status, data.errors?.[0]?.code ?? "unknown");
    throw new SquarePaymentError("The Square Sandbox connection needs to be renewed in the staff Payments tab.", 503);
  }
  const nextRefreshToken = data.refresh_token || currentRefreshToken;
  const now = new Date().toISOString();
  await env.DB.prepare(`
    UPDATE square_connections
    SET access_token_encrypted = ?, refresh_token_encrypted = ?,
        expires_at = ?, updated_at = ?
    WHERE restaurant_id = ?
  `).bind(
    await encryptSquareToken(data.access_token, env),
    await encryptSquareToken(nextRefreshToken, env),
    data.expires_at,
    now,
    RESTAURANT_ID,
  ).run();
  return data.access_token;
}

async function squareApiRequest<T>(
  env: OrderingEnv,
  path: string,
  init: RequestInit = {},
) {
  const connection = await getSquareConnection(env);
  if (!connection) throw new SquarePaymentError("Square Sandbox is not connected.", 503);

  const run = async (forceRefresh = false) => {
    const headers = new Headers(init.headers);
    headers.set("authorization", `Bearer ${await squareAccessToken(env, connection, forceRefresh)}`);
    headers.set("Square-Version", SQUARE_API_VERSION);
    if (init.body) headers.set("content-type", "application/json");
    return fetch(`${squareBaseUrl(env)}${path}`, { ...init, headers });
  };

  let response = await run(false);
  if (response.status === 401) response = await run(true);
  const data = await response.json().catch(() => ({})) as T & SquareErrorPayload;
  return { response, data, connection };
}

async function authorizeSquarePayment(
  env: OrderingEnv,
  payment: { id: string; sourceId: string; totalCents: number },
) {
  const result = await squareApiRequest<{
    payment?: { id?: string; status?: string };
  }>(env, "/v2/payments", {
    method: "POST",
    body: JSON.stringify({
      source_id: payment.sourceId,
      idempotency_key: `wisense-${payment.id}-${randomToken().slice(0, 16)}`,
      amount_money: { amount: payment.totalCents, currency: "USD" },
      autocomplete: false,
      delay_action: "CANCEL",
      location_id: (await getSquareConnection(env))?.location_id,
      reference_id: payment.id,
      note: `Jigsy's Sandbox pickup ${payment.id}`,
    }),
  });
  if (!result.response.ok || !result.data.payment?.id || result.data.payment.status !== "APPROVED") {
    throw new SquarePaymentError(
      squarePaymentMessage(result.data, "Square could not authorize the Sandbox test payment."),
      402,
    );
  }
  return result.data.payment.id;
}

async function settleSquarePayment(env: OrderingEnv, paymentId: string, action: "complete" | "cancel") {
  const expected = action === "complete" ? "COMPLETED" : "CANCELED";
  const attempt = await squareApiRequest<{ payment?: { status?: string } }>(
    env,
    `/v2/payments/${encodeURIComponent(paymentId)}/${action}`,
    { method: "POST", body: "{}" },
  );
  if (attempt.response.ok && attempt.data.payment?.status === expected) return;

  const current = await squareApiRequest<{ payment?: { status?: string } }>(
    env,
    `/v2/payments/${encodeURIComponent(paymentId)}`,
  );
  if (current.response.ok && current.data.payment?.status === expected) return;
  throw new SquarePaymentError(
    squarePaymentMessage(
      attempt.data,
      action === "complete"
        ? "Square could not capture the authorized Sandbox payment. The order was not accepted."
        : "Square could not cancel the Sandbox authorization. The order was not rejected.",
    ),
  );
}

async function refundSquarePayment(
  env: OrderingEnv,
  payment: { id: string; paymentId: string; totalCents: number },
) {
  const result = await squareApiRequest<{
    refund?: { id?: string; status?: string };
  }>(env, "/v2/refunds", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: `wisense-refund-${payment.id}-${randomToken().slice(0, 16)}`,
      payment_id: payment.paymentId,
      amount_money: { amount: payment.totalCents, currency: "USD" },
      reason: `Jigsy's Sandbox refund ${payment.id}`,
    }),
  });
  const status = result.data.refund?.status;
  // Square returns PENDING (settles asynchronously) or COMPLETED for a successful refund.
  if (!result.response.ok || !result.data.refund?.id || (status !== "PENDING" && status !== "COMPLETED")) {
    throw new SquarePaymentError(
      squarePaymentMessage(result.data, "Square could not refund the Sandbox payment. The order was not refunded."),
    );
  }
  return result.data.refund.id;
}

async function createSquareOrder(env: OrderingEnv, order: StoredOrderRow, connection: SquareConnectionRow) {
  const items = JSON.parse(order.items_json) as Array<{ name?: string; detail?: string; price?: number }>;
  const lineItems: Array<Record<string, unknown>> = items.map((item) => ({
    name: String(item.name ?? "Item").slice(0, 512),
    quantity: "1",
    base_price_money: { amount: Math.round(Number(item.price ?? 0) * 100), currency: "USD" },
    note: item.detail ? String(item.detail).slice(0, 500) : undefined,
  }));
  if (order.fee_cents > 0) {
    lineItems.push({
      name: "Online ordering fee",
      quantity: "1",
      base_price_money: { amount: order.fee_cents, currency: "USD" },
    });
  }
  const customer = JSON.parse(order.customer_json) as { name?: string; phone?: string };
  const pickupAt = new Date(Date.now() + order.pickup_minutes * 60_000).toISOString();
  const result = await squareApiRequest<{ order?: { id?: string } }>(env, "/v2/orders", {
    method: "POST",
    body: JSON.stringify({
      idempotency_key: `wisense-order-${order.id}-${randomToken().slice(0, 12)}`,
      order: {
        location_id: connection.location_id,
        reference_id: order.id,
        line_items: lineItems,
        fulfillments: [
          {
            type: "PICKUP",
            state: "PROPOSED",
            pickup_details: {
              recipient: {
                display_name: customer.name || "Online order",
                phone_number: customer.phone || undefined,
              },
              schedule_type: "ASAP",
              pickup_at: pickupAt,
              note: order.notes ? order.notes.slice(0, 500) : undefined,
            },
          },
        ],
      },
    }),
  });
  if (!result.response.ok || !result.data.order?.id) {
    throw new SquarePaymentError(squarePaymentMessage(result.data, "Square could not record the order."));
  }
  return result.data.order.id;
}

async function publicSquareConfig(env: OrderingEnv) {
  const settings = await getSettings(env);
  const connection = settings.squareConnected ? await getSquareConnection(env) : null;
  const enabled = Boolean(
    settings.paymentMode === "square"
    && env.SQUARE_ENV !== "production"
    && connection
    && env.SQUARE_APPLICATION_ID,
  );
  return {
    enabled,
    environment: "sandbox",
    applicationId: enabled ? env.SQUARE_APPLICATION_ID : null,
    locationId: enabled ? connection?.location_id : null,
    currency: "USD",
  };
}

function squareStatus(connection: SquareConnectionRow | null, env: OrderingEnv) {
  let scopes: string[] = [];
  if (connection) {
    try {
      const parsed = JSON.parse(connection.scopes_json);
      scopes = Array.isArray(parsed) ? parsed : [];
    } catch {
      scopes = [];
    }
  }
  return {
    configured: squareConfigured(env),
    connected: Boolean(connection),
    environment: env.SQUARE_ENV === "production" ? "production" : "sandbox",
    merchantId: connection?.merchant_id ?? null,
    locationId: connection?.location_id ?? null,
    locationName: connection?.location_name ?? null,
    expiresAt: connection?.expires_at ?? null,
    scopes,
  };
}

async function staffSquareStatus(env: OrderingEnv) {
  const [connection, settings] = await Promise.all([getSquareConnection(env), getSettings(env)]);
  return { ...squareStatus(connection, env), paymentMode: settings.paymentMode };
}

async function setSquarePaymentMode(request: Request, env: OrderingEnv) {
  const body = await request.json().catch(() => ({})) as { enabled?: unknown };
  if (typeof body.enabled !== "boolean") return json({ error: "Choose whether Sandbox checkout is enabled." }, 400);
  const settings = await getSettings(env);
  if (body.enabled) {
    const connection = await getSquareConnection(env);
    if (!connection || !settings.squareConnected) {
      return json({ error: "Connect Square Sandbox before enabling test checkout." }, 409);
    }
    if (env.SQUARE_ENV === "production") {
      return json({ error: "This control is restricted to Square Sandbox." }, 409);
    }
  }
  const next = { ...settings, paymentMode: body.enabled ? "square" as const : "manual" as const };
  await saveSettings(env, next);
  return json({ settings: publicSettings(next), status: await staffSquareStatus(env) });
}

async function beginSquareConnect(request: Request, env: OrderingEnv) {
  if (!squareConfigured(env)) {
    return json({ error: "Square Sandbox has not been configured on this site yet." }, 503);
  }
  const nonce = randomToken();
  const state = `${nonce}.${await hmac(`${RESTAURANT_ID}.${nonce}`, sessionSecret(env))}`;
  const authorizeUrl = new URL(`${squareBaseUrl(env)}/oauth2/authorize`);
  authorizeUrl.searchParams.set("client_id", env.SQUARE_APPLICATION_ID!);
  authorizeUrl.searchParams.set("scope", SQUARE_SCOPES.join(" "));
  authorizeUrl.searchParams.set("state", state);
  authorizeUrl.searchParams.set("session", "false");
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return json(
    { authorizeUrl: authorizeUrl.toString() },
    200,
    {
      "set-cookie": `${SQUARE_STATE_COOKIE}=${encodeURIComponent(state)}; Path=/api/square/oauth/callback; HttpOnly; SameSite=Lax; Max-Age=600${secure}`,
    },
  );
}

function squareCallbackRedirect(request: Request, result: "connected" | "error", message = "") {
  const target = new URL("/staff-demo.html", request.url);
  target.searchParams.set("square", result);
  if (message) target.searchParams.set("message", cleanText(message, 140));
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return new Response(null, {
    status: 302,
    headers: {
      location: target.toString(),
      "cache-control": "no-store",
      "set-cookie": `${SQUARE_STATE_COOKIE}=; Path=/api/square/oauth/callback; HttpOnly; SameSite=Lax; Max-Age=0${secure}`,
    },
  });
}

async function completeSquareConnect(request: Request, url: URL, env: OrderingEnv) {
  if (!squareConfigured(env)) return squareCallbackRedirect(request, "error", "Square is not configured.");
  const returnedState = url.searchParams.get("state") ?? "";
  const storedState = cookieValue(request, SQUARE_STATE_COOKIE);
  if (!returnedState || !storedState || !constantTimeEqual(returnedState, storedState)) {
    return squareCallbackRedirect(request, "error", "The Square connection request expired. Try again.");
  }
  if (url.searchParams.get("error")) {
    return squareCallbackRedirect(request, "error", "Square authorization was cancelled.");
  }
  const code = url.searchParams.get("code") ?? "";
  if (!code) return squareCallbackRedirect(request, "error", "Square did not return an authorization code.");

  const tokenResponse = await fetch(`${squareBaseUrl(env)}/oauth2/token`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Square-Version": SQUARE_API_VERSION,
    },
    body: JSON.stringify({
      client_id: env.SQUARE_APPLICATION_ID,
      client_secret: env.SQUARE_APPLICATION_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });
  const tokenData = await tokenResponse.json() as {
    access_token?: string;
    refresh_token?: string;
    expires_at?: string;
    merchant_id?: string;
    scope?: string;
    message?: string;
  };
  if (!tokenResponse.ok || !tokenData.access_token || !tokenData.refresh_token || !tokenData.merchant_id) {
    console.error("Square token exchange failed", tokenResponse.status, tokenData.message ?? "unknown error");
    return squareCallbackRedirect(request, "error", "Square could not finish the connection.");
  }

  const locationsResponse = await fetch(`${squareBaseUrl(env)}/v2/locations`, {
    headers: {
      authorization: `Bearer ${tokenData.access_token}`,
      "Square-Version": SQUARE_API_VERSION,
    },
  });
  const locationsData = await locationsResponse.json() as {
    locations?: Array<{ id?: string; name?: string; status?: string }>;
  };
  const locations = locationsData.locations ?? [];
  const location = locations.find((item) => item.status === "ACTIVE") ?? locations[0];
  if (!locationsResponse.ok || !location?.id) {
    return squareCallbackRedirect(request, "error", "Square connected, but no restaurant location was available.");
  }

  const now = new Date().toISOString();
  const expiresAt = tokenData.expires_at ?? new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString();
  const scopes = (tokenData.scope ?? SQUARE_SCOPES.join(" ")).split(/\s+/).filter(Boolean);
  await ensureSchema(env);
  await env.DB.prepare(`
    INSERT INTO square_connections (
      restaurant_id, environment, merchant_id, location_id, location_name,
      access_token_encrypted, refresh_token_encrypted, expires_at,
      scopes_json, connected_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(restaurant_id) DO UPDATE SET
      environment = excluded.environment,
      merchant_id = excluded.merchant_id,
      location_id = excluded.location_id,
      location_name = excluded.location_name,
      access_token_encrypted = excluded.access_token_encrypted,
      refresh_token_encrypted = excluded.refresh_token_encrypted,
      expires_at = excluded.expires_at,
      scopes_json = excluded.scopes_json,
      updated_at = excluded.updated_at
  `).bind(
    RESTAURANT_ID,
    env.SQUARE_ENV === "production" ? "production" : "sandbox",
    tokenData.merchant_id,
    location.id,
    cleanText(location.name || "Square location", 160),
    await encryptSquareToken(tokenData.access_token, env),
    await encryptSquareToken(tokenData.refresh_token, env),
    expiresAt,
    JSON.stringify(scopes),
    now,
    now,
  ).run();
  const settings = await getSettings(env);
  await saveSettings(env, { ...settings, squareConnected: true, paymentMode: "manual" });
  return squareCallbackRedirect(request, "connected");
}

async function disconnectSquare(env: OrderingEnv) {
  const connection = await getSquareConnection(env);
  if (connection && squareConfigured(env)) {
    try {
      const token = await decryptSquareToken(connection.access_token_encrypted, env);
      await fetch(`${squareBaseUrl(env)}/oauth2/revoke`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Client ${env.SQUARE_APPLICATION_SECRET}`,
          "Square-Version": SQUARE_API_VERSION,
        },
        body: JSON.stringify({
          client_id: env.SQUARE_APPLICATION_ID,
          access_token: token,
          revoke_only_access_token: false,
        }),
      });
    } catch (error) {
      console.warn("Square token revoke did not complete; removing the local connection.", error);
    }
  }
  await ensureSchema(env);
  await env.DB.prepare("DELETE FROM square_connections WHERE restaurant_id = ?").bind(RESTAURANT_ID).run();
  const settings = await getSettings(env);
  await saveSettings(env, { ...settings, squareConnected: false, paymentMode: "manual" });
  return json({ ok: true, status: await staffSquareStatus(env) });
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
    if (url.pathname === "/api/public/square-config" && request.method === "GET") {
      return json({ square: await publicSquareConfig(env) });
    }
    if (url.pathname === "/api/square/oauth/callback" && request.method === "GET") {
      return completeSquareConnect(request, url, env);
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
      if (url.pathname === "/api/staff/square/status" && request.method === "GET") {
        return json({ status: await staffSquareStatus(env) });
      }
      if (url.pathname === "/api/staff/square/connect" && request.method === "GET") {
        return beginSquareConnect(request, env);
      }
      if (url.pathname === "/api/staff/square/disconnect" && request.method === "POST") {
        return disconnectSquare(env);
      }
      if (url.pathname === "/api/staff/square/payment-mode" && request.method === "POST") {
        return setSquarePaymentMode(request, env);
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
