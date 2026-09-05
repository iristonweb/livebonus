import { index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export type PartnerLogoCleanupFailedPath = {
  path: string;
  error: string;
};

export const partnerLogoCleanupRunsTable = pgTable(
  "partner_logo_cleanup_runs",
  {
    id: serial("id").primaryKey(),
    adminUserId: integer("admin_user_id").notNull().references(() => usersTable.id),
    adminName: text("admin_name").notNull(),
    adminPhone: text("admin_phone"),
    mode: text("mode").notNull(),
    scanned: integer("scanned").notNull(),
    referenced: integer("referenced").notNull(),
    orphanedPaths: text("orphaned_paths").array().notNull(),
    removedPaths: text("removed_paths").array().notNull(),
    failedPaths: jsonb("failed_paths").$type<PartnerLogoCleanupFailedPath[]>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("partner_logo_cleanup_runs_created_at_idx").on(table.createdAt),
  ],
);

export type PartnerLogoCleanupRun = typeof partnerLogoCleanupRunsTable.$inferSelect;