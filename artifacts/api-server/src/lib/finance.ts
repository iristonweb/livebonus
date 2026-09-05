export interface FinancePolicy {
  version: number;
  currency: "RUB";
  purchaseRedemptionBps: number;
  partnerFeeBps: number;
  rentalBonusBps: number;
  effectiveFrom: string;
}

export const FINANCE_POLICY: FinancePolicy = {
  version: 1,
  currency: "RUB" as const,
  purchaseRedemptionBps: 1500,
  partnerFeeBps: 150,
  rentalBonusBps: 1000,
  effectiveFrom: "2026-01-01T00:00:00.000Z",
};

export const LEGACY_CONVERSION_CENTS_PER_POINT = 80;
export const RECONCILIATION_ROUNDING_TOLERANCE_CENTS = Math.floor(LEGACY_CONVERSION_CENTS_PER_POINT / 2);

export type BalanceReconciliationStatus = "consistent" | "rounding_difference" | "mismatch" | "unmigrated";

export type BalanceReconciliation = {
  status: BalanceReconciliationStatus;
  pointsBalance: number;
  expectedBalanceCents: bigint;
  monetaryBalanceCents: bigint | null;
  differenceCents: bigint | null;
  legacyEquivalentPoints: number | null;
};

/**
 * Convert a monetary balance to the nearest whole legacy point amount.
 * The legacy system represents one point as 0.80 RUB, so a difference of up
 * to half that unit is a representational rounding difference, not drift.
 */
export function legacyPointsForCents(cents: bigint): number {
  const sign = cents < 0n ? -1 : 1;
  const magnitude = cents < 0n ? -cents : cents;
  return sign * Number((magnitude + BigInt(Math.floor(LEGACY_CONVERSION_CENTS_PER_POINT / 2))) / BigInt(LEGACY_CONVERSION_CENTS_PER_POINT));
}

export function legacyCentsForPoints(points: number): bigint {
  return BigInt(Math.max(0, Math.trunc(points))) * BigInt(LEGACY_CONVERSION_CENTS_PER_POINT);
}

export function reconcileBalances(user: {
  pointsBalance: number;
  bonusBalanceRub: string | number | null;
}): BalanceReconciliation {
  const expectedBalanceCents = legacyCentsForPoints(user.pointsBalance);
  if (user.bonusBalanceRub === null) {
    return {
      status: "unmigrated",
      pointsBalance: user.pointsBalance,
      expectedBalanceCents,
      monetaryBalanceCents: null,
      differenceCents: null,
      legacyEquivalentPoints: null,
    };
  }

  const parsed = parseRub(user.bonusBalanceRub);
  const monetaryBalanceCents = parsed.ok ? parsed.cents : 0n;
  const differenceCents = monetaryBalanceCents - expectedBalanceCents;
  const absoluteDifference = differenceCents < 0n ? -differenceCents : differenceCents;
  const status = differenceCents === 0n
    ? "consistent"
    : absoluteDifference <= BigInt(RECONCILIATION_ROUNDING_TOLERANCE_CENTS)
      ? "rounding_difference"
      : "mismatch";

  return {
    status,
    pointsBalance: user.pointsBalance,
    expectedBalanceCents,
    monetaryBalanceCents,
    differenceCents,
    legacyEquivalentPoints: legacyPointsForCents(monetaryBalanceCents),
  };
}

export type QuoteError = {
  code: "INVALID_AMOUNT" | "INSUFFICIENT_BALANCE" | "MAX_REDEMPTION_EXCEEDED";
  message: string;
};

export type PurchaseQuote = {
  kind: "partner_purchase";
  valid: boolean;
  currency: "RUB";
  policyVersion: number;
  grossAmountRub: number;
  maxBonusRedemptionRub: number;
  availableBonusRub: number;
  requestedBonusRub: number;
  bonusRedeemedRub: number;
  netAmountRub: number;
  partnerFeeRub: number;
  rates: {
    maxRedemptionRate: number;
    partnerFeeRate: number;
  };
  breakdown: {
    grossRub: number;
    redemptionCapRub: number;
    balanceCapRub: number;
    bonusRedeemedRub: number;
    netRub: number;
    partnerFeeRub: number;
  };
  errors: QuoteError[];
};

export type RentalQuote = {
  kind: "rental_deal";
  valid: boolean;
  currency: "RUB";
  policyVersion: number;
  grossAmountRub: number;
  landlordFeeRub: number;
  landlordBonusRub: number;
  tenantBonusRub: number;
  rates: {
    landlordFeeRate: number;
    landlordBonusRate: number;
    tenantBonusRate: number;
  };
  breakdown: {
    grossRub: number;
    landlordFeeRub: number;
    landlordBonusRub: number;
    tenantBonusRub: number;
  };
  errors: QuoteError[];
};

export type MoneyParseResult =
  | { ok: true; cents: bigint }
  | { ok: false; error: QuoteError };

/**
 * Parse a JSON money value without doing arithmetic on a floating point
 * number. Inputs are intentionally limited to regular RUB decimal notation.
 */
