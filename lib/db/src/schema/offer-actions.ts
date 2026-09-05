import { integer, pgTable, serial, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { offersTable } from "./offers";
import { usersTable } from "./users";

export const userOfferActionsTable = pgTable(
  "user_offer_actions",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    offerId: integer("offer_id").notNull().references(() => offersTable.id),
    savedAt: timestamp("saved_at", { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
  },
  (table) => [
    uniqueIndex("user_offer_actions_user_offer_idx").on(table.userId, table.offerId),
  ],
);

export type UserOfferAction = typeof userOfferActionsTable.$inferSelect;