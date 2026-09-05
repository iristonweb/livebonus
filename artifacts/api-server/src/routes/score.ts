import { Router, type Response } from "express";
import { createHash, randomBytes } from "node:crypto";
import {
  db,
  usersTable,
  leasesTable,
  scoreEventsTable,
  scoreDisputesTable,
  scoreDisputeAuditTable,
  livePassportSharesTable,
  livePassportShareAuditTable,
} from "@workspace/db";
import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import {
  calculateScore,
  getTier,
  getTierLabel,
  addScoreEventInTransaction,
  buildScoreTimeline,
} from "../lib/score.js";
import { getUserIdFromReq, requireAuth } from "./auth.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ---------------------------------------------------------------------------
// GET /score — Current user's live score
// ---------------------------------------------------------------------------
function serializeScoreComponent(component: ReturnType<typeof calculateScore>["components"][number], includeEvents: boolean) {
  return {
    key: component.key,
    name: component.name,
    score: component.score,
    maxScore: component.maxScore,
    minScore: component.minScore,
    capApplied: component.capApplied,
    capDescription: component.capDescription,
    description: component.description,
    details: component.details,
    // Public passports retain the same shape but never expose event text.
    events: includeEvents ? component.events : [],
  };
}

function formatDispute(dispute: typeof scoreDisputesTable.$inferSelect, includeReason = true) {
  return {
    id: dispute.id,
    leaseId: dispute.leaseId,
    scoreEventId: dispute.scoreEventId,
    ...(includeReason ? { reason: dispute.reason, resolutionReason: dispute.resolutionReason } : {}),
    status: dispute.status,
    version: dispute.version,
    createdAt: dispute.createdAt.toISOString(),
    updatedAt: dispute.updatedAt.toISOString(),
    resolvedAt: dispute.resolvedAt?.toISOString() ?? null,
  };
}

async function readScore(userId: number) {
  const [[user], events, leases] = await Promise.all([
    db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1),
    db.select().from(scoreEventsTable).where(eq(scoreEventsTable.userId, userId)),
    db.select().from(leasesTable).where(eq(leasesTable.userId, userId)),
  ]);
  if (!user) return null;
  const calculation = calculateScore(user, events);
  const activeLease = leases.find((lease) => lease.isActive) ?? null;
  await db.update(usersTable).set({ liveScore: calculation.score }).where(eq(usersTable.id, userId));
  return {
    ...calculation,
    tier: getTier(calculation.score),
    tierLabel: getTierLabel(calculation.score),
    isPhoneVerified: user.isPhoneVerified,
    isIdentityVerified: user.isIdentityVerified,
    isIncomeVerified: user.isIncomeVerified,
    verificationLevel: user.verificationLevel,
    totalLeases: leases.length,
    activeLeases: leases.filter((lease) => lease.isActive).length,
    activeLease: activeLease
      ? {
          address: activeLease.address,
          city: activeLease.city,
          monthlyRentRub: parseFloat(activeLease.monthlyRentRub as string),
          startDate: activeLease.startDate.toISOString(),
          onTimePayments: activeLease.onTimePayments,
          latePayments: activeLease.latePayments,
          landlordRating: activeLease.landlordRating ? parseFloat(activeLease.landlordRating as string) : null,
        }
      : null,
    components: calculation.components.map((component) => serializeScoreComponent(component, true)),
  };
}

router.get("/", requireAuth, async (req, res) => {
  const userId = getUserIdFromReq(req as any);
  const score = await readScore(userId);
  if (!score) { res.status(404).json({ error: "User not found" }); return; }
  res.json(score);
});

// ---------------------------------------------------------------------------
// GET /score/history — Recent score events
// ---------------------------------------------------------------------------
router.get("/history", requireAuth, async (req, res) => {
  const userId = getUserIdFromReq(req as any);
  const events = await db
    .select()
    .from(scoreEventsTable)
    .where(eq(scoreEventsTable.userId, userId))
    .orderBy(desc(scoreEventsTable.createdAt), desc(scoreEventsTable.id))
    .limit(30);

  res.json(
    events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      scoreChange: e.scoreChange,
      description: e.description,
      createdAt: e.createdAt.toISOString(),
      relatedLeaseId: e.relatedLeaseId,
    })),
  );
});

router.get("/disputes", requireAuth, async (req, res) => {
  const userId = getUserIdFromReq(req as any);
  const disputes = await db.select().from(scoreDisputesTable)
    .where(eq(scoreDisputesTable.userId, userId))
    .orderBy(desc(scoreDisputesTable.createdAt));
  res.json(disputes.map((dispute) => formatDispute(dispute)));
});

