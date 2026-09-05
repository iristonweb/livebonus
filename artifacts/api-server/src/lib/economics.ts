import { centsToRub, parseRub } from "./finance.js";

export type EconomicsStatus = "all" | "settled" | "refunded";
export type EconomicsDealKind = "partner_purchase" | "rental_deal";

export interface EconomicsPeriod {
  from: Date;
  to: Date;
  type: "day" | "week" | "month" | "custom";
}

export interface EconomicsDeal {
  id: number;
  kind: string;
  status: string;
  partnerId: number | null;
  grossAmountRub: string | number;
  bonusRedeemedRub: string | number;
  netAmountRub: string | number;
  feeAmountRub: string | number;
  landlordBonusRub: string | number;
  tenantBonusRub: string | number;
  settledAt: Date | null;
}

export interface EconomicsLedgerEntry {
  id: number;
  dealId: number;
  idempotencyKey?: string;
  reference?: string;
  entryType: string;
  source: string;
  amountRub: string | number;
  reversalOfId: number | null;
  createdAt: Date;
}

export type EconomicsAuditDiscrepancyCode =
  | "deal_amounts_mismatch"
  | "missing_ledger_posting"
  | "ledger_amount_mismatch"
  | "duplicate_ledger_posting"
  | "missing_refund_reversal"
  | "refund_reversal_amount_mismatch"
  | "duplicate_refund_reversal"
  | "orphan_refund_reversal";

export interface EconomicsAuditDiscrepancy {
  code: EconomicsAuditDiscrepancyCode;
  field: string;
  expectedRub: number | null;
  actualRub: number | null;
  differenceRub: number | null;
  expectedCount?: number;
  actualCount?: number;
  message: string;
}

export interface EconomicsAuditDeal {
  dealId: number;
  kind: string;
  status: string;
  amounts: {
    grossAmountRub: number;
    bonusRedeemedRub: number;
    netAmountRub: number;
    feeAmountRub: number;
    landlordBonusRub: number;
    tenantBonusRub: number;
  };
  discrepancies: EconomicsAuditDiscrepancy[];
}

export interface EconomicsAuditReport {
  source: "financial_deals_and_ledger_audit";
  checkedDeals: number;
  cleanDeals: number;
  discrepantDeals: number;
  results: EconomicsAuditDeal[];
  discrepancies: Array<EconomicsAuditDiscrepancy & { dealId: number; kind: string; status: string }>;
  limit: number;
  offset: number;
  snapshotAt: string;
}

export interface EconomicsPartner {
  id: number;
  name: string;
  category: string;
}

export interface EconomicsUser {
  pointsBalance: number;
  bonusBalanceRub: string | null;
}

type MoneyBreakdown = {
  dealCount: number;
  grossTurnoverRub: number;
  netTurnoverRub: number;
  partnerCommissionRub: number;
  landlordCommissionRub: number;
  tenantBonusAccruedRub: number;
  landlordBonusAccruedRub: number;
  bonusRedeemedRub: number;
  refundsRub: number;
  netRevenueRub: number;
  bonusLiabilityCostRub: number;
  contributionProfitRub: number;
  contributionMarginPercent: number;
  averageCheckRub: number;
};

export interface EconomicsReport {
  period: {
    from: string;
    to: string;
    type: EconomicsPeriod["type"];
    timezone: "UTC";
    isEmpty: boolean;
  };
  source: "confirmed_financial_deals_and_ledger";
  status: EconomicsStatus;
  confirmedLedgerEntries: number;
  summary: MoneyBreakdown & {
    outstandingBonusLiabilityRub: number;
  };
  byDealType: Array<MoneyBreakdown & { type: EconomicsDealKind }>;
  byPartner: Array<MoneyBreakdown & {
    partnerId: number | null;
    partnerName: string;
    category: string;
  }>;
  byCategory: Array<MoneyBreakdown & { category: string }>;
  policy: {
    currency: "RUB";
    purchaseMaxRedemptionRate: number;
    partnerFeeRate: number;
    landlordFeeRate: number;
    rentalTenantBonusRate: number;
    rentalLandlordBonusRate: number;
  };
  operatingCostsRub: null;
  profitBasis: "contribution_before_operating_costs";
}

