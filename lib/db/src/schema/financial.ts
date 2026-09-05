import {
  check,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable } from "./users";
import { partnersTable } from "./partners";
import { leasesTable } from "./leases";
import { transactionsTable } from "./transactions";

export const financialPoliciesTable = pgTable(
  "financial_policies",
  {
    id: serial("id").primaryKey(),
    version: integer("version").notNull(),
    currency: text("currency").notNull().default("RUB"),
    purchaseRedemptionRate: numeric("purchase_redemption_rate", { precision: 5, scale: 4 }).notNull().default("0.1500"),
    partnerFeeRate: numeric("partner_fee_rate", { precision: 5, scale: 4 }).notNull().default("0.0150"),
    rentalBonusRate: numeric("rental_bonus_rate", { precision: 5, scale: 4 }).notNull().default("0.1000"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("financial_policies_version_idx").on(table.version),
    check("financial_policies_rates_nonnegative", sql`
      ${table.purchaseRedemptionRate} >= 0
      AND ${table.partnerFeeRate} >= 0
      AND ${table.rentalBonusRate} >= 0
    `),
  ],
);

export const financialDealsTable = pgTable(
  "financial_deals",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    partnerId: integer("partner_id").references(() => partnersTable.id),
    leaseId: integer("lease_id").references(() => leasesTable.id),
    policyId: integer("policy_id").notNull().references(() => financialPoliciesTable.id),
    status: text("status").notNull().default("settled"),
    externalReference: text("external_reference"),
    idempotencyKey: text("idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    paymentProvider: text("payment_provider"),
    paymentMethod: text("payment_method").notNull().default("mir_pay"),
    providerPaymentId: text("provider_payment_id"),
    providerPaymentStatus: text("provider_payment_status"),
    providerCheckoutUrl: text("provider_checkout_url"),
    providerRefundId: text("provider_refund_id"),
    providerRefundStatus: text("provider_refund_status"),
    paymentFailureReason: text("payment_failure_reason"),
    paymentUpdatedAt: timestamp("payment_updated_at", { withTimezone: true }),
    currency: text("currency").notNull().default("RUB"),
    grossAmountRub: numeric("gross_amount_rub", { precision: 14, scale: 2 }).notNull(),
    bonusRedeemedRub: numeric("bonus_redeemed_rub", { precision: 14, scale: 2 }).notNull().default("0"),
    netAmountRub: numeric("net_amount_rub", { precision: 14, scale: 2 }).notNull(),
    feeAmountRub: numeric("fee_amount_rub", { precision: 14, scale: 2 }).notNull().default("0"),
    landlordBonusRub: numeric("landlord_bonus_rub", { precision: 14, scale: 2 }).notNull().default("0"),
    tenantBonusRub: numeric("tenant_bonus_rub", { precision: 14, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("financial_deals_user_idempotency_idx").on(table.userId, table.idempotencyKey),
    index("financial_deals_user_idx").on(table.userId, table.createdAt),
    index("financial_deals_partner_idx").on(table.partnerId, table.createdAt),
    check("financial_deals_amounts_nonnegative", sql`
      ${table.grossAmountRub} >= 0
      AND ${table.bonusRedeemedRub} >= 0
      AND ${table.netAmountRub} >= 0
      AND ${table.feeAmountRub} >= 0
      AND ${table.landlordBonusRub} >= 0
      AND ${table.tenantBonusRub} >= 0
      AND ${table.bonusRedeemedRub} <= ${table.grossAmountRub}
      AND ${table.netAmountRub} + ${table.bonusRedeemedRub} = ${table.grossAmountRub}
    `),
    check("financial_deals_kind_valid", sql`${table.kind} IN ('partner_purchase', 'rental_deal')`),
    check("financial_deals_payment_method_valid", sql`${table.paymentMethod} IN ('sbp', 'mir_pay')`),
    check("financial_deals_status_valid", sql`${table.status} IN ('pending', 'payment_failed', 'cancelled', 'settled', 'refunded')`),
  ],
);

export const financialDealParticipantsTable = pgTable(
  "financial_deal_participants",
  {
    id: serial("id").primaryKey(),
    dealId: integer("deal_id").notNull().references(() => financialDealsTable.id),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    role: text("role").notNull(),
    bonusAmountRub: numeric("bonus_amount_rub", { precision: 14, scale: 2 }).notNull().default("0"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("financial_deal_participants_role_idx").on(table.dealId, table.role),
    index("financial_deal_participants_user_idx").on(table.userId, table.createdAt),
    check("financial_deal_participants_bonus_nonnegative", sql`${table.bonusAmountRub} >= 0`),
    check("financial_deal_participants_role_valid", sql`${table.role} IN ('tenant', 'landlord')`),
  ],
);

export const financialLedgerEntriesTable = pgTable(
  "financial_ledger_entries",
  {
    id: serial("id").primaryKey(),
    dealId: integer("deal_id").notNull().references(() => financialDealsTable.id),
    userId: integer("user_id").references(() => usersTable.id),
    transactionId: integer("transaction_id").references(() => transactionsTable.id),
    entryType: text("entry_type").notNull(),
    source: text("source").notNull(),
    reference: text("reference").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    amountRub: numeric("amount_rub", { precision: 14, scale: 2 }).notNull(),
    balanceAfterRub: numeric("balance_after_rub", { precision: 14, scale: 2 }),
    // Deliberately stored as an immutable ledger id. A self-referencing
    // Drizzle FK creates a circular type initializer; the application only
    // writes this field to a pre-existing entry inside the same transaction.
    reversalOfId: integer("reversal_of_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("financial_ledger_idempotency_idx").on(table.idempotencyKey),
    index("financial_ledger_user_idx").on(table.userId, table.createdAt),
    index("financial_ledger_deal_idx").on(table.dealId, table.createdAt),
    check("financial_ledger_amount_nonnegative", sql`${table.amountRub} >= 0`),
    check("financial_ledger_entry_type_valid", sql`${table.entryType} IN ('debit', 'credit')`),
  ],
);

/**
 * Append-only record of an operator-approved balance reconciliation.
 * Corrections update the user snapshot atomically, but never rewrite an
 * existing financial deal or ledger entry.
 */
export const financialBalanceReconciliationsTable = pgTable(
  "financial_balance_reconciliations",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id),
    operatorUserId: integer("operator_user_id").notNull().references(() => usersTable.id),
    correctionTarget: text("correction_target").notNull(),
    reason: text("reason").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    beforePointsBalance: integer("before_points_balance").notNull(),
    afterPointsBalance: integer("after_points_balance").notNull(),
    beforeBonusBalanceRub: numeric("before_bonus_balance_rub", { precision: 14, scale: 2 }),
    afterBonusBalanceRub: numeric("after_bonus_balance_rub", { precision: 14, scale: 2 }).notNull(),
    beforeDifferenceCents: integer("before_difference_cents"),
    afterDifferenceCents: integer("after_difference_cents").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("financial_balance_reconciliations_idempotency_idx").on(table.idempotencyKey),
    index("financial_balance_reconciliations_user_idx").on(table.userId, table.createdAt),
    index("financial_balance_reconciliations_created_at_idx").on(table.createdAt),
    check("financial_balance_reconciliations_target_valid", sql`${table.correctionTarget} IN ('monetary', 'points')`),
    check("financial_balance_reconciliations_points_nonnegative", sql`${table.beforePointsBalance} >= 0 AND ${table.afterPointsBalance} >= 0`),
    check("financial_balance_reconciliations_bonus_nonnegative", sql`
      ${table.beforeBonusBalanceRub} IS NULL OR ${table.beforeBonusBalanceRub} >= 0
    `),
    check("financial_balance_reconciliations_after_bonus_nonnegative", sql`${table.afterBonusBalanceRub} >= 0`),
  ],
);

export type FinancialPolicy = typeof financialPoliciesTable.$inferSelect;
export type FinancialDeal = typeof financialDealsTable.$inferSelect;
export type FinancialDealParticipant = typeof financialDealParticipantsTable.$inferSelect;
export type FinancialLedgerEntry = typeof financialLedgerEntriesTable.$inferSelect;
export type FinancialBalanceReconciliation = typeof financialBalanceReconciliationsTable.$inferSelect;