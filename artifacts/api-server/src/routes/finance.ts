import { Router, type Request, type Response } from "express";
import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import {
  db,
  financialDealsTable,
  financialDealParticipantsTable,
  financialLedgerEntriesTable,
  financialBalanceReconciliationsTable,
  financialPoliciesTable,
  leasesTable,
  partnersTable,
  transactionsTable,
  usersTable,
} from "@workspace/db";
import {
  QuotePartnerPurchaseBody,
  QuoteRentalDealBody,
  RefundFinancialDealBody,
  CreatePurchaseCheckoutBody,
  CreateRentalCheckoutBody,
  CorrectBalanceReconciliationBody,
  ListBalanceReconciliationQueryParams,
  ExportBalanceReconciliationQueryParams,
  ListPaymentReconciliationQueryParams,
} from "@workspace/api-zod";
import {
  FINANCE_POLICY,
  centsToRub,
  legacyCentsForPoints,
  legacyPointsForCents,
  parseRub,
  quotePartnerPurchase,
  quoteRentalDeal,
  reconcileBalances,
} from "../lib/finance.js";
import { getStatusForPoints } from "../lib/bonus.js";
import {
  persistSecurityEvent,
  recordSecurityEvent,
  YOOKASSA_WEBHOOK_REJECTION_EVENT,
} from "../lib/logger.js";
import { getAuthPayloadFromReq, getUserIdFromReq, requireAdmin } from "./auth.js";
import {
  YooKassaError,
  createYooKassaPayment,
  createYooKassaRefund,
  getYooKassaPayment,
  isYooKassaWebhookIp,
  type YooKassaPayment,
} from "../lib/yookassa.js";

const router = Router();
const TestPurchaseSettlementBody = CreatePurchaseCheckoutBody.omit({ paymentMethod: true });
const TestRentalSettlementBody = CreateRentalCheckoutBody.omit({ paymentMethod: true });

function money(value: number): string {
  return value.toFixed(2);
}

function isoTimestamp(value: Date | string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function legacyBalanceCents(user: { pointsBalance: number; bonusBalanceRub: string | null }): bigint {
  if (user.bonusBalanceRub !== null) {
    const parsed = parseRub(user.bonusBalanceRub);
    return parsed.ok ? parsed.cents : 0n;
  }
  return legacyCentsForPoints(user.pointsBalance);
}

function fingerprint(body: unknown): string {
  return JSON.stringify(body, Object.keys(body as Record<string, unknown>).sort());
}

function getIdempotencyKey(req: { headers: Record<string, string | string[] | undefined> }, body: unknown): string | null {
  const header = req.headers["idempotency-key"];
  if (typeof header === "string" && header.trim()) return header.trim();
  const bodyKey = (body as { idempotencyKey?: unknown }).idempotencyKey;
  return typeof bodyKey === "string" && bodyKey.trim() ? bodyKey.trim() : null;
}

async function getCurrentPolicy() {
  const [row] = await db
    .select()
    .from(financialPoliciesTable)
    .orderBy(desc(financialPoliciesTable.effectiveFrom), desc(financialPoliciesTable.version))
    .limit(1);
  if (!row) return null;
  return {
    id: row.id,
    version: row.version,
    currency: "RUB" as const,
    purchaseRedemptionBps: Math.round(Number(row.purchaseRedemptionRate) * 10000),
    partnerFeeBps: Math.round(Number(row.partnerFeeRate) * 10000),
    rentalBonusBps: Math.round(Number(row.rentalBonusRate) * 10000),
    effectiveFrom: row.effectiveFrom.toISOString(),
  };
}

async function formatDeal(deal: typeof financialDealsTable.$inferSelect) {
  const [policy] = await db
    .select({ version: financialPoliciesTable.version })
    .from(financialPoliciesTable)
    .where(eq(financialPoliciesTable.id, deal.policyId))
    .limit(1);
  return {
    id: deal.id,
    kind: deal.kind,
    status: deal.status,
    userId: deal.userId,
    partnerId: deal.partnerId,
    leaseId: deal.leaseId,
    policyVersion: policy?.version ?? deal.policyId,
    externalReference: deal.externalReference,
    idempotencyKey: deal.idempotencyKey,
    currency: deal.currency,
    paymentMethod: deal.paymentMethod,
    grossAmountRub: Number(deal.grossAmountRub),
    bonusRedeemedRub: Number(deal.bonusRedeemedRub),
    netAmountRub: Number(deal.netAmountRub),
    feeAmountRub: Number(deal.feeAmountRub),
    landlordBonusRub: Number(deal.landlordBonusRub),
    tenantBonusRub: Number(deal.tenantBonusRub),
    createdAt: deal.createdAt.toISOString(),
    settledAt: deal.settledAt?.toISOString() ?? null,
    refundedAt: deal.refundedAt?.toISOString() ?? null,
    paymentProvider: deal.paymentProvider,
    providerPaymentId: deal.providerPaymentId,
    providerPaymentStatus: deal.providerPaymentStatus,
    providerCheckoutUrl: deal.providerCheckoutUrl,
    providerRefundId: deal.providerRefundId,
    providerRefundStatus: deal.providerRefundStatus,
    paymentFailureReason: deal.paymentFailureReason,
    paymentUpdatedAt: deal.paymentUpdatedAt?.toISOString() ?? null,
  };
}

function isAuthenticated(req: Request): boolean {
  return getAuthPayloadFromReq(req) !== null;
}

function formatBalanceReconciliation(user: {
  id: number;
  phone: string;
  name: string;
  pointsBalance: number;
  bonusBalanceRub: string | null;
}) {
  const reconciliation = reconcileBalances(user);
  return {
    userId: user.id,
    phone: user.phone,
    name: user.name,
    pointsBalance: user.pointsBalance,
    bonusBalanceRub: reconciliation.monetaryBalanceCents === null
      ? null
      : centsToRub(reconciliation.monetaryBalanceCents),
    expectedBalanceRub: centsToRub(reconciliation.expectedBalanceCents),
    differenceRub: reconciliation.differenceCents === null
      ? null
      : centsToRub(reconciliation.differenceCents),
    differenceCents: reconciliation.differenceCents === null
      ? null
      : Number(reconciliation.differenceCents),
    legacyEquivalentPoints: reconciliation.legacyEquivalentPoints,
    status: reconciliation.status,
    canCorrect: reconciliation.status === "mismatch" || reconciliation.status === "unmigrated",
  };
}

function formatBalanceCorrection(
  correction: typeof financialBalanceReconciliationsTable.$inferSelect,
) {
  return {
    id: correction.id,
    userId: correction.userId,
    operatorUserId: correction.operatorUserId,
    correctionTarget: correction.correctionTarget,
    reason: correction.reason,
    idempotencyKey: correction.idempotencyKey,
    beforePointsBalance: correction.beforePointsBalance,
    afterPointsBalance: correction.afterPointsBalance,
    beforeBonusBalanceRub: correction.beforeBonusBalanceRub === null
      ? null
      : Number(correction.beforeBonusBalanceRub),
    afterBonusBalanceRub: Number(correction.afterBonusBalanceRub),
    beforeDifferenceCents: correction.beforeDifferenceCents === null
      ? null
      : Number(correction.beforeDifferenceCents),
    afterDifferenceCents: Number(correction.afterDifferenceCents),
    createdAt: correction.createdAt.toISOString(),
  };
}

const reconciliationExportHeaders = [
  "recordType",
  "reconciliationId",
  "userId",
  "classification",
  "operatorUserId",
  "correctionTarget",
  "reason",
  "beforePointsBalance",
  "afterPointsBalance",
  "beforeBonusBalanceRub",
  "afterBonusBalanceRub",
  "beforeDifferenceCents",
  "afterDifferenceCents",
  "currentPointsBalance",
  "currentBonusBalanceRub",
  "currentExpectedBalanceRub",
  "currentDifferenceCents",
  "createdAt",
] as const;

const reconciliationExportBatchSize = 500;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function reconciliationExportRow(
  values: Partial<Record<(typeof reconciliationExportHeaders)[number], unknown>>,
): string {
  return reconciliationExportHeaders.map((header) => csvCell(values[header])).join(",");
}

function writeReconciliationExportChunk(res: Response, chunk: string): Promise<boolean> {
  if (res.destroyed || res.writableEnded) return Promise.resolve(false);
  if (res.write(chunk)) return Promise.resolve(true);

  return new Promise((resolve) => {
    const cleanup = () => {
      res.off("drain", onDrain);
      res.off("close", onClose);
      res.off("error", onError);
    };
    const finish = (writable: boolean) => {
      cleanup();
      resolve(writable);
    };
    const onDrain = () => finish(true);
    const onClose = () => finish(false);
    const onError = () => finish(false);

    res.once("drain", onDrain);
    res.once("close", onClose);
    res.once("error", onError);
  });
}

function parseReconciliationExportDates(query: Record<string, unknown>): {
  from?: Date;
  to?: Date;
} {
  return {
    ...(typeof query.from === "string"
      ? { from: new Date(`${query.from}T00:00:00.000Z`) }
      : {}),
    ...(typeof query.to === "string"
      ? { to: new Date(`${query.to}T23:59:59.999Z`) }
      : {}),
  };
}

function classificationForBalanceCorrection(
  correction: typeof financialBalanceReconciliationsTable.$inferSelect,
): "mismatch" | "unmigrated" {
  return correction.beforeBonusBalanceRub === null ? "unmigrated" : "mismatch";
}

type PurchaseInput = {
  grossAmountRub: number;
  requestedBonusRub?: number;
  partnerId?: number;
  externalReference?: string;
};

function paymentStatusForDeal(deal: typeof financialDealsTable.$inferSelect): string {
  if (deal.status === "payment_failed") return "failed";
  if (deal.status === "cancelled") return "canceled";
  // A provider can confirm the charge while the server is unable to apply
  // the bonus debit safely (for example, the balance changed in parallel).
  // Keep the deal pending for reconciliation, but never expose that internal
  // state as a successful user debit.
  if (deal.status !== "settled" && deal.paymentFailureReason) return "failed";
  return deal.providerPaymentStatus ?? "pending";
}

function paymentReviewReason(deal: {
  status: string;
  providerPaymentStatus: string | null;
  paymentFailureReason: string | null;
}): { needsReview: boolean; reviewReason: string } {
  if (deal.status === "payment_failed") {
    return {
      needsReview: true,
      reviewReason: deal.paymentFailureReason ?? "Провайдер не подтвердил оплату",
    };
  }
  if (deal.status === "pending") {
    return {
      needsReview: true,
      reviewReason: deal.paymentFailureReason
        ?? (deal.providerPaymentStatus === "waiting_for_capture"
          ? "Платёж ожидает подтверждения у провайдера"
          : "Проверить итоговый статус у провайдера"),
    };
  }
  return {
    needsReview: false,
    reviewReason: "Платёж отменён провайдером; финансовая проводка не создана",
  };
}

function publicAppUrl(req: Request, path: string): string {
  const configuredDomain = process.env.REPLIT_DOMAINS?.split(",")[0]?.trim();
  const base = configuredDomain ? `https://${configuredDomain}` : `${req.protocol}://${req.get("host")}`;
  return `${base}${path}`;
}

function purchaseInputFromDeal(deal: typeof financialDealsTable.$inferSelect): PurchaseInput {
  try {
    const input = JSON.parse(deal.requestFingerprint) as PurchaseInput;
    return {
      grossAmountRub: input.grossAmountRub,
      ...(input.requestedBonusRub !== undefined ? { requestedBonusRub: input.requestedBonusRub } : {}),
      ...(input.partnerId !== undefined ? { partnerId: input.partnerId } : {}),
      ...(input.externalReference !== undefined ? { externalReference: input.externalReference } : {}),
    };
  } catch {
    return { grossAmountRub: Number(deal.grossAmountRub), partnerId: deal.partnerId ?? undefined };
  }
}

function providerPaymentMatchesDeal(deal: typeof financialDealsTable.$inferSelect, payment: YooKassaPayment): boolean {
  const expected = parseRub(deal.netAmountRub);
  const actual = payment.amount?.value ? parseRub(payment.amount.value) : null;
  if (!expected.ok || !actual?.ok) return false;
  return expected.cents === actual.cents && payment.amount?.currency === deal.currency;
}

async function settleVerifiedPurchase(
  dealId: number,
  payment: YooKassaPayment,
): Promise<{ deal: typeof financialDealsTable.$inferSelect; idempotent: boolean }> {
  if (payment.status !== "succeeded") {
    throw new Error("PAYMENT_NOT_SUCCEEDED");
  }

  return db.transaction(async (tx) => {
    const [deal] = await tx.select().from(financialDealsTable).where(eq(financialDealsTable.id, dealId)).for("update");
    if (!deal) throw new Error("DEAL_NOT_FOUND");
    if (deal.status === "settled" || deal.status === "refunded") return { deal, idempotent: true };
    if (deal.providerPaymentId !== payment.id || !providerPaymentMatchesDeal(deal, payment)) {
      await tx.update(financialDealsTable).set({
        status: "payment_failed",
        providerPaymentStatus: payment.status,
        paymentFailureReason: "Provider amount or currency did not match the server quote",
        paymentUpdatedAt: new Date(),
      }).where(eq(financialDealsTable.id, dealId));
      const [updated] = await tx.select().from(financialDealsTable).where(eq(financialDealsTable.id, dealId)).limit(1);
      if (!updated) throw new Error("DEAL_NOT_FOUND");
      return { deal: updated, idempotent: false };
    }

    const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, deal.userId)).for("update");
    if (!user) throw new Error("USER_NOT_FOUND");
    const redeemed = parseRub(deal.bonusRedeemedRub);
    if (!redeemed.ok) throw new Error("INVALID_REDEMPTION");
    const currentBalance = legacyBalanceCents(user);
    const nextBalance = currentBalance - redeemed.cents;
    if (nextBalance < 0n) {
      await tx.update(financialDealsTable).set({
        providerPaymentStatus: payment.status,
        paymentFailureReason: "Bonus balance changed before provider confirmation",
        paymentUpdatedAt: new Date(),
      }).where(eq(financialDealsTable.id, dealId));
      const [updated] = await tx.select().from(financialDealsTable).where(eq(financialDealsTable.id, dealId)).limit(1);
      if (!updated) throw new Error("DEAL_NOT_FOUND");
      return { deal: updated, idempotent: false };
    }

    const [legacyTransaction] = await tx.insert(transactionsTable).values({
      userId: deal.userId,
      partnerId: deal.partnerId,
      type: "redeem",
      category: "other",
      amountRub: deal.bonusRedeemedRub,
      pointsEarned: legacyPointsForCents(redeemed.cents),
      multiplier: "1.0",
      description: `Списание бонусами по покупке #${deal.id}`,
    }).returning({ id: transactionsTable.id });

    await tx.insert(financialLedgerEntriesTable).values([
      {
        dealId: deal.id,
        userId: deal.userId,
        transactionId: legacyTransaction.id,
        entryType: "debit",
        source: "partner_purchase",
        reference: `deal:${deal.id}:bonus-redemption`,
        idempotencyKey: `${deal.idempotencyKey}:bonus-debit`,
        amountRub: deal.bonusRedeemedRub,
        balanceAfterRub: money(centsToRub(nextBalance)),
      },
      {
        dealId: deal.id,
        userId: null,
        entryType: "credit",
        source: "partner_fee",
        reference: `deal:${deal.id}:partner-fee`,
        idempotencyKey: `${deal.idempotencyKey}:partner-fee`,
        amountRub: deal.feeAmountRub,
        balanceAfterRub: null,
      },
    ]);

    await tx.update(usersTable).set({
      bonusBalanceRub: money(centsToRub(nextBalance)),
      pointsBalance: Math.max(0, user.pointsBalance - legacyPointsForCents(redeemed.cents)),
    }).where(eq(usersTable.id, deal.userId));

    const [settled] = await tx.update(financialDealsTable).set({
      status: "settled",
      providerPaymentStatus: payment.status,
      paymentFailureReason: null,
      paymentUpdatedAt: new Date(),
      settledAt: new Date(),
    }).where(eq(financialDealsTable.id, dealId)).returning();
    if (!settled) throw new Error("DEAL_NOT_FOUND");
    return { deal: settled, idempotent: false };
  });
}

