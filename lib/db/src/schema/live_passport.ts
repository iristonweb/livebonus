import { index, integer, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const livePassportSharesTable = pgTable(
  "live_passport_shares",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("live_passport_shares_token_hash_idx").on(table.tokenHash),
    index("live_passport_shares_user_idx").on(table.userId, table.createdAt),
  ],
);

export type LivePassportShare = typeof livePassportSharesTable.$inferSelect;

export const livePassportShareAuditTable = pgTable(
  "live_passport_share_audit",
  {
    id: serial("id").primaryKey(),
    shareId: integer("share_id").references(() => livePassportSharesTable.id),
    ownerUserId: integer("owner_user_id").references(() => usersTable.id),
    actorUserId: integer("actor_user_id").references(() => usersTable.id),
    action: text("action").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("live_passport_share_audit_share_idx").on(table.shareId, table.createdAt),
    index("live_passport_share_audit_owner_idx").on(table.ownerUserId, table.createdAt),
  ],
);

export type LivePassportShareAudit = typeof livePassportShareAuditTable.$inferSelect;