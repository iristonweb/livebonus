import { pgTable, text, serial, integer, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const verificationApplicationsTable = pgTable(
  "verification_applications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    verificationType: text("verification_type").notNull(),
    status: text("status").notNull().default("pending"),
    fileObjectPath: text("file_object_path").notNull(),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    fileSize: integer("file_size").notNull(),
    rejectionReason: text("rejection_reason"),
    reviewerId: integer("reviewer_id").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    index("verification_applications_user_idx").on(table.userId, table.createdAt),
    index("verification_applications_queue_idx").on(table.status, table.createdAt),
    uniqueIndex("verification_applications_pending_idx")
      .on(table.userId, table.verificationType)
      .where(sql`status = 'pending'`),
  ],
);

export const verificationAuditEventsTable = pgTable(
  "verification_audit_events",
  {
    id: serial("id").primaryKey(),
    applicationId: integer("application_id").notNull().references(() => verificationApplicationsTable.id),
    actorUserId: integer("actor_user_id").references(() => usersTable.id),
    action: text("action").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("verification_audit_events_application_idx").on(table.applicationId, table.createdAt),
  ],
);

export const insertVerificationApplicationSchema = createInsertSchema(verificationApplicationsTable)
  .omit({ id: true, createdAt: true, decidedAt: true, updatedAt: true });
export type InsertVerificationApplication = z.infer<typeof insertVerificationApplicationSchema>;
export type VerificationApplication = typeof verificationApplicationsTable.$inferSelect;
export type VerificationAuditEvent = typeof verificationAuditEventsTable.$inferSelect;