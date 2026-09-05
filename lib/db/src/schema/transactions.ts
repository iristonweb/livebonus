import { pgTable, text, serial, integer, numeric, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { partnersTable } from "./partners";

export const transactionsTable = pgTable("transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id),
  partnerId: integer("partner_id").references(() => partnersTable.id),
  type: text("type").notNull(),
  category: text("category").notNull(),
  amountRub: numeric("amount_rub", { precision: 12, scale: 2 }).notNull().default("0"),
  pointsEarned: integer("points_earned").notNull().default(0),
  multiplier: numeric("multiplier", { precision: 4, scale: 2 }).notNull().default("1.0"),
  description: text("description").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertTransactionSchema = createInsertSchema(transactionsTable).omit({ id: true, createdAt: true });
export type InsertTransaction = z.infer<typeof insertTransactionSchema>;
export type Transaction = typeof transactionsTable.$inferSelect;
