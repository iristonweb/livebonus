import { index, integer, jsonb, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export type CatalogAuditChange = {
  from: string | number | boolean | null;
  to: string | number | boolean | null;
};

export const catalogAuditLogTable = pgTable(
  "catalog_audit_log",
  {
    id: serial("id").primaryKey(),
    adminUserId: integer("admin_user_id").notNull().references(() => usersTable.id),
    adminName: text("admin_name").notNull(),
    adminPhone: text("admin_phone"),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id").notNull(),
    entityName: text("entity_name").notNull(),
    action: text("action").notNull(),
    changes: jsonb("changes").$type<Record<string, CatalogAuditChange>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("catalog_audit_log_created_at_idx").on(table.createdAt),
    index("catalog_audit_log_entity_idx").on(table.entityType, table.entityId),
  ],
);

export const insertCatalogAuditLogSchema = createInsertSchema(catalogAuditLogTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCatalogAuditLog = z.infer<typeof insertCatalogAuditLogSchema>;
export type CatalogAuditLog = typeof catalogAuditLogTable.$inferSelect;