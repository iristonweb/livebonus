import { pgTable, text, serial, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { partnersTable } from "./partners";

export const offersTable = pgTable("offers", {
  id: serial("id").primaryKey(),
  partnerId: integer("partner_id").notNull().references(() => partnersTable.id),
  title: text("title").notNull(),
  description: text("description"),
  bonusMultiplier: numeric("bonus_multiplier", { precision: 4, scale: 2 }).notNull().default("1.0"),
  category: text("category").notNull(),
  minAmountRub: numeric("min_amount_rub", { precision: 12, scale: 2 }),
  isActive: boolean("is_active").notNull().default(true),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertOfferSchema = createInsertSchema(offersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOffer = z.infer<typeof insertOfferSchema>;
export type Offer = typeof offersTable.$inferSelect;
