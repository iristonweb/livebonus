import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, leasesTable, insertLeaseSchema, scoreEventsTable, usersTable } from "@workspace/db";
import { CreateLeaseBody, UpdateLeaseBody } from "@workspace/api-zod";
import { addScoreEventInTransaction } from "../lib/score.js";
import { getUserIdFromReq, requireAuth } from "./auth.js";

const router = Router();

function formatLease(l: typeof leasesTable.$inferSelect) {
  return {
    id: l.id,
    address: l.address,
    city: l.city,
    landlordName: l.landlordName,
    landlordUserId: l.landlordUserId,
    monthlyRentRub: parseFloat(l.monthlyRentRub as string),
    startDate: l.startDate.toISOString(),
    endDate: l.endDate?.toISOString() ?? null,
    isActive: l.isActive,
    depositAmountRub: l.depositAmountRub ? parseFloat(l.depositAmountRub as string) : null,
    depositReturned: l.depositReturned,
    onTimePayments: l.onTimePayments,
    latePayments: l.latePayments,
    landlordRating: l.landlordRating ? parseFloat(l.landlordRating as string) : null,
    createdAt: l.createdAt.toISOString(),
  };
}

function parseLeaseId(rawId: string | string[]): number | null {
  const id = Number(Array.isArray(rawId) ? rawId[0] : rawId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseDate(value: string | Date): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const match = /^(?<date>\d{4}-\d{2}-\d{2})(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/.exec(value);
  if (!match?.groups?.date) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const [year, month, day] = match.groups.date.split("-").map(Number);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null;
  return date;
}

function validationError(res: { status: (code: number) => { json: (body: unknown) => void } }, details?: unknown): void {
  res.status(422).json({ error: "Invalid lease data", code: "LEASE_VALIDATION_FAILED", ...(details ? { details } : {}) });
}

// GET /leases
router.get("/", requireAuth, async (req, res) => {
  const userId = getUserIdFromReq(req);
  const leases = await db
    .select()
    .from(leasesTable)
    .where(eq(leasesTable.userId, userId))
    .orderBy(desc(leasesTable.startDate));
  res.json(leases.map(formatLease));
});

// POST /leases
router.post("/", requireAuth, async (req, res) => {
  const userId = getUserIdFromReq(req);
  const body = CreateLeaseBody.strict().safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: "Invalid input", details: body.error.issues });
    return;
  }
  const startDate = body.data.startDate === undefined ? undefined : parseDate(body.data.startDate);
  if ((body.data.startDate !== undefined && !startDate)
    || !Number.isFinite(body.data.monthlyRentRub) || body.data.monthlyRentRub < 0
    || (body.data.depositAmountRub !== undefined
      && (!Number.isFinite(body.data.depositAmountRub) || body.data.depositAmountRub < 0))) {
    validationError(res, [{ path: ["lease"], message: "Invalid dates or non-negative monetary values are required" }]);
    return;
  }
  const parsed = insertLeaseSchema.safeParse({
    ...body.data,
    ...(startDate ? { startDate } : {}),
    userId,
  });
  if (!parsed.success) {
    validationError(res, parsed.error.issues);
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [lease] = await tx.insert(leasesTable).values(parsed.data).returning();
      if (!lease) throw new Error("LEASE_NOT_CREATED");
      await addScoreEventInTransaction(
        tx,
        userId,
        "lease_started",
        30,
        `Новый договор аренды: ${lease.address}`,
        lease.id,
        `lease:${lease.id}:started`,
      );
      return lease;
    });
    res.status(201).json(formatLease(result));
  } catch (error) {
    if ((error as { code?: string }).code === "23503") {
      res.status(404).json({ error: "Landlord not found", code: "LANDLORD_NOT_FOUND" });
      return;
    }
    throw error;
  }
});

