import { createHash } from "node:crypto";
import { db, usersTable, scoreEventsTable, leasesTable } from "@workspace/db";
import { eq, asc } from "drizzle-orm";

export const BASE_SCORE = 500;
export const SCORE_LIMITS = { min: 0, max: 1000 } as const;

export const SCORE_CATEGORY_DEFINITIONS = [
  { key: "verification", name: "Верификация личности", maxScore: 250, description: "Подтверждённые данные повышают доверие" },
  { key: "payment_history", name: "Платёжная история", maxScore: 250, description: "Регулярность и своевременность платежей" },
  { key: "tenure", name: "Стаж аренды", maxScore: 200, description: "Длительность и количество договоров аренды" },
  { key: "reviews", name: "Отзывы арендодателей", maxScore: 200, description: "Оценки от арендодателей" },
  { key: "disputes", name: "Чистая история", maxScore: 100, description: "Результат рассмотренных споров и возврата депозита" },
] as const;

type ScoreCategoryKey = (typeof SCORE_CATEGORY_DEFINITIONS)[number]["key"];
type ScoreUser = Pick<typeof usersTable.$inferSelect, "isPhoneVerified" | "isIdentityVerified" | "isIncomeVerified">;
type ScoreEvent = typeof scoreEventsTable.$inferSelect;

const EVENT_CATEGORIES: Record<string, Exclude<ScoreCategoryKey, "verification">> = {
  payment_on_time: "payment_history",
  payment_late: "payment_history",
  lease_started: "tenure",
  lease_completed: "tenure",
  long_tenure: "tenure",
  landlord_review: "reviews",
  no_disputes: "disputes",
  dispute_opened: "disputes",
  dispute_resolved: "disputes",
};

const VERIFICATION_EVENTS = new Set(["phone_verified", "identity_verified", "income_verified"]);

export function getTier(score: number): string {
  if (score >= 900) return "premium";
  if (score >= 800) return "high";
  if (score >= 700) return "above_average";
  if (score >= 600) return "average";
  return "below_average";
}

