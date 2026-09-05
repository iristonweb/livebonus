import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import {
  CalculateBonusResponse,
  CorrectBalanceReconciliationResponse,
  GetDashboardActivityResponse,
  GetBalanceReconciliationResponse,
  GetDashboardSummaryResponse,
  GetEconomicsResponse,
  GetEconomicsAuditResponse,
  GetFinancialPolicyResponse,
  GetOfferResponse,
  GetMeResponse,
  GetPartnerResponse,
  GetScoreHistoryResponse,
  GetScoreResponse,
  GetScoreTimelineResponse,
  ListBalanceReconciliationResponse,
  ListCatalogAuditLogResponse,
  ListPartnerLogoCleanupHistoryResponse,
  ListFinancialLedgerResponse,
  ListLeasesResponse,
  ListOffersResponse,
  ListPassportSharesResponse,
  ListPartnersResponse,
  ListPaymentReconciliationResponse,
  ListTransactionsResponse,
  ListVerificationQueueResponse,
  ListMyVerificationsResponse,
  CleanupPartnerLogosResponse,
  QuotePartnerPurchaseResponse,
  QuoteRentalDealResponse,
  RequestOtpResponse,
  VerifyOtpResponse,
} from "@workspace/api-zod";
import type {
  BalanceReconciliation,
  BalanceReconciliationCorrection,
  BalanceReconciliationCorrectionResponse,
  BalanceReconciliationDetail,
  BalanceReconciliationReport,
} from "@workspace/api-zod";

type ApiSchema = { parse: (fixture: unknown) => unknown };

