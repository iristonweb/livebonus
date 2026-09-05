import { pgTable, text, serial, integer, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const scoreEventsTable = pgTable(
  "score_events",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    eventType: text("event_type").notNull(),
    scoreChange: integer("score_change").notNull(),
    description: text("description").notNull(),
    relatedLeaseId: integer("related_lease_id"),
    // Deterministic business events use this key to make retries and
    // concurrent requests no-ops. It remains nullable for legacy events.
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("score_events_idempotency_idx").on(table.idempotencyKey),
  ],
);

export const insertScoreEventSchema = createInsertSchema(scoreEventsTable).omit({ id: true, createdAt: true });
export type InsertScoreEvent = z.infer<typeof insertScoreEventSchema>;
export type ScoreEvent = typeof scoreEventsTable.$inferSelect;