const EMPTY_BREAKDOWN = (): MoneyBreakdown => ({
  dealCount: 0,
  grossTurnoverRub: 0,
  netTurnoverRub: 0,
  partnerCommissionRub: 0,
  landlordCommissionRub: 0,
  tenantBonusAccruedRub: 0,
  landlordBonusAccruedRub: 0,
  bonusRedeemedRub: 0,
  refundsRub: 0,
  netRevenueRub: 0,
  bonusLiabilityCostRub: 0,
  contributionProfitRub: 0,
  contributionMarginPercent: 0,
  averageCheckRub: 0,
});

function toCents(value: string | number): bigint {
  const parsed = parseRub(value);
  return parsed.ok ? parsed.cents : 0n;
}

function centsDifferenceRub(actual: bigint, expected: bigint): number {
  return centsToRub(actual - expected);
}

function addCents(target: Record<string, bigint>, key: string, value: bigint): void {
  target[key] = (target[key] ?? 0n) + value;
}

function moneyBreakdown(cents: Record<string, bigint>): MoneyBreakdown {
  const result = {
    dealCount: Number(cents.dealCount ?? 0n),
    grossTurnoverRub: centsToRub(cents.grossTurnover ?? 0n),
    netTurnoverRub: centsToRub(cents.netTurnover ?? 0n),
    partnerCommissionRub: centsToRub(cents.partnerCommission ?? 0n),
    landlordCommissionRub: centsToRub(cents.landlordCommission ?? 0n),
    tenantBonusAccruedRub: centsToRub(cents.tenantBonusAccrued ?? 0n),
    landlordBonusAccruedRub: centsToRub(cents.landlordBonusAccrued ?? 0n),
    bonusRedeemedRub: centsToRub(cents.bonusRedeemed ?? 0n),
    refundsRub: centsToRub(cents.refunds ?? 0n),
    netRevenueRub: centsToRub(cents.netRevenue ?? 0n),
    bonusLiabilityCostRub: centsToRub(cents.bonusLiabilityCost ?? 0n),
    contributionProfitRub: centsToRub(cents.contributionProfit ?? 0n),
    contributionMarginPercent: 0,
    averageCheckRub: 0,
  };
  result.contributionMarginPercent = result.netRevenueRub !== 0
    ? Number(((result.contributionProfitRub / result.netRevenueRub) * 100).toFixed(2))
    : 0;
  result.averageCheckRub = result.dealCount > 0
    ? Number((result.grossTurnoverRub / result.dealCount).toFixed(2))
    : 0;
  return result;
}

function addBreakdown(
  map: Map<string, { labels: Record<string, string | number | null>; cents: Record<string, bigint> }>,
  key: string,
  labels: Record<string, string | number | null>,
  values: Record<string, bigint>,
): void {
  const current = map.get(key) ?? { labels, cents: {} };
  for (const [name, value] of Object.entries(values)) addCents(current.cents, name, value);
  map.set(key, current);
}

function eventValues(deal: EconomicsDeal, sign: bigint): Record<string, bigint> {
  const gross = toCents(deal.grossAmountRub) * sign;
  const net = toCents(deal.netAmountRub) * sign;
  const partnerCommission = deal.kind === "partner_purchase" ? toCents(deal.feeAmountRub) * sign : 0n;
  const landlordCommission = deal.kind === "rental_deal" ? toCents(deal.feeAmountRub) * sign : 0n;
  const tenantBonus = deal.kind === "rental_deal" ? toCents(deal.tenantBonusRub) * sign : 0n;
  const landlordBonus = deal.kind === "rental_deal" ? toCents(deal.landlordBonusRub) * sign : 0n;
  const bonusRedeemed = deal.kind === "partner_purchase" ? toCents(deal.bonusRedeemedRub) * sign : 0n;
  const revenue = partnerCommission + landlordCommission;
  const liability = tenantBonus + landlordBonus;
  return {
    grossTurnover: gross,
    netTurnover: net,
    partnerCommission,
    landlordCommission,
    tenantBonusAccrued: tenantBonus,
    landlordBonusAccrued: landlordBonus,
    bonusRedeemed,
    refunds: sign < 0n ? toCents(deal.grossAmountRub) : 0n,
    netRevenue: revenue,
    bonusLiabilityCost: liability,
    contributionProfit: revenue - liability,
  };
}