function parseFixture(name: string, schema: ApiSchema, fixture: unknown) {
  try {
    return schema.parse(fixture);
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(`${name} fixture does not match the API contract: ${details}`);
  }
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (inQuotes) {
      if (character === '"' && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell.length === 0) {
      inQuotes = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (inQuotes) throw new Error("CSV ended inside a quoted cell");
  if (row.length > 0 || cell.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

const score = {
  score: 720,
  baseScore: 500,
  categoryScore: 220,
  scoreVersion: "fixture-score-v1",
  tier: "above_average",
  tierLabel: "Хороший",
  components: [
    {
      key: "payments",
      name: "Платёжная дисциплина",
      score: 280,
      maxScore: 350,
      minScore: -350,
      capApplied: false,
      capDescription: "Ограничение: от −350 до +350 баллов",
      description: "История своевременных платежей",
      details: [],
      events: [],
    },
  ],
  activeLease: {
    address: "ул. Тестовая, 1",
    city: "Москва",
    monthlyRentRub: 50_000,
    startDate: "2025-01-15T00:00:00.000Z",
    onTimePayments: 12,
  },
  isPhoneVerified: true,
  isIdentityVerified: true,
  isIncomeVerified: false,
  verificationLevel: 2,
  totalLeases: 1,
  activeLeases: 1,
};

const dashboardSummary = {
  pointsBalance: 12_450,
  status: "gold",
  statusMultiplier: 1.25,
  pointsEarnedThisMonth: 1_250,
  pointsSpentThisMonth: 300,
  totalPartnersAvailable: 12,
  activeOffersCount: 4,
  pointsToNextStatus: 25_000,
  nextStatus: "platinum",
  rubEquivalent: 9_960,
};

const leases = [
  {
    id: 1,
    address: "ул. Тестовая, 1",
    city: "Москва",
    monthlyRentRub: 50_000,
    startDate: "2025-01-15T00:00:00.000Z",
    isActive: true,
    onTimePayments: 12,
    latePayments: 0,
  },
];

const user = {
  id: 1,
  phone: "+79001234567",
  name: "Тестовый пользователь",
  email: "smoke@example.com",
  isAdmin: false,
  status: "gold",
  pointsBalance: 12_450,
  liveScore: 720,
  isPhoneVerified: true,
  isIdentityVerified: true,
  isIncomeVerified: false,
  verificationLevel: 2,
  createdAt: "2025-01-01T00:00:00.000Z",
};

const catalogPartners = [{
  id: 7,
  name: "Тестовый партнёр",
  category: "food",
  description: "Скидка для участников программы Live Score.",
  logoUrl: null,
  logoObjectPath: null,
  bonusMultiplier: 1.5,
  address: "ул. Тестовая, 7",
  city: "Москва",
  isActive: true,
  totalTransactions: 12,
  totalVolumeRub: 24_000,
}];

const catalogOffers = [{
  id: 17,
  partnerId: 7,
  partnerName: "Тестовый партнёр",
  partnerLogoUrl: null,
  title: "Получи больше бонусов",
  description: "Повышенное начисление на первую покупку.",
  bonusMultiplier: 2,
  category: "food",
  minAmountRub: 1_000,
  isActive: true,
  expiresAt: "2026-12-31T23:59:59.000Z",
  isSaved: false,
  isActivated: false,
}];

const walletLedger = [
  {
    id: 101,
    dealId: 201,
    transactionId: null,
    userId: 1,
    entryType: "credit",
    source: "rental_deal",
    reference: "deal:201:tenant-bonus",
    amountRub: 120,
    amountRubSigned: 120,
    dealType: "rental_deal",
    category: "rent",
    transactionType: "credit",
    partnerId: null,
    partnerName: null,
    settlementStatus: "settled",
    paymentProvider: "yookassa",
    providerPaymentId: "payment-smoke-settled",
    providerPaymentStatus: "succeeded",
    providerRefundId: null,
    providerRefundStatus: null,
    dealIdempotencyKey: "smoke-rental-settled-key",
    dealGrossAmountRub: 1_200,
    dealNetAmountRub: 1_200,
    dealFeeAmountRub: 18,
    dealBonusRedeemedRub: 0,
    dealLandlordBonusRub: 120,
    dealTenantBonusRub: 120,
    balanceAfterRub: 1_120,
    reversalOfId: null,
    createdAt: "2026-08-30T10:00:00.000Z",
  },
  {
    id: 102,
    dealId: 202,
    transactionId: null,
    userId: 1,
    entryType: "credit",
    source: "refund",
    reference: "deal:202:refund:91",
    amountRub: 80,
    amountRubSigned: 80,
    dealType: "rental_deal",
    category: "rent",
    transactionType: "refund",
    partnerId: null,
    partnerName: null,
    settlementStatus: "refunded",
    paymentProvider: "yookassa",
    providerPaymentId: "payment-smoke-refunded",
    providerPaymentStatus: "succeeded",
    providerRefundId: "refund-smoke-refunded",
    providerRefundStatus: "succeeded",
    dealIdempotencyKey: "smoke-rental-refunded-key",
    dealGrossAmountRub: 800,
    dealNetAmountRub: 800,
    dealFeeAmountRub: 12,
    dealBonusRedeemedRub: 0,
    dealLandlordBonusRub: 80,
    dealTenantBonusRub: 80,
    balanceAfterRub: 1_000,
    reversalOfId: 91,
    createdAt: "2026-08-29T10:00:00.000Z",
  },
  {
    id: 103,
    dealId: 203,
    transactionId: null,
    userId: 1,
    entryType: "debit",
    source: "partner_purchase",
    reference: "deal:203:bonus-debit",
    amountRub: 150,
    amountRubSigned: -150,
    dealType: "partner_purchase",
    category: "other",
    transactionType: "redeem",
    partnerId: 7,
    partnerName: "Тестовый партнёр",
    settlementStatus: "pending",
    paymentProvider: "yookassa",
    providerPaymentId: "payment-smoke-pending",
    providerPaymentStatus: "pending",
    providerRefundId: null,
    providerRefundStatus: null,
    dealIdempotencyKey: "smoke-partner-pending-key",
    dealGrossAmountRub: 1_000,
    dealNetAmountRub: 850,
    dealFeeAmountRub: 12.75,
    dealBonusRedeemedRub: 150,
    dealLandlordBonusRub: 0,
    dealTenantBonusRub: 0,
    balanceAfterRub: 1_000,
    reversalOfId: null,
    createdAt: "2026-08-28T10:00:00.000Z",
  },
];

const walletLegacyTransactions = [
  {
    id: 901,
    userId: 1,
    type: "earn",
    category: "rent",
    amountRub: 40,
    amountRubSigned: 40,
    bonusValueRub: 40,
    direction: "credit",
    dealType: null,
    settlementStatus: null,
    operationSource: null,
    isReversal: false,
    pointsEarned: 50,
    multiplier: 1,
    description: "Историческое начисление за аренду",
    partnerName: null,
    partnerLogoUrl: null,
    createdAt: "2026-08-29T12:00:00.000Z",
  },
];

const economics = {
  period: {
    from: "2026-08-01T00:00:00.000Z",
    to: "2026-08-31T23:59:59.999Z",
    type: "custom",
    timezone: "UTC",
    isEmpty: false,
  },
  source: "confirmed_financial_deals_and_ledger",
  status: "all",
  confirmedLedgerEntries: 3,
  summary: {
    dealCount: 1,
    grossTurnoverRub: 1_000,
    netTurnoverRub: 900,
    partnerCommissionRub: 13.5,
    landlordCommissionRub: 0,
    tenantBonusAccruedRub: 0,
    landlordBonusAccruedRub: 0,
    bonusRedeemedRub: 100,
    refundsRub: 0,
    netRevenueRub: 13.5,
    bonusLiabilityCostRub: 0,
    contributionProfitRub: 13.5,
    contributionMarginPercent: 100,
    averageCheckRub: 1_000,
    outstandingBonusLiabilityRub: 100,
  },
  byDealType: [{
    type: "partner_purchase",
    dealCount: 1,
    grossTurnoverRub: 1_000,
    netTurnoverRub: 900,
    partnerCommissionRub: 13.5,
    landlordCommissionRub: 0,
    tenantBonusAccruedRub: 0,
    landlordBonusAccruedRub: 0,
    bonusRedeemedRub: 100,
    refundsRub: 0,
    netRevenueRub: 13.5,
    bonusLiabilityCostRub: 0,
    contributionProfitRub: 13.5,
    contributionMarginPercent: 100,
    averageCheckRub: 1_000,
  }],
  byPartner: [{
    partnerId: 1,
    partnerName: "Тестовый партнёр",
    category: "food",
    dealCount: 1,
    grossTurnoverRub: 1_000,
    netTurnoverRub: 900,
    partnerCommissionRub: 13.5,
    landlordCommissionRub: 0,
    tenantBonusAccruedRub: 0,
    landlordBonusAccruedRub: 0,
    bonusRedeemedRub: 100,
    refundsRub: 0,
    netRevenueRub: 13.5,
    bonusLiabilityCostRub: 0,
    contributionProfitRub: 13.5,
    contributionMarginPercent: 100,
    averageCheckRub: 1_000,
  }],
  byCategory: [],
  policy: {
    currency: "RUB",
    purchaseMaxRedemptionRate: 0.15,
    partnerFeeRate: 0.015,
    landlordFeeRate: 0.015,
    rentalTenantBonusRate: 0.1,
    rentalLandlordBonusRate: 0.1,
  },
  operatingCostsRub: null,
  profitBasis: "contribution_before_operating_costs",
  activeUsers: 1,
  usersByStatus: { gold: 1 },
};

const economicsAudit = {
  source: "financial_deals_and_ledger_audit",
  checkedDeals: 2,
  cleanDeals: 1,
  discrepantDeals: 1,
  results: [
    {
      dealId: 17,
      kind: "partner_purchase",
      status: "settled",
      amounts: {
        grossAmountRub: 1_000,
        bonusRedeemedRub: 100,
        netAmountRub: 900,
        feeAmountRub: 13.5,
        landlordBonusRub: 0,
        tenantBonusRub: 0,
      },
      discrepancies: [{
        code: "ledger_amount_mismatch",
        field: "feeAmountRub",
        expectedRub: 13.5,
        actualRub: 12.5,
        differenceRub: -1,
        message: "Комиссия в ledger не совпадает со сделкой",
      }],
    },
    {
      dealId: 18,
      kind: "rental_deal",
      status: "refunded",
      amounts: {
        grossAmountRub: 2_000,
        bonusRedeemedRub: 0,
        netAmountRub: 2_000,
        feeAmountRub: 30,
        landlordBonusRub: 200,
        tenantBonusRub: 200,
      },
      discrepancies: [],
    },
  ],
  discrepancies: [{
    code: "ledger_amount_mismatch",
    field: "feeAmountRub",
    expectedRub: 13.5,
    actualRub: 12.5,
    differenceRub: -1,
    message: "Комиссия в ledger не совпадает со сделкой",
    dealId: 17,
    kind: "partner_purchase",
    status: "settled",
  }],
  limit: 25,
  offset: 0,
  snapshotAt: "2026-08-31T12:00:00.000Z",
};

const economicsAuditReviewResults = [
  ...Array.from({ length: 24 }, (_, index) => ({
    ...economicsAudit.results[1],
    dealId: 100 - index,
  })),
  economicsAudit.results[0],
  economicsAudit.results[1],
];

const paymentReconciliation = {
  items: [{
    id: 41,
    kind: "partner_purchase",
    status: "pending",
    userId: 1,
    userName: "Тестовый пользователь",
    userPhone: "+79001234567",
    partnerId: 1,
    partnerName: "Тестовый партнёр",
    policyVersion: 1,
    idempotencyKey: "smoke-payment-idempotency-key",
    grossAmountRub: 1_000,
    bonusRedeemedRub: 150,
    netAmountRub: 850,
    feeAmountRub: 12.75,
    landlordBonusRub: 0,
    tenantBonusRub: 0,
    currency: "RUB",
    paymentProvider: "yookassa",
    paymentMethod: "mir_pay",
    providerPaymentId: "payment-smoke-pending",
    providerPaymentStatus: "pending",
    providerRefundStatus: null,
    paymentFailureReason: null,
    createdAt: "2026-08-29T08:00:00.000Z",
    paymentUpdatedAt: "2026-08-29T08:01:00.000Z",
    needsReview: true,
    reviewReason: "Проверить итоговый статус у провайдера",
  }],
  summary: {
    total: 1,
    pending: 1,
    paymentFailed: 0,
    cancelled: 0,
    requiresReview: 1,
    confirmedAwaitingReconciliation: 0,
    confirmedAwaitingReconciliationLastUpdatedAt: null,
  },
  status: "all",
  limit: 100,
  offset: 0,
};

const financePolicy = {
  id: 1,
  version: 1,
  currency: "RUB",
  purchaseRedemptionRate: 0.15,
  partnerFeeRate: 0.015,
  rentalBonusRate: 0.1,
  effectiveFrom: "2026-01-01T00:00:00.000Z",
};

const categoryMultipliers: Record<string, number> = {
  rent: 2,
  utilities: 2,
  transport: 1.5,
  health: 1.3,
  food: 1,
  other: 1,
};

const statusMultipliers: Record<string, number> = {
  novice: 1,
  silver: 1.1,
  gold: 1.25,
  platinum: 1.5,
};

const scoreTimeline = [
  { date: "2025-01-01T00:00:00.000Z", score: 650 },
  { date: "2025-02-01T00:00:00.000Z", score: 720 },
];

const catalogAuditLog = [];

const catalogAuditExportCsv = [
  "administrator,timestamp,entityType,entityId,entityName,action,beforeValues,afterValues",
  'Catalog reviewer,2026-08-30T10:00:00.000Z,offer,84,Filtered offer,update,"{""logoUrl"":""old-logo.svg""}","{""logoUrl"":""approved-logo.svg""}"',
].join("\r\n") + "\r\n";

const logoCleanupDryRun = {
  dryRun: true,
  scanned: 4,
  referenced: 2,
  orphaned: [
    "/objects/partner-logos/old-logo.svg",
    "/objects/partner-logos/unavailable-logo.svg",
  ],
  removed: [],
  failed: [],
};

const logoCleanupConfirmed = {
  ...logoCleanupDryRun,
  dryRun: false,
  removed: ["/objects/partner-logos/old-logo.svg"],
  failed: [{
    path: "/objects/partner-logos/unavailable-logo.svg",
    error: "Объект недоступен в хранилище",
  }],
};

const logoCleanupHistory = [{
  id: 2,
  adminUserId: 7,
  adminName: "Последний администратор",
  adminPhone: null,
  mode: "confirmed",
  scanned: 4,
  referenced: 2,
  orphaned: [
    "/objects/partner-logos/old-logo.svg",
    "/objects/partner-logos/unavailable-logo.svg",
  ],
  removed: ["/objects/partner-logos/old-logo.svg"],
  failed: [{
    path: "/objects/partner-logos/unavailable-logo.svg",
    error: "Объект недоступен в хранилище",
  }],
  createdAt: "2026-08-31T09:45:00.000Z",
}, {
  id: 1,
  adminUserId: 7,
  adminName: "Исторический администратор",
  adminPhone: null,
  mode: "dry_run",
  scanned: 3,
  referenced: 2,
  orphaned: ["/objects/partner-logos/old-logo.svg"],
  removed: [],
  failed: [],
  createdAt: "2026-08-30T09:15:00.000Z",
}];

const balanceReconciliation = {
  items: [],
  summary: {
    totalUsers: 0,
    consistent: 0,
    roundingDifference: 0,
    mismatch: 0,
    unmigrated: 0,
    returned: 0,
  },
  status: "mismatch",
  limit: 25,
  offset: 0,
};

const balanceReconciliationMismatch: BalanceReconciliationReport = {
  items: [{
    userId: 42,
    phone: "+79990001122",
    name: "Анна Сверочная",
    pointsBalance: 1_250,
    bonusBalanceRub: 1_200,
    expectedBalanceRub: 1_000,
    differenceRub: 200,
    differenceCents: 20_000,
    legacyEquivalentPoints: 1_500,
    status: "mismatch",
    canCorrect: true,
  }],
  summary: {
    totalUsers: 1,
    consistent: 0,
    roundingDifference: 0,
    mismatch: 1,
    unmigrated: 0,
    returned: 1,
  },
  status: "mismatch",
  limit: 25,
  offset: 0,
};

type ReconciliationQuery = {
  status: "all" | "consistent" | "rounding_difference" | "mismatch" | "unmigrated";
  limit: 25 | 50 | 100;
  offset: number;
};

type ReconciliationResultStatus = Exclude<ReconciliationQuery["status"], "all">;
type BalanceReconciliationFixture = BalanceReconciliationReport | ((query: ReconciliationQuery) => BalanceReconciliationReport);
type BalanceReconciliationStatusFixture = number | ((query: ReconciliationQuery) => number);
type BalanceReconciliationDetailStatusFixture = number | (() => number);

const reconciliationFixtureRows: Record<ReconciliationResultStatus, BalanceReconciliation> = {
  mismatch: balanceReconciliationMismatch.items[0],
  consistent: {
    ...balanceReconciliationMismatch.items[0],
    userId: 68,
    phone: "+79990001148",
    name: "Ирина Совпадающая",
    pointsBalance: 1_250,
    bonusBalanceRub: 1_000,
    expectedBalanceRub: 1_000,
    differenceRub: 0,
    differenceCents: 0,
    legacyEquivalentPoints: 1_250,
    status: "consistent",
    canCorrect: false,
  },
  rounding_difference: {
    ...balanceReconciliationMismatch.items[0],
    userId: 69,
    phone: "+79990001149",
    name: "Павел Округляющий",
    pointsBalance: 1_250,
    bonusBalanceRub: 1_000.04,
    expectedBalanceRub: 1_000,
    differenceRub: 0.04,
    differenceCents: 4,
    legacyEquivalentPoints: 1_250,
    status: "rounding_difference",
    canCorrect: false,
  },
  unmigrated: {
    ...balanceReconciliationMismatch.items[0],
    userId: 70,
    phone: "+79990001150",
    name: "Сергей Немигрированный",
    pointsBalance: 0,
    bonusBalanceRub: null,
    expectedBalanceRub: 0,
    differenceRub: null,
    differenceCents: null,
    legacyEquivalentPoints: null,
    status: "unmigrated",
    canCorrect: false,
  },
};

const reconciliationFixtureDataset: BalanceReconciliation[] = [
  ...Array.from({ length: 26 }, (_, index) => ({
    ...reconciliationFixtureRows.mismatch,
    userId: 42 + index,
    phone: `+7999000${1122 + index}`,
    name: index === 0 ? reconciliationFixtureRows.mismatch.name : `Расхождение ${index + 1}`,
  })),
  reconciliationFixtureRows.consistent,
  reconciliationFixtureRows.rounding_difference,
  reconciliationFixtureRows.unmigrated,
];

function balanceReconciliationForQuery(query: ReconciliationQuery): BalanceReconciliationReport {
  const filtered = query.status === "all"
    ? reconciliationFixtureDataset
    : reconciliationFixtureDataset.filter(item => item.status === query.status);
  const items = filtered.slice(query.offset, query.offset + query.limit);
  const summary = reconciliationFixtureDataset.reduce(
    (counts, item) => {
      counts[item.status === "rounding_difference" ? "roundingDifference" : item.status] += 1;
      return counts;
    },
    { consistent: 0, roundingDifference: 0, mismatch: 0, unmigrated: 0 } as Record<string, number>,
  );

  return {
    items,
    summary: {
      totalUsers: reconciliationFixtureDataset.length,
      consistent: summary.consistent,
      roundingDifference: summary.roundingDifference,
      mismatch: summary.mismatch,
      unmigrated: summary.unmigrated,
      returned: items.length,
    },
    status: query.status,
    limit: query.limit,
    offset: query.offset,
  };
}

const balanceReconciliationCorrection: BalanceReconciliationCorrection = {
  id: 501,
  userId: 42,
  operatorUserId: 7,
  correctionTarget: "monetary",
  reason: "Сверка после миграции",
  idempotencyKey: "smoke-balance-correction-key",
  beforePointsBalance: 1_200,
  afterPointsBalance: 1_250,
  beforeBonusBalanceRub: 960,
  afterBonusBalanceRub: 1_000,
  beforeDifferenceCents: 40,
  afterDifferenceCents: 0,
  createdAt: "2026-08-29T08:00:00.000Z",
};

const balanceReconciliationDetail: BalanceReconciliationDetail = {
  ...balanceReconciliationMismatch.items[0],
  corrections: [balanceReconciliationCorrection],
};

const balanceReconciliationRoundingDetail: BalanceReconciliationDetail = {
  ...reconciliationFixtureRows.rounding_difference,
  corrections: [],
};

const correctedBalanceReconciliation: BalanceReconciliation = {
  ...balanceReconciliationMismatch.items[0],
  pointsBalance: 1_500,
  expectedBalanceRub: 1_200,
  differenceRub: 0,
  differenceCents: 0,
  legacyEquivalentPoints: 1_500,
  status: "consistent",
  canCorrect: false,
};

const correctedBalanceReconciliationDetail: BalanceReconciliationDetail = {
  ...correctedBalanceReconciliation,
  corrections: [
    ...balanceReconciliationDetail.corrections,
    {
      ...balanceReconciliationCorrection,
      id: 502,
      beforePointsBalance: 1_250,
      afterPointsBalance: 1_500,
      beforeBonusBalanceRub: 1_200,
      afterBonusBalanceRub: 1_200,
      beforeDifferenceCents: 20_000,
      afterDifferenceCents: 0,
      reason: "Исправление по результатам сверки",
      idempotencyKey: "smoke-balance-correction-success-key",
    },
  ],
};

const balanceReconciliationCorrectionResponse: BalanceReconciliationCorrectionResponse = {
  reconciliation: correctedBalanceReconciliation,
  correction: correctedBalanceReconciliationDetail.corrections[1],
  idempotent: false,
};

const balanceReconciliationConflict = {
  code: "RECONCILIATION_ROUNDING_ONLY",
  error: "Осталось только допустимое расхождение округления",
};

test.beforeAll(() => {
  parseFixture("score", GetScoreResponse, score);
  parseFixture("dashboard summary", GetDashboardSummaryResponse, dashboardSummary);
  parseFixture("leases", ListLeasesResponse, leases);
  parseFixture("user", GetMeResponse, user);
  parseFixture("economics", GetEconomicsResponse, economics);
  parseFixture("economics audit", GetEconomicsAuditResponse, economicsAudit);
  parseFixture("payment reconciliation", ListPaymentReconciliationResponse, paymentReconciliation);
  parseFixture("financial policy", GetFinancialPolicyResponse, financePolicy);
  parseFixture("dashboard activity", GetDashboardActivityResponse, []);
  parseFixture("score history", GetScoreHistoryResponse, []);
  parseFixture("partners", ListPartnersResponse, []);
  parseFixture("offers", ListOffersResponse, []);
  parseFixture("financial ledger", ListFinancialLedgerResponse, walletLedger);
  parseFixture("transactions", ListTransactionsResponse, []);
  parseFixture("score timeline", GetScoreTimelineResponse, scoreTimeline);
  parseFixture("passport shares", ListPassportSharesResponse, []);
  parseFixture("catalog audit log", ListCatalogAuditLogResponse, catalogAuditLog);
  parseFixture("logo cleanup dry-run", CleanupPartnerLogosResponse, logoCleanupDryRun);
  parseFixture("logo cleanup confirmation", CleanupPartnerLogosResponse, logoCleanupConfirmed);
  parseFixture("logo cleanup history", ListPartnerLogoCleanupHistoryResponse, logoCleanupHistory);
  parseFixture("balance reconciliation", ListBalanceReconciliationResponse, balanceReconciliation);
  parseFixture("balance reconciliation mismatch", ListBalanceReconciliationResponse, balanceReconciliationMismatch);
  for (const status of ["all", "consistent", "rounding_difference", "mismatch", "unmigrated"] as const) {
    for (const limit of [25, 50, 100] as const) {
      for (const offset of [0, 25] as const) {
        parseFixture(
          `balance reconciliation ${status} limit=${limit} offset=${offset}`,
          ListBalanceReconciliationResponse,
          balanceReconciliationForQuery({ status, limit, offset }),
        );
      }
    }
  }
  parseFixture("balance reconciliation detail", GetBalanceReconciliationResponse, balanceReconciliationDetail);
  parseFixture("balance reconciliation corrected detail", GetBalanceReconciliationResponse, correctedBalanceReconciliationDetail);
  parseFixture("balance reconciliation correction", CorrectBalanceReconciliationResponse, balanceReconciliationCorrectionResponse);
});

interface AuthMockState {
  /** phone -> issued dev code */
  otps: Map<string, string>;
  /** when true, verify-otp behaves as if the code has expired */
  expired: boolean;
  /** every API request made while this mock is installed */
  requests: Array<{ method: string; path: string }>;
  /** API requests without an explicit fixture branch */
  unexpectedRequests: string[];
}

const pageApiMocks = new WeakMap<Page, AuthMockState[]>();

type PaymentReconciliationFixture = typeof paymentReconciliation | (() => typeof paymentReconciliation);
type PaymentReconciliationStatusFixture = number | (() => number);
type CatalogAuditExportFailureFixture = "network" | "non-json" | undefined | (() => "network" | "non-json" | undefined);
type CatalogAuditExportStatusFixture = number | (() => number);
type ReconciliationExportStatusFixture = number | (() => number);
type ReconciliationExportBodyFixture = string | (() => string);
type FixtureOrFactory<T> = T | (() => T);
type EconomicsAuditQuery = { limit: number; offset: number; snapshotAt?: string };
type EconomicsAuditFixture = typeof economicsAudit | ((query: EconomicsAuditQuery) => typeof economicsAudit);

async function mockApi(page: Page, options?: {
  isAdmin?: boolean;
  economicsAudit?: EconomicsAuditFixture;
  paymentReconciliation?: PaymentReconciliationFixture;
  paymentReconciliationStatus?: PaymentReconciliationStatusFixture;
  balanceReconciliation?: BalanceReconciliationFixture;
  balanceReconciliationStatus?: BalanceReconciliationStatusFixture;
  balanceReconciliationDetail?: FixtureOrFactory<BalanceReconciliationDetail>;
  balanceReconciliationDetailStatus?: BalanceReconciliationDetailStatusFixture;
  balanceReconciliationCorrection?: FixtureOrFactory<BalanceReconciliationCorrectionResponse>;
  balanceReconciliationCorrectionStatus?: number;
  balanceReconciliationCorrectionError?: unknown;
  reconciliationExportStatus?: ReconciliationExportStatusFixture;
  reconciliationExportBody?: ReconciliationExportBodyFixture;
  catalogAuditExportFailure?: CatalogAuditExportFailureFixture;
  catalogAuditExportStatus?: CatalogAuditExportStatusFixture;
  catalogAuditExportError?: unknown;
  catalog?: {
    partners?: typeof catalogPartners;
    offers?: typeof catalogOffers;
  };
  catalogStatus?: {
    partners?: number | (() => number | undefined);
    offers?: number | (() => number | undefined);
  };
  endpointStatus?: {
    summary?: number;
    score?: number;
    activity?: number;
    partners?: number;
    offers?: number;
    leases?: number;
  };
}): Promise<AuthMockState> {
  const auth: AuthMockState = {
    otps: new Map(),
    expired: false,
    requests: [],
    unexpectedRequests: [],
  };
  let passportShareFixture: {
    id: number;
    token: string;
    expiresAt: string;
    revokedAt: string | null;
    createdAt: string;
    lastAccessedAt: string | null;
    status: "active" | "expired" | "revoked";
  } | null = null;
  pageApiMocks.set(page, [...(pageApiMocks.get(page) ?? []), auth]);

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const requestPath = `${url.pathname}${url.search}`;
    auth.requests.push({ method: request.method(), path: requestPath });
    let status = 200;
    let response: unknown;
    const endpointStatus = request.method() === "GET"
      ? ({
          "/api/dashboard/summary": options?.endpointStatus?.summary,
          "/api/score": options?.endpointStatus?.score,
          "/api/dashboard/activity": options?.endpointStatus?.activity,
          "/api/partners": options?.endpointStatus?.partners,
          "/api/offers": options?.endpointStatus?.offers,
          "/api/leases": options?.endpointStatus?.leases,
        } as Record<string, number | undefined>)[url.pathname]
      : undefined;

    if (request.method() === "POST" && url.pathname.endsWith("/auth/request-otp")) {
      const body = request.postDataJSON() as { phone?: string };
      const phone = (body.phone ?? "").trim();
      auth.otps.set(phone, "1234");
      response = parseFixture("request OTP response", RequestOtpResponse, {
        success: true,
        maskedPhone: phone.replace(/^(\+?\d{1,2})(\d+)(\d{2})$/, "$1•••$3"),
        expiresIn: 600,
        devCode: "1234",
      });
    } else if (request.method() === "POST" && url.pathname.endsWith("/auth/verify-otp")) {
      const body = request.postDataJSON() as { phone?: string; code?: string };
      const phone = (body.phone ?? "").trim();
      const stored = auth.otps.get(phone);
      if (!stored) {
        status = 400;
        response = { error: "Код не запрашивался или истёк. Запросите новый." };
      } else if (auth.expired) {
        auth.otps.delete(phone);
        status = 400;
        response = { error: "Срок действия кода истёк. Запросите новый." };
      } else if (stored !== (body.code ?? "").trim()) {
        status = 400;
        response = { error: "Неверный код", attemptsLeft: 2 };
      } else {
        auth.otps.delete(phone);
        response = parseFixture("verify OTP response", VerifyOtpResponse, {
          token: "browser-smoke-token",
          userId: 1,
          name: user.name,
          phone,
          isAdmin: options?.isAdmin ?? user.isAdmin,
        });
      }
    } else if (request.method() === "POST" && url.pathname.endsWith("/bonus/calculate")) {
      const body = request.postDataJSON() as {
        amountRub: number;
        category: string;
        userStatus: string;
      };
      const effectiveMultiplier =
        (categoryMultipliers[body.category] ?? 1) *
        (statusMultipliers[body.userStatus] ?? 1);
      const pointsEarned = Math.floor(body.amountRub * 0.01 * effectiveMultiplier * 100);
      response = parseFixture("bonus calculation response", CalculateBonusResponse, {
        pointsEarned,
        rubEquivalent: Number((pointsEarned * 0.8).toFixed(2)),
        baseRate: 0.01,
        categoryMultiplier: categoryMultipliers[body.category] ?? 1,
        statusMultiplier: statusMultipliers[body.userStatus] ?? 1,
        promoMultiplier: 1,
        effectiveMultiplier,
        breakdown: `${pointsEarned} баллов`,
      });
    } else if (request.method() === "POST" && url.pathname.endsWith("/finance/quotes/purchase")) {
      const body = request.postDataJSON() as { grossAmountRub: number; requestedBonusRub?: number };
      const gross = body.grossAmountRub;
      const maxBonus = Number((gross * financePolicy.purchaseRedemptionRate).toFixed(2));
      const available = 1_000;
      const requested = body.requestedBonusRub ?? Math.min(maxBonus, available);
      const valid = requested <= maxBonus && requested <= available;
      const redeemed = valid ? requested : Math.min(requested, maxBonus, available);
      const net = Number((gross - redeemed).toFixed(2));
      response = parseFixture("purchase quote response", QuotePartnerPurchaseResponse, {
        kind: "partner_purchase",
        valid,
        currency: "RUB",
        policyVersion: 1,
        grossAmountRub: gross,
        maxBonusRedemptionRub: maxBonus,
        availableBonusRub: available,
        requestedBonusRub: requested,
        bonusRedeemedRub: redeemed,
        netAmountRub: net,
        partnerFeeRub: Number((net * 0.015).toFixed(2)),
        rates: { maxRedemptionRate: 0.15, partnerFeeRate: 0.015 },
        breakdown: {
          grossRub: gross,
          redemptionCapRub: maxBonus,
          balanceCapRub: available,
          bonusRedeemedRub: redeemed,
          netRub: net,
          partnerFeeRub: Number((net * 0.015).toFixed(2)),
        },
        errors: valid ? [] : [{
          code: requested > maxBonus ? "MAX_REDEMPTION_EXCEEDED" : "INSUFFICIENT_BALANCE",
          message: requested > maxBonus ? "Списать бонусами можно не более 15% от валового чека" : "Недостаточно денежного бонусного баланса",
        }],
      });
    } else if (request.method() === "POST" && url.pathname.endsWith("/finance/quotes/rental")) {
      const body = request.postDataJSON() as { grossAmountRub: number };
      const gross = body.grossAmountRub;
      const fee = Number((gross * 0.015).toFixed(2));
      const bonus = Number((gross * 0.1).toFixed(2));
      response = parseFixture("rental quote response", QuoteRentalDealResponse, {
        kind: "rental_deal",
        valid: true,
        currency: "RUB",
        policyVersion: 1,
        grossAmountRub: gross,
        landlordFeeRub: fee,
        landlordBonusRub: bonus,
        tenantBonusRub: bonus,
        rates: { landlordFeeRate: 0.015, landlordBonusRate: 0.1, tenantBonusRate: 0.1 },
        breakdown: { grossRub: gross, landlordFeeRub: fee, landlordBonusRub: bonus, tenantBonusRub: bonus },
        errors: [],
      });
    } else if (request.method() === "GET" && url.pathname.endsWith("/finance/payment-reconciliation")) {
      const configuredStatus = typeof options?.paymentReconciliationStatus === "function"
        ? options.paymentReconciliationStatus()
        : options?.paymentReconciliationStatus;
      if (configuredStatus !== undefined) {
        status = configuredStatus;
      }
      response = status >= 400
        ? { error: "Временная ошибка отчёта сверки" }
        : typeof options?.paymentReconciliation === "function"
          ? options.paymentReconciliation()
          : options?.paymentReconciliation ?? paymentReconciliation;
    } else if (request.method() === "GET" && /^\/api\/finance\/reconciliation\/\d+$/.test(url.pathname)) {
      const configuredStatus = typeof options?.balanceReconciliationDetailStatus === "function"
        ? options.balanceReconciliationDetailStatus()
        : options?.balanceReconciliationDetailStatus;
      if (configuredStatus !== undefined) {
        status = configuredStatus;
      }
      if (status >= 400) {
        response = { error: "Карточка пользователя временно недоступна. Повторите попытку." };
      } else {
        const detail = typeof options?.balanceReconciliationDetail === "function"
          ? options.balanceReconciliationDetail()
          : options?.balanceReconciliationDetail ?? balanceReconciliationDetail;
        response = parseFixture("balance reconciliation detail", GetBalanceReconciliationResponse, detail);
      }
    } else if (request.method() === "GET" && url.pathname === "/api/finance/reconciliation/export") {
      const configuredStatus = typeof options?.reconciliationExportStatus === "function"
        ? options.reconciliationExportStatus()
        : options?.reconciliationExportStatus;
      if (configuredStatus !== undefined) {
        status = configuredStatus;
      }
      if (status >= 400) {
        response = { error: "Экспорт сверки временно недоступен. Повторите попытку." };
      } else {
        await route.fulfill({
          status,
          contentType: "text/csv",
          headers: { "Content-Disposition": 'attachment; filename="balance-reconciliation.csv"' },
          body: typeof options?.reconciliationExportBody === "function"
            ? options.reconciliationExportBody()
            : options?.reconciliationExportBody ?? "recordType,reconciliationId\r\nreconciliation,,\r\n",
        });
        return;
      }
    } else if (request.method() === "POST" && /^\/api\/finance\/reconciliation\/\d+\/correct$/.test(url.pathname)) {
      if (options?.balanceReconciliationCorrectionStatus) {
        status = options.balanceReconciliationCorrectionStatus;
        response = options.balanceReconciliationCorrectionError ?? balanceReconciliationConflict;
      } else {
        const correction = typeof options?.balanceReconciliationCorrection === "function"
          ? options.balanceReconciliationCorrection()
          : options?.balanceReconciliationCorrection ?? balanceReconciliationCorrectionResponse;
        response = parseFixture("balance reconciliation correction", CorrectBalanceReconciliationResponse, correction);
      }
    } else if (request.method() === "GET" && url.pathname === "/api/partners/maintenance/cleanup-logos/history") {
      const history = url.searchParams.get("status") === "failed"
        ? logoCleanupHistory.filter((entry) => entry.failed.length > 0)
        : logoCleanupHistory;
      response = parseFixture("logo cleanup history", ListPartnerLogoCleanupHistoryResponse, history);
    } else if (request.method() === "POST" && url.pathname.endsWith("/partners/maintenance/cleanup-logos")) {
      const body = request.postDataJSON() as { dryRun?: boolean };
      response = body.dryRun === false ? logoCleanupConfirmed : logoCleanupDryRun;
    } else if (request.method() === "POST" && url.pathname === "/api/score/passport/shares") {
      passportShareFixture = {
        id: 701,
        token: "smokePassportToken_AaBbCcDdEeFf00112233445566778899",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        revokedAt: null,
        createdAt: new Date().toISOString(),
        lastAccessedAt: null,
        status: "active",
      };
      response = passportShareFixture;
    } else if (request.method() === "POST" && /^\/api\/score\/passport\/shares\/\d+\/revoke$/.test(url.pathname)) {
      passportShareFixture = {
        ...(passportShareFixture ?? {
          id: Number(url.pathname.split("/").at(-2)),
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          createdAt: new Date().toISOString(),
          lastAccessedAt: null,
        }),
        revokedAt: new Date().toISOString(),
        status: "revoked",
      };
      response = passportShareFixture;
    } else if (request.method() === "GET" && /^\/api\/score\/passport\/[A-Za-z0-9_-]{40,80}$/.test(url.pathname)) {
      status = 404;
      response = { error: "Passport unavailable", code: "PASSPORT_UNAVAILABLE" };
    } else if (request.method() === "GET" && url.pathname === "/api/admin/catalog-audit-log/export") {
      const configuredFailure = typeof options?.catalogAuditExportFailure === "function"
        ? options.catalogAuditExportFailure()
        : options?.catalogAuditExportFailure;
      if (configuredFailure === "network") {
        await route.abort("failed");
        return;
      }
      if (configuredFailure === "non-json") {
        await route.fulfill({
          status: 503,
          contentType: "text/plain",
          body: "upstream unavailable",
        });
        return;
      }
      const configuredStatus = typeof options?.catalogAuditExportStatus === "function"
        ? options.catalogAuditExportStatus()
        : options?.catalogAuditExportStatus;
      if (configuredStatus !== undefined && configuredStatus >= 400) {
        await route.fulfill({
          status: configuredStatus,
          contentType: "application/json",
          body: JSON.stringify(options?.catalogAuditExportError ?? {
            error: "Экспорт журнала временно недоступен. Повторите попытку.",
          }),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "text/csv; charset=utf-8",
        headers: {
          "Content-Disposition": 'attachment; filename="catalog-audit-log.csv"',
        },
        body: catalogAuditExportCsv,
      });
      return;
    } else {
      switch (url.pathname) {
        case "/api/finance/policy":
          response = parseFixture("financial policy", GetFinancialPolicyResponse, financePolicy);
          break;
        case "/api/finance/ledger":
          response = parseFixture("financial ledger", ListFinancialLedgerResponse, walletLedger);
          break;
        case "/api/transactions":
          response = parseFixture(
            "transactions",
            ListTransactionsResponse,
            !url.searchParams.has("category") || url.searchParams.get("category") === "rent"
              ? walletLegacyTransactions
              : [],
          );
          break;
        case "/api/dashboard/summary":
          response = parseFixture("dashboard summary", GetDashboardSummaryResponse, dashboardSummary);
          break;
        case "/api/dashboard/activity":
        case "/api/score/history":
          response = url.pathname.endsWith("/dashboard/activity")
            ? parseFixture("dashboard activity", GetDashboardActivityResponse, [])
            : parseFixture("score history", GetScoreHistoryResponse, []);
          break;
        case "/api/score/disputes":
          response = [];
          break;
        case "/api/offers":
        case "/api/partners":
          const catalogKind = url.pathname.endsWith("/offers") ? "offers" : "partners";
          const configuredCatalogStatus = options?.catalogStatus?.[catalogKind];
          const nextCatalogStatus = typeof configuredCatalogStatus === "function"
            ? configuredCatalogStatus()
            : configuredCatalogStatus;
          if (nextCatalogStatus !== undefined) {
            status = nextCatalogStatus;
            response = { error: "Каталог временно недоступен. Повторите попытку." };
          } else {
            response = catalogKind === "offers"
              ? parseFixture("offers", ListOffersResponse, options?.catalog?.offers ?? [])
              : parseFixture("partners", ListPartnersResponse, options?.catalog?.partners ?? []);
          }
          break;
        case "/api/partners/7":
          response = parseFixture("partner detail", GetPartnerResponse, catalogPartners[0]);
          break;
        case "/api/offers/17":
          response = parseFixture("offer detail", GetOfferResponse, catalogOffers[0]);
          break;
        case "/api/score/timeline":
          response = parseFixture("score timeline", GetScoreTimelineResponse, scoreTimeline);
          break;
        case "/api/score/passport/shares":
          response = parseFixture("passport shares", ListPassportSharesResponse, passportShareFixture ? [passportShareFixture] : []);
          break;
        case "/api/score":
          response = parseFixture("score", GetScoreResponse, score);
          break;
        case "/api/leases":
          response = parseFixture("leases", ListLeasesResponse, leases);
          break;
        case "/api/users/me":
          response = parseFixture("user", GetMeResponse, {
            ...user,
            isAdmin: options?.isAdmin ?? user.isAdmin,
          });
          break;
        case "/api/users/me/verifications":
          response = parseFixture("my verifications", ListMyVerificationsResponse, []);
          break;
        case "/api/users/verifications":
          response = parseFixture("verification queue", ListVerificationQueueResponse, []);
          break;
        case "/api/admin/economics":
          response = parseFixture("economics", GetEconomicsResponse, economics);
          break;
        case "/api/admin/score/disputes":
          response = [];
          break;
        case "/api/admin/economics/audit":
          const economicsAuditQuery: EconomicsAuditQuery = {
            limit: Number(url.searchParams.get("limit") ?? economicsAudit.limit),
            offset: Number(url.searchParams.get("offset") ?? economicsAudit.offset),
            snapshotAt: url.searchParams.get("snapshotAt") ?? undefined,
          };
          const configuredEconomicsAudit = typeof options?.economicsAudit === "function"
            ? options.economicsAudit(economicsAuditQuery)
            : options?.economicsAudit ?? economicsAudit;
          response = parseFixture("economics audit", GetEconomicsAuditResponse, configuredEconomicsAudit);
          break;
        case "/api/admin/catalog-audit-log":
          response = parseFixture("catalog audit log", ListCatalogAuditLogResponse, catalogAuditLog);
          break;
        case "/api/finance/reconciliation":
          const reconciliationQuery: ReconciliationQuery = {
            status: (url.searchParams.get("status") ?? balanceReconciliation.status) as ReconciliationQuery["status"],
            limit: Number(url.searchParams.get("limit") ?? balanceReconciliation.limit) as ReconciliationQuery["limit"],
            offset: Number(url.searchParams.get("offset") ?? balanceReconciliation.offset),
          };
          const configuredStatus = typeof options?.balanceReconciliationStatus === "function"
            ? options.balanceReconciliationStatus(reconciliationQuery)
            : options?.balanceReconciliationStatus;
          if (configuredStatus !== undefined) {
            status = configuredStatus;
          }
          const configuredBalanceReconciliation = typeof options?.balanceReconciliation === "function"
            ? options.balanceReconciliation(reconciliationQuery)
            : options?.balanceReconciliation ?? balanceReconciliation;
          response = status >= 400
            ? { error: "Временная ошибка отчёта сверки" }
            : parseFixture("balance reconciliation", ListBalanceReconciliationResponse, {
                ...configuredBalanceReconciliation,
                status: reconciliationQuery.status,
                limit: reconciliationQuery.limit,
                offset: reconciliationQuery.offset,
              });
          break;
        default:
          const unexpectedRequest = `${request.method()} ${requestPath}`;
          auth.unexpectedRequests.push(unexpectedRequest);
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({
              error: `No browser fixture is registered for ${unexpectedRequest}`,
            }),
          });
          return;
      }
    }

    await route.fulfill({
      status: endpointStatus ?? status,
      contentType: "application/json",
      body: JSON.stringify(endpointStatus !== undefined
        ? { error: "Сервис временно недоступен. Повторите попытку." }
        : response),
    });
  });

  return auth;
}

test.afterEach(async ({ page }) => {
  const unexpectedRequests = (pageApiMocks.get(page) ?? []).flatMap(
    ({ unexpectedRequests }) => unexpectedRequests,
  );
  expect(
    unexpectedRequests,
    "Every API request in a smoke scenario must have an explicit fixture",
  ).toEqual([]);
});

function collectBrowserErrors(page: Page, options?: { allow?: RegExp[] }) {
  const errors: string[] = [];
  const allowed = (text: string, url: string) =>
    (options?.allow ?? []).some((re) => re.test(text) || re.test(url));
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    if (allowed(message.text(), message.location().url ?? "")) return;
    errors.push(`console: ${message.text()}`);
  });
  return errors;
}

