import { check, pgTable, text, serial, integer, numeric, boolean, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const leasesTable = pgTable(
  "leases",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    landlordUserId: integer("landlord_user_id").references(() => usersTable.id),
    address: text("address").notNull(),
    city: text("city").notNull().default("Москва"),
    landlordName: text("landlord_name"),
    monthlyRentRub: numeric("monthly_rent_rub", { precision: 12, scale: 2 }).notNull().default("0"),
    startDate: timestamp("start_date", { withTimezone: true }).notNull().defaultNow(),
    endDate: timestamp("end_date", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    depositAmountRub: numeric("deposit_amount_rub", { precision: 12, scale: 2 }),
    depositReturned: boolean("deposit_returned"),
    onTimePayments: integer("on_time_payments").notNull().default(0),
    latePayments: integer("late_payments").notNull().default(0),
    landlordRating: numeric("landlord_rating", { precision: 3, scale: 1 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    check("leases_monthly_rent_nonnegative", sql`${table.monthlyRentRub} >= 0`),
    check("leases_deposit_nonnegative", sql`${table.depositAmountRub} IS NULL OR ${table.depositAmountRub} >= 0`),
    check("leases_payment_counters_nonnegative", sql`${table.onTimePayments} >= 0 AND ${table.latePayments} >= 0`),
    check("leases_rating_range", sql`${table.landlordRating} IS NULL OR (${table.landlordRating} >= 1 AND ${table.landlordRating} <= 5)`),
    check("leases_dates_ordered", sql`${table.endDate} IS NULL OR ${table.endDate} >= ${table.startDate}`),
  ],
);

export const insertLeaseSchema = createInsertSchema(leasesTable)
  .omit({ id: true, createdAt: true, updatedAt: true })
  .superRefine((value, ctx) => {
    if (value.endDate && value.startDate && value.endDate < value.startDate) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endDate"], message: "endDate must not be before startDate" });
    }
    if (value.landlordUserId !== undefined && value.landlordUserId === value.userId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["landlordUserId"], message: "landlordUserId must differ from userId" });
    }
  });
export type InsertLease = z.infer<typeof insertLeaseSchema>;
export type Lease = typeof leasesTable.$inferSelect;