function inPeriod(date: Date, period: EconomicsPeriod): boolean {
  return date >= period.from && date <= period.to;
}

function currentLiabilityCents(users: EconomicsUser[]): bigint {
  return users.reduce((sum, user) => {
    if (user.bonusBalanceRub !== null) return sum + toCents(user.bonusBalanceRub);
    return sum + BigInt(Math.max(0, user.pointsBalance)) * 80n;
  }, 0n);
}

function auditDiscrepancy(
  code: EconomicsAuditDiscrepancyCode,
  field: string,
  expectedCents: bigint | null,
  actualCents: bigint | null,
  message: string,
  counts?: { expected: number; actual: number },
): EconomicsAuditDiscrepancy {
  return {
    code,
    field,
    expectedRub: expectedCents === null ? null : centsToRub(expectedCents),
    actualRub: actualCents === null ? null : centsToRub(actualCents),
    differenceRub: expectedCents === null || actualCents === null
      ? null
      : centsDifferenceRub(actualCents, expectedCents),
    ...(counts ? { expectedCount: counts.expected, actualCount: counts.actual } : {}),
    message,
  };
}

function hasPostingReference(entry: EconomicsLedgerEntry, suffix: string): boolean {
  return entry.reference?.endsWith(`:${suffix}`) === true
    || entry.idempotencyKey?.endsWith(`:${suffix}`) === true;
}

type AuditPostingSpec = {
  field: string;
  expectedCents: bigint;
  source: string;
  entryType: string;
  referenceSuffix?: string;
};

function postingMatches(entry: EconomicsLedgerEntry, spec: AuditPostingSpec): boolean {
  return entry.reversalOfId === null
    && entry.source === spec.source
    && entry.entryType === spec.entryType
    && (!spec.referenceSuffix || hasPostingReference(entry, spec.referenceSuffix));
}

function auditPosting(
  entries: EconomicsLedgerEntry[],
  spec: AuditPostingSpec,
): EconomicsAuditDiscrepancy[] {
  const matching = entries.filter((entry) => postingMatches(entry, spec));
  const actualCents = matching.reduce((sum, entry) => sum + toCents(entry.amountRub), 0n);
  const discrepancies: EconomicsAuditDiscrepancy[] = [];

  if (matching.length === 0) {
    discrepancies.push(auditDiscrepancy(
      "missing_ledger_posting",
      spec.field,
      spec.expectedCents,
      0n,
      `Missing ${spec.field} ledger posting`,
      { expected: 1, actual: 0 },
    ));
  } else if (matching.length > 1) {
    discrepancies.push(auditDiscrepancy(
      "duplicate_ledger_posting",
      spec.field,
      spec.expectedCents,
      actualCents,
      `Expected one ${spec.field} ledger posting but found ${matching.length}`,
      { expected: 1, actual: matching.length },
    ));
  } else if (actualCents !== spec.expectedCents) {
    discrepancies.push(auditDiscrepancy(
      "ledger_amount_mismatch",
      spec.field,
      spec.expectedCents,
      actualCents,
      `${spec.field} ledger posting does not match the deal`,
    ));
  }

  return discrepancies;
}