test.describe("authenticated pages", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem("ls_token", "browser-smoke-token");
    });
    await mockApi(page);
  });

test("dashboard renders its primary content without browser errors", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Обзор" })).toBeVisible();
  await expect(page.getByTestId("balance-card")).toBeVisible();

  expect(browserErrors).toEqual([]);
});

test("dashboard keeps successful blocks visible when other blocks fail", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page, {
    allow: [/Failed to load resource: the server responded with a status of 503/],
  });
  await mockApi(page, {
    endpointStatus: {
      score: 503,
      activity: 503,
      partners: 503,
      offers: 503,
      leases: 503,
    },
  });

  await page.goto("/");
  await expect(page.getByTestId("balance-card")).toBeVisible();
  await expect(page.getByTestId("dashboard-score-error")).toBeVisible();
  await expect(page.getByTestId("dashboard-activity-error")).toBeVisible();
  await expect(page.getByTestId("dashboard-partners-error")).toBeVisible();
  await expect(page.getByTestId("dashboard-offers-error")).toBeVisible();
  await expect(page.getByTestId("dashboard-leases-error")).toBeVisible();
  await expect(page.getByTestId("text-balance")).toBeVisible();
  await expect(page.getByText("Операций пока нет")).toHaveCount(0);

  expect(browserErrors).toEqual([]);
});

