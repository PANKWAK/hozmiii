import {
  sqliteTable,
  text,
  integer,
  primaryKey,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
export const states = sqliteTable("cloud_states", {
  userId: text("user_id").primaryKey(),
  revision: integer("revision").notNull().default(0),
  imports: text("imports_json").notNull().default("[]"),
  groups: text("groups_json").notNull().default("{}"),
  updatedAt: text("updated_at").notNull(),
});
export const orders = sqliteTable(
  "cloud_orders",
  {
    userId: text("user_id").notNull(),
    key: text("order_key").notNull(),
    body: text("body_json").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);
export const connections = sqliteTable(
  "g2g_connections",
  {
    userId: text("user_id").primaryKey(),
    routeId: text("route_id").notNull(),
    encrypted: text("encrypted_credentials").notNull(),
    lastEventAt: text("last_event_at"),
    lastSyncAt: text("last_sync_at"),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("g2g_route_unique").on(t.routeId)],
);
export const events = sqliteTable(
  "g2g_events",
  {
    routeId: text("route_id").notNull(),
    eventId: text("event_id").notNull(),
    receivedAt: text("received_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.routeId, t.eventId] })],
);