async function settleVerifiedRental(
  dealId: number,
  payment: YooKassaPayment,
): Promise<typeof financialDealsTable.$inferSelect> {
  if (payment.status !== "succeeded") throw new Error("PAYMENT_NOT_SUCCEEDED");

  return db.transaction(async (tx) => {
    const [deal] = await tx.select().from(financialDealsTable).where(eq(financialDealsTable.id, dealId)).for("update");
    if (!deal) throw new Error("DEAL_NOT_FOUND");
    if (deal.kind !== "rental_deal") throw new Error("PAYMENT_DEAL_MISMATCH");
    if (deal.status === "settled" || deal.status === "refunded") return deal;
    if (deal.providerPaymentId !== payment.id || !providerPaymentMatchesDeal(deal, payment)) {
      const [failed] = await tx.update(financialDealsTable).set({
        status: "payment_failed",
        providerPaymentStatus: payment.status,
        paymentFailureReason: "Provider amount or currency did not match the server quote",
        paymentUpdatedAt: new Date(),
      }).where(eq(financialDealsTable.id, dealId)).returning();
      if (!failed) throw new Error("DEAL_NOT_FOUND");
      return failed;
    }

    if (!deal.leaseId) throw new Error("LEASE_NOT_FOUND");
    const [tenant] = await tx.select().from(usersTable).where(eq(usersTable.id, deal.userId)).for("update");
    const [lease] = await tx.select().from(leasesTable).where(
      and(eq(leasesTable.id, deal.leaseId), eq(leasesTable.userId, deal.userId)),
    ).limit(1);
    if (!tenant || !lease) throw new Error("LEASE_NOT_FOUND");
    const landlordId = lease.landlordUserId;
    if (!landlordId || landlordId === deal.userId) throw new Error("LANDLORD_REQUIRED");
    const [landlord] = await tx.select().from(usersTable).where(eq(usersTable.id, landlordId)).for("update");
    if (!landlord) throw new Error("LANDLORD_NOT_FOUND");

    const tenantBonus = parseRub(deal.tenantBonusRub);
    const landlordBonus = parseRub(deal.landlordBonusRub);
    if (!tenantBonus.ok || !landlordBonus.ok) throw new Error("INVALID_RENTAL_BONUS");
    const tenantNext = legacyBalanceCents(tenant) + tenantBonus.cents;
    const landlordNext = legacyBalanceCents(landlord) + landlordBonus.cents;

    const [tenantParticipant] = await tx.insert(financialDealParticipantsTable).values({
      dealId: deal.id,
      userId: deal.userId,
      role: "tenant",
      bonusAmountRub: deal.tenantBonusRub,
    }).returning();
    const [landlordParticipant] = await tx.insert(financialDealParticipantsTable).values({
      dealId: deal.id,
      userId: landlordId,
      role: "landlord",
      bonusAmountRub: deal.landlordBonusRub,
    }).returning();
    const [tenantTransaction] = await tx.insert(transactionsTable).values({
      userId: deal.userId,
      type: "bonus",
      category: "rent",
      amountRub: deal.grossAmountRub,
      pointsEarned: legacyPointsForCents(tenantBonus.cents),
      multiplier: "1.0",
      description: `Бонус арендатора по сделке #${deal.id}`,
    }).returning({ id: transactionsTable.id });
    const [landlordTransaction] = await tx.insert(transactionsTable).values({
      userId: landlordId,
      type: "bonus",
      category: "rent",
      amountRub: deal.grossAmountRub,
      pointsEarned: legacyPointsForCents(landlordBonus.cents),
      multiplier: "1.0",
      description: `Бонус арендодателя по сделке #${deal.id}`,
    }).returning({ id: transactionsTable.id });

    await tx.insert(financialLedgerEntriesTable).values([
      {
        dealId: deal.id,
        userId: deal.userId,
        transactionId: tenantTransaction.id,
        entryType: "credit",
        source: "rental_deal",
        reference: `deal:${deal.id}:tenant-bonus`,
        idempotencyKey: `${deal.idempotencyKey}:tenant-bonus`,
        amountRub: deal.tenantBonusRub,
        balanceAfterRub: money(centsToRub(tenantNext)),
      },
      {
        dealId: deal.id,
        userId: landlordId,
        transactionId: landlordTransaction.id,
        entryType: "credit",
        source: "rental_deal",
        reference: `deal:${deal.id}:landlord-bonus`,
        idempotencyKey: `${deal.idempotencyKey}:landlord-bonus`,
        amountRub: deal.landlordBonusRub,
        balanceAfterRub: money(centsToRub(landlordNext)),
      },
      {
        dealId: deal.id,
        userId: null,
        entryType: "debit",
        source: "landlord_fee",
        reference: `deal:${deal.id}:landlord-fee`,
        idempotencyKey: `${deal.idempotencyKey}:landlord-fee`,
        amountRub: deal.feeAmountRub,
        balanceAfterRub: null,
      },
    ]);

    await tx.update(usersTable).set({
      bonusBalanceRub: money(centsToRub(tenantNext)),
      pointsBalance: tenant.pointsBalance + legacyPointsForCents(tenantBonus.cents),
    }).where(eq(usersTable.id, deal.userId));
    await tx.update(usersTable).set({
      bonusBalanceRub: money(centsToRub(landlordNext)),
      pointsBalance: landlord.pointsBalance + legacyPointsForCents(landlordBonus.cents),
    }).where(eq(usersTable.id, landlordId));

    void tenantParticipant;
    void landlordParticipant;
    const [settled] = await tx.update(financialDealsTable).set({
      status: "settled",
      providerPaymentStatus: payment.status,
      paymentFailureReason: null,
      paymentUpdatedAt: new Date(),
      settledAt: new Date(),
    }).where(eq(financialDealsTable.id, dealId)).returning();
    if (!settled) throw new Error("DEAL_NOT_FOUND");
    return settled;
  });
}