export function parseRub(value: unknown): MoneyParseResult {
  if (typeof value !== "number" && typeof value !== "string") {
    return { ok: false, error: { code: "INVALID_AMOUNT", message: "Сумма должна быть числом" } };
  }
  if (typeof value === "number" && (!Number.isFinite(value) || value > Number.MAX_SAFE_INTEGER / 100)) {
    return { ok: false, error: { code: "INVALID_AMOUNT", message: "Сумма должна быть безопасным денежным числом" } };
  }

  const raw = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) {
    return { ok: false, error: { code: "INVALID_AMOUNT", message: "Сумма должна быть неотрицательной и иметь не более 2 знаков" } };
  }

  const [whole, fraction = ""] = raw.split(".");
  return { ok: true, cents: BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0") };
}

export function centsToRub(cents: bigint): number {
  return Number(cents) / 100;
}

function roundRate(amountCents: bigint, basisPoints: number): bigint {
  return (amountCents * BigInt(basisPoints) + 5000n) / 10000n;
}

function errorFor(code: QuoteError["code"], message: string): QuoteError {
  return { code, message };
}

export function quotePartnerPurchase(params: {
  grossAmountRub: unknown;
  availableBonusRub: unknown;
  requestedBonusRub?: unknown;
  policy?: FinancePolicy;
}): PurchaseQuote {
  const policy = params.policy ?? FINANCE_POLICY;
  const gross = parseRub(params.grossAmountRub);
  const available = parseRub(params.availableBonusRub);
  const requested = params.requestedBonusRub === undefined
    ? null
    : parseRub(params.requestedBonusRub);
  const errors: QuoteError[] = [];

  if (!gross.ok) errors.push(gross.error);
  if (!available.ok) errors.push(available.error);
  if (requested && !requested.ok) errors.push(requested.error);

  const grossCents = gross.ok ? gross.cents : 0n;
  const availableCents = available.ok ? available.cents : 0n;
  const maxRedemptionCents = roundRate(grossCents, policy.purchaseRedemptionBps);
  const requestedCents = requested?.ok
    ? requested.cents
    : maxRedemptionCents < availableCents
      ? maxRedemptionCents
      : availableCents;

  if (requested?.ok && requestedCents > maxRedemptionCents) {
    errors.push(errorFor("MAX_REDEMPTION_EXCEEDED", "Списать бонусами можно не более 15% от валового чека"));
  }
  if (requested?.ok && requestedCents > availableCents) {
    errors.push(errorFor("INSUFFICIENT_BALANCE", "Недостаточно денежного бонусного баланса"));
  }

  const redeemedCents = errors.length === 0
    ? requestedCents
    : requestedCents < maxRedemptionCents && requestedCents < availableCents
      ? requestedCents
      : maxRedemptionCents < availableCents
        ? maxRedemptionCents
        : availableCents;
  const netCents = grossCents >= redeemedCents ? grossCents - redeemedCents : 0n;
  const feeCents = roundRate(netCents, policy.partnerFeeBps);

  return {
    kind: "partner_purchase",
    valid: errors.length === 0,
    currency: policy.currency,
    policyVersion: policy.version,
    grossAmountRub: centsToRub(grossCents),
    maxBonusRedemptionRub: centsToRub(maxRedemptionCents),
    availableBonusRub: centsToRub(availableCents),
    requestedBonusRub: centsToRub(requestedCents),
    bonusRedeemedRub: centsToRub(redeemedCents),
    netAmountRub: centsToRub(netCents),
    partnerFeeRub: centsToRub(feeCents),
    rates: {
      maxRedemptionRate: policy.purchaseRedemptionBps / 10000,
      partnerFeeRate: policy.partnerFeeBps / 10000,
    },
    breakdown: {
      grossRub: centsToRub(grossCents),
      redemptionCapRub: centsToRub(maxRedemptionCents),
      balanceCapRub: centsToRub(availableCents),
      bonusRedeemedRub: centsToRub(redeemedCents),
      netRub: centsToRub(netCents),
      partnerFeeRub: centsToRub(feeCents),
    },
    errors,
  };
}

export function quoteRentalDeal(params: {
  grossAmountRub: unknown;
  policy?: FinancePolicy;
}): RentalQuote {
  const policy = params.policy ?? FINANCE_POLICY;
  const gross = parseRub(params.grossAmountRub);
  const errors = gross.ok ? [] : [gross.error];
  const grossCents = gross.ok ? gross.cents : 0n;
  const feeCents = roundRate(grossCents, policy.partnerFeeBps);
  const bonusCents = roundRate(grossCents, policy.rentalBonusBps);

  return {
    kind: "rental_deal",
    valid: errors.length === 0,
    currency: policy.currency,
    policyVersion: policy.version,
    grossAmountRub: centsToRub(grossCents),
    landlordFeeRub: centsToRub(feeCents),
    landlordBonusRub: centsToRub(bonusCents),
    tenantBonusRub: centsToRub(bonusCents),
    rates: {
      landlordFeeRate: policy.partnerFeeBps / 10000,
      landlordBonusRate: policy.rentalBonusBps / 10000,
      tenantBonusRate: policy.rentalBonusBps / 10000,
    },
    breakdown: {
      grossRub: centsToRub(grossCents),
      landlordFeeRub: centsToRub(feeCents),
      landlordBonusRub: centsToRub(bonusCents),
      tenantBonusRub: centsToRub(bonusCents),
    },
    errors,
  };
}
