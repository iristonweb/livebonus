export const CATEGORY_MULTIPLIERS: Record<string, number> = {
  rent: 2.0,
  utilities: 2.0,
  transport: 1.5,
  health: 1.3,
  food: 1.0,
  other: 1.0,
};

export const STATUS_MULTIPLIERS: Record<string, number> = {
  novice: 1.0,
  silver: 1.1,
  gold: 1.25,
  platinum: 1.5,
};

export const STATUS_THRESHOLDS: Record<string, number> = {
  novice: 0,
  silver: 50000,
  gold: 150000,
  platinum: 300000,
};

export const STATUS_ORDER = ["novice", "silver", "gold", "platinum"];

export const CONVERSION_RATE = 0.8;
export const BASE_RATE = 0.01;

export function calculateBonus(params: {
  amountRub: number;
  category: string;
  userStatus: string;
  promoMultiplier?: number;
}): {
  pointsEarned: number;
  rubEquivalent: number;
  baseRate: number;
  categoryMultiplier: number;
  statusMultiplier: number;
  promoMultiplier: number;
  effectiveMultiplier: number;
  breakdown: string;
} {
  const categoryMultiplier = CATEGORY_MULTIPLIERS[params.category] ?? 1.0;
  const statusMultiplier = STATUS_MULTIPLIERS[params.userStatus] ?? 1.0;
  const promoMultiplier = params.promoMultiplier ?? 1.0;
  const effectiveMultiplier = categoryMultiplier * statusMultiplier * promoMultiplier;
  const pointsEarned = Math.floor(params.amountRub * BASE_RATE * effectiveMultiplier * 100);
  const rubEquivalent = parseFloat((pointsEarned * CONVERSION_RATE).toFixed(2));

  const breakdown = `${params.amountRub}₽ × ${BASE_RATE * 100}% × ${categoryMultiplier}× (категория) × ${statusMultiplier}× (статус)${promoMultiplier !== 1.0 ? ` × ${promoMultiplier}× (промо)` : ""} = ${pointsEarned} баллов`;

  return {
    pointsEarned,
    rubEquivalent,
    baseRate: BASE_RATE,
    categoryMultiplier,
    statusMultiplier,
    promoMultiplier,
    effectiveMultiplier,
    breakdown,
  };
}

export function getStatusForPoints(points: number): string {
  let status = "novice";
  for (const [s, threshold] of Object.entries(STATUS_THRESHOLDS)) {
    if (points >= threshold) status = s;
  }
  return status;
}

export function getNextStatus(currentStatus: string): string | null {
  const idx = STATUS_ORDER.indexOf(currentStatus);
  if (idx === -1 || idx === STATUS_ORDER.length - 1) return null;
  return STATUS_ORDER[idx + 1];
}

export function getPointsToNextStatus(currentPoints: number, currentStatus: string): number | null {
  const next = getNextStatus(currentStatus);
  if (!next) return null;
  return STATUS_THRESHOLDS[next] - currentPoints;
}
