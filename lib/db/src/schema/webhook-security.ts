import { index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Operational history for rejected YooKassa webhook sources.
 *
 * Keep this table deliberately narrow: source addresses and timestamps are
 * useful for investigating delivery changes, while notification bodies and
 * provider payment identifiers must never enter the security history.
 */
export const webhookSecurityEventsTable = pgTable(
  "webhook_security_events",
  {
    id: serial("id").primaryKey(),
    event: text("event").notNull(),
    sourceIp: text("source_ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("webhook_security_events_created_at_idx").on(table.createdAt),
    index("webhook_security_events_source_created_at_idx").on(table.sourceIp, table.createdAt),
  ],
);

export type WebhookSecurityEvent = typeof webhookSecurityEventsTable.$inferSelect;
export type InsertWebhookSecurityEvent = typeof webhookSecurityEventsTable.$inferInsert;