// ---------------------------------------------------------------------------
// GET /score/timeline — Cumulative score over time for chart
// ---------------------------------------------------------------------------
router.get("/timeline", requireAuth, async (req, res) => {
  const userId = getUserIdFromReq(req as any);
  const timeline = await buildScoreTimeline(userId);
  res.json(timeline);
});

// ---------------------------------------------------------------------------
// Disputes — every dispute is bound to the user's lease and can be decided
// only once. The opening penalty is compensated exactly once on approval.
// ---------------------------------------------------------------------------
function parsePositiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function idempotencyKeyFromRequest(req: { headers: Record<string, string | string[] | undefined> }): string | null {
  const value = req.headers["idempotency-key"];
  return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, 200) : null;
}

router.post("/dispute", requireAuth, async (req, res) => {
  const userId = getUserIdFromReq(req as any);
  const body = req.body as { reason?: unknown; leaseId?: unknown; scoreEventId?: unknown };
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const requestedLeaseId = parsePositiveInt(body.leaseId);
  const requestedEventId = parsePositiveInt(body.scoreEventId);
  if (reason.length < 10 || reason.length > 1000) {
    res.status(400).json({ error: "Укажите причину длиной от 10 до 1000 символов", code: "INVALID_DISPUTE_REASON" });
    return;
  }
  if (body.leaseId !== undefined && requestedLeaseId === null) {
    res.status(400).json({ error: "Invalid lease id", code: "INVALID_LEASE_ID" });
    return;
  }
  if (body.scoreEventId !== undefined && requestedEventId === null) {
    res.status(400).json({ error: "Invalid score event id", code: "INVALID_SCORE_EVENT_ID" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    let leaseId = requestedLeaseId;
    let scoreEventId = requestedEventId;
    if (scoreEventId !== null) {
      const [event] = await tx.select().from(scoreEventsTable)
        .where(and(eq(scoreEventsTable.id, scoreEventId), eq(scoreEventsTable.userId, userId))).limit(1);
      if (!event) return { error: "SCORE_EVENT_NOT_FOUND" as const };
      if (leaseId === null && event.relatedLeaseId) leaseId = event.relatedLeaseId;
      if (leaseId !== null && event.relatedLeaseId !== null && event.relatedLeaseId !== leaseId) {
        return { error: "SCORE_EVENT_LEASE_MISMATCH" as const };
      }
    }
    if (leaseId === null) {
      const [activeLease] = await tx.select().from(leasesTable)
        .where(and(eq(leasesTable.userId, userId), eq(leasesTable.isActive, true))).limit(1);
      leaseId = activeLease?.id ?? null;
    }
    if (leaseId === null) return { error: "LEASE_REQUIRED" as const };
    const [lease] = await tx.select().from(leasesTable)
      .where(and(eq(leasesTable.id, leaseId), eq(leasesTable.userId, userId))).limit(1);
    if (!lease) return { error: "LEASE_NOT_FOUND" as const };

    const [openDispute] = await tx.select().from(scoreDisputesTable)
      .where(and(eq(scoreDisputesTable.userId, userId), eq(scoreDisputesTable.leaseId, leaseId),
        sql`${scoreDisputesTable.status} IN ('created', 'under_review')`))
      .limit(1);
    if (openDispute) return { duplicate: openDispute };

    const [dispute] = await tx.insert(scoreDisputesTable).values({
      userId,
      leaseId,
      scoreEventId,
      reason,
      status: "created",
      version: 1,
    }).returning();
    if (!dispute) return { error: "DISPUTE_NOT_CREATED" as const };
    const newScore = await addScoreEventInTransaction(
      tx,
      userId,
      "dispute_opened",
      -5,
      `Открыт спор по аренде: ${lease.address}`,
      leaseId,
      `dispute:${dispute.id}:opened`,
    );
    await tx.insert(scoreDisputeAuditTable).values({
      disputeId: dispute.id,
      actorUserId: userId,
      action: "created",
      toStatus: "created",
      reason,
    });
    return { dispute, newScore };
  });

  if ("duplicate" in result) {
    res.status(409).json({ error: "По этой аренде уже есть открытый спор", code: "DISPUTE_ALREADY_OPEN", dispute: formatDispute(result.duplicate!) });
    return;
  }
  if ("error" in result) {
    const status = result.error === "LEASE_REQUIRED" ? 422 : 404;
    res.status(status).json({ error: result.error === "LEASE_REQUIRED" ? "Спор должен быть привязан к аренде или событию" : "Разрешённая аренда или событие не найдены", code: result.error });
    return;
  }
  res.status(201).json({
    success: true,
    message: "Спор зарегистрирован и ожидает рассмотрения модератором.",
    scoreImpact: -5,
    newScore: result.newScore,
    dispute: formatDispute(result.dispute),
  });
});

// ---------------------------------------------------------------------------
// Live Passport sharing
// ---------------------------------------------------------------------------
const PASSPORT_TOKEN_BYTES = 32;
const PASSPORT_MAX_ACTIVE_SHARES = 3;
const PASSPORT_DEFAULT_EXPIRY_DAYS = 7;
const PASSPORT_MAX_EXPIRY_DAYS = 30;
const PASSPORT_RATE_WINDOW_MS = 60_000;
const PASSPORT_RATE_LIMIT = 60;
const passportReadBuckets = new Map<string, { count: number; resetAt: number }>();

type PassportUnavailableResponse = { error: "Passport unavailable"; code: "PASSPORT_UNAVAILABLE" };

function passportUnavailable(res: Response): void {
  res.status(404).json({ error: "Passport unavailable", code: "PASSPORT_UNAVAILABLE" } satisfies PassportUnavailableResponse);
}

function hashPassportToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function getRequestAddress(req: { ip?: string; socket?: { remoteAddress?: string } }): string {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function isPassportReadAllowed(address: string, now = Date.now()): boolean {
  const current = passportReadBuckets.get(address);
  if (!current || current.resetAt <= now) {
    passportReadBuckets.set(address, { count: 1, resetAt: now + PASSPORT_RATE_WINDOW_MS });
    return true;
  }
  if (current.count >= PASSPORT_RATE_LIMIT) return false;
  current.count += 1;
  return true;
}

function parseShareId(value: string): number | null {
  if (!/^[1-9]\d*$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : null;
}

function formatShare(share: typeof livePassportSharesTable.$inferSelect, token?: string) {
  return {
    id: share.id,
    expiresAt: share.expiresAt.toISOString(),
    revokedAt: share.revokedAt?.toISOString() ?? null,
    createdAt: share.createdAt.toISOString(),
    lastAccessedAt: share.lastAccessedAt?.toISOString() ?? null,
    status: share.revokedAt
      ? "revoked"
      : share.expiresAt.getTime() <= Date.now()
        ? "expired"
        : "active",
    ...(token ? { token } : {}),
  };
}

function buildPublicPassport(
  user: typeof usersTable.$inferSelect,
  events: Array<typeof scoreEventsTable.$inferSelect>,
  leases: Array<typeof leasesTable.$inferSelect>,
) {
  const calculation = calculateScore(user, events);
  const now = Date.now();
  const totalTenureMonths = leases.reduce((sum, lease) => {
    const end = lease.endDate?.getTime() ?? now;
    return sum + Math.max(0, Math.floor((end - lease.startDate.getTime()) / (30 * 24 * 60 * 60 * 1000)));
  }, 0);

  return {
    score: calculation.score,
    baseScore: calculation.baseScore,
    categoryScore: calculation.categoryScore,
    scoreVersion: calculation.scoreVersion,
    tier: getTier(calculation.score),
    tierLabel: getTierLabel(calculation.score),
    components: calculation.components.map((component) => serializeScoreComponent(component, false)),
    isPhoneVerified: user.isPhoneVerified,
    isIdentityVerified: user.isIdentityVerified,
    isIncomeVerified: user.isIncomeVerified,
    totalLeases: leases.length,
    activeLeases: leases.filter((lease) => lease.isActive).length,
    completedLeases: leases.filter((lease) => !lease.isActive).length,
    totalTenureMonths,
    totalOnTimePayments: leases.reduce((sum, lease) => sum + lease.onTimePayments, 0),
    totalLatePayments: leases.reduce((sum, lease) => sum + lease.latePayments, 0),
    generatedAt: new Date().toISOString(),
  };
}

function expiryDateFromBody(body: unknown): Date | null {
  const raw = (body as { expiresInDays?: unknown } | null)?.expiresInDays;
  const days = raw === undefined ? PASSPORT_DEFAULT_EXPIRY_DAYS : Number(raw);
  if (!Number.isInteger(days) || days < 1 || days > PASSPORT_MAX_EXPIRY_DAYS) return null;
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

// Management routes are declared before /passport/:token so "shares" cannot
// accidentally be interpreted as a public token.
router.get("/passport/shares", requireAuth, async (req, res) => {
  const userId = getUserIdFromReq(req as any);
  const shares = await db
    .select()
    .from(livePassportSharesTable)
    .where(eq(livePassportSharesTable.userId, userId))
    .orderBy(desc(livePassportSharesTable.createdAt))
    .limit(20);
  res.json(shares.map((share) => formatShare(share)));
});

router.post("/passport/shares", requireAuth, async (req, res) => {
  const userId = getUserIdFromReq(req as any);
  const expiresAt = expiryDateFromBody(req.body);
  if (!expiresAt) {
    res.status(400).json({
      error: "Expiry must be between 1 and 30 days",
      code: "INVALID_EXPIRY",
    });
    return;
  }

  const token = randomBytes(PASSPORT_TOKEN_BYTES).toString("base64url");
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${userId})`);
    const activeShares = await tx
      .select({ id: livePassportSharesTable.id })
      .from(livePassportSharesTable)
      .where(and(
        eq(livePassportSharesTable.userId, userId),
        isNull(livePassportSharesTable.revokedAt),
        gt(livePassportSharesTable.expiresAt, new Date()),
      ));
    if (activeShares.length >= PASSPORT_MAX_ACTIVE_SHARES) return { share: null };

    const [share] = await tx
      .insert(livePassportSharesTable)
      .values({ userId, tokenHash: hashPassportToken(token), expiresAt })
      .returning();
    if (!share) return { share: undefined };
    await tx.insert(livePassportShareAuditTable).values({
      shareId: share.id,
      ownerUserId: userId,
      actorUserId: userId,
      action: "created",
    });
    return { share };
  });
  if (result.share === null) {
    res.status(409).json({
      error: "Too many active passport links",
      code: "ACTIVE_SHARE_LIMIT",
      limit: PASSPORT_MAX_ACTIVE_SHARES,
    });
    return;
  }
  if (!result.share) {
    res.status(503).json({ error: "Could not create passport link", code: "SHARE_CREATE_FAILED" });
    return;
  }

  res.status(201).json(formatShare(result.share, token));
});

router.post("/passport/shares/:id/revoke", requireAuth, async (req, res) => {
  const userId = getUserIdFromReq(req as any);
  const shareId = parseShareId(typeof req.params.id === "string" ? req.params.id : "");
  if (shareId === null) {
    res.status(400).json({ error: "Invalid share id", code: "INVALID_SHARE_ID" });
    return;
  }

  const [share] = await db
    .select()
    .from(livePassportSharesTable)
    .where(and(eq(livePassportSharesTable.id, shareId), eq(livePassportSharesTable.userId, userId)))
    .limit(1);
  if (!share) {
    res.status(404).json({ error: "Share not found", code: "SHARE_NOT_FOUND" });
    return;
  }
  if (!share.revokedAt) {
    const revokedAt = new Date();
    await db
      .update(livePassportSharesTable)
      .set({ revokedAt })
      .where(and(eq(livePassportSharesTable.id, shareId), eq(livePassportSharesTable.userId, userId)));
    await db.insert(livePassportShareAuditTable).values({
      shareId,
      ownerUserId: userId,
      actorUserId: userId,
      action: "revoked",
    });
    share.revokedAt = revokedAt;
  }
  res.json(formatShare(share));
});

// GET /score/passport/:token — public, token-based Live Passport
router.get("/passport/:token", async (req, res) => {
  if (!isPassportReadAllowed(getRequestAddress(req))) {
    res.set("Retry-After", "60");
    res.status(429).json({ error: "Too many passport requests", code: "PASSPORT_RATE_LIMITED" });
    return;
  }

  const token = typeof req.params.token === "string" ? req.params.token : "";
  if (!/^[A-Za-z0-9_-]{40,80}$/.test(token)) {
    passportUnavailable(res);
    return;
  }

  const [share] = await db
    .select()
    .from(livePassportSharesTable)
    .where(and(
      eq(livePassportSharesTable.tokenHash, hashPassportToken(token)),
      isNull(livePassportSharesTable.revokedAt),
      gt(livePassportSharesTable.expiresAt, new Date()),
    ))
    .limit(1);
  if (!share) {
    passportUnavailable(res);
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, share.userId)).limit(1);
  if (!user) {
    passportUnavailable(res);
    return;
  }
  const [events, leases] = await Promise.all([
    db.select().from(scoreEventsTable).where(eq(scoreEventsTable.userId, user.id)),
    db.select().from(leasesTable).where(eq(leasesTable.userId, user.id)),
  ]);

  const accessedAt = new Date();
  await Promise.all([
    db.update(livePassportSharesTable).set({ lastAccessedAt: accessedAt }).where(eq(livePassportSharesTable.id, share.id)),
    db.insert(livePassportShareAuditTable).values({
      shareId: share.id,
      ownerUserId: share.userId,
      action: "read",
    }),
  ]).catch((error) => {
    logger.warn({ err: error, shareId: share.id }, "Failed to record Live Passport access");
  });

  res.json(buildPublicPassport(user, events, leases));
});

export default router;
