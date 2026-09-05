import { pgTable, text, serial, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { leasesTable } from "./leases";
import { scoreEventsTable } from "./score_events";

export const SCORE_DISPUTE_STATUSES = ["created", "under_review", "resolved", "rejected"] as const;
export type ScoreDisputeStatus = (typeof SCORE_DISPUTE_STATUSES)[number];

export const scoreDisputesTable = pgTable(
  "score_disputes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    leaseId: integer("lease_id").notNull().references(() => leasesTable.id),
    scoreEventId: integer("score_event_id").references(() => scoreEventsTable.id),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("created"),
    resolutionReason: text("resolution_reason"),
    resolvedByUserId: integer("resolved_by_user_id").references(() => usersTable.id),
    decisionIdempotencyKey: text("decision_idempotency_key"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("score_disputes_decision_key_idx").on(table.decisionIdempotencyKey),
    index("score_disputes_user_idx").on(table.userId, table.createdAt),
    index("score_disputes_status_idx").on(table.status, table.createdAt),
  ],
);

export const insertScoreDisputeSchema = createInsertSchema(scoreDisputesTable)
  .omit({ id: true, createdAt: true, updatedAt: true });
export type InsertScoreDispute = z.infer<typeof insertScoreDisputeSchema>;
export type ScoreDispute = typeof scoreDisputesTable.$inferSelect;

export const scoreDisputeAuditTable = pgTable(
  "score_dispute_audit",
  {
    id: serial("id").primaryKey(),
    disputeId: integer("dispute_id").notNull().references(() => scoreDisputesTable.id),
    actorUserId: integer("actor_user_id").references(() => usersTable.id),
    action: text("action").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("score_dispute_audit_dispute_idx").on(table.disputeId, table.createdAt),
  ],
);