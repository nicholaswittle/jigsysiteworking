import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const settings = sqliteTable("restaurant_settings", {
  restaurantId: text("restaurant_id").primaryKey(),
  valueJson: text("value_json").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const squareConnections = sqliteTable("square_connections", {
  restaurantId: text("restaurant_id").primaryKey(),
  environment: text("environment").notNull(),
  merchantId: text("merchant_id").notNull(),
  locationId: text("location_id").notNull(),
  locationName: text("location_name").notNull(),
  accessTokenEncrypted: text("access_token_encrypted").notNull(),
  refreshTokenEncrypted: text("refresh_token_encrypted").notNull(),
  expiresAt: text("expires_at").notNull(),
  scopesJson: text("scopes_json").notNull(),
  connectedAt: text("connected_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const orders = sqliteTable(
  "orders",
  {
    id: text("id").primaryKey(),
    restaurantId: text("restaurant_id").notNull(),
    publicToken: text("public_token").notNull().unique(),
    status: text("status").notNull(),
    submittedAt: text("submitted_at").notNull(),
    updatedAt: text("updated_at").notNull(),
    acceptedAt: text("accepted_at"),
    rejectedAt: text("rejected_at"),
    completedAt: text("completed_at"),
    printedAt: text("printed_at"),
    pickupMinutes: integer("pickup_minutes").notNull(),
    customerJson: text("customer_json").notNull(),
    notes: text("notes").notNull(),
    itemsJson: text("items_json").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    feeCents: integer("fee_cents").notNull(),
    taxCents: integer("tax_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    paymentMode: text("payment_mode").notNull(),
    paymentStatus: text("payment_status").notNull(),
  },
  (table) => [
    index("orders_restaurant_submitted_idx").on(table.restaurantId, table.submittedAt),
    index("orders_restaurant_status_idx").on(table.restaurantId, table.status, table.submittedAt),
  ],
);