async function applyProviderPaymentStatus(
  deal: typeof financialDealsTable.$inferSelect,
  payment: YooKassaPayment,
): Promise<typeof financialDealsTable.$inferSelect> {
  if (payment.id !== deal.providerPaymentId) throw new Error("PAYMENT_DEAL_MISMATCH");
  if (deal.status === "settled" || deal.status === "refunded") return deal;
  if (payment.status === "succeeded") {
    return deal.kind === "rental_deal"
      ? await settleVerifiedRental(deal.id, payment)
      : (await settleVerifiedPurchase(deal.id, payment)).deal;
  }

  const status = payment.status === "canceled" ? "cancelled" : "pending";
  const [updated] = await db.update(financialDealsTable).set({
    status,
    providerPaymentStatus: payment.status,
    paymentFailureReason: payment.status === "canceled" ? payment.cancellation_details?.reason ?? "Payment cancelled by provider" : null,
    paymentUpdatedAt: new Date(),
  }).where(eq(financialDealsTable.id, deal.id)).returning();
  if (!updated) throw new Error("DEAL_NOT_FOUND");
  return updated;
}

router.get("/policy", async (req, res) => {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const [policy] = await db
    .select()
    .from(financialPoliciesTable)
    .orderBy(desc(financialPoliciesTable.effectiveFrom), desc(financialPoliciesTable.version))
    .limit(1);
  if (!policy) {
    res.status(503).json({ error: "Financial policy is not initialized" });
    return;
  }
  res.json({
    id: policy.id,
    version: policy.version,
    currency: policy.currency,
    purchaseRedemptionRate: Number(policy.purchaseRedemptionRate),
    partnerFeeRate: Number(policy.partnerFeeRate),
    rentalBonusRate: Number(policy.rentalBonusRate),
    effectiveFrom: policy.effectiveFrom.toISOString(),
  });
});

router.post("/quotes/purchase", async (req, res) => {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const parsed = QuotePartnerPurchaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  const policy = await getCurrentPolicy();
  if (!policy) {
    res.status(503).json({ error: "Financial policy is not initialized" });
    return;
  }
  const userId = getUserIdFromReq(req);
  const [user] = await db
    .select({ pointsBalance: usersTable.pointsBalance, bonusBalanceRub: usersTable.bonusBalanceRub })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const availableBonusRub = centsToRub(legacyBalanceCents(user));
  const quote = quotePartnerPurchase({ ...parsed.data, availableBonusRub, policy });
  res.status(quote.valid ? 200 : 422).json(quote);
});

router.post("/quotes/rental", async (req, res) => {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const parsed = QuoteRentalDealBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  const policy = await getCurrentPolicy();
  if (!policy) {
    res.status(503).json({ error: "Financial policy is not initialized" });
    return;
  }
  const quote = quoteRentalDeal({ ...parsed.data, policy });
  res.status(quote.valid ? 200 : 422).json(quote);
});

router.post("/purchases/checkout", async (req, res) => {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const parsed = CreatePurchaseCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  const key = getIdempotencyKey(req, parsed.data);
  if (!key) {
    res.status(400).json({ error: "Idempotency-Key is required" });
    return;
  }
  const userId = getUserIdFromReq(req);
  const policy = await getCurrentPolicy();
  if (!policy) {
    res.status(503).json({ error: "Financial policy is not initialized" });
    return;
  }

  try {
    const paymentMethod = parsed.data.paymentMethod ?? "mir_pay";
    const created = await db.transaction(async (tx) => {
      const requestFingerprint = fingerprint({ ...parsed.data, paymentMethod });
      const [existing] = await tx.select().from(financialDealsTable).where(
        and(eq(financialDealsTable.userId, userId), eq(financialDealsTable.idempotencyKey, key)),
      ).limit(1);
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) throw Object.assign(new Error("IDEMPOTENCY_CONFLICT"), { status: 409 });
        return { deal: existing, quote: null, idempotent: true };
      }

      const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).for("update");
      if (!user) throw Object.assign(new Error("USER_NOT_FOUND"), { status: 404 });
      const [lockedExisting] = await tx.select().from(financialDealsTable).where(
        and(eq(financialDealsTable.userId, userId), eq(financialDealsTable.idempotencyKey, key)),
      ).limit(1);
      if (lockedExisting) {
        if (lockedExisting.requestFingerprint !== requestFingerprint) throw Object.assign(new Error("IDEMPOTENCY_CONFLICT"), { status: 409 });
        return { deal: lockedExisting, quote: null, idempotent: true };
      }
      if (parsed.data.partnerId) {
        const [partner] = await tx.select({ id: partnersTable.id }).from(partnersTable).where(
          and(eq(partnersTable.id, parsed.data.partnerId), eq(partnersTable.isActive, true)),
        ).limit(1);
        if (!partner) throw Object.assign(new Error("PARTNER_NOT_FOUND"), { status: 404 });
      }

      const quote = quotePartnerPurchase({
        grossAmountRub: parsed.data.grossAmountRub,
        requestedBonusRub: parsed.data.requestedBonusRub,
        availableBonusRub: centsToRub(legacyBalanceCents(user)),
        policy,
      });
      if (!quote.valid) throw Object.assign(new Error(JSON.stringify(quote.errors)), { status: 422 });

      const [deal] = await tx.insert(financialDealsTable).values({
        kind: "partner_purchase",
        userId,
        partnerId: parsed.data.partnerId ?? null,
        policyId: policy.id,
        status: "pending",
        externalReference: parsed.data.externalReference ?? null,
        idempotencyKey: key,
        requestFingerprint,
        paymentProvider: "yookassa",
        paymentMethod,
        providerPaymentStatus: "pending",
        paymentUpdatedAt: new Date(),
        currency: "RUB",
        grossAmountRub: money(quote.grossAmountRub),
        bonusRedeemedRub: money(quote.bonusRedeemedRub),
        netAmountRub: money(quote.netAmountRub),
        feeAmountRub: money(quote.partnerFeeRub),
        landlordBonusRub: "0.00",
        tenantBonusRub: "0.00",
      }).returning();
      if (!deal) throw new Error("DEAL_NOT_CREATED");
      return { deal, quote, idempotent: false };
    });

    if (created.idempotent || created.deal.status !== "pending") {
      const input = purchaseInputFromDeal(created.deal);
      const [user] = await db.select({ pointsBalance: usersTable.pointsBalance, bonusBalanceRub: usersTable.bonusBalanceRub })
        .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      const quote = created.quote ?? quotePartnerPurchase({
        grossAmountRub: input.grossAmountRub,
        requestedBonusRub: input.requestedBonusRub,
        availableBonusRub: centsToRub(legacyBalanceCents(user ?? { pointsBalance: 0, bonusBalanceRub: null }) + BigInt(Math.round(Number(created.deal.bonusRedeemedRub) * 100))),
        policy,
      });
      res.status(200).json({
        deal: await formatDeal(created.deal),
        quote,
        checkoutUrl: created.deal.providerCheckoutUrl,
        paymentStatus: paymentStatusForDeal(created.deal),
      });
      return;
    }

    let payment: YooKassaPayment;
    try {
      payment = await createYooKassaPayment({
        amountRub: Number(created.deal.netAmountRub),
        description: `Покупка у партнёра #${created.deal.id}`,
        returnUrl: publicAppUrl(req, `/calculator?payment=${created.deal.id}`),
        idempotencyKey: key,
        paymentMethod,
        metadata: {
          dealId: String(created.deal.id),
          userId: String(userId),
          paymentMethod,
        },
      });
    } catch (error) {
      req.log.error({ err: error, dealId: created.deal.id }, "YooKassa checkout creation failed");
      const [failed] = await db.update(financialDealsTable).set({
        status: "payment_failed",
        providerPaymentStatus: "canceled",
        paymentFailureReason: error instanceof Error ? error.message : "Provider checkout failed",
        paymentUpdatedAt: new Date(),
      }).where(eq(financialDealsTable.id, created.deal.id)).returning();
      res.status(502).json({
        error: "Не удалось открыть checkout провайдера",
        code: "PROVIDER_CHECKOUT_FAILED",
        deal: failed ? await formatDeal(failed) : await formatDeal(created.deal),
      });
      return;
    }

    const providerStatus = payment.status === "canceled" ? "cancelled" : "pending";
    const [updated] = await db.update(financialDealsTable).set({
      providerPaymentId: payment.id,
      providerPaymentStatus: payment.status,
      providerCheckoutUrl: payment.confirmation?.confirmation_url ?? null,
      paymentFailureReason: payment.status === "canceled"
        ? payment.cancellation_details?.reason ?? "Payment cancelled by provider"
        : null,
      paymentUpdatedAt: new Date(),
      status: providerStatus,
    }).where(eq(financialDealsTable.id, created.deal.id)).returning();
    if (!updated) {
      res.status(500).json({ error: "Unable to save provider checkout" });
      return;
    }
    res.status(201).json({
      deal: await formatDeal(updated),
      quote: created.quote,
      checkoutUrl: updated.providerCheckoutUrl,
      paymentStatus: paymentStatusForDeal(updated),
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    if ((error as Error).message === "IDEMPOTENCY_CONFLICT") {
      res.status(409).json({ error: "Idempotency key was already used with different data" });
      return;
    }
    if (status === 422) {
      let reasons: unknown;
      try { reasons = JSON.parse((error as Error).message); } catch { reasons = undefined; }
      res.status(422).json({ error: "Financial quote is invalid", reasons });
      return;
    }
    if (status === 404) {
      res.status(404).json({ error: "User or partner not found" });
      return;
    }
    req.log.error({ err: error }, "Unable to create purchase checkout");
    res.status(500).json({ error: "Unable to create purchase checkout" });
  }
});

router.get("/purchases/:id/status", async (req, res) => {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = Number(rawId);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid purchase id" });
    return;
  }
  const userId = getUserIdFromReq(req);
  const [deal] = await db.select().from(financialDealsTable).where(
    and(eq(financialDealsTable.id, id), eq(financialDealsTable.userId, userId)),
  ).limit(1);
  if (!deal) {
    res.status(404).json({ error: "Purchase not found" });
    return;
  }
  if (!deal.providerPaymentId) {
    res.json({ deal: await formatDeal(deal), paymentStatus: paymentStatusForDeal(deal), providerPaymentId: null, message: deal.paymentFailureReason });
    return;
  }

  try {
    const payment = await getYooKassaPayment(deal.providerPaymentId);
    const updated = await applyProviderPaymentStatus(deal, payment);
    res.json({
      deal: await formatDeal(updated),
      paymentStatus: paymentStatusForDeal(updated),
      providerPaymentId: payment.id,
      message: updated.paymentFailureReason,
    });
  } catch (error) {
    if ((error as Error).message === "PAYMENT_DEAL_MISMATCH") {
      res.status(409).json({ error: "Provider payment does not belong to this purchase" });
      return;
    }
    if ((error as Error).message === "PAYMENT_NOT_SUCCEEDED") {
      res.status(409).json({ error: "Provider payment is not completed yet", code: "PAYMENT_PENDING" });
      return;
    }
    req.log.error({ err: error, dealId: id }, "Unable to verify YooKassa payment");
    res.status(error instanceof YooKassaError ? 502 : 500).json({ error: "Не удалось проверить статус оплаты" });
  }
});

