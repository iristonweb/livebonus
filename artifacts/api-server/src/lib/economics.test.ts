import assert from "node:assert/strict";
import test from "node:test";
import {
  auditEconomicsDeals,
  calculateEconomicsReport,
  type EconomicsLedgerEntry,
} from "./economics.js";

const policy = {
  currency: "RUB" as const,
  purchaseMaxRedemptionRate: 0.15,
  partnerFeeRate: 0.015,
  landlordFeeRate: 0.015,
  rentalTenantBonusRate: 0.1,
  rentalLandlordBonusRate: 0.1,
};
const period = {
  from: new Date("2026-08-01T00:00:00.000Z"),
  to: new Date("2026-08-31T23:59:59.999Z"),
  type: "custom" as const,
};

function purchase(overrides: Partial<Parameters<typeof calculateEconomicsReport>[0]["deals"][number]> = {}) {
  return {
    id: 1,
    kind: "partner_purchase",
    status: "settled",
    partnerId: 10,
    grossAmountRub: "1000.00",
    bonusRedeemedRub: "100.00",
    netAmountRub: "900.00",
    feeAmountRub: "13.50",
    landlordBonusRub: "0.00",
    tenantBonusRub: "0.00",
    settledAt: new Date("2026-08-10T10:00:00.000Z"),
    ...overrides,
  };
}

function purchaseEntries(id = 1, key = "purchase-1"): EconomicsLedgerEntry[] {
  return [
    { id: id * 10, dealId: id, idempotencyKey: `${key}:bonus-debit`, entryType: "debit", source: "partner_purchase", amountRub: "100.00", reversalOfId: null, createdAt: new Date("2026-08-10T10:00:00.000Z") },
    { id: id * 10 + 1, dealId: id, idempotencyKey: `${key}:partner-fee`, entryType: "credit", source: "partner_fee", amountRub: "13.50", reversalOfId: null, createdAt: new Date("2026-08-10T10:00:00.000Z") },
  ];
}

function report(deals: Parameters<typeof calculateEconomicsReport>[0]["deals"], ledgerEntries: Parameters<typeof calculateEconomicsReport>[0]["ledgerEntries"]) {
  return calculateEconomicsReport({
    deals,
    ledgerEntries,
    partners: [{ id: 10, name: "Партнёр", category: "food" }],
    users: [{ pointsBalance: 0, bonusBalanceRub: "100.00" }],
    period,
    status: "all",
    policy,
  });
}

test("calculates positive contribution profit from confirmed purchase postings", () => {
  const result = report([purchase()], purchaseEntries());
  assert.equal(result.summary.grossTurnoverRub, 1000);
  assert.equal(result.summary.netTurnoverRub, 900);
  assert.equal(result.summary.partnerCommissionRub, 13.5);
  assert.equal(result.summary.bonusRedeemedRub, 100);
  assert.equal(result.summary.contributionProfitRub, 13.5);
  assert.equal(result.summary.contributionMarginPercent, 100);
  assert.equal(result.summary.dealCount, 1);
});

test("reports the control purchase fee from net separately from the user debit", () => {
  const result = report(
    [purchase({
      grossAmountRub: "10000.00",
      bonusRedeemedRub: "1500.00",
      netAmountRub: "8500.00",
      feeAmountRub: "127.50",
    })],
    [
      { id: 10, dealId: 1, idempotencyKey: "control:bonus-debit", entryType: "debit", source: "partner_purchase", amountRub: "1500.00", reversalOfId: null, createdAt: new Date("2026-08-10T10:00:00.000Z") },
      { id: 11, dealId: 1, idempotencyKey: "control:partner-fee", entryType: "credit", source: "partner_fee", amountRub: "127.50", reversalOfId: null, createdAt: new Date("2026-08-10T10:00:00.000Z") },
    ],
  );
  assert.equal(result.summary.grossTurnoverRub, 10000);
  assert.equal(result.summary.netTurnoverRub, 8500);
  assert.equal(result.summary.bonusRedeemedRub, 1500);
  assert.equal(result.summary.partnerCommissionRub, 127.5);
  assert.equal(result.summary.netRevenueRub, 127.5);
  assert.equal(result.summary.contributionProfitRub, 127.5);
});

test("does not divide by zero for an empty financial period", () => {
  const result = report([], []);
  assert.equal(result.period.isEmpty, true);
  assert.equal(result.summary.averageCheckRub, 0);
  assert.equal(result.summary.contributionProfitRub, 0);
  assert.equal(result.summary.contributionMarginPercent, 0);
});

test("returns can make contribution profit negative and duplicate reversals are ignored", () => {
  const deal = purchase({ status: "refunded" });
  const entries = purchaseEntries();
  entries.push(
    { id: 20, dealId: 1, idempotencyKey: "refund:bonus", entryType: "credit", source: "refund", amountRub: "100.00", reversalOfId: 10, createdAt: new Date("2026-08-20T10:00:00.000Z") },
    { id: 21, dealId: 1, idempotencyKey: "refund:fee", entryType: "debit", source: "refund", amountRub: "13.50", reversalOfId: 11, createdAt: new Date("2026-08-20T10:00:00.000Z") },
    { id: 22, dealId: 1, idempotencyKey: "refund:fee-duplicate", entryType: "debit", source: "refund", amountRub: "13.50", reversalOfId: 11, createdAt: new Date("2026-08-20T10:00:00.000Z") },
  );
  const result = report([deal], entries);
  assert.equal(result.summary.grossTurnoverRub, 0);
  assert.equal(result.summary.refundsRub, 1000);
  assert.equal(result.summary.netRevenueRub, 0);
  assert.equal(result.summary.contributionProfitRub, 0);
  assert.equal(result.confirmedLedgerEntries, 4);
});