function auditRefundReversals(
  entries: EconomicsLedgerEntry[],
  originals: EconomicsLedgerEntry[],
): EconomicsAuditDiscrepancy[] {
  const discrepancies: EconomicsAuditDiscrepancy[] = [];
  const originalIds = new Set(originals.map((entry) => entry.id));

  for (const original of originals) {
    const reversals = entries.filter((entry) => entry.reversalOfId === original.id);
    if (reversals.length === 0) {
      discrepancies.push(auditDiscrepancy(
        "missing_refund_reversal",
        `refund_reversal:${original.id}`,
        toCents(original.amountRub),
        0n,
        `Missing refund reversal for ledger entry ${original.id}`,
        { expected: 1, actual: 0 },
      ));
      continue;
    }
    if (reversals.length > 1) {
      discrepancies.push(auditDiscrepancy(
        "duplicate_refund_reversal",
        `refund_reversal:${original.id}`,
        toCents(original.amountRub),
        reversals.reduce((sum, entry) => sum + toCents(entry.amountRub), 0n),
        `Expected one refund reversal for ledger entry ${original.id} but found ${reversals.length}`,
        { expected: 1, actual: reversals.length },
      ));
      continue;
    }

    const reversal = reversals[0];
    if (
      toCents(reversal.amountRub) !== toCents(original.amountRub)
      || reversal.entryType === original.entryType
      || reversal.source !== "refund"
    ) {
      discrepancies.push(auditDiscrepancy(
        "refund_reversal_amount_mismatch",
        `refund_reversal:${original.id}`,
        toCents(original.amountRub),
        toCents(reversal.amountRub),
        `Refund reversal for ledger entry ${original.id} does not reverse the original posting`,
      ));
    }
  }

  for (const reversal of entries.filter((entry) => entry.reversalOfId !== null)) {
    if (!originalIds.has(reversal.reversalOfId as number)) {
      discrepancies.push(auditDiscrepancy(
        "orphan_refund_reversal",
        `refund_reversal:${reversal.reversalOfId}`,
        null,
        toCents(reversal.amountRub),
        `Refund reversal points to missing original ledger entry ${reversal.reversalOfId}`,
      ));
    }
  }

  return discrepancies;
}

function auditDeal(
  deal: EconomicsDeal,
  dealEntries: EconomicsLedgerEntry[],
): EconomicsAuditDeal {
  const grossCents = toCents(deal.grossAmountRub);
  const redeemedCents = toCents(deal.bonusRedeemedRub);
  const netCents = toCents(deal.netAmountRub);
  const feeCents = toCents(deal.feeAmountRub);
  const landlordBonusCents = toCents(deal.landlordBonusRub);
  const tenantBonusCents = toCents(deal.tenantBonusRub);
  const originals = dealEntries.filter((entry) => entry.reversalOfId === null);
  const discrepancies: EconomicsAuditDiscrepancy[] = [];

  if (deal.kind === "partner_purchase" && grossCents !== redeemedCents + netCents) {
    discrepancies.push(auditDiscrepancy(
      "deal_amounts_mismatch",
      "grossAmountRub",
      redeemedCents + netCents,
      grossCents,
      "Gross amount does not equal redeemed bonus plus net amount",
    ));
  }

  if (deal.kind === "partner_purchase") {
    discrepancies.push(...auditPosting(dealEntries, {
      field: "bonusRedeemedRub",
      expectedCents: redeemedCents,
      source: "partner_purchase",
      entryType: "debit",
    }));
    discrepancies.push(...auditPosting(dealEntries, {
      field: "feeAmountRub",
      expectedCents: feeCents,
      source: "partner_fee",
      entryType: "credit",
    }));
  } else if (deal.kind === "rental_deal") {
    discrepancies.push(...auditPosting(dealEntries, {
      field: "feeAmountRub",
      expectedCents: feeCents,
      source: "landlord_fee",
      entryType: "debit",
    }));
    discrepancies.push(...auditPosting(dealEntries, {
      field: "tenantBonusRub",
      expectedCents: tenantBonusCents,
      source: "rental_deal",
      entryType: "credit",
      referenceSuffix: "tenant-bonus",
    }));
    discrepancies.push(...auditPosting(dealEntries, {
      field: "landlordBonusRub",
      expectedCents: landlordBonusCents,
      source: "rental_deal",
      entryType: "credit",
      referenceSuffix: "landlord-bonus",
    }));
  }

  if (deal.status === "refunded") {
    discrepancies.push(...auditRefundReversals(dealEntries, originals));
  }

  return {
    dealId: deal.id,
    kind: deal.kind,
    status: deal.status,
    amounts: {
      grossAmountRub: centsToRub(grossCents),
      bonusRedeemedRub: centsToRub(redeemedCents),
      netAmountRub: centsToRub(netCents),
      feeAmountRub: centsToRub(feeCents),
      landlordBonusRub: centsToRub(landlordBonusCents),
      tenantBonusRub: centsToRub(tenantBonusCents),
    },
    discrepancies,
  };
}