router.post("/rentals/checkout", async (req, res) => {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const parsed = CreateRentalCheckoutBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  const key = getIdempotencyKey(req, parsed.data);
  if (!key) {
    res.status(400).json({ error: "Idempotency-Key is required" });
    return;
  }
  const userId = getUserIdFromReq(req);
  const policy = await getCurrentPolicy();
  if (!policy) {
    res.status(503).json({ error: "Financial policy is not initialized" });
    return;
  }

  try {
    const paymentMethod = parsed.data.paymentMethod ?? "mir_pay";
    const created = await db.transaction(async (tx) => {
      const requestFingerprint = fingerprint({ ...parsed.data, paymentMethod });
      const [existing] = await tx.select().from(financialDealsTable).where(
        and(eq(financialDealsTable.userId, userId), eq(financialDealsTable.idempotencyKey, key)),
      ).limit(1);
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) {
          throw Object.assign(new Error("IDEMPOTENCY_CONFLICT"), { status: 409 });
        }
        return { deal: existing, quote: null, idempotent: true };
      }

      const [tenant] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).for("update");
      const [lease] = await tx.select().from(leasesTable).where(
        and(eq(leasesTable.id, parsed.data.leaseId), eq(leasesTable.userId, userId), eq(leasesTable.isActive, true)),
      ).limit(1);
      if (!tenant || !lease) throw Object.assign(new Error("LEASE_NOT_FOUND"), { status: 404 });
      if (!lease.landlordUserId || lease.landlordUserId === userId) {
        throw Object.assign(new Error("LANDLORD_REQUIRED"), { status: 422 });
      }
      const [landlord] = await tx.select({ id: usersTable.id }).from(usersTable).where(
        eq(usersTable.id, lease.landlordUserId),
      ).limit(1);
      if (!landlord) throw Object.assign(new Error("LANDLORD_NOT_FOUND"), { status: 404 });

      const quote = quoteRentalDeal({ grossAmountRub: parsed.data.grossAmountRub, policy });
      if (!quote.valid) throw Object.assign(new Error(JSON.stringify(quote.errors)), { status: 422 });
      const [deal] = await tx.insert(financialDealsTable).values({
        kind: "rental_deal",
        userId,
        leaseId: lease.id,
        policyId: policy.id,
        status: "pending",
        externalReference: parsed.data.externalReference ?? null,
        idempotencyKey: key,
        requestFingerprint,
        paymentProvider: "yookassa",
        paymentMethod,
        providerPaymentStatus: "pending",
        paymentUpdatedAt: new Date(),
        currency: "RUB",
        grossAmountRub: money(quote.grossAmountRub),
        bonusRedeemedRub: "0.00",
        netAmountRub: money(quote.grossAmountRub),
        feeAmountRub: money(quote.landlordFeeRub),
        landlordBonusRub: money(quote.landlordBonusRub),
        tenantBonusRub: money(quote.tenantBonusRub),
      }).returning();
      if (!deal) throw new Error("DEAL_NOT_CREATED");
      return { deal, quote, idempotent: false };
    });

    if (created.idempotent || created.deal.status !== "pending") {
      const quote = created.quote ?? quoteRentalDeal({
        grossAmountRub: Number(created.deal.grossAmountRub),
        policy,
      });
      res.status(200).json({
        deal: await formatDeal(created.deal),
        quote,
        checkoutUrl: created.deal.providerCheckoutUrl,
        paymentStatus: paymentStatusForDeal(created.deal),
      });
      return;
    }

    let payment: YooKassaPayment;
    try {
      payment = await createYooKassaPayment({
        amountRub: Number(created.deal.netAmountRub),
        description: `Арендный платёж #${created.deal.id}`,
        returnUrl: publicAppUrl(req, `/calculator?payment=${created.deal.id}&kind=rental`),
        idempotencyKey: key,
        paymentMethod,
        metadata: {
          dealId: String(created.deal.id),
          userId: String(userId),
          dealType: "rental_deal",
          paymentMethod,
        },
      });
    } catch (error) {
      req.log.error({ err: error, dealId: created.deal.id }, "YooKassa rental checkout creation failed");
      const [failed] = await db.update(financialDealsTable).set({
        status: "payment_failed",
        providerPaymentStatus: "canceled",
        paymentFailureReason: error instanceof Error ? error.message : "Provider checkout failed",
        paymentUpdatedAt: new Date(),
      }).where(eq(financialDealsTable.id, created.deal.id)).returning();
      res.status(502).json({
        error: "Не удалось открыть checkout провайдера",
        code: "PROVIDER_CHECKOUT_FAILED",
        deal: failed ? await formatDeal(failed) : await formatDeal(created.deal),
      });
      return;
    }

    const providerStatus = payment.status === "canceled" ? "cancelled" : "pending";
    const [updated] = await db.update(financialDealsTable).set({
      providerPaymentId: payment.id,
      providerPaymentStatus: payment.status,
      providerCheckoutUrl: payment.confirmation?.confirmation_url ?? null,
      paymentFailureReason: payment.status === "canceled"
        ? payment.cancellation_details?.reason ?? "Payment cancelled by provider"
        : null,
      paymentUpdatedAt: new Date(),
      status: providerStatus,
    }).where(eq(financialDealsTable.id, created.deal.id)).returning();
    if (!updated) {
      res.status(500).json({ error: "Unable to save provider checkout" });
      return;
    }
    res.status(201).json({
      deal: await formatDeal(updated),
      quote: created.quote,
      checkoutUrl: updated.providerCheckoutUrl,
      paymentStatus: paymentStatusForDeal(updated),
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    if ((error as Error).message === "IDEMPOTENCY_CONFLICT") {
      res.status(409).json({ error: "Idempotency key was already used with different data" });
      return;
    }
    if ((error as Error).message === "LEASE_NOT_FOUND") {
      res.status(404).json({ error: "Active lease not found" });
      return;
    }
    if ((error as Error).message === "LANDLORD_REQUIRED") {
      res.status(422).json({ error: "Rental lease has no valid landlord" });
      return;
    }
    if ((error as Error).message === "LANDLORD_NOT_FOUND") {
      res.status(404).json({ error: "Landlord not found" });
      return;
    }
    if (status === 422) {
      let reasons: unknown;
      try { reasons = JSON.parse((error as Error).message); } catch { reasons = undefined; }
      res.status(422).json({ error: "Rental quote is invalid", reasons });
      return;
    }
    req.log.error({ err: error }, "Unable to create rental checkout");
    res.status(500).json({ error: "Unable to create rental checkout" });
  }
});

router.get("/rentals/:id/status", async (req, res) => {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = Number(rawId);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid rental payment id" });
    return;
  }
  const userId = getUserIdFromReq(req);
  const [deal] = await db.select().from(financialDealsTable).where(
    and(eq(financialDealsTable.id, id), eq(financialDealsTable.userId, userId), eq(financialDealsTable.kind, "rental_deal")),
  ).limit(1);
  if (!deal) {
    res.status(404).json({ error: "Rental payment not found" });
    return;
  }
  if (!deal.providerPaymentId) {
    res.json({
      deal: await formatDeal(deal),
      paymentStatus: paymentStatusForDeal(deal),
      providerPaymentId: null,
      message: deal.paymentFailureReason,
    });
    return;
  }
  try {
    const payment = await getYooKassaPayment(deal.providerPaymentId);
    const updated = await applyProviderPaymentStatus(deal, payment);
    res.json({
      deal: await formatDeal(updated),
      paymentStatus: paymentStatusForDeal(updated),
      providerPaymentId: payment.id,
      message: updated.paymentFailureReason
        ?? (updated.status === "settled" ? "Платёж подтверждён, бонус начислен" : null),
    });
  } catch (error) {
    if ((error as Error).message === "PAYMENT_DEAL_MISMATCH") {
      res.status(409).json({ error: "Provider payment does not belong to this rental" });
      return;
    }
    req.log.error({ err: error, dealId: id }, "Unable to verify YooKassa rental payment");
    res.status(error instanceof YooKassaError ? 502 : 500).json({
      error: error instanceof YooKassaError ? "Не удалось проверить статус оплаты у провайдера" : "Не удалось проверить статус оплаты",
    });
  }
});

router.post("/payment-reconciliation/:id/resolve", requireAdmin, async (req, res) => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id < 1) {
    res.status(400).json({ error: "Invalid payment id" });
    return;
  }

  const [deal] = await db
    .select()
    .from(financialDealsTable)
    .where(eq(financialDealsTable.id, id))
    .limit(1);
  if (!deal) {
    res.status(404).json({ error: "Payment not found" });
    return;
  }
  if (!deal.providerPaymentId) {
    res.status(409).json({
      error: "This payment has no provider payment id and cannot be verified",
      code: "PAYMENT_PROVIDER_ID_MISSING",
    });
    return;
  }

  try {
    const payment = await getYooKassaPayment(deal.providerPaymentId);
    const updated = await applyProviderPaymentStatus(deal, payment);
    const alreadyResolved = deal.status === "settled" || deal.status === "refunded";
    res.json({
      deal: await formatDeal(updated),
      paymentStatus: paymentStatusForDeal(updated),
      providerPaymentId: payment.id,
      message: updated.paymentFailureReason
        ?? (updated.status === "settled"
          ? "Платёж подтверждён, сделка проведена"
          : "Провайдер ещё не подтвердил оплату"),
      idempotent: alreadyResolved,
    });
  } catch (error) {
    if ((error as Error).message === "PAYMENT_DEAL_MISMATCH") {
      res.status(409).json({ error: "Provider payment does not belong to this purchase", code: "PAYMENT_DEAL_MISMATCH" });
      return;
    }
    req.log.error({ err: error, dealId: id }, "Unable to resolve payment reconciliation");
    res.status(error instanceof YooKassaError ? 502 : 500).json({
      error: error instanceof YooKassaError ? "Не удалось проверить статус оплаты у провайдера" : "Не удалось разрешить платёж",
    });
  }
});

router.post("/yookassa/webhook", async (req, res) => {
  if (!isYooKassaWebhookIp(req.ip)) {
    const securityEvent = {
      sourceIp: req.ip ?? null,
    };
    recordSecurityEvent(YOOKASSA_WEBHOOK_REJECTION_EVENT, securityEvent);
    try {
      await persistSecurityEvent(YOOKASSA_WEBHOOK_REJECTION_EVENT, securityEvent);
    } catch (error) {
      // A rejected webhook must remain rejected even if the operational
      // history is temporarily unavailable; the structured log still records
      // the event and its process-local repeat count.
      req.log.error({ err: error }, "Unable to persist rejected webhook source");
    }
    res.status(401).json({ error: "Invalid YooKassa webhook authentication" });
    return;
  }
  const event = req.body as { object?: { id?: unknown } };
  const paymentId = event.object?.id;
  if (typeof paymentId !== "string" || !paymentId) {
    res.status(400).json({ error: "Invalid YooKassa notification" });
    return;
  }
  try {
    const payment = await getYooKassaPayment(paymentId);
    const dealId = payment.metadata?.dealId ? Number(payment.metadata.dealId) : NaN;
    if (Number.isInteger(dealId)) {
      const [deal] = await db.select().from(financialDealsTable).where(
        and(eq(financialDealsTable.id, dealId), eq(financialDealsTable.providerPaymentId, payment.id)),
      ).limit(1);
      if (deal) await applyProviderPaymentStatus(deal, payment);
    }
    res.json({ received: true });
  } catch (error) {
    req.log.error({ err: error, paymentId }, "Unable to process YooKassa webhook");
    res.status(error instanceof YooKassaError ? 502 : 500).json({ error: "Unable to process payment notification" });
  }
});

