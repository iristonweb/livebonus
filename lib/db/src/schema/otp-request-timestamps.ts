import { index, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Durable history used to enforce the phone OTP resend window.
 *
 * Verification codes intentionally remain in the API process because this
 * table is only a throttle, not a code store.
 */
export const otpRequestTimestampsTable = pgTable(
  "otp_request_timestamps",
  {
    id: serial("id").primaryKey(),
    phone: text("phone").notNull(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("otp_request_timestamps_phone_requested_at_idx").on(table.phone, table.requestedAt),
    index("otp_request_timestamps_requested_at_idx").on(table.requestedAt),
  ],
);

export type OtpRequestTimestamp = typeof otpRequestTimestampsTable.$inferSelect;
export type InsertOtpRequestTimestamp = typeof otpRequestTimestampsTable.$inferInsert;