import { check, pgTable, text, serial, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull().unique(),
  name: text("name").notNull(),
  email: text("email"),
  pointsBalance: integer("points_balance").notNull().default(0),
  // Authoritative monetary bonus balance. NULL means this legacy account has
  // not been migrated yet; financial settlement initializes it once from the
  // compatibility points balance.
  bonusBalanceRub: numeric("bonus_balance_rub", { precision: 14, scale: 2 }),
  status: text("status").notNull().default("novice"),
  // Live Score fields
  liveScore: integer("live_score").notNull().default(500),
  verificationLevel: integer("verification_level").notNull().default(0),
  isPhoneVerified: boolean("is_phone_verified").notNull().default(false),
  isIdentityVerified: boolean("is_identity_verified").notNull().default(false),
  isIncomeVerified: boolean("is_income_verified").notNull().default(false),
  identityVerificationStatus: text("identity_verification_status").notNull().default("not_started"),
  incomeVerificationStatus: text("income_verification_status").notNull().default("not_started"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  check("users_points_balance_nonnegative", sql`${table.pointsBalance} >= 0`),
  check("users_bonus_balance_nonnegative", sql`${table.bonusBalanceRub} IS NULL OR ${table.bonusBalanceRub} >= 0`),
]);

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