export function getTierLabel(score: number): string {
  if (score >= 900) return "Premium Tenant";
  if (score >= 800) return "Надёжный";
  if (score >= 700) return "Хороший";
  if (score >= 600) return "Средний";
  return "Начинающий";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function eventDate(event: Pick<ScoreEvent, "createdAt">): Date {
  return event.createdAt instanceof Date ? event.createdAt : new Date(event.createdAt);
}

export function sortScoreEvents<T extends Pick<ScoreEvent, "createdAt" | "id">>(events: T[]): T[] {
  return [...events].sort((a, b) => {
    const byDate = eventDate(a).getTime() - eventDate(b).getTime();
    return byDate || a.id - b.id;
  });
}

function scoreVersion(user: ScoreUser, events: ScoreEvent[]): string {
  const source = JSON.stringify({
    verification: [user.isPhoneVerified, user.isIdentityVerified, user.isIncomeVerified],
    events: sortScoreEvents(events).map((event) => [event.id, event.eventType, event.scoreChange, event.createdAt]),
  });
  return createHash("sha256").update(source).digest("hex").slice(0, 16);
}

export interface ScoreEventDetail {
  id: number;
  eventType: string;
  scoreChange: number;
  description: string;
  createdAt: string;
}

export interface ScoreComponentResult {
  key: ScoreCategoryKey;
  name: string;
  score: number;
  maxScore: number;
  minScore: number;
  capApplied: boolean;
  capDescription: string;
  description: string;
  details: Array<{ label: string; achieved: boolean; points: number }>;
  events: ScoreEventDetail[];
}

export interface ScoreCalculation {
  score: number;
  baseScore: number;
  categoryScore: number;
  scoreVersion: string;
  components: ScoreComponentResult[];
}

/**
 * The only score calculation used by private score, timeline and Live Passport.
 * Verification is account state (verification events are audit history only);
 * all other values are the net, capped contribution of their score events.
 */
export function calculateScore(user: ScoreUser, inputEvents: ScoreEvent[]): ScoreCalculation {
  const events = sortScoreEvents(inputEvents);
  const verificationEventTypes = new Set(events.filter((event) => VERIFICATION_EVENTS.has(event.eventType)).map((event) => event.eventType));
  const verification = [
    { label: "Телефон", achieved: user.isPhoneVerified || verificationEventTypes.has("phone_verified"), points: 50 },
    { label: "Паспорт / ID", achieved: user.isIdentityVerified || verificationEventTypes.has("identity_verified"), points: 100 },
    { label: "Подтверждение дохода", achieved: user.isIncomeVerified || verificationEventTypes.has("income_verified"), points: 100 },
  ];
  const verificationScore = verification.reduce((sum, detail) => sum + (detail.achieved ? detail.points : 0), 0);
  const components = SCORE_CATEGORY_DEFINITIONS.map((definition): ScoreComponentResult => {
    if (definition.key === "verification") {
      return {
        ...definition,
        score: verificationScore,
        minScore: 0,
        capApplied: false,
        capDescription: `От 0 до ${definition.maxScore} баллов`,
        details: verification,
        events: [],
      };
    }
    const categoryEvents = events.filter((event) => EVENT_CATEGORIES[event.eventType] === definition.key);
    const rawScore = categoryEvents.reduce((sum, event) => sum + event.scoreChange, 0);
    const score = clamp(rawScore, -definition.maxScore, definition.maxScore);
    return {
      ...definition,
      score,
      minScore: -definition.maxScore,
      capApplied: score !== rawScore,
      capDescription: `Ограничение: от −${definition.maxScore} до +${definition.maxScore} баллов`,
      details: [],
      events: categoryEvents.map((event) => ({
        id: event.id,
        eventType: event.eventType,
        scoreChange: event.scoreChange,
        description: event.description,
        createdAt: eventDate(event).toISOString(),
      })),
    };
  });
  const categoryScore = components.reduce((sum, component) => sum + component.score, 0);
  return {
    score: clamp(BASE_SCORE + categoryScore, SCORE_LIMITS.min, SCORE_LIMITS.max),
    baseScore: BASE_SCORE,
    categoryScore,
    scoreVersion: scoreVersion(user, events),
    components,
  };
}

type ScoreExecutor = Pick<typeof db, "select" | "update" | "insert">;

async function syncUserScoreWithExecutor(executor: ScoreExecutor, userId: number): Promise<number> {
  const [user] = await executor
    .select({ isPhoneVerified: usersTable.isPhoneVerified, isIdentityVerified: usersTable.isIdentityVerified, isIncomeVerified: usersTable.isIncomeVerified })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  const events = await executor
    .select()
    .from(scoreEventsTable)
    .where(eq(scoreEventsTable.userId, userId));
  const total = calculateScore(user ?? { isPhoneVerified: false, isIdentityVerified: false, isIncomeVerified: false }, events).score;
  await executor.update(usersTable).set({ liveScore: total }).where(eq(usersTable.id, userId));
  return total;
}

export async function syncUserScore(userId: number): Promise<number> {
  return syncUserScoreWithExecutor(db, userId);
}

/** Insert a score event + sync liveScore atomically within the supplied transaction. */
export async function addScoreEventInTransaction(
  tx: ScoreExecutor,
  userId: number,
  eventType: string,
  scoreChange: number,
  description: string,
  relatedLeaseId?: number,
  idempotencyKey?: string,
): Promise<number> {
  await tx.insert(scoreEventsTable).values({
    userId,
    eventType,
    scoreChange,
    description,
    relatedLeaseId: relatedLeaseId ?? null,
    idempotencyKey: idempotencyKey ?? null,
  }).onConflictDoNothing({ target: scoreEventsTable.idempotencyKey });
  return syncUserScoreWithExecutor(tx, userId);
}

/** Insert a score event and update the cached score in one database transaction. */
export async function addScoreEvent(
  userId: number,
  eventType: string,
  scoreChange: number,
  description: string,
  relatedLeaseId?: number,
  idempotencyKey?: string,
): Promise<number> {
  return db.transaction((tx) =>
    addScoreEventInTransaction(tx, userId, eventType, scoreChange, description, relatedLeaseId, idempotencyKey));
}

/** Build the same cumulative score model used by GET /score and Live Passport. */
export async function buildScoreTimeline(userId: number) {
  const [[user], events] = await Promise.all([
    db.select({
      isPhoneVerified: usersTable.isPhoneVerified,
      isIdentityVerified: usersTable.isIdentityVerified,
      isIncomeVerified: usersTable.isIncomeVerified,
    }).from(usersTable).where(eq(usersTable.id, userId)),
    db.select().from(scoreEventsTable).where(eq(scoreEventsTable.userId, userId)),
  ]);
  const orderedEvents = sortScoreEvents(events);
  const timeline: { date: string; score: number; change?: number; description?: string; eventType?: string; scoreVersion?: string }[] = [];
  const scoreUser = user ?? { isPhoneVerified: false, isIdentityVerified: false, isIncomeVerified: false };
  const initial = calculateScore(scoreUser, []);
  const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
  timeline.push({ date: oneYearAgo.toISOString(), score: initial.score, scoreVersion: initial.scoreVersion });
  for (let index = 0; index < orderedEvents.length; index += 1) {
    const event = orderedEvents[index]!;
    const calculation = calculateScore(scoreUser, orderedEvents.slice(0, index + 1));
    timeline.push({
      date: eventDate(event).toISOString(),
      score: calculation.score,
      change: event.scoreChange,
      description: event.description,
      eventType: event.eventType,
      scoreVersion: calculation.scoreVersion,
    });
  }
  const now = new Date();
  if (timeline[timeline.length - 1]?.date !== now.toISOString()) {
    timeline.push({ date: now.toISOString(), score: calculateScore(scoreUser, orderedEvents).score, scoreVersion: calculateScore(scoreUser, orderedEvents).scoreVersion });
  }
  return timeline;
}

/** Apply long_tenure events for all active leases (run monthly). */
export async function applyMonthlyTenureEvents(): Promise<void> {
  const activeLeases = await db.select().from(leasesTable).where(eq(leasesTable.isActive, true));
  const now = new Date();
  for (const lease of activeLeases) {
    const monthsActive = Math.floor((now.getTime() - lease.startDate.getTime()) / (30 * 24 * 60 * 60 * 1000));
    if (monthsActive < 1) continue;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const recentEvents = await db.select().from(scoreEventsTable).where(eq(scoreEventsTable.userId, lease.userId));
    const alreadyIssued = recentEvents.some((event) =>
      event.eventType === "long_tenure" && event.relatedLeaseId === lease.id && eventDate(event) >= startOfMonth);
    if (!alreadyIssued) {
      await addScoreEvent(
        lease.userId,
        "long_tenure",
        5,
        `${monthsActive} ${monthsActive === 1 ? "месяц" : monthsActive < 5 ? "месяца" : "месяцев"} аренды без нарушений`,
        lease.id,
        `lease:${lease.id}:long-tenure:${now.getUTCFullYear()}-${now.getUTCMonth() + 1}`,
      );
    }
  }
}