export function auditEconomicsDeals(params: {
  deals: EconomicsDeal[];
  ledgerEntries: EconomicsLedgerEntry[];
  limit?: number;
  offset?: number;
  snapshotAt?: Date;
}): EconomicsAuditReport {
  const snapshotAt = params.snapshotAt ?? new Date();
  const eligibleDeals = params.deals
    .filter((deal) =>
      (deal.kind === "partner_purchase" || deal.kind === "rental_deal")
      && (deal.status === "settled" || deal.status === "refunded")
      && (deal.settledAt === null || deal.settledAt <= snapshotAt))
    .sort((left, right) => {
      if (left.settledAt === null && right.settledAt !== null) return 1;
      if (left.settledAt !== null && right.settledAt === null) return -1;
      if (left.settledAt !== null && right.settledAt !== null) {
        const settledAtDifference = right.settledAt.getTime() - left.settledAt.getTime();
        if (settledAtDifference !== 0) return settledAtDifference;
      }
      return right.id - left.id;
    });
  const requestedLimit = params.limit === undefined
    ? Math.max(eligibleDeals.length, 1)
    : params.limit;
  const requestedOffset = params.offset ?? 0;
  const limit = Number.isFinite(requestedLimit)
    ? Math.max(1, Math.min(100, Math.trunc(requestedLimit)))
    : 25;
  const offset = Number.isFinite(requestedOffset)
    ? Math.max(0, Math.trunc(requestedOffset))
    : 0;
  const entriesByDeal = new Map<number, EconomicsLedgerEntry[]>();
  for (const entry of params.ledgerEntries) {
    const entries = entriesByDeal.get(entry.dealId) ?? [];
    entries.push(entry);
    entriesByDeal.set(entry.dealId, entries);
  }

  const results: EconomicsAuditDeal[] = [];
  let cleanDeals = 0;
  let discrepantDeals = 0;
  const discrepancies: Array<EconomicsAuditDiscrepancy & { dealId: number; kind: string; status: string }> = [];
  const pageEnd = offset + limit;

  // Audit every eligible deal so the totals remain authoritative, but retain
  // detailed results only for the requested review window.
  eligibleDeals.forEach((deal, index) => {
    const result = auditDeal(deal, entriesByDeal.get(deal.id) ?? []);
    if (result.discrepancies.length === 0) {
      cleanDeals += 1;
    } else {
      discrepantDeals += 1;
    }
    if (index >= offset && index < pageEnd) {
      results.push(result);
      discrepancies.push(...result.discrepancies.map((discrepancy) => ({
        ...discrepancy,
        dealId: result.dealId,
        kind: result.kind,
        status: result.status,
      })));
    }
  });

  return {
    source: "financial_deals_and_ledger_audit",
    checkedDeals: eligibleDeals.length,
    cleanDeals,
    discrepantDeals,
    results,
    discrepancies,
    limit,
    offset,
    snapshotAt: snapshotAt.toISOString(),
  };
}