router.post("/purchases/settle", async (_req, res) => {
  res.status(410).json({
    error: "Direct settlement is disabled; create a provider checkout first",
    code: "PAYMENT_REQUIRED",
  });
});

// Test-only seam. It is intentionally outside the public contract and is
// executable only by the isolated integration test process.
router.post("/test/purchases/settle", async (req, res) => {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (process.env.NODE_ENV !== "test") {
    res.status(404).json({ error: "Test settlement seam is unavailable" });
    return;
  }
  const parsed = TestPurchaseSettlementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  const key = getIdempotencyKey(req, parsed.data);
  if (!key) {
    res.status(400).json({ error: "Idempotency-Key is required" });
    return;
  }
  const userId = getUserIdFromReq(req);
  const policy = await getCurrentPolicy();
  if (!policy) {
    res.status(503).json({ error: "Financial policy is not initialized" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const requestFingerprint = fingerprint(parsed.data);
      const [existing] = await tx
        .select()
        .from(financialDealsTable)
        .where(and(eq(financialDealsTable.userId, userId), eq(financialDealsTable.idempotencyKey, key)))
        .limit(1);
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) {
          const error = new Error("IDEMPOTENCY_CONFLICT");
          (error as Error & { status?: number }).status = 409;
          throw error;
        }
        const [currentUser] = await tx
          .select()
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1);
        const redeemed = parseRub(existing.bonusRedeemedRub);
        return {
          deal: existing,
          idempotent: true,
          availableBeforeRub: currentUser && redeemed.ok
            ? centsToRub(legacyBalanceCents(currentUser) + redeemed.cents)
            : Number(existing.bonusRedeemedRub),
        };
      }

      const [user] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .for("update");
      if (!user) {
        const error = new Error("USER_NOT_FOUND");
        (error as Error & { status?: number }).status = 404;
        throw error;
      }
      // A concurrent request with the same key can only become visible after
      // the user row lock is acquired. Re-check it here to avoid a unique-key
      // race turning an idempotent replay into a 500 response.
      const [lockedExisting] = await tx
        .select()
        .from(financialDealsTable)
        .where(and(eq(financialDealsTable.userId, userId), eq(financialDealsTable.idempotencyKey, key)))
        .limit(1);
      if (lockedExisting) {
        if (lockedExisting.requestFingerprint !== requestFingerprint) {
          const error = new Error("IDEMPOTENCY_CONFLICT");
          (error as Error & { status?: number }).status = 409;
          throw error;
        }
        const redeemed = parseRub(lockedExisting.bonusRedeemedRub);
        return {
          deal: lockedExisting,
          idempotent: true,
          availableBeforeRub: redeemed.ok
            ? centsToRub(legacyBalanceCents(user) + redeemed.cents)
            : Number(lockedExisting.bonusRedeemedRub),
        };
      }

      const partner = parsed.data.partnerId
        ? (await tx.select({ id: partnersTable.id }).from(partnersTable).where(and(eq(partnersTable.id, parsed.data.partnerId), eq(partnersTable.isActive, true))).limit(1))[0]
        : null;
      if (parsed.data.partnerId && !partner) {
        const error = new Error("PARTNER_NOT_FOUND");
        (error as Error & { status?: number }).status = 404;
        throw error;
      }

      const quote = quotePartnerPurchase({
        ...parsed.data,
        availableBonusRub: centsToRub(legacyBalanceCents(user)),
        policy,
      });
      if (!quote.valid) {
        const error = new Error(JSON.stringify(quote.errors));
        (error as Error & { status?: number }).status = 422;
        throw error;
      }

      const [deal] = await tx
        .insert(financialDealsTable)
        .values({
          kind: "partner_purchase",
          userId,
          partnerId: parsed.data.partnerId ?? null,
          policyId: policy.id,
          status: "settled",
          externalReference: parsed.data.externalReference ?? null,
          idempotencyKey: key,
          requestFingerprint,
          currency: "RUB",
          grossAmountRub: money(quote.grossAmountRub),
          bonusRedeemedRub: money(quote.bonusRedeemedRub),
          netAmountRub: money(quote.netAmountRub),
          feeAmountRub: money(quote.partnerFeeRub),
          landlordBonusRub: "0.00",
          tenantBonusRub: "0.00",
        })
        .returning();

      const redeemed = parseRub(money(quote.bonusRedeemedRub));
      if (!redeemed.ok) throw new Error("Calculated amount cannot be parsed");
      const currentBalance = legacyBalanceCents(user);
      const nextBalance = currentBalance - redeemed.cents;
      if (nextBalance < 0n) {
        const error = new Error("INSUFFICIENT_BALANCE");
        (error as Error & { status?: number }).status = 409;
        throw error;
      }

      const [legacyTransaction] = await tx
        .insert(transactionsTable)
        .values({
          userId,
          partnerId: parsed.data.partnerId ?? null,
          type: "redeem",
          category: "other",
          amountRub: money(quote.bonusRedeemedRub),
          pointsEarned: legacyPointsForCents(redeemed.cents),
          multiplier: "1.0",
          description: `Списание бонусами по покупке #${deal.id}`,
        })
        .returning({ id: transactionsTable.id });

      await tx.insert(financialLedgerEntriesTable).values([
        {
          dealId: deal.id,
          userId,
          transactionId: legacyTransaction.id,
          entryType: "debit",
          source: "partner_purchase",
          reference: `deal:${deal.id}:bonus-redemption`,
          idempotencyKey: `${key}:bonus-debit`,
          amountRub: money(quote.bonusRedeemedRub),
          balanceAfterRub: money(centsToRub(nextBalance)),
        },
        {
          dealId: deal.id,
          userId: null,
          entryType: "credit",
          source: "partner_fee",
          reference: `deal:${deal.id}:partner-fee`,
          idempotencyKey: `${key}:partner-fee`,
          amountRub: money(quote.partnerFeeRub),
          balanceAfterRub: null,
        },
      ]);

      const pointsBalance = Math.max(0, user.pointsBalance - legacyPointsForCents(redeemed.cents));
      await tx
        .update(usersTable)
        .set({ bonusBalanceRub: money(centsToRub(nextBalance)), pointsBalance })
        .where(eq(usersTable.id, userId));
      return { deal, idempotent: false, availableBeforeRub: centsToRub(currentBalance) };
    });
    res.status(result.idempotent ? 200 : 201).json({
      deal: await formatDeal(result.deal),
      quote: quotePartnerPurchase({
        ...parsed.data,
        availableBonusRub: result.availableBeforeRub,
        policy,
      }),
      idempotent: result.idempotent,
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    if (status === 422) {
      try {
        res.status(422).json({ error: "Financial quote is invalid", reasons: JSON.parse((error as Error).message) });
      } catch {
        res.status(422).json({ error: "Financial quote is invalid" });
      }
      return;
    }
    if ((error as Error).message === "IDEMPOTENCY_CONFLICT") {
      res.status(409).json({ error: "Idempotency key was already used with different data" });
      return;
    }
    if ((error as Error).message === "INSUFFICIENT_BALANCE") {
      res.status(409).json({ error: "Insufficient bonus balance", code: "INSUFFICIENT_BALANCE" });
      return;
    }
    if (status === 404) {
      res.status(404).json({ error: "User or partner not found" });
      return;
    }
    res.status(500).json({ error: "Unable to settle purchase" });
  }
});

router.post("/rentals/settle", async (_req, res) => {
  res.status(410).json({
    error: "Direct settlement is disabled; create a provider checkout first",
    code: "PAYMENT_REQUIRED",
  });
});