// PATCH /leases/:id — update landlord rating / deposit returned / lifecycle
router.patch("/:id", requireAuth, async (req, res) => {
  const userId = getUserIdFromReq(req);
  const leaseId = parseLeaseId(req.params.id);
  if (leaseId === null) {
    res.status(400).json({ error: "Invalid lease id" });
    return;
  }

  const parsed = UpdateLeaseBody.strict().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.issues });
    return;
  }
  if (Object.keys(parsed.data).length === 0) {
    res.status(400).json({ error: "No updatable fields provided" });
    return;
  }
  if (parsed.data.landlordRating !== undefined
    && (!Number.isFinite(parsed.data.landlordRating) || parsed.data.landlordRating < 1 || parsed.data.landlordRating > 5)) {
    validationError(res, [{ path: ["landlordRating"], message: "landlordRating must be between 1 and 5" }]);
    return;
  }
  if (parsed.data.landlordName !== undefined && parsed.data.landlordName.trim().length === 0) {
    validationError(res, [{ path: ["landlordName"], message: "landlordName must not be empty" }]);
    return;
  }
  const endDate = parsed.data.endDate === undefined ? undefined : parseDate(parsed.data.endDate);
  if (parsed.data.endDate !== undefined && !endDate) {
    validationError(res, [{ path: ["endDate"], message: "endDate must be a valid date" }]);
    return;
  }

  try {
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(leasesTable)
        .where(and(eq(leasesTable.id, leaseId), eq(leasesTable.userId, userId)))
        .for("update");
      if (!existing) return null;
      if (endDate && endDate < existing.startDate) {
        const error = new Error("END_DATE_BEFORE_START");
        (error as Error & { status?: number }).status = 422;
        throw error;
      }
      if (parsed.data.isActive === true && endDate && endDate <= new Date()) {
        const error = new Error("EXPIRED_ACTIVE_LEASE");
        (error as Error & { status?: number }).status = 422;
        throw error;
      }

      const updates = {
        ...(parsed.data.landlordRating === undefined ? {} : { landlordRating: String(parsed.data.landlordRating) }),
        ...(parsed.data.landlordName === undefined ? {} : { landlordName: parsed.data.landlordName.trim() }),
        ...(parsed.data.depositReturned === undefined ? {} : { depositReturned: parsed.data.depositReturned }),
        ...(parsed.data.isActive === undefined ? {} : { isActive: parsed.data.isActive }),
        ...(endDate === undefined ? {} : { endDate }),
      };
      const [updated] = await tx.update(leasesTable).set(updates).where(eq(leasesTable.id, leaseId)).returning();
      if (!updated) return null;

      if (parsed.data.landlordRating !== undefined && !existing.landlordRating) {
        const scoreChange = parsed.data.landlordRating >= 4 ? 20 : parsed.data.landlordRating >= 3 ? 0 : -10;
        if (scoreChange !== 0) {
          await addScoreEventInTransaction(
            tx,
            userId,
            "landlord_review",
            scoreChange,
            `Оценка арендодателя: ${parsed.data.landlordRating}/5 — ${existing.address}`,
            leaseId,
            `lease:${leaseId}:landlord-review`,
          );
        }
      }
      if (parsed.data.depositReturned === true && !existing.depositReturned) {
        await addScoreEventInTransaction(
          tx,
          userId,
          "no_disputes",
          10,
          `Депозит возвращён: ${existing.address}`,
          leaseId,
          `lease:${leaseId}:deposit-returned`,
        );
      }
      return updated;
    });
    if (!result) {
      res.status(404).json({ error: "Lease not found" });
      return;
    }
    res.json(formatLease(result));
  } catch (error) {
    const message = (error as Error).message;
    if (message === "END_DATE_BEFORE_START" || message === "EXPIRED_ACTIVE_LEASE") {
      validationError(res, [{ path: ["endDate"], message: "endDate must not be before startDate or reactivate an expired lease" }]);
      return;
    }
    throw error;
  }
});

async function recordLeasePayment(req: Parameters<typeof requireAuth>[0], res: Parameters<typeof requireAuth>[1], kind: "on_time" | "late"): Promise<void> {
  const userId = getUserIdFromReq(req);
  const leaseId = parseLeaseId(req.params.id);
  if (leaseId === null) {
    res.status(400).json({ error: "Invalid lease id" });
    return;
  }
  const rawIdempotencyKey = req.headers["idempotency-key"];
  const idempotencyKey = typeof rawIdempotencyKey === "string" && rawIdempotencyKey.trim()
    ? `lease:${leaseId}:${kind}:${rawIdempotencyKey.trim()}`
    : null;

  const result = await db.transaction(async (tx) => {
    const [lease] = await tx
      .select()
      .from(leasesTable)
      .where(and(eq(leasesTable.id, leaseId), eq(leasesTable.userId, userId)))
      .for("update");
    if (!lease) return null;
    if (idempotencyKey) {
      const [existingEvent] = await tx
        .select({ scoreChange: scoreEventsTable.scoreChange })
        .from(scoreEventsTable)
        .where(and(
          eq(scoreEventsTable.userId, userId),
          eq(scoreEventsTable.idempotencyKey, idempotencyKey),
        ))
        .limit(1);
      if (existingEvent) {
        const [user] = await tx.select({ liveScore: usersTable.liveScore }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
        return {
          updated: lease,
          newScore: user?.liveScore ?? 500,
          scoreChange: existingEvent.scoreChange,
          streakBonus: kind === "on_time" && existingEvent.scoreChange > 15 ? existingEvent.scoreChange - 15 : 0,
          idempotent: true,
        };
      }
    }
    const nextCount = kind === "on_time" ? lease.onTimePayments + 1 : lease.latePayments + 1;
    const [updated] = await tx.update(leasesTable).set(
      kind === "on_time" ? { onTimePayments: nextCount } : { latePayments: nextCount },
    ).where(eq(leasesTable.id, leaseId)).returning();
    if (!updated) return null;

    const streakBonus = kind === "on_time" && nextCount % 6 === 0 ? 5 : 0;
    const scoreChange = kind === "on_time" ? 15 + streakBonus : -25;
    const newScore = await addScoreEventInTransaction(
      tx,
      userId,
      kind === "on_time" ? "payment_on_time" : "payment_late",
      scoreChange,
      kind === "on_time"
        ? (streakBonus > 0
          ? `Оплата вовремя #${nextCount} — серия платежей! (+${streakBonus} бонус)`
          : `Оплата вовремя #${nextCount} — ${lease.address}`)
        : `Просрочка платежа #${nextCount} — ${lease.address}`,
      leaseId,
      idempotencyKey ?? `lease:${leaseId}:${kind}:${nextCount}`,
    );
    return { updated, newScore, scoreChange, streakBonus, idempotent: false };
  });

  if (!result) {
    res.status(404).json({ error: "Lease not found" });
    return;
  }
  res.json({
    success: true,
    scoreChange: result.scoreChange,
    ...(kind === "on_time" ? { streakBonus: result.streakBonus, onTimePayments: result.updated.onTimePayments } : {}),
    ...(kind === "late" ? { latePayments: result.updated.latePayments } : {}),
    newScore: result.newScore,
    idempotent: result.idempotent,
  });
}

// POST /leases/:id/confirm-payment — on-time payment
router.post("/:id/confirm-payment", requireAuth, async (req, res) => {
  await recordLeasePayment(req, res, "on_time");
});

// POST /leases/:id/late-payment — late payment
router.post("/:id/late-payment", requireAuth, async (req, res) => {
  await recordLeasePayment(req, res, "late");
});

export default router;