export function calculateEconomicsReport(params: {
  deals: EconomicsDeal[];
  ledgerEntries: EconomicsLedgerEntry[];
  partners: EconomicsPartner[];
  users: EconomicsUser[];
  period: EconomicsPeriod;
  status: EconomicsStatus;
  policy: EconomicsReport["policy"];
}): EconomicsReport {
  const uniqueEntries = new Map<string, EconomicsLedgerEntry>();
  const uniqueReversals = new Set<string>();
  for (const entry of params.ledgerEntries) {
    const reversalKey = entry.reversalOfId === null ? null : `${entry.reversalOfId}:${entry.source}`;
    if (reversalKey && uniqueReversals.has(reversalKey)) continue;
    if (reversalKey) uniqueReversals.add(reversalKey);
    const key = entry.idempotencyKey ?? `${entry.id}:${entry.reversalOfId ?? "original"}:${entry.source}:${entry.amountRub}`;
    if (!uniqueEntries.has(key)) uniqueEntries.set(key, entry);
  }
  const entries = [...uniqueEntries.values()];
  const entriesByDeal = new Map<number, EconomicsLedgerEntry[]>();
  for (const entry of entries) {
    const list = entriesByDeal.get(entry.dealId) ?? [];
    list.push(entry);
    entriesByDeal.set(entry.dealId, list);
  }

  const partnerById = new Map(params.partners.map((partner) => [partner.id, partner]));
  const summaryCents: Record<string, bigint> = {};
  const dealTypeMap = new Map<string, { labels: Record<string, string | number | null>; cents: Record<string, bigint> }>();
  const partnerMap = new Map<string, { labels: Record<string, string | number | null>; cents: Record<string, bigint> }>();
  const categoryMap = new Map<string, { labels: Record<string, string | number | null>; cents: Record<string, bigint> }>();
  let confirmedLedgerEntries = 0;

  for (const deal of params.deals) {
    if (deal.kind !== "partner_purchase" && deal.kind !== "rental_deal") continue;
    if (params.status !== "all" && deal.status !== params.status) continue;
    const dealEntries = entriesByDeal.get(deal.id) ?? [];
    const originalEntries = dealEntries.filter((entry) => entry.reversalOfId === null);
    const reversalEntries = dealEntries.filter((entry) => entry.reversalOfId !== null);
    const hasSettlement = deal.settledAt !== null && inPeriod(deal.settledAt, params.period)
      && originalEntries.some((entry) => inPeriod(entry.createdAt, params.period));
    const hasRefund = reversalEntries.some((entry) => inPeriod(entry.createdAt, params.period));
    if (!hasSettlement && !hasRefund) continue;

    if (hasSettlement) {
      const values = eventValues(deal, 1n);
      for (const [name, value] of Object.entries(values)) addCents(summaryCents, name, value);
      addCents(summaryCents, "dealCount", 1n);
      addBreakdown(dealTypeMap, deal.kind, { type: deal.kind }, { ...values, dealCount: 1n });
      const partner = deal.partnerId === null ? null : partnerById.get(deal.partnerId);
      const category = partner?.category ?? (deal.kind === "rental_deal" ? "rent" : "other");
      const partnerKey = partner ? String(partner.id) : "none";
      addBreakdown(partnerMap, partnerKey, {
        partnerId: partner?.id ?? null,
        partnerName: partner?.name ?? "Без партнёра",
        category,
      }, { ...values, dealCount: 1n });
      addBreakdown(categoryMap, category, { category }, { ...values, dealCount: 1n });
      confirmedLedgerEntries += originalEntries.filter((entry) => inPeriod(entry.createdAt, params.period)).length;
    }

    if (hasRefund) {
      const values = eventValues(deal, -1n);
      for (const [name, value] of Object.entries(values)) addCents(summaryCents, name, value);
      addBreakdown(dealTypeMap, deal.kind, { type: deal.kind }, values);
      const partner = deal.partnerId === null ? null : partnerById.get(deal.partnerId);
      const category = partner?.category ?? (deal.kind === "rental_deal" ? "rent" : "other");
      const partnerKey = partner ? String(partner.id) : "none";
      addBreakdown(partnerMap, partnerKey, {
        partnerId: partner?.id ?? null,
        partnerName: partner?.name ?? "Без партнёра",
        category,
      }, values);
      addBreakdown(categoryMap, category, { category }, values);
      confirmedLedgerEntries += reversalEntries.filter((entry) => inPeriod(entry.createdAt, params.period)).length;
    }
  }

  const summary = {
    ...moneyBreakdown(summaryCents),
    outstandingBonusLiabilityRub: centsToRub(currentLiabilityCents(params.users)),
  };
  const toBreakdown = <T extends Record<string, string | number | null>>(
    map: Map<string, { labels: T; cents: Record<string, bigint> }>,
  ) => [...map.values()].map(({ labels, cents }) => ({ ...labels, ...moneyBreakdown(cents) }));

  return {
    period: {
      from: params.period.from.toISOString(),
      to: params.period.to.toISOString(),
      type: params.period.type,
      timezone: "UTC",
      isEmpty: summary.dealCount === 0 && confirmedLedgerEntries === 0,
    },
    source: "confirmed_financial_deals_and_ledger",
    status: params.status,
    confirmedLedgerEntries,
    summary,
    byDealType: toBreakdown(dealTypeMap) as EconomicsReport["byDealType"],
    byPartner: toBreakdown(partnerMap) as EconomicsReport["byPartner"],
    byCategory: toBreakdown(categoryMap) as EconomicsReport["byCategory"],
    policy: params.policy,
    operatingCostsRub: null,
    profitBasis: "contribution_before_operating_costs",
  };
}