// Test-only seam; see the purchase settlement seam above.
router.post("/test/rentals/settle", async (req, res) => {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const parsed = TestRentalSettlementBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  const key = getIdempotencyKey(req, parsed.data);
  if (!key) {
    res.status(400).json({ error: "Idempotency-Key is required" });
    return;
  }
  const userId = getUserIdFromReq(req);
  const policy = await getCurrentPolicy();
  if (!policy) {
    res.status(503).json({ error: "Financial policy is not initialized" });
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const requestFingerprint = fingerprint(parsed.data);
      const [existing] = await tx
        .select()
        .from(financialDealsTable)
        .where(and(eq(financialDealsTable.userId, userId), eq(financialDealsTable.idempotencyKey, key)))
        .limit(1);
      if (existing) {
        if (existing.requestFingerprint !== requestFingerprint) {
          const error = new Error("IDEMPOTENCY_CONFLICT");
          (error as Error & { status?: number }).status = 409;
          throw error;
        }
        return { deal: existing, idempotent: true };
      }

      const [tenant] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).for("update");
      const [lockedExisting] = await tx
        .select()
        .from(financialDealsTable)
        .where(and(eq(financialDealsTable.userId, userId), eq(financialDealsTable.idempotencyKey, key)))
        .limit(1);
      if (lockedExisting) {
        if (lockedExisting.requestFingerprint !== requestFingerprint) {
          const error = new Error("IDEMPOTENCY_CONFLICT");
          (error as Error & { status?: number }).status = 409;
          throw error;
        }
        return { deal: lockedExisting, idempotent: true };
      }
      const [lease] = await tx.select().from(leasesTable).where(and(eq(leasesTable.id, parsed.data.leaseId), eq(leasesTable.userId, userId))).limit(1);
      if (!tenant || !lease) {
        const error = new Error("LEASE_NOT_FOUND");
        (error as Error & { status?: number }).status = 404;
        throw error;
      }
      const landlordId = lease.landlordUserId;
      if (!landlordId || landlordId === userId) {
        const error = new Error("LANDLORD_REQUIRED");
        (error as Error & { status?: number }).status = 422;
        throw error;
      }
      const [landlord] = await tx.select().from(usersTable).where(eq(usersTable.id, landlordId)).for("update");
      if (!landlord) {
        const error = new Error("LANDLORD_NOT_FOUND");
        (error as Error & { status?: number }).status = 404;
        throw error;
      }

      const quote = quoteRentalDeal({ ...parsed.data, policy });
      if (!quote.valid) {
        const error = new Error(JSON.stringify(quote.errors));
        (error as Error & { status?: number }).status = 422;
        throw error;
      }

      const [deal] = await tx.insert(financialDealsTable).values({
        kind: "rental_deal",
        userId,
        leaseId: lease.id,
        policyId: policy.id,
        status: "settled",
        externalReference: parsed.data.externalReference ?? null,
        idempotencyKey: key,
        requestFingerprint,
        currency: "RUB",
        grossAmountRub: money(quote.grossAmountRub),
        bonusRedeemedRub: "0.00",
        netAmountRub: money(quote.grossAmountRub),
        feeAmountRub: money(quote.landlordFeeRub),
        landlordBonusRub: money(quote.landlordBonusRub),
        tenantBonusRub: money(quote.tenantBonusRub),
      }).returning();

      const tenantBonus = parseRub(money(quote.tenantBonusRub));
      const landlordBonus = parseRub(money(quote.landlordBonusRub));
      if (!tenantBonus.ok || !landlordBonus.ok) throw new Error("Calculated amount cannot be parsed");
      const tenantNext = legacyBalanceCents(tenant) + tenantBonus.cents;
      const landlordNext = legacyBalanceCents(landlord) + landlordBonus.cents;

      const [tenantParticipant] = await tx.insert(financialDealParticipantsTable).values({
        dealId: deal.id,
        userId,
        role: "tenant",
        bonusAmountRub: money(quote.tenantBonusRub),
      }).returning();
      const [landlordParticipant] = await tx.insert(financialDealParticipantsTable).values({
        dealId: deal.id,
        userId: landlordId,
        role: "landlord",
        bonusAmountRub: money(quote.landlordBonusRub),
      }).returning();

      const [tenantTransaction] = await tx.insert(transactionsTable).values({
        userId,
        type: "bonus",
        category: "rent",
        amountRub: money(quote.grossAmountRub),
        pointsEarned: legacyPointsForCents(tenantBonus.cents),
        multiplier: "1.0",
        description: `Бонус арендатора по сделке #${deal.id}`,
      }).returning({ id: transactionsTable.id });
      const [landlordTransaction] = await tx.insert(transactionsTable).values({
        userId: landlordId,
        type: "bonus",
        category: "rent",
        amountRub: money(quote.grossAmountRub),
        pointsEarned: legacyPointsForCents(landlordBonus.cents),
        multiplier: "1.0",
        description: `Бонус арендодателя по сделке #${deal.id}`,
      }).returning({ id: transactionsTable.id });

      await tx.insert(financialLedgerEntriesTable).values([
        {
          dealId: deal.id,
          userId,
          transactionId: tenantTransaction.id,
          entryType: "credit",
          source: "rental_deal",
          reference: `deal:${deal.id}:tenant-bonus`,
          idempotencyKey: `${key}:tenant-bonus`,
          amountRub: money(quote.tenantBonusRub),
          balanceAfterRub: money(centsToRub(tenantNext)),
        },
        {
          dealId: deal.id,
          userId: landlordId,
          transactionId: landlordTransaction.id,
          entryType: "credit",
          source: "rental_deal",
          reference: `deal:${deal.id}:landlord-bonus`,
          idempotencyKey: `${key}:landlord-bonus`,
          amountRub: money(quote.landlordBonusRub),
          balanceAfterRub: money(centsToRub(landlordNext)),
        },
        {
          dealId: deal.id,
          userId: null,
          entryType: "debit",
          source: "landlord_fee",
          reference: `deal:${deal.id}:landlord-fee`,
          idempotencyKey: `${key}:landlord-fee`,
          amountRub: money(quote.landlordFeeRub),
          balanceAfterRub: null,
        },
      ]);

      await tx.update(usersTable).set({
        bonusBalanceRub: money(centsToRub(tenantNext)),
        pointsBalance: tenant.pointsBalance + legacyPointsForCents(tenantBonus.cents),
      }).where(eq(usersTable.id, userId));
      await tx.update(usersTable).set({
        bonusBalanceRub: money(centsToRub(landlordNext)),
        pointsBalance: landlord.pointsBalance + legacyPointsForCents(landlordBonus.cents),
      }).where(eq(usersTable.id, landlordId));

      // Keep participant variables visible in the transaction for the type
      // checker and make the relationship explicit in the returned contract.
      void tenantParticipant;
      void landlordParticipant;
      return { deal, idempotent: false };
    });
    res.status(result.idempotent ? 200 : 201).json({
      deal: await formatDeal(result.deal),
      quote: quoteRentalDeal({ ...parsed.data, policy }),
      idempotent: result.idempotent,
    });
  } catch (error) {
    const status = (error as Error & { status?: number }).status ?? 500;
    if ((error as Error).message === "IDEMPOTENCY_CONFLICT") {
      res.status(409).json({ error: "Idempotency key was already used with different data" });
      return;
    }
    if ((error as Error).message === "LEASE_NOT_FOUND") {
      res.status(404).json({ error: "Lease not found" });
      return;
    }
    if (status === 422) {
      res.status(422).json({ error: "Rental quote is invalid", code: (error as Error).message });
      return;
    }
    if (status === 404) {
      res.status(404).json({ error: "Landlord not found" });
      return;
    }
    res.status(500).json({ error: "Unable to settle rental deal" });
  }
});

router.get("/ledger", async (req, res) => {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const userId = getUserIdFromReq(req);
  const limit = Math.min(Math.max(Number(req.query.limit ?? 50), 1), 100);
  const category = typeof req.query.category === "string" && req.query.category.trim()
    ? req.query.category.trim()
    : undefined;
  const partnerId = typeof req.query.partnerId === "string" && Number.isInteger(Number(req.query.partnerId))
    ? Number(req.query.partnerId)
    : undefined;
  const dealType = req.query.dealType === "partner_purchase" || req.query.dealType === "rental_deal"
    ? req.query.dealType
    : undefined;
  const entries = await db
    .select({
      id: financialLedgerEntriesTable.id,
      dealId: financialLedgerEntriesTable.dealId,
      userId: financialLedgerEntriesTable.userId,
      transactionId: financialLedgerEntriesTable.transactionId,
      entryType: financialLedgerEntriesTable.entryType,
      source: financialLedgerEntriesTable.source,
      reference: financialLedgerEntriesTable.reference,
      amountRub: financialLedgerEntriesTable.amountRub,
      balanceAfterRub: financialLedgerEntriesTable.balanceAfterRub,
      reversalOfId: financialLedgerEntriesTable.reversalOfId,
      createdAt: financialLedgerEntriesTable.createdAt,
      dealType: financialDealsTable.kind,
      category: transactionsTable.category,
      transactionType: transactionsTable.type,
      partnerId: financialDealsTable.partnerId,
      partnerName: partnersTable.name,
      settlementStatus: financialDealsTable.status,
      dealGrossAmountRub: financialDealsTable.grossAmountRub,
      dealNetAmountRub: financialDealsTable.netAmountRub,
      dealFeeAmountRub: financialDealsTable.feeAmountRub,
      dealBonusRedeemedRub: financialDealsTable.bonusRedeemedRub,
      dealLandlordBonusRub: financialDealsTable.landlordBonusRub,
      dealTenantBonusRub: financialDealsTable.tenantBonusRub,
      paymentProvider: financialDealsTable.paymentProvider,
      providerPaymentId: financialDealsTable.providerPaymentId,
      providerPaymentStatus: financialDealsTable.providerPaymentStatus,
      providerRefundId: financialDealsTable.providerRefundId,
      providerRefundStatus: financialDealsTable.providerRefundStatus,
      dealIdempotencyKey: financialDealsTable.idempotencyKey,
    })
    .from(financialLedgerEntriesTable)
    .leftJoin(financialDealsTable, eq(financialDealsTable.id, financialLedgerEntriesTable.dealId))
    .leftJoin(transactionsTable, eq(transactionsTable.id, financialLedgerEntriesTable.transactionId))
    .leftJoin(partnersTable, eq(partnersTable.id, financialDealsTable.partnerId))
    .where(and(
      eq(financialLedgerEntriesTable.userId, userId),
      ...(category ? [eq(transactionsTable.category, category)] : []),
      ...(partnerId !== undefined ? [eq(financialDealsTable.partnerId, partnerId)] : []),
      ...(dealType ? [eq(financialDealsTable.kind, dealType)] : []),
    ))
    .orderBy(desc(financialLedgerEntriesTable.createdAt))
    .limit(limit);
  res.json(entries.map((entry) => {
    const amountRub = Number(entry.amountRub);
    return {
      id: entry.id,
      dealId: entry.dealId,
      userId: entry.userId,
      transactionId: entry.transactionId,
      entryType: entry.entryType,
      source: entry.source,
      reference: entry.reference,
      amountRub,
      amountRubSigned: entry.entryType === "debit" ? -amountRub : amountRub,
      balanceAfterRub: entry.balanceAfterRub === null ? null : Number(entry.balanceAfterRub),
      reversalOfId: entry.reversalOfId,
      dealType: entry.dealType,
      category: entry.category ?? (entry.dealType === "rental_deal" ? "rent" : "other"),
      transactionType: entry.transactionType,
      partnerId: entry.partnerId,
      partnerName: entry.partnerName,
      settlementStatus: entry.settlementStatus,
      dealGrossAmountRub: entry.dealGrossAmountRub === null ? null : Number(entry.dealGrossAmountRub),
      dealNetAmountRub: entry.dealNetAmountRub === null ? null : Number(entry.dealNetAmountRub),
      dealFeeAmountRub: entry.dealFeeAmountRub === null ? null : Number(entry.dealFeeAmountRub),
      dealBonusRedeemedRub: entry.dealBonusRedeemedRub === null ? null : Number(entry.dealBonusRedeemedRub),
      dealLandlordBonusRub: entry.dealLandlordBonusRub === null ? null : Number(entry.dealLandlordBonusRub),
      dealTenantBonusRub: entry.dealTenantBonusRub === null ? null : Number(entry.dealTenantBonusRub),
      paymentProvider: entry.paymentProvider,
      providerPaymentId: entry.providerPaymentId,
      providerPaymentStatus: entry.providerPaymentStatus,
      providerRefundId: entry.providerRefundId,
      providerRefundStatus: entry.providerRefundStatus,
      dealIdempotencyKey: entry.dealIdempotencyKey,
      createdAt: entry.createdAt.toISOString(),
    };
  }));
});