test("audits settled purchases without mutating or reporting a matching ledger", () => {
  const result = auditEconomicsDeals({
    deals: [purchase()],
    ledgerEntries: purchaseEntries(),
  });

  assert.equal(result.checkedDeals, 1);
  assert.equal(result.cleanDeals, 1);
  assert.equal(result.discrepantDeals, 0);
  assert.deepEqual(result.results[0].amounts, {
    grossAmountRub: 1000,
    bonusRedeemedRub: 100,
    netAmountRub: 900,
    feeAmountRub: 13.5,
    landlordBonusRub: 0,
    tenantBonusRub: 0,
  });
  assert.deepEqual(result.discrepancies, []);
});

test("paginates audit details while keeping history totals global", () => {
  const result = auditEconomicsDeals({
    deals: [
      purchase(),
      purchase({
        id: 2,
        grossAmountRub: "1001.00",
        settledAt: new Date("2026-08-09T10:00:00.000Z"),
      }),
    ],
    ledgerEntries: [
      ...purchaseEntries(1),
      ...purchaseEntries(2),
    ],
    limit: 1,
    offset: 1,
  });

  assert.equal(result.checkedDeals, 2);
  assert.equal(result.cleanDeals, 1);
  assert.equal(result.discrepantDeals, 1);
  assert.equal(result.limit, 1);
  assert.equal(result.offset, 1);
  assert.deepEqual(result.results.map(({ dealId }) => dealId), [2]);
  assert.deepEqual(result.discrepancies.map(({ dealId, field }) => ({ dealId, field })), [
    { dealId: 2, field: "grossAmountRub" },
  ]);
});

test("keeps audit pages stable at a snapshot and orders ties by deal id", () => {
  const snapshotAt = new Date("2026-08-15T00:00:00.000Z");
  const result = auditEconomicsDeals({
    deals: [
      purchase({ id: 2, settledAt: new Date("2026-08-10T10:00:00.000Z") }),
      purchase({ id: 4, settledAt: new Date("2026-08-20T10:00:00.000Z") }),
      purchase({ id: 3, settledAt: new Date("2026-08-10T10:00:00.000Z") }),
    ],
    ledgerEntries: [
      ...purchaseEntries(2),
      ...purchaseEntries(4),
      ...purchaseEntries(3),
    ],
    limit: 2,
    snapshotAt,
  });

  assert.equal(result.snapshotAt, snapshotAt.toISOString());
  assert.equal(result.checkedDeals, 2);
  assert.deepEqual(result.results.map(({ dealId }) => dealId), [3, 2]);
});

test("reports purchase amount and fee or bonus ledger drift by deal", () => {
  const result = auditEconomicsDeals({
    deals: [purchase({
      grossAmountRub: "1000.00",
      bonusRedeemedRub: "120.00",
      netAmountRub: "900.00",
      feeAmountRub: "15.00",
    })],
    ledgerEntries: purchaseEntries(),
  });

  assert.equal(result.discrepantDeals, 1);
  assert.deepEqual(result.discrepancies.map(({ code, field, expectedRub, actualRub }) => ({
    code,
    field,
    expectedRub,
    actualRub,
  })), [
    { code: "deal_amounts_mismatch", field: "grossAmountRub", expectedRub: 1020, actualRub: 1000 },
    { code: "ledger_amount_mismatch", field: "bonusRedeemedRub", expectedRub: 120, actualRub: 100 },
    { code: "ledger_amount_mismatch", field: "feeAmountRub", expectedRub: 15, actualRub: 13.5 },
  ]);
});

test("checks rental landlord fee and tenant and landlord bonuses independently", () => {
  const rental = {
    ...purchase(),
    id: 2,
    kind: "rental_deal",
    grossAmountRub: "5000.00",
    bonusRedeemedRub: "0.00",
    netAmountRub: "5000.00",
    feeAmountRub: "75.00",
    landlordBonusRub: "500.00",
    tenantBonusRub: "500.00",
  };
  const result = auditEconomicsDeals({
    deals: [rental],
    ledgerEntries: [
      { id: 20, dealId: 2, idempotencyKey: "rental:tenant-bonus", entryType: "credit", source: "rental_deal", amountRub: "500.00", reversalOfId: null, createdAt: period.from },
      { id: 21, dealId: 2, idempotencyKey: "rental:landlord-bonus", entryType: "credit", source: "rental_deal", amountRub: "450.00", reversalOfId: null, createdAt: period.from },
      { id: 22, dealId: 2, idempotencyKey: "rental:landlord-fee", entryType: "debit", source: "landlord_fee", amountRub: "75.00", reversalOfId: null, createdAt: period.from },
    ],
  });

  assert.deepEqual(result.discrepancies.map(({ field, expectedRub, actualRub }) => ({
    field,
    expectedRub,
    actualRub,
  })), [
    { field: "landlordBonusRub", expectedRub: 500, actualRub: 450 },
  ]);
});

test("requires every original posting to be reversed for a refunded deal", () => {
  const entries = purchaseEntries();
  entries.push({
    id: 12,
    dealId: 1,
    idempotencyKey: "refund:bonus",
    entryType: "credit",
    source: "refund",
    amountRub: "100.00",
    reversalOfId: 10,
    createdAt: new Date("2026-08-20T10:00:00.000Z"),
  });
  const result = auditEconomicsDeals({
    deals: [purchase({ status: "refunded" })],
    ledgerEntries: entries,
  });

  assert.equal(result.discrepantDeals, 1);
  assert.deepEqual(result.discrepancies.map(({ code, field, expectedRub, actualRub }) => ({
    code,
    field,
    expectedRub,
    actualRub,
  })), [
    { code: "missing_refund_reversal", field: "refund_reversal:11", expectedRub: 13.5, actualRub: 0 },
  ]);
});