test("catalog cards are keyboard-accessible links to working detail and payment routes", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await mockApi(page, { catalog: { partners: catalogPartners, offers: catalogOffers } });

  await page.goto("/partners");
  const partnerLink = page.getByRole("link", { name: "Открыть карточку партнёра «Тестовый партнёр»" });
  await expect(partnerLink).toHaveAttribute("href", "/partners/7");
  await partnerLink.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Тестовый партнёр" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Смотреть предложения" })).toHaveAttribute("href", "/offers?category=food");

  await page.goto("/offers");
  const offerLink = page.getByRole("link", { name: "Открыть предложение «Получи больше бонусов»" });
  await expect(offerLink).toHaveAttribute("href", "/offers/17");
  await offerLink.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Получи больше бонусов" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Перейти к оплате" })).toHaveAttribute("href", "/calculator");

  expect(browserErrors).toEqual([]);
});

test("catalog errors are distinct from empty results and can be retried", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page, {
    allow: [/Failed to load resource: the server responded with a status of 503/],
  });
  let partnerAttempts = 0;
  let offerAttempts = 0;
  await mockApi(page, {
    catalog: { partners: catalogPartners, offers: catalogOffers },
    catalogStatus: {
      partners: () => (partnerAttempts++ === 0 ? 503 : undefined),
      offers: () => (offerAttempts++ === 0 ? 503 : undefined),
    },
  });

  await page.goto("/partners");
  await expect(page.getByTestId("partners-error")).toBeVisible();
  await expect(page.getByText("Партнёров не найдено", { exact: true })).toBeHidden();
  await page.getByTestId("partners-retry").click();
  await expect(page.getByTestId("partner-card-7")).toBeVisible();

  await page.goto("/offers");
  await expect(page.getByTestId("offers-error")).toBeVisible();
  await expect(page.getByText("Нет активных предложений", { exact: true })).toBeHidden();
  await page.getByTestId("offers-retry").click();
  await expect(page.getByTestId("offer-item-17")).toBeVisible();

  expect(browserErrors).toEqual([]);
});