router.get("/payment-reconciliation", requireAdmin, async (req, res) => {
  // The administrator alert is backed by this report and is polled by every
  // open admin session. Never let a proxy serve an older queue summary.
  res.set("Cache-Control", "no-store");
  const parsed = ListPaymentReconciliationQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid payment reconciliation query", details: parsed.error.issues });
    return;
  }
  const { status, limit, offset } = parsed.data;
  const statuses = status === "all"
    ? ["pending", "payment_failed", "cancelled"]
    : [status];

  const [rows, counts] = await Promise.all([
    db
      .select({
        id: financialDealsTable.id,
        kind: financialDealsTable.kind,
        status: financialDealsTable.status,
        userId: financialDealsTable.userId,
        userName: usersTable.name,
        userPhone: usersTable.phone,
        partnerId: financialDealsTable.partnerId,
        partnerName: partnersTable.name,
        policyVersion: financialPoliciesTable.version,
        idempotencyKey: financialDealsTable.idempotencyKey,
        grossAmountRub: financialDealsTable.grossAmountRub,
        bonusRedeemedRub: financialDealsTable.bonusRedeemedRub,
        netAmountRub: financialDealsTable.netAmountRub,
        feeAmountRub: financialDealsTable.feeAmountRub,
        landlordBonusRub: financialDealsTable.landlordBonusRub,
        tenantBonusRub: financialDealsTable.tenantBonusRub,
        currency: financialDealsTable.currency,
        paymentProvider: financialDealsTable.paymentProvider,
        paymentMethod: financialDealsTable.paymentMethod,
        providerPaymentId: financialDealsTable.providerPaymentId,
        providerPaymentStatus: financialDealsTable.providerPaymentStatus,
        providerRefundStatus: financialDealsTable.providerRefundStatus,
        paymentFailureReason: financialDealsTable.paymentFailureReason,
        createdAt: financialDealsTable.createdAt,
        paymentUpdatedAt: financialDealsTable.paymentUpdatedAt,
      })
      .from(financialDealsTable)
      .innerJoin(usersTable, eq(usersTable.id, financialDealsTable.userId))
      .innerJoin(financialPoliciesTable, eq(financialPoliciesTable.id, financialDealsTable.policyId))
      .leftJoin(partnersTable, eq(partnersTable.id, financialDealsTable.partnerId))
      .where(inArray(financialDealsTable.status, statuses))
      .orderBy(asc(financialDealsTable.createdAt), asc(financialDealsTable.id))
      .limit(limit)
      .offset(offset),
    db
      .select({
        status: financialDealsTable.status,
        count: sql<number>`count(*)::int`,
      })
      .from(financialDealsTable)
      .where(inArray(financialDealsTable.status, ["pending", "payment_failed", "cancelled"]))
      .groupBy(financialDealsTable.status),
  ]);
  const [confirmedAwaitingReconciliation] = await db
    .select({
      count: sql<number>`count(*)::int`,
      lastUpdatedAt: sql<Date | string | null>`max(${financialDealsTable.paymentUpdatedAt})`,
    })
    .from(financialDealsTable)
    .where(and(
      eq(financialDealsTable.status, "pending"),
      eq(financialDealsTable.providerPaymentStatus, "succeeded"),
      isNotNull(financialDealsTable.paymentFailureReason),
    ));

  const summary = counts.reduce(
    (result, row) => {
      if (row.status === "pending") result.pending = row.count;
      if (row.status === "payment_failed") result.paymentFailed = row.count;
      if (row.status === "cancelled") result.cancelled = row.count;
      return result;
    },
    { total: 0, pending: 0, paymentFailed: 0, cancelled: 0, requiresReview: 0 },
  );
  summary.total = summary.pending + summary.paymentFailed + summary.cancelled;
  summary.requiresReview = summary.pending + summary.paymentFailed;

  res.json({
    items: rows.map((deal) => ({
      ...deal,
      grossAmountRub: Number(deal.grossAmountRub),
      bonusRedeemedRub: Number(deal.bonusRedeemedRub),
      netAmountRub: Number(deal.netAmountRub),
      feeAmountRub: Number(deal.feeAmountRub),
      landlordBonusRub: Number(deal.landlordBonusRub),
      tenantBonusRub: Number(deal.tenantBonusRub),
      createdAt: deal.createdAt.toISOString(),
      paymentUpdatedAt: deal.paymentUpdatedAt?.toISOString() ?? null,
      ...paymentReviewReason(deal),
    })),
    summary: {
      ...summary,
      confirmedAwaitingReconciliation: confirmedAwaitingReconciliation?.count ?? 0,
      confirmedAwaitingReconciliationLastUpdatedAt:
        isoTimestamp(confirmedAwaitingReconciliation?.lastUpdatedAt),
    },
    status,
    limit,
    offset,
  });
});

router.get("/reconciliation", requireAdmin, async (req, res) => {
  const parsed = ListBalanceReconciliationQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid reconciliation query", details: parsed.error.issues });
    return;
  }
  const { status, limit, offset } = parsed.data;
  const users = await db
    .select({
      id: usersTable.id,
      phone: usersTable.phone,
      name: usersTable.name,
      pointsBalance: usersTable.pointsBalance,
      bonusBalanceRub: usersTable.bonusBalanceRub,
    })
    .from(usersTable)
    .orderBy(asc(usersTable.id));
  const classifications = users.map((user) => ({
    user,
    reconciliation: formatBalanceReconciliation(user),
  }));
  const summary = classifications.reduce(
    (counts, item) => {
      counts[item.reconciliation.status === "rounding_difference"
        ? "roundingDifference"
        : item.reconciliation.status] += 1;
      return counts;
    },
    { consistent: 0, roundingDifference: 0, mismatch: 0, unmigrated: 0 } as Record<string, number>,
  );
  const filtered = status === "all"
    ? classifications
    : classifications.filter((item) => item.reconciliation.status === status);
  const items = filtered.slice(offset, offset + limit);

  res.json({
    items: items.map((item) => item.reconciliation),
    summary: {
      totalUsers: users.length,
      ...summary,
      returned: items.length,
    },
    status,
    limit,
    offset,
  });
});

router.get("/reconciliation/export", requireAdmin, async (req, res) => {
  const parsed = ExportBalanceReconciliationQueryParams.safeParse({
    ...(req.query as Record<string, unknown>),
    ...parseReconciliationExportDates(req.query as Record<string, unknown>),
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid reconciliation export query", details: parsed.error.issues });
    return;
  }

  const { status = "all", from, to } = parsed.data;
  if (from && to && from > to) {
    res.status(400).json({ error: "The export from date must be before or equal to the to date" });
    return;
  }

  const dateFilters = [
    from ? sql`${financialBalanceReconciliationsTable.createdAt} >= ${from}` : undefined,
    to ? sql`${financialBalanceReconciliationsTable.createdAt} <= ${to}` : undefined,
  ].filter((filter): filter is NonNullable<typeof filter> => Boolean(filter));
  const dateSuffix = from || to
    ? `-${from?.toISOString().slice(0, 10) ?? "all"}-${to?.toISOString().slice(0, 10) ?? "now"}`
    : "";

  res
    .type("text/csv")
    .set("Content-Disposition", `attachment; filename="balance-reconciliation${dateSuffix}.csv"`);

  try {
    if (!await writeReconciliationExportChunk(res, `${reconciliationExportHeaders.join(",")}\r\n`)) return;

    let lastUserId: number | undefined;
    while (!res.destroyed && !res.writableEnded) {
      const userFilters = lastUserId === undefined
        ? undefined
        : gt(usersTable.id, lastUserId);
      const users = await db
        .select({
          id: usersTable.id,
          pointsBalance: usersTable.pointsBalance,
          bonusBalanceRub: usersTable.bonusBalanceRub,
        })
        .from(usersTable)
        .where(userFilters)
        .orderBy(asc(usersTable.id))
        .limit(reconciliationExportBatchSize);
      if (users.length === 0) break;

      for (const user of users) {
        const reconciliation = formatBalanceReconciliation({
          ...user,
          phone: "",
          name: "",
        });
        if (status !== "all" && reconciliation.status !== status) continue;
        if (!await writeReconciliationExportChunk(res, `${reconciliationExportRow({
          recordType: "reconciliation",
          userId: reconciliation.userId,
          classification: reconciliation.status,
          currentPointsBalance: reconciliation.pointsBalance,
          currentBonusBalanceRub: reconciliation.bonusBalanceRub,
          currentExpectedBalanceRub: reconciliation.expectedBalanceRub,
          currentDifferenceCents: reconciliation.differenceCents,
        })}\r\n`)) return;
      }

      lastUserId = users[users.length - 1]?.id;
    }

    let lastCorrection: { createdAt: Date; id: number } | undefined;
    while (!res.destroyed && !res.writableEnded) {
      const cursorFilter = lastCorrection
        ? or(
          lt(financialBalanceReconciliationsTable.createdAt, lastCorrection.createdAt),
          and(
            eq(financialBalanceReconciliationsTable.createdAt, lastCorrection.createdAt),
            lt(financialBalanceReconciliationsTable.id, lastCorrection.id),
          ),
        )
        : undefined;
      const correctionFilters = cursorFilter
        ? [...dateFilters, cursorFilter]
        : dateFilters;
      const corrections = await db
        .select()
        .from(financialBalanceReconciliationsTable)
        .where(correctionFilters.length ? and(...correctionFilters) : undefined)
        .orderBy(
          desc(financialBalanceReconciliationsTable.createdAt),
          desc(financialBalanceReconciliationsTable.id),
        )
        .limit(reconciliationExportBatchSize);
      if (corrections.length === 0) break;

      for (const correction of corrections) {
        const classification = classificationForBalanceCorrection(correction);
        if (status !== "all" && classification !== status) continue;
        if (!await writeReconciliationExportChunk(res, `${reconciliationExportRow({
          recordType: "correction",
          reconciliationId: correction.id,
          userId: correction.userId,
          classification,
          operatorUserId: correction.operatorUserId,
          correctionTarget: correction.correctionTarget,
          reason: correction.reason,
          beforePointsBalance: correction.beforePointsBalance,
          afterPointsBalance: correction.afterPointsBalance,
          beforeBonusBalanceRub: correction.beforeBonusBalanceRub,
          afterBonusBalanceRub: correction.afterBonusBalanceRub,
          beforeDifferenceCents: correction.beforeDifferenceCents,
          afterDifferenceCents: correction.afterDifferenceCents,
          createdAt: correction.createdAt.toISOString(),
        })}\r\n`)) return;
      }

      const last = corrections[corrections.length - 1];
      if (!last) break;
      lastCorrection = { createdAt: last.createdAt, id: last.id };
    }

    if (!res.destroyed && !res.writableEnded) res.end();
  } catch (error) {
    if (res.headersSent) {
      res.destroy(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    throw error;
  }
});

router.get("/reconciliation/:userId", requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  const [user] = await db
    .select({
      id: usersTable.id,
      phone: usersTable.phone,
      name: usersTable.name,
      pointsBalance: usersTable.pointsBalance,
      bonusBalanceRub: usersTable.bonusBalanceRub,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const corrections = await db
    .select()
    .from(financialBalanceReconciliationsTable)
    .where(eq(financialBalanceReconciliationsTable.userId, userId))
    .orderBy(desc(financialBalanceReconciliationsTable.createdAt));
  res.json({
    ...formatBalanceReconciliation(user),
    corrections: corrections.map(formatBalanceCorrection),
  });
});

router.post("/reconciliation/:userId/correct", requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId);
  if (!Number.isInteger(userId) || userId <= 0) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  const parsed = CorrectBalanceReconciliationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid reconciliation correction", details: parsed.error.issues });
    return;
  }
  const reason = parsed.data.reason.trim();
  if (reason.length < 3) {
    res.status(400).json({ error: "A correction reason is required" });
    return;
  }
  const idempotencyKey = getIdempotencyKey(req, parsed.data);
  if (!idempotencyKey) {
    res.status(400).json({ error: "Idempotency-Key is required" });
    return;
  }
  const operatorUserId = getUserIdFromReq(req);

  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(financialBalanceReconciliationsTable)
        .where(eq(financialBalanceReconciliationsTable.idempotencyKey, idempotencyKey))
        .limit(1);
      if (existing) {
        if (
          existing.userId !== userId
          || existing.operatorUserId !== operatorUserId
          || existing.correctionTarget !== parsed.data.target
          || existing.reason !== reason
        ) {
          const error = new Error("RECONCILIATION_IDEMPOTENCY_CONFLICT");
          (error as Error & { status?: number }).status = 409;
          throw error;
        }
        const [currentUser] = await tx
          .select({
            id: usersTable.id,
            phone: usersTable.phone,
            name: usersTable.name,
            pointsBalance: usersTable.pointsBalance,
            bonusBalanceRub: usersTable.bonusBalanceRub,
          })
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1);
        if (!currentUser) {
          const error = new Error("USER_NOT_FOUND");
          (error as Error & { status?: number }).status = 404;
          throw error;
        }
        return {
          correction: existing,
          reconciliation: formatBalanceReconciliation(currentUser),
          idempotent: true,
        };
      }

      const [user] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .for("update");
      if (!user) {
        const error = new Error("USER_NOT_FOUND");
        (error as Error & { status?: number }).status = 404;
        throw error;
      }

      const before = reconcileBalances(user);
      if (before.status === "consistent") {
        const error = new Error("RECONCILIATION_ALREADY_CONSISTENT");
        (error as Error & { status?: number }).status = 409;
        throw error;
      }
      if (before.status === "rounding_difference") {
        const error = new Error("RECONCILIATION_ROUNDING_ONLY");
        (error as Error & { status?: number }).status = 409;
        throw error;
      }
      if (parsed.data.target === "points" && before.monetaryBalanceCents === null) {
        const error = new Error("MONETARY_BALANCE_REQUIRED");
        (error as Error & { status?: number }).status = 409;
        throw error;
      }

      const afterPointsBalance = parsed.data.target === "monetary"
        ? user.pointsBalance
        : legacyPointsForCents(before.monetaryBalanceCents as bigint);
      const afterBonusBalanceCents = parsed.data.target === "monetary"
        ? before.expectedBalanceCents
        : before.monetaryBalanceCents as bigint;
      const afterBonusBalanceRub = money(centsToRub(afterBonusBalanceCents));
      const after = reconcileBalances({
        pointsBalance: afterPointsBalance,
        bonusBalanceRub: afterBonusBalanceRub,
      });
      const [correction] = await tx
        .insert(financialBalanceReconciliationsTable)
        .values({
          userId,
          operatorUserId,
          correctionTarget: parsed.data.target,
          reason,
          idempotencyKey,
          beforePointsBalance: user.pointsBalance,
          afterPointsBalance,
          beforeBonusBalanceRub: user.bonusBalanceRub,
          afterBonusBalanceRub,
          beforeDifferenceCents: before.differenceCents === null ? null : Number(before.differenceCents),
          afterDifferenceCents: after.differenceCents === null ? 0 : Number(after.differenceCents),
        })
        .returning();
      if (!correction) throw new Error("RECONCILIATION_NOT_CREATED");

      await tx
        .update(usersTable)
        .set({
          pointsBalance: afterPointsBalance,
          bonusBalanceRub: afterBonusBalanceRub,
          status: getStatusForPoints(afterPointsBalance),
        })
        .where(eq(usersTable.id, userId));

      return {
        correction,
        reconciliation: formatBalanceReconciliation({
          id: user.id,
          phone: user.phone,
          name: user.name,
          pointsBalance: afterPointsBalance,
          bonusBalanceRub: afterBonusBalanceRub,
        }),
        idempotent: false,
      };
    });

    res.status(result.idempotent ? 200 : 201).json({
      reconciliation: result.reconciliation,
      correction: formatBalanceCorrection(result.correction),
      idempotent: result.idempotent,
    });
  } catch (error) {
    const message = (error as Error).message;
    const status = (error as Error & { status?: number }).status ?? 500;
    if (message === "USER_NOT_FOUND") {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (status === 409) {
      const errorMessage = message === "RECONCILIATION_ALREADY_CONSISTENT"
        ? "Balance is already consistent"
        : message === "RECONCILIATION_ROUNDING_ONLY"
          ? "The difference is within the valid 0.40 RUB rounding tolerance"
          : message === "MONETARY_BALANCE_REQUIRED"
            ? "A monetary balance is required before points can be synchronized"
            : "Idempotency key was already used for a different reconciliation";
      res.status(409).json({ error: errorMessage, code: message });
      return;
    }
    res.status(500).json({ error: "Unable to apply balance reconciliation" });
  }
});

router.get("/deals/:id", async (req, res) => {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid deal id" });
    return;
  }
  const userId = getUserIdFromReq(req);
  const isAdmin = getAuthPayloadFromReq(req)?.isAdmin === true;
  const [deal] = await db.select().from(financialDealsTable).where(eq(financialDealsTable.id, id)).limit(1);
  if (!deal || (deal.userId !== userId && !isAdmin)) {
    res.status(404).json({ error: "Financial deal not found" });
    return;
  }
  res.json(await formatDeal(deal));
});

router.post("/deals/:id/refund", requireAdmin, async (req, res) => {
  if (!isAuthenticated(req)) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  const parsed = RefundFinancialDealBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  const key = getIdempotencyKey(req, parsed.data);
  if (!key) {
    res.status(400).json({ error: "Idempotency-Key is required" });
    return;
  }
  const dealId = Number(req.params.id);
  const actorId = getUserIdFromReq(req);
  const isAdmin = getAuthPayloadFromReq(req)?.isAdmin === true;
  try {
    const result = await db.transaction(async (tx) => {
      const [deal] = await tx.select().from(financialDealsTable).where(eq(financialDealsTable.id, dealId)).for("update");
      if (!deal || (deal.userId !== actorId && !isAdmin)) {
        const error = new Error("DEAL_NOT_FOUND");
        (error as Error & { status?: number }).status = 404;
        throw error;
      }
      const [existingRefund] = await tx.select().from(financialLedgerEntriesTable)
        .where(and(
          eq(financialLedgerEntriesTable.dealId, dealId),
          sql`${financialLedgerEntriesTable.idempotencyKey} LIKE ${`${key}:refund:%`}`,
        ))
        .limit(1);
      if (existingRefund) return { deal, idempotent: true };
      if (deal.status === "refunded") {
        const error = new Error("ALREADY_REFUNDED");
        (error as Error & { status?: number }).status = 409;
        throw error;
      }
      if (deal.providerPaymentId) {
        if (deal.status !== "settled") {
          const error = new Error("REFUND_NOT_SETTLED");
          (error as Error & { status?: number }).status = 409;
          throw error;
        }
        const providerRefund = await createYooKassaRefund({
          paymentId: deal.providerPaymentId,
          amountRub: Number(deal.netAmountRub),
          idempotencyKey: key,
        });
        const [providerUpdated] = await tx.update(financialDealsTable).set({
          providerRefundId: providerRefund.id,
          providerRefundStatus: providerRefund.status,
          paymentUpdatedAt: new Date(),
        }).where(eq(financialDealsTable.id, dealId)).returning();
        if (providerRefund.status !== "succeeded") {
          return { deal: providerUpdated ?? deal, idempotent: false, refundPending: true };
        }
      }

      const originals = await tx.select().from(financialLedgerEntriesTable)
        .where(and(eq(financialLedgerEntriesTable.dealId, dealId), sql`${financialLedgerEntriesTable.reversalOfId} IS NULL`))
        .orderBy(asc(financialLedgerEntriesTable.id));
      const userIds = [...new Set(originals.flatMap((entry) => entry.userId === null ? [] : [entry.userId]))].sort((a, b) => a - b);
      const lockedUsers = userIds.length
        ? await tx.select().from(usersTable).where(inArray(usersTable.id, userIds)).orderBy(asc(usersTable.id)).for("update")
        : [];
      const balances = new Map(lockedUsers.map((user) => [user.id, legacyBalanceCents(user)]));

      const reversalValues = [];
      for (const original of originals) {
        if (original.userId !== null) {
          const balance = balances.get(original.userId) ?? 0n;
          const amount = parseRub(original.amountRub);
          if (!amount.ok) throw new Error("Invalid ledger amount");
          const next = original.entryType === "debit" ? balance + amount.cents : balance - amount.cents;
          if (next < 0n) {
            const error = new Error("REFUND_WOULD_OVERDRAW");
            (error as Error & { status?: number }).status = 409;
            throw error;
          }
          balances.set(original.userId, next);
          const [reversalTransaction] = await tx.insert(transactionsTable).values({
            userId: original.userId,
            type: original.entryType === "debit" ? "bonus" : "redeem",
            category: "other",
            amountRub: original.amountRub,
            pointsEarned: legacyPointsForCents(amount.cents),
            multiplier: "1.0",
            description: `Обратная проводка по сделке #${deal.id}`,
          }).returning({ id: transactionsTable.id });
          reversalValues.push({
            dealId,
            userId: original.userId,
            transactionId: reversalTransaction.id,
            entryType: original.entryType === "debit" ? "credit" : "debit",
            source: "refund",
            reference: `deal:${deal.id}:refund:${original.id}`,
            idempotencyKey: `${key}:refund:${original.id}`,
            amountRub: original.amountRub,
            balanceAfterRub: money(centsToRub(next)),
            reversalOfId: original.id,
          });
        } else {
          reversalValues.push({
            dealId,
            userId: null,
            transactionId: null,
            entryType: original.entryType === "debit" ? "credit" : "debit",
            source: "refund",
            reference: `deal:${deal.id}:refund:${original.id}`,
            idempotencyKey: `${key}:refund:${original.id}`,
            amountRub: original.amountRub,
            balanceAfterRub: null,
            reversalOfId: original.id,
          });
        }
      }
      await tx.insert(financialLedgerEntriesTable).values(reversalValues);
      for (const user of lockedUsers) {
        const balance = balances.get(user.id) ?? 0n;
        const changed = balance - legacyBalanceCents(user);
        await tx.update(usersTable).set({
          bonusBalanceRub: money(centsToRub(balance)),
          pointsBalance: Math.max(0, user.pointsBalance + legacyPointsForCents(changed)),
        }).where(eq(usersTable.id, user.id));
      }
      const [updated] = await tx.update(financialDealsTable).set({
        status: "refunded",
        refundedAt: new Date(),
      }).where(eq(financialDealsTable.id, dealId)).returning();
      return { deal: updated, idempotent: false, refundPending: false };
    });
    if (result.refundPending) {
      res.status(202).json({
        deal: await formatDeal(result.deal),
        idempotent: result.idempotent,
        code: "REFUND_PENDING",
      });
      return;
    }
    res.status(result.idempotent ? 200 : 201).json({ deal: await formatDeal(result.deal), idempotent: result.idempotent });
  } catch (error) {
    const message = (error as Error).message;
    const status = (error as Error & { status?: number }).status ?? 500;
    if (message === "DEAL_NOT_FOUND") {
      res.status(404).json({ error: "Financial deal not found" });
      return;
    }
    if (status === 409) {
      res.status(409).json({
        error: message === "REFUND_WOULD_OVERDRAW"
          ? "Refund would overdraw a bonus balance"
          : message === "REFUND_PENDING"
            ? "Provider refund is still pending; ledger was not reversed"
            : message === "REFUND_NOT_SETTLED"
              ? "Only a settled provider payment can be refunded"
            : "Deal is already refunded",
        code: message,
      });
      return;
    }
    if (error instanceof YooKassaError) {
      req.log.error({ err: error, dealId }, "Unable to refund YooKassa payment");
      res.status(502).json({ error: "Не удалось оформить возврат у провайдера", code: "PROVIDER_REFUND_FAILED" });
      return;
    }
    res.status(500).json({ error: "Unable to refund financial deal" });
  }
});

export default router;