test("wallet history keeps financial settlement states visible through category filters", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/wallet");
  await expect(page.getByRole("heading", { name: "Транзакции" })).toBeVisible();
  await expect(page.getByTestId("ledger-row-101")).toContainText("подтверждена");
  await expect(page.getByTestId("ledger-row-102")).toContainText("возвращена");
  await expect(page.getByTestId("ledger-row-103")).toContainText("ожидает оплаты");
  await expect(page.getByTestId("transaction-row-901")).toBeVisible();

  await page.getByTestId("filter-rent").click();
  await expect(page.getByTestId("filter-rent")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("filter-all")).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("group", { name: "Фильтр операций" })).toContainText("Выбрана категория: Аренда");
  await expect(page.getByTestId("ledger-row-101")).toBeVisible();
  await expect(page.getByTestId("ledger-row-102")).toBeVisible();
  await expect(page.getByTestId("ledger-row-101")).toContainText("подтверждена");
  await expect(page.getByTestId("ledger-row-102")).toContainText("возвращена");
  await expect(page.getByTestId("ledger-row-103")).toHaveCount(0);
  await expect(page.getByTestId("transaction-row-901")).toBeVisible();

  await page.getByTestId("filter-other").click();
  await expect(page.getByTestId("ledger-row-103")).toBeVisible();
  await expect(page.getByTestId("ledger-row-103")).toContainText("ожидает оплаты");
  await expect(page.getByTestId("ledger-row-103")).not.toContainText("подтверждена");
  await expect(page.getByTestId("ledger-row-101")).toHaveCount(0);
  await expect(page.getByTestId("ledger-row-102")).toHaveCount(0);
  await expect(page.locator('[data-testid^="transaction-row-"]')).toHaveCount(0);

  expect(browserErrors).toEqual([]);
});

test("wallet history merges legacy rows into the filtered financial timeline", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/wallet");
  await page.getByTestId("filter-rent").click();

  const rows = page.locator('[data-testid^="ledger-row-"], [data-testid^="transaction-row-"]');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toHaveAttribute("data-testid", "ledger-row-101");
  await expect(rows.nth(1)).toHaveAttribute("data-testid", "transaction-row-901");
  await expect(rows.nth(2)).toHaveAttribute("data-testid", "ledger-row-102");
  await expect(page.getByTestId("ledger-row-101")).toBeVisible();
  await expect(page.getByTestId("transaction-row-901")).toBeVisible();
  await expect(page.getByTestId("ledger-row-102")).toBeVisible();
  expect(await rows.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-testid"))))
    .toEqual(["ledger-row-101", "transaction-row-901", "ledger-row-102"]);
  expect(new Set(await rows.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-testid")))).size)
    .toBe(3);

  expect(browserErrors).toEqual([]);
});

test("profile renders its primary content without browser errors", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/profile");
  await expect(page.getByRole("heading", { name: "Профиль" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Центр верификации" })).toBeVisible();

  expect(browserErrors).toEqual([]);
});

test("score renders the current score without browser errors", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/score");
  await expect(page.getByRole("heading", { name: "Рейтинг доверия", level: 1 })).toBeVisible();
  await expect(page.getByTestId("score-value")).toHaveText("720", { timeout: 10_000 });

  expect(browserErrors).toEqual([]);
});

test("passport sharing never falls back to a numeric user id", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/passport/1");
  await expect(page.getByRole("heading", { name: "Паспорт недоступен" })).toBeVisible();

  await page.goto("/score");
  await page.getByRole("button", { name: "Копировать ссылку" }).click();
  await expect(page.getByTestId("passport-share-list")).toContainText("Активна");

  const storedToken = await page.evaluate(() => localStorage.getItem("live_passport_token_701"));
  expect(storedToken).toMatch(/^[A-Za-z0-9_-]{40,80}$/);
  expect(storedToken).not.toBe("1");
  expect(browserErrors).toEqual([]);
});

test("calculator shows server purchase and rental quotes without pretending to pay", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/calculator");
  await expect(page.getByRole("heading", { name: "Сначала цифры. Потом решение." })).toBeVisible();
  await page.getByTestId("input-gross-amount").fill("1000");
  await page.getByTestId("button-calculate").click();
  await expect(page.getByTestId("purchase-quote")).toBeVisible();
  await expect(page.getByTestId("result-gross")).toContainText("1 000");
  await expect(page.getByTestId("result-redemption-cap")).toContainText("150");
  await expect(page.getByTestId("result-net")).toContainText("850");
  await expect(page.getByTestId("result-partner-fee")).toContainText("12,75");
  await expect(page.getByTestId("preview-notice")).toContainText("не выполняются");
  await expect(page.getByTestId("payment-method-mir-pay")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("payment-method-sbp").click();
  await expect(page.getByTestId("payment-method-sbp")).toHaveAttribute("aria-checked", "true");

  await page.getByTestId("mode-rental").click();
  await page.getByTestId("input-gross-amount").fill("100000");
  await page.getByTestId("button-calculate").click();
  await expect(page.getByTestId("rental-quote")).toBeVisible();
  await expect(page.getByTestId("rental-landlord-fee")).toContainText("1 500");
  await expect(page.getByTestId("rental-tenant-bonus")).toContainText("10 000");
  await expect(page.getByTestId("rental-landlord-bonus")).toContainText("10 000");

  expect(browserErrors).toEqual([]);
});

test("calculator explains a purchase redemption cap error", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await page.goto("/calculator");
  await page.getByTestId("input-gross-amount").fill("1000");
  await page.getByTestId("input-requested-bonus").fill("200");
  await page.getByTestId("button-calculate").click();
  await expect(page.getByRole("alert")).toContainText("MAX_REDEMPTION_EXCEEDED");
  await expect(page.getByRole("alert")).toContainText("15%");
  expect(browserErrors).toEqual([]);
});

test("calculator explains insufficient bonus balance", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await page.goto("/calculator");
  await page.getByTestId("input-gross-amount").fill("10000");
  await page.getByTestId("input-requested-bonus").fill("1200");
  await page.getByTestId("button-calculate").click();
  await expect(page.getByRole("alert")).toContainText("INSUFFICIENT_BALANCE");
  await expect(page.getByRole("alert")).toContainText("Недостаточно");
  expect(browserErrors).toEqual([]);
});

test("regular users cannot see or open platform analytics", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);

  await page.goto("/");
  await expect(page.locator("aside").getByRole("link", { name: "Аналитика" })).toHaveCount(0);

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Доступ ограничен" })).toBeVisible();
  await expect(page.getByText("Аналитика платформы доступна только администраторам.")).toBeVisible();

  expect(browserErrors).toEqual([]);
});

test("admins see confirmed economics and contribution metrics", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await mockApi(page, { isAdmin: true });

  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "Аналитика платформы" })).toBeVisible();
  await expect(page.getByText("Gross-оборот")).toBeVisible();
  await expect(page.getByText("Net revenue", { exact: true })).toBeVisible();
  await expect(page.getByText("Contribution profit", { exact: true })).toBeVisible();
  await expect(page.getByText(/13,5/).first()).toBeVisible();
  await expect(page.getByText("Комиссия партнёра")).toBeVisible();
  await expect(page.getByText("Максимум списания")).toBeVisible();

  expect(browserErrors).toEqual([]);
});

test("admins can review historical deal discrepancies without financial mutations", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  const auth = await mockApi(page, { isAdmin: true });

  await page.goto("/admin");
  await page.getByRole("button", { name: /Сделки/ }).click();
  await expect(page.getByRole("heading", { name: "Аудит исторических сделок" })).toBeVisible();
  await expect(page.getByText("Расхождения на странице · 1")).toBeVisible();
  await expect(page.getByText("Сделка #17")).toBeVisible();
  await expect(page.getByText("Комиссия", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Ожидается", { exact: true })).toBeVisible();
  await expect(page.getByText("В ledger", { exact: true })).toBeVisible();
  await expect(page.getByText("Чистые сделки · 1")).toBeVisible();
  await expect(page.getByText("Сделка #18")).toBeVisible();
  await expect(page.getByRole("button", { name: /исправить|проверить у провайдера/i })).toHaveCount(0);
  expect(auth.requests.some(({ method, path }) => method === "GET" && path === "/api/admin/economics/audit?limit=25&offset=0")).toBe(true);
  expect(auth.requests.some(({ method, path }) => method === "POST" && path.includes("/finance/"))).toBe(false);

  expect(browserErrors).toEqual([]);
});

test("admins can review multiple audit pages from one snapshot while a new deal settles", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  let newDealSettled = false;
  const auditFixture = ({ limit, offset, snapshotAt }: EconomicsAuditQuery) => {
    const isInitialSnapshotRequest = !snapshotAt && offset === 0 && !newDealSettled;
    if (isInitialSnapshotRequest) {
      newDealSettled = true;
    }
    const useLiveDataset = newDealSettled && !snapshotAt && !isInitialSnapshotRequest;
    const allDeals = useLiveDataset
      ? [{ ...economicsAudit.results[1], dealId: 999 }, ...economicsAuditReviewResults]
      : economicsAuditReviewResults;
    const results = allDeals.slice(offset, offset + limit);

    return {
      ...economicsAudit,
      checkedDeals: allDeals.length,
      cleanDeals: allDeals.length - 1,
      discrepantDeals: 1,
      results,
      discrepancies: results.flatMap((deal) => deal.discrepancies.map((discrepancy) => ({
        ...discrepancy,
        dealId: deal.dealId,
        kind: deal.kind,
        status: deal.status,
      }))),
      limit,
      offset,
      snapshotAt: snapshotAt ?? economicsAudit.snapshotAt,
    };
  };
  const auth = await mockApi(page, { isAdmin: true, economicsAudit: auditFixture });

  await page.goto("/admin");
  await page.getByRole("button", { name: /Сделки/ }).click();
  const auditPanel = page.getByTestId("economics-audit-panel");
  await expect(auditPanel.getByRole("heading", { name: "Аудит исторических сделок" })).toBeVisible();
  await expect(auditPanel.getByText("Страница 1 из 2")).toBeVisible();
  await expect(auditPanel.getByText("Проверено").locator("..").getByText("26", { exact: true })).toBeVisible();
  await expect(auditPanel.getByText("Без расхождений").locator("..").getByText("25", { exact: true })).toBeVisible();
  await expect(auditPanel.getByText("С расхождениями").locator("..").getByText("1", { exact: true })).toBeVisible();
  await expect(auditPanel.getByText("Сделка #17", { exact: true })).toHaveCount(1);

  await auditPanel.getByRole("button", { name: "Следующая страница аудита" }).click();
  await expect(auditPanel.getByText("Страница 2 из 2")).toBeVisible();
  await expect(auditPanel.getByText("Проверено").locator("..").getByText("26", { exact: true })).toBeVisible();
  await expect(auditPanel.getByText("Без расхождений").locator("..").getByText("25", { exact: true })).toBeVisible();
  await expect(auditPanel.getByText("С расхождениями").locator("..").getByText("1", { exact: true })).toBeVisible();
  await expect(auditPanel.getByText("Сделка #17", { exact: true })).toHaveCount(0);
  await expect(auditPanel.getByText("Сделка #18", { exact: true })).toHaveCount(1);
  expect(auth.requests).toContainEqual({
    method: "GET",
    path: `/api/admin/economics/audit?limit=25&offset=25&snapshotAt=${encodeURIComponent(economicsAudit.snapshotAt)}`,
  });
  expect(browserErrors).toEqual([]);
});

test("admins can download a filtered catalog audit CSV", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  const auth = await mockApi(page, { isAdmin: true });

  await page.goto("/admin");
  await page.getByRole("button", { name: /^Журнал/ }).click();
  await expect(page.getByRole("heading", { name: "Журнал изменений каталога" })).toBeVisible();
  await page.getByLabel("Сущность").selectOption("offer");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать CSV" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("catalog-audit-log.csv");
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  const csv = (await readFile(downloadPath!, "utf8")).replace(/^\uFEFF/, "");
  const [headers, record] = parseCsv(csv);
  expect(headers).toEqual([
    "administrator",
    "timestamp",
    "entityType",
    "entityId",
    "entityName",
    "action",
    "beforeValues",
    "afterValues",
  ]);
  expect(record).toEqual([
    "Catalog reviewer",
    "2026-08-30T10:00:00.000Z",
    "offer",
    "84",
    "Filtered offer",
    "update",
    '{"logoUrl":"old-logo.svg"}',
    '{"logoUrl":"approved-logo.svg"}',
  ]);
  expect(auth.requests).toContainEqual({
    method: "GET",
    path: "/api/admin/catalog-audit-log/export?entityType=offer",
  });

  expect(browserErrors).toEqual([]);
});

test("admins can recover from a failed catalog audit export without losing filters", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page, { allow: [/status of 503/] });
  let exportAttempts = 0;
  const auth = await mockApi(page, {
    isAdmin: true,
    catalogAuditExportStatus: () => {
      exportAttempts += 1;
      return exportAttempts === 1 ? 503 : 200;
    },
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: /^Журнал/ }).click();
  await expect(page.getByRole("heading", { name: "Журнал изменений каталога" })).toBeVisible();
  await page.getByLabel("Сущность").selectOption("offer");
  await page.getByLabel("Действие").selectOption("update");

  await page.getByRole("button", { name: "Скачать CSV" }).click();
  await expect(page.getByRole("alert")).toContainText("Не удалось скачать журнал: Экспорт журнала временно недоступен. Повторите попытку.");
  await expect(page.getByLabel("Сущность")).toHaveValue("offer");
  await expect(page.getByLabel("Действие")).toHaveValue("update");
  await expect(page).toHaveURL(/\/admin$/);

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Повторить экспорт" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("catalog-audit-log.csv");
  expect(auth.requests).toContainEqual({
    method: "GET",
    path: "/api/admin/catalog-audit-log/export?entityType=offer&action=update",
  });
  expect(auth.requests.filter(({ path }) => path === "/api/admin/catalog-audit-log/export?entityType=offer&action=update")).toHaveLength(2);
  expect(browserErrors).toEqual([]);
});

test("admins can recover from a network failure during catalog audit export without losing filters", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page, { allow: [/net::ERR_FAILED/] });
  let exportAttempts = 0;
  const auth = await mockApi(page, {
    isAdmin: true,
    catalogAuditExportFailure: () => {
      exportAttempts += 1;
      return exportAttempts === 1 ? "network" : undefined;
    },
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: /^Журнал/ }).click();
  await expect(page.getByRole("heading", { name: "Журнал изменений каталога" })).toBeVisible();
  await page.getByLabel("Сущность").selectOption("partner");
  await page.getByLabel("Действие").selectOption("delete");

  await page.getByRole("button", { name: "Скачать CSV" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Не удалось скачать журнал: соединение прервалось. Повторите попытку.",
  );
  await expect(page.getByLabel("Сущность")).toHaveValue("partner");
  await expect(page.getByLabel("Действие")).toHaveValue("delete");

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Повторить экспорт" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("catalog-audit-log.csv");
  expect(auth.requests).toContainEqual({
    method: "GET",
    path: "/api/admin/catalog-audit-log/export?entityType=partner&action=delete",
  });
  expect(auth.requests.filter(({ path }) => path === "/api/admin/catalog-audit-log/export?entityType=partner&action=delete")).toHaveLength(2);
  expect(browserErrors).toEqual([]);
});

test("admins see and can resolve the payment reconciliation queue", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await mockApi(page, { isAdmin: true });

  await page.goto("/admin");
  await page.getByRole("button", { name: /Платежи/ }).click();
  await expect(page.getByRole("heading", { name: "Очередь сверки платежей" })).toBeVisible();
  await expect(page.getByText("Требуют проверки")).toBeVisible();
  await expect(page.getByText("Сделка #41")).toBeVisible();
  await expect(page.getByRole("button", { name: "Проверить у провайдера" })).toBeVisible();

  expect(browserErrors).toEqual([]);
});

test("admins see an alert for confirmed payments awaiting reconciliation", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await mockApi(page, {
    isAdmin: true,
    paymentReconciliation: {
      ...paymentReconciliation,
      summary: {
        ...paymentReconciliation.summary,
        confirmedAwaitingReconciliation: 2,
        confirmedAwaitingReconciliationLastUpdatedAt: "2026-08-30T10:15:00.000Z",
      },
    },
  });

  await page.goto("/admin");
  const alert = page.getByTestId("payment-reconciliation-alert");
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("2 подтверждённых платежа ожидают сверки");
  await expect(alert).toContainText("30 авг. 2026 г., 10:15");
  await alert.getByRole("button", { name: "Открыть записи" }).click();
  await expect(page.getByRole("heading", { name: "Очередь сверки платежей" })).toBeVisible();
  await expect(page.locator("#payment-reconciliation")).toBeVisible();
  await expect(page.getByRole("combobox").last()).toHaveValue("pending");

  expect(browserErrors).toEqual([]);
});

test("admins can review and confirm a balance correction with an audit history", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  const auth = await mockApi(page, {
    isAdmin: true,
    balanceReconciliation: balanceReconciliationMismatch,
    balanceReconciliationDetail,
    balanceReconciliationCorrection: balanceReconciliationCorrectionResponse,
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: /Сверка балансов/ }).click();
  await expect(page.getByRole("heading", { name: "Сверка балансов" })).toBeVisible();
  await expect(page.getByText("Анна Сверочная").first()).toBeVisible();
  await expect(page.getByText("Расхождение").first()).toBeVisible();

  await page.getByRole("button", { name: "Открыть" }).click();
  const detail = page.locator("#reconciliation-detail");
  await expect(detail).toContainText("Анна Сверочная");
  await expect(detail).toContainText("Баллы сейчас");
  await expect(detail).toContainText("Ожидается по legacy");
  await expect(detail).toContainText("История исправлений");
  await expect(detail).toContainText("Только чтение · записи нельзя изменить или удалить");
  await expect(detail).toContainText("Сверка после миграции");
  await expect(detail.getByText("1 250", { exact: true })).toBeVisible();
  await expect(detail).toContainText("1 200");

  const correctionButton = detail.getByRole("button", { name: "Проверить и исправить" });
  await expect(correctionButton).toBeDisabled();
  await detail.getByPlaceholder("Опишите источник расхождения").fill("Исправление по результатам сверки");
  await correctionButton.click();

  const confirmation = page.getByRole("dialog");
  await expect(confirmation).toContainText("Подтвердить исправление?");
  await expect(confirmation).toContainText("Исправление по результатам сверки");
  await confirmation.getByRole("button", { name: "Подтвердить исправление" }).click();

  await expect(detail.getByRole("status")).toContainText("Исправление применено и добавлено в неизменяемую историю.");
  expect(auth.requests.filter(({ method, path }) => method === "POST" && path.endsWith("/finance/reconciliation/42/correct"))).toHaveLength(1);
  expect(browserErrors).toEqual([]);
});

test("admins can download the filtered balance reconciliation CSV", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  const csv = "recordType,reconciliationId,userId\r\nreconciliation,,42\r\n";
  const auth = await mockApi(page, {
    isAdmin: true,
    balanceReconciliation: balanceReconciliationMismatch,
    reconciliationExportBody: csv,
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: /Сверка балансов/ }).click();
  const reconciliation = page.locator("#reconciliation-review");
  await expect(reconciliation.getByRole("heading", { name: "Сверка балансов" })).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await reconciliation.getByRole("button", { name: "Скачать CSV" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("balance-reconciliation.csv");
  const downloadPath = await download.path();
  expect(downloadPath).toBeTruthy();
  expect(await readFile(downloadPath!, "utf8")).toBe(csv);
  expect(auth.requests).toContainEqual({
    method: "GET",
    path: "/api/finance/reconciliation/export?status=mismatch",
  });
  expect(browserErrors).toEqual([]);
});

test("admins can download a classified balance reconciliation CSV for a date range", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page, { allow: [/status of 503/] });
  let exportAttempts = 0;
  const auth = await mockApi(page, {
    isAdmin: true,
    balanceReconciliation: balanceReconciliationMismatch,
    reconciliationExportStatus: () => {
      exportAttempts += 1;
      return exportAttempts === 1 ? 503 : 200;
    },
    reconciliationExportBody: "recordType,reconciliationId,userId\r\ncorrection,7,42\r\n",
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: /Сверка балансов/ }).click();
  const reconciliation = page.locator("#reconciliation-review");
  await reconciliation.getByLabel("Дата начала истории исправлений").fill("2026-08-15");
  await reconciliation.getByLabel("Дата окончания истории исправлений").fill("2026-08-16");
  await reconciliation.getByRole("button", { name: "Скачать CSV" }).click();
  await expect(reconciliation.getByText(
    "Повторная попытка использует выбранный период: 2026-08-15 — 2026-08-16.",
  )).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await reconciliation.getByRole("button", { name: "Повторить экспорт" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("balance-reconciliation-2026-08-15-2026-08-16.csv");
  expect(exportAttempts).toBe(2);
  expect(auth.requests.filter(({ path }) => path === "/api/finance/reconciliation/export?status=mismatch&from=2026-08-15&to=2026-08-16")).toHaveLength(2);
  expect(browserErrors).toEqual([]);
});

test("admins can retry a balance reconciliation export that fails before streaming", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page, { allow: [/status of 503/] });
  let exportAttempts = 0;
  const auth = await mockApi(page, {
    isAdmin: true,
    balanceReconciliation: balanceReconciliationMismatch,
    reconciliationExportStatus: () => {
      exportAttempts += 1;
      return exportAttempts === 1 ? 503 : 200;
    },
    reconciliationExportBody: "recordType,reconciliationId\r\nreconciliation,,42\r\n",
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: /Сверка балансов/ }).click();
  const reconciliation = page.locator("#reconciliation-review");
  await reconciliation.getByRole("button", { name: "Скачать CSV" }).click();
  await expect(reconciliation.getByRole("alert")).toContainText(
    "Не удалось скачать сверку: Экспорт сверки временно недоступен. Повторите попытку.",
  );

  const downloadPromise = page.waitForEvent("download");
  await reconciliation.getByRole("button", { name: "Повторить экспорт" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("balance-reconciliation.csv");
  expect(exportAttempts).toBe(2);
  expect(auth.requests.filter(({ path }) => path === "/api/finance/reconciliation/export?status=mismatch")).toHaveLength(2);
  expect(browserErrors).toEqual([]);
});

test("admins are warned when a balance reconciliation export fails during streaming", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  await mockApi(page, {
    isAdmin: true,
    balanceReconciliation: balanceReconciliationMismatch,
  });
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
      if (url.pathname === "/api/finance/reconciliation/export") {
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode("recordType,reconciliationId\r\nreconciliation,"));
            controller.error(new Error("simulated stream failure"));
          },
        });
        return new Response(stream, {
          status: 200,
          headers: { "content-type": "text/csv" },
        });
      }
      return originalFetch(input, init);
    };
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: /Сверка балансов/ }).click();
  const reconciliation = page.locator("#reconciliation-review");
  await reconciliation.getByRole("button", { name: "Скачать CSV" }).click();
  await expect(reconciliation.getByRole("alert")).toContainText(
    "Не удалось скачать сверку: соединение прервалось. Повторите попытку.",
  );
  await expect(reconciliation.getByRole("button", { name: "Повторить экспорт" })).toBeVisible();
  expect(browserErrors).toEqual([]);
});

test("admins cannot correct a rounding-only reconciliation", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  const auth = await mockApi(page, {
    isAdmin: true,
    balanceReconciliation: balanceReconciliationForQuery,
    balanceReconciliationDetail: balanceReconciliationRoundingDetail,
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: /Сверка балансов/ }).click();
  const reconciliation = page.locator("#reconciliation-review");
  await reconciliation.getByRole("combobox").nth(0).selectOption("rounding_difference");
  await expect(reconciliation.getByText("Павел Округляющий", { exact: true }).first()).toBeVisible();

  await reconciliation.getByRole("button", { name: "Открыть" }).click();
  const detail = page.locator("#reconciliation-detail");
  await expect(detail).toContainText("Павел Округляющий");
  await expect(detail).toContainText("только в пределах допустимого округления");
  await expect(detail.getByRole("button", { name: "Проверить и исправить" })).toHaveCount(0);
  await expect(detail.locator('input[name="correction-target"]')).toHaveCount(0);
  await expect(detail.getByPlaceholder("Опишите источник расхождения")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(auth.requests.filter(({ method, path }) => method === "POST" && path.endsWith("/finance/reconciliation/69/correct"))).toHaveLength(0);
  expect(browserErrors).toEqual([]);
});

test("admins keep balance reconciliation filters and pagination in sync with the report", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  const auth = await mockApi(page, {
    isAdmin: true,
    balanceReconciliation: balanceReconciliationForQuery,
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: /Сверка балансов/ }).click();

  const reconciliation = page.locator("#reconciliation-review");
  const statusSelect = reconciliation.getByRole("combobox").nth(0);
  const limitSelect = reconciliation.getByRole("combobox").nth(1);
  await expect(statusSelect).toHaveValue("mismatch");
  await expect(limitSelect).toHaveValue("25");
  await expect(reconciliation.getByText("Анна Сверочная", { exact: true }).first()).toBeVisible();
  expect(auth.requests.some(({ method, path }) => method === "GET" && path === "/api/finance/reconciliation?status=mismatch&limit=25&offset=0")).toBe(true);

  await statusSelect.selectOption("consistent");
  await expect(statusSelect).toHaveValue("consistent");
  await expect(reconciliation.getByText("Ирина Совпадающая", { exact: true }).first()).toBeVisible();
  await expect(reconciliation.getByText("Анна Сверочная", { exact: true })).toHaveCount(0);
  expect(auth.requests.some(({ method, path }) => method === "GET" && path === "/api/finance/reconciliation?status=consistent&limit=25&offset=0")).toBe(true);

  await statusSelect.selectOption("all");
  await expect(statusSelect).toHaveValue("all");
  await expect(reconciliation.getByText("Показано 1–25 из 29", { exact: true })).toBeVisible();
  const nextPage = reconciliation.getByRole("button", { name: /Вперёд/ });
  await expect(nextPage).toBeEnabled();
  await nextPage.click();
  await expect(reconciliation.getByText("Расхождение 26", { exact: true }).first()).toBeVisible();
  await expect(reconciliation.getByText("Показано 26–29 из 29", { exact: true })).toBeVisible();
  expect(auth.requests.some(({ method, path }) => method === "GET" && path === "/api/finance/reconciliation?status=all&limit=25&offset=25")).toBe(true);

  await limitSelect.selectOption("50");
  await expect(limitSelect).toHaveValue("50");
  await expect(reconciliation.getByText("Показано 1–29 из 29", { exact: true })).toBeVisible();
  expect(auth.requests.some(({ method, path }) => method === "GET" && path === "/api/finance/reconciliation?status=all&limit=50&offset=0")).toBe(true);

  expect(browserErrors).toEqual([]);
});

test("admins can retry a failed reconciliation refresh without losing filters or pagination", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page, {
    allow: [/\/api\/finance\/reconciliation/, /the server responded with a status of 503/],
  });
  let targetPageRequestCount = 0;
  const auth = await mockApi(page, {
    isAdmin: true,
    balanceReconciliation: balanceReconciliationForQuery,
    balanceReconciliationStatus: (query) => {
      if (query.status !== "all" || query.limit !== 25 || query.offset !== 25) return 200;
      targetPageRequestCount += 1;
      return targetPageRequestCount === 1 ? 503 : 200;
    },
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: /Сверка балансов/ }).click();

  const reconciliation = page.locator("#reconciliation-review");
  const statusSelect = reconciliation.getByRole("combobox").nth(0);
  const limitSelect = reconciliation.getByRole("combobox").nth(1);
  await statusSelect.selectOption("all");
  await expect(reconciliation.getByText("Показано 1–25 из 29", { exact: true })).toBeVisible();
  await reconciliation.getByRole("button", { name: /Вперёд/ }).click();

  const errorState = reconciliation.getByRole("alert");
  await expect(errorState).toContainText("Сервис временно не ответил");
  await expect(errorState.getByRole("button", { name: "Повторить" })).toBeVisible();
  await expect(statusSelect).toHaveValue("all");
  await expect(limitSelect).toHaveValue("25");

  await errorState.getByRole("button", { name: "Повторить" }).click();
  await expect(reconciliation.getByText("Расхождение 26", { exact: true }).first()).toBeVisible();
  await expect(reconciliation.getByText("Показано 26–29 из 29", { exact: true })).toBeVisible();
  await expect(statusSelect).toHaveValue("all");
  await expect(limitSelect).toHaveValue("25");

  const secondPageRequestLog = auth.requests.filter(
    ({ method, path }) => method === "GET" && path === "/api/finance/reconciliation?status=all&limit=25&offset=25",
  );
  expect(secondPageRequestLog).toHaveLength(2);
  expect(browserErrors).toEqual([]);
});

test("admins can retry a failed reconciliation user detail without losing selection or correction history", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page, {
    allow: [/\/api\/finance\/reconciliation\/42$/, /the server responded with a status of 503/],
  });
  let detailRequestCount = 0;
  const auth = await mockApi(page, {
    isAdmin: true,
    balanceReconciliation: balanceReconciliationMismatch,
    balanceReconciliationDetailStatus: () => {
      detailRequestCount += 1;
      return detailRequestCount === 1 ? 503 : 200;
    },
    balanceReconciliationDetail,
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: /Сверка балансов/ }).click();
  const reconciliation = page.locator("#reconciliation-review");
  await reconciliation.getByRole("button", { name: "Открыть" }).click();

  const detail = page.locator("#reconciliation-detail");
  await expect(detail.getByRole("heading", { name: "Не удалось загрузить пользователя" })).toBeVisible();
  await expect(detail).toContainText("Запись могла измениться. Обновите данные и повторите.");
  await expect(detail.getByRole("button", { name: "Обновить данные" })).toBeVisible();

  await detail.getByRole("button", { name: "Обновить данные" }).click();
  await expect(detail).toContainText("Анна Сверочная");
  await expect(detail).toContainText("История исправлений");
  await expect(detail).toContainText("Сверка после миграции");
  expect(detailRequestCount).toBe(2);
  expect(auth.requests.filter(({ method, path }) => method === "GET" && path === "/api/finance/reconciliation/42")).toHaveLength(2);
  expect(browserErrors).toEqual([]);
});

test("admins close a correction confirmation when a refreshed detail becomes rounding-only", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  let detailRequestCount = 0;
  const auth = await mockApi(page, {
    isAdmin: true,
    balanceReconciliation: balanceReconciliationMismatch,
    balanceReconciliationDetail: () => {
      detailRequestCount += 1;
      return detailRequestCount === 1 ? balanceReconciliationDetail : balanceReconciliationRoundingDetail;
    },
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: /Сверка балансов/ }).click();
  const reconciliation = page.locator("#reconciliation-review");
  await reconciliation.getByRole("button", { name: "Открыть" }).click();
  const detail = page.locator("#reconciliation-detail");
  await detail.getByPlaceholder("Опишите источник расхождения").fill("Проверка после обновления сверки");
  await detail.getByRole("button", { name: "Проверить и исправить" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await reconciliation.getByRole("button", { name: "Обновить" }).evaluate((button) => button.click());

  await expect(detail).toContainText("только в пределах допустимого округления");
  await expect(detail.getByRole("button", { name: "Проверить и исправить" })).toHaveCount(0);
  await expect(detail.locator('input[name="correction-target"]')).toHaveCount(0);
  await expect(detail.getByPlaceholder("Опишите источник расхождения")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(auth.requests.filter(({ method, path }) => method === "GET" && path === "/api/finance/reconciliation/42")).toHaveLength(2);
  expect(auth.requests.filter(({ method, path }) => method === "POST" && path.endsWith("/finance/reconciliation/42/correct"))).toHaveLength(0);
  expect(browserErrors).toEqual([]);
});

test("admins automatically refresh an open reconciliation detail and remove correction controls", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  let detailRequestCount = 0;
  const auth = await mockApi(page, {
    isAdmin: true,
    balanceReconciliation: balanceReconciliationMismatch,
    balanceReconciliationDetail: () => {
      detailRequestCount += 1;
      return detailRequestCount === 1 ? balanceReconciliationDetail : balanceReconciliationRoundingDetail;
    },
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: /Сверка балансов/ }).click();
  const reconciliation = page.locator("#reconciliation-review");
  await reconciliation.getByRole("button", { name: "Открыть" }).click();

  const detail = page.locator("#reconciliation-detail");
  await detail.getByPlaceholder("Опишите источник расхождения").fill("Проверка автоматического обновления");
  await detail.getByRole("button", { name: "Проверить и исправить" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  await expect(detail).toContainText("только в пределах допустимого округления", { timeout: 8_000 });
  await expect(detail.getByRole("button", { name: "Проверить и исправить" })).toHaveCount(0);
  await expect(detail.locator('input[name="correction-target"]')).toHaveCount(0);
  await expect(detail.getByPlaceholder("Опишите источник расхождения")).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(detailRequestCount).toBeGreaterThanOrEqual(2);
  expect(auth.requests.filter(({ method, path }) => method === "POST" && path.endsWith("/finance/reconciliation/42/correct"))).toHaveLength(0);
  expect(browserErrors).toEqual([]);
});

test("admins surface an automatic reconciliation detail refresh failure without correcting", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page, {
    allow: [/\/api\/finance\/reconciliation\/42$/, /the server responded with a status of 503/],
  });
  let detailRequestCount = 0;
  const auth = await mockApi(page, {
    isAdmin: true,
    balanceReconciliation: balanceReconciliationMismatch,
    balanceReconciliationDetailStatus: () => {
      detailRequestCount += 1;
      return detailRequestCount === 1 ? 200 : 503;
    },
    balanceReconciliationDetail,
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: /Сверка балансов/ }).click();
  const reconciliation = page.locator("#reconciliation-review");
  await reconciliation.getByRole("button", { name: "Открыть" }).click();

  const detail = page.locator("#reconciliation-detail");
  await expect(detail).toContainText("Анна Сверочная");
  await expect(detail.getByRole("button", { name: "Проверить и исправить" })).toBeVisible();
  await expect(detail.getByRole("heading", { name: "Не удалось загрузить пользователя" })).toBeVisible({ timeout: 8_000 });
  await expect(detail).toContainText("Запись могла измениться. Обновите данные и повторите.");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(detailRequestCount).toBeGreaterThanOrEqual(2);
  expect(auth.requests.filter(({ method, path }) => method === "POST" && path.endsWith("/finance/reconciliation/42/correct"))).toHaveLength(0);
  expect(browserErrors).toEqual([]);
});

test("admins see a reconciliation conflict without automatically retrying the correction", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page, {
    allow: [/\/api\/finance\/reconciliation\/42\/correct/, /the server responded with a status of 409/],
  });
  const auth = await mockApi(page, {
    isAdmin: true,
    balanceReconciliation: balanceReconciliationMismatch,
    balanceReconciliationDetail,
    balanceReconciliationCorrectionStatus: 409,
    balanceReconciliationCorrectionError: balanceReconciliationConflict,
  });

  await page.goto("/admin");
  await page.getByRole("button", { name: /Сверка балансов/ }).click();
  await page.getByRole("button", { name: "Открыть" }).click();
  const detail = page.locator("#reconciliation-detail");
  await detail.getByPlaceholder("Опишите источник расхождения").fill("Проверка допустимого округления");
  await detail.getByRole("button", { name: "Проверить и исправить" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Подтвердить исправление" }).click();

  await expect(detail.getByRole("alert")).toContainText("осталось только допустимое расхождение округления");
  expect(auth.requests.filter(({ method, path }) => method === "POST" && path.endsWith("/finance/reconciliation/42/correct"))).toHaveLength(1);
  expect(browserErrors).toEqual([]);
});

test("admins receive other-admin reconciliation updates without running a payment mutation", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  let currentPaymentReconciliation = {
    ...paymentReconciliation,
    summary: {
      ...paymentReconciliation.summary,
      confirmedAwaitingReconciliation: 2,
      confirmedAwaitingReconciliationLastUpdatedAt: "2026-08-30T10:15:00.000Z",
    },
  };
  const auth = await mockApi(page, {
    isAdmin: true,
    paymentReconciliation: () => currentPaymentReconciliation,
  });

  await page.goto("/admin");
  const alert = page.getByTestId("payment-reconciliation-alert");
  await expect(alert).toContainText("2 подтверждённых платежа ожидают сверки");
  await expect(page.getByTestId("payment-reconciliation-last-updated")).toHaveText("30 авг. 2026 г., 10:15");

  currentPaymentReconciliation = {
    ...currentPaymentReconciliation,
    summary: {
      ...currentPaymentReconciliation.summary,
      confirmedAwaitingReconciliation: 1,
      confirmedAwaitingReconciliationLastUpdatedAt: "2026-08-30T10:30:00.000Z",
    },
  };

  await expect(alert).toContainText("1 подтверждённых платежа ожидают сверки", { timeout: 8_000 });
  await expect(page.getByTestId("payment-reconciliation-last-updated")).toHaveText("30 авг. 2026 г., 10:30");
  expect(auth.requests.filter(({ method, path }) => method === "POST" && path.includes("/finance/")).length).toBe(0);
  expect(browserErrors).toEqual([]);
});

test("admins keep the last reconciliation alert through consecutive failed refreshes and recover without mutations", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page, {
    allow: [/\/api\/finance\/payment-reconciliation/, /the server responded with a status of 503/],
  });
  let currentPaymentReconciliation = {
    ...paymentReconciliation,
    summary: {
      ...paymentReconciliation.summary,
      confirmedAwaitingReconciliation: 2,
      confirmedAwaitingReconciliationLastUpdatedAt: "2026-08-30T10:15:00.000Z",
    },
  };
  let paymentRefreshes = 0;
  const auth = await mockApi(page, {
    isAdmin: true,
    paymentReconciliation: () => currentPaymentReconciliation,
    paymentReconciliationStatus: () => {
      paymentRefreshes += 1;
      return paymentRefreshes >= 2 && paymentRefreshes <= 3 ? 503 : 200;
    },
  });

  await page.goto("/admin");
  const alert = page.getByTestId("payment-reconciliation-alert");
  const lastUpdated = page.getByTestId("payment-reconciliation-last-updated");
  await expect(alert).toContainText("2 подтверждённых платежа ожидают сверки");
  await expect(lastUpdated).toHaveText("30 авг. 2026 г., 10:15");

  currentPaymentReconciliation = {
    ...currentPaymentReconciliation,
    summary: {
      ...currentPaymentReconciliation.summary,
      confirmedAwaitingReconciliation: 1,
      confirmedAwaitingReconciliationLastUpdatedAt: "2026-08-30T10:30:00.000Z",
    },
  };

  await expect.poll(() => paymentRefreshes, { timeout: 8_000 }).toBeGreaterThanOrEqual(2);
  await expect(alert).toContainText("2 подтверждённых платежа ожидают сверки");
  await expect(lastUpdated).toHaveText("30 авг. 2026 г., 10:15");
  await expect(page.getByTestId("payment-reconciliation-stale")).toHaveText("Отчёт временно устарел — ожидается повторное обновление");
  await expect.poll(() => paymentRefreshes, { timeout: 8_000 }).toBeGreaterThanOrEqual(3);
  await expect(alert).toContainText("2 подтверждённых платежа ожидают сверки");
  await expect(lastUpdated).toHaveText("30 авг. 2026 г., 10:15");
  await expect(page.getByTestId("payment-reconciliation-stale")).toHaveText("Отчёт временно устарел — ожидается повторное обновление");
  await expect(alert).toContainText("1 подтверждённых платежа ожидают сверки", { timeout: 8_000 });
  await expect(lastUpdated).toHaveText("30 авг. 2026 г., 10:30");
  await expect(page.getByTestId("payment-reconciliation-stale")).toHaveCount(0);
  expect(auth.requests.filter(({ method, path }) => method === "POST" && path.includes("/finance/")).length).toBe(0);
  expect(browserErrors).toEqual([]);
});

test("admins can review orphaned logos before confirming deletion", async ({ page }) => {
  const browserErrors = collectBrowserErrors(page);
  const auth = await mockApi(page, { isAdmin: true });

  await page.goto("/admin");
  await page.getByRole("button", { name: "Логотипы" }).click();
  await expect(page.getByRole("heading", { name: "Проверка логотипов" })).toBeVisible();
  const failedHistory = page.getByTestId("logo-cleanup-history-2");
  await expect(failedHistory).toContainText("unavailable-logo.svg");
  await expect(failedHistory).toContainText("Объект недоступен в хранилище");
  await expect(failedHistory.getByRole("button")).toHaveCount(0);
  await expect(page.getByTestId("logo-cleanup-history-1")).toContainText("Исторический администратор");
  await expect(page.getByTestId("logo-cleanup-history-1")).toContainText("dry_run");
  await expect(page.getByTestId("logo-cleanup-confirm-open")).toHaveCount(0);

  await page.getByTestId("logo-cleanup-history-status").selectOption("failed");
  await expect(page.getByTestId("logo-cleanup-history-filter-active")).toHaveText("Показаны только запуски с ошибками удаления");
  await expect(page.getByTestId("logo-cleanup-history-2")).toBeVisible();
  await expect(page.getByTestId("logo-cleanup-history-1")).toHaveCount(0);
  expect(auth.requests.some(({ method, path }) => method === "GET" && path.includes("/partners/maintenance/cleanup-logos/history?") && path.includes("status=failed"))).toBe(true);

  await page.getByTestId("logo-cleanup-dry-run").click();
  await expect(page.getByText("Проверка завершена. Удаление не выполнялось.")).toBeVisible();
  await expect(page.getByText("old-logo.svg", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("unavailable-logo.svg", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Осиротело").first()).toBeVisible();
  await expect(page.getByTestId("logo-cleanup-confirm-open")).toContainText("2");

  await page.getByTestId("logo-cleanup-confirm-open").click();
  await expect(page.getByRole("dialog")).toContainText("Подтвердить удаление?");
  await expect(page.getByRole("dialog")).toContainText("2 объекта");
  await page.getByRole("dialog").getByTestId("logo-cleanup-confirm").click();
  await expect(page.getByText("Очистка подтверждена и выполнена")).toBeVisible();
  await expect(page.getByText("Удалённые пути")).toBeVisible();
  await expect(page.getByText("Удалено").first()).toBeVisible();
  await expect(page.getByTestId("logo-cleanup-failures-2").getByText("Объект недоступен в хранилище")).toBeVisible();
  expect(auth.requests.filter(({ method, path }) => method === "POST" && path.endsWith("/partners/maintenance/cleanup-logos"))).toHaveLength(2);

  expect(browserErrors).toEqual([]);
});
});

test.describe("sign-in flow", () => {
  test("demo login signs in and the session persists across navigation", async ({ page }) => {
    const browserErrors = collectBrowserErrors(page);
    await mockApi(page);

    await page.goto("/auth");
    await expect(page.getByRole("heading", { name: "Авторизация" })).toBeVisible();

    await page.getByRole("button", { name: "Войти как демо-пользователь" }).click();

    // The session token lands in localStorage and the app moves to the dashboard.
    await expect(page.getByRole("heading", { name: "Обзор" })).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.localStorage.getItem("ls_token")))
      .toBe("browser-smoke-token");

    // Session persists across a full page load to another protected page…
    await page.goto("/profile");
    await expect(page.getByRole("heading", { name: "Профиль" })).toBeVisible();

    // …and an authed visit to /auth bounces back to the dashboard.
    await page.goto("/auth");
    await expect(page.getByRole("heading", { name: "Обзор" })).toBeVisible();

    expect(browserErrors).toEqual([]);
  });

  test("manual OTP flow surfaces invalid-code feedback and still lets the user in", async ({ page }) => {
    // The intentionally wrong code produces an expected 400 network log entry.
    const browserErrors = collectBrowserErrors(page, {
      allow: [/\/api\/auth\/verify-otp/, /the server responded with a status of 400/],
    });
    await mockApi(page);

    await page.goto("/auth");
    await page.getByPlaceholder("+7 900 123-45-67").fill("+79001234567");
    await page.getByRole("button", { name: "Продолжить" }).click();

    // OTP step shows the dev code panel.
    await expect(page.getByText("Код для разработчиков")).toBeVisible();

    // Wrong code → server feedback stays visible, form remains usable.
    await page.getByPlaceholder("0000").fill("9999");
    await page.getByRole("button", { name: "Войти в систему" }).click();
    await expect(page.getByText("Неверный код")).toBeVisible();

    // Correct code afterwards still signs the user in.
    await page.getByPlaceholder("0000").fill("1234");
    await page.getByRole("button", { name: "Войти в систему" }).click();
    await expect(page.getByRole("heading", { name: "Обзор" })).toBeVisible();

    expect(browserErrors).toEqual([]);
  });

  test("expired OTP shows the renewal message without browser errors", async ({ page }) => {
    const browserErrors = collectBrowserErrors(page, {
      allow: [/\/api\/auth\/verify-otp/, /the server responded with a status of 400/],
    });
    const auth = await mockApi(page);

    await page.goto("/auth");
    await page.getByPlaceholder("+7 900 123-45-67").fill("+79001234567");
    await page.getByRole("button", { name: "Продолжить" }).click();
    await expect(page.getByText("Код для разработчиков")).toBeVisible();

    // Simulate the code expiring before the user submits it.
    auth.expired = true;
    await page.getByPlaceholder("0000").fill("1234");
    await page.getByRole("button", { name: "Войти в систему" }).click();

    await expect(page.getByText("Срок действия кода истёк. Запросите новый.")).toBeVisible();
    // Still on the OTP step — the user can go back and request a new code.
    await expect(page.getByRole("button", { name: "Войти в систему" })).toBeVisible();

    expect(browserErrors).toEqual([]);
  });
});