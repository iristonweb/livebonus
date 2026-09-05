import { Router } from "express";
import { db, offersTable, partnersTable, userOfferActionsTable } from "@workspace/db";
import { eq, and, desc, gt } from "drizzle-orm";
import { CreateOfferBody, ListOffersQueryParams, UpdateOfferBody, UpdateOfferParams } from "@workspace/api-zod";
import { getAuthPayloadFromReq, getUserIdFromReq, requireAdmin, requireAuth } from "./auth.js";
import { auditChange, recordCatalogAudit } from "../lib/catalog-audit.js";

const router = Router();

function getOptionalUserId(req: { headers: Record<string, string | string[] | undefined> }): number | undefined {
  const payload = getAuthPayloadFromReq(req);
  if (payload && typeof payload.userId === "number") return payload.userId;
  return undefined;
}

function requireUser(req: { headers: Record<string, string | string[] | undefined> }, res: { status: (code: number) => { json: (body: unknown) => void } }): number | null {
  if (!getAuthPayloadFromReq(req)) {
    res.status(401).json({ error: "Authentication required" });
    return null;
  }
  return getUserIdFromReq(req);
}

async function formatOffer(offer: typeof offersTable.$inferSelect, userId?: number) {
  const partner = await db
    .select({
      name: partnersTable.name,
      logoUrl: partnersTable.logoUrl,
      logoObjectPath: partnersTable.logoObjectPath,
    })
    .from(partnersTable)
    .where(eq(partnersTable.id, offer.partnerId))
    .limit(1);

  let isSaved = false;
  let isActivated = false;
  if (userId !== undefined) {
    const [action] = await db
      .select({ savedAt: userOfferActionsTable.savedAt, activatedAt: userOfferActionsTable.activatedAt })
      .from(userOfferActionsTable)
      .where(and(eq(userOfferActionsTable.userId, userId), eq(userOfferActionsTable.offerId, offer.id)))
      .limit(1);
    isSaved = Boolean(action);
    isActivated = Boolean(action?.activatedAt);
  }

  return {
    id: offer.id,
    partnerId: offer.partnerId,
    partnerName: partner[0]?.name ?? "",
    partnerLogoUrl: partner[0]?.logoObjectPath
      ? `/api/storage${partner[0].logoObjectPath}`
      : partner[0]?.logoUrl ?? null,
    title: offer.title,
    description: offer.description ?? null,
    bonusMultiplier: parseFloat(offer.bonusMultiplier),
    category: offer.category,
    minAmountRub: offer.minAmountRub ? parseFloat(offer.minAmountRub) : null,
    isActive: offer.isActive,
    expiresAt: offer.expiresAt.toISOString(),
    isSaved,
    isActivated,
  };
}

router.get("/", async (req, res) => {
  const parsed = ListOffersQueryParams.safeParse(req.query);
  const { partnerId, category } = parsed.success ? parsed.data : {};
  const userId = getOptionalUserId(req);

  const now = new Date();
  let offers;
  if (partnerId && category) {
    offers = await db
      .select()
      .from(offersTable)
      .where(and(eq(offersTable.partnerId, partnerId), eq(offersTable.category, category), eq(offersTable.isActive, true), gt(offersTable.expiresAt, now)));
  } else if (partnerId) {
    offers = await db.select().from(offersTable).where(and(eq(offersTable.partnerId, partnerId), eq(offersTable.isActive, true), gt(offersTable.expiresAt, now)));
  } else if (category) {
    offers = await db.select().from(offersTable).where(and(eq(offersTable.category, category), eq(offersTable.isActive, true), gt(offersTable.expiresAt, now)));
  } else {
    offers = await db.select().from(offersTable).where(and(eq(offersTable.isActive, true), gt(offersTable.expiresAt, now)));
  }

  const formatted = await Promise.all(offers.map((offer) => formatOffer(offer, userId)));
  res.json(formatted);
});

router.get("/saved", requireAuth, async (req, res) => {
  const userId = requireUser(req, res);
  if (userId === null) return;

  const savedOffers = await db
    .select({ offer: offersTable })
    .from(userOfferActionsTable)
    .innerJoin(offersTable, eq(userOfferActionsTable.offerId, offersTable.id))
    .where(and(
      eq(userOfferActionsTable.userId, userId),
      eq(offersTable.isActive, true),
      gt(offersTable.expiresAt, new Date()),
    ))
    .orderBy(desc(userOfferActionsTable.updatedAt));

  res.json(await Promise.all(savedOffers.map(({ offer }) => formatOffer(offer, userId))));
});

router.post("/", requireAdmin, async (req, res) => {
  const parsed = CreateOfferBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { bonusMultiplier, minAmountRub, expiresAt, ...rest } = parsed.data;
  const expiration = new Date(expiresAt);
  if (!Number.isFinite(bonusMultiplier) || bonusMultiplier < 0 || (minAmountRub !== undefined && minAmountRub < 0)
    || Number.isNaN(expiration.getTime()) || expiration <= new Date()) {
    res.status(422).json({ error: "Invalid offer values", code: "OFFER_VALIDATION_FAILED" });
    return;
  }
  const created = await db
    .insert(offersTable)
    .values({
      ...rest,
      bonusMultiplier: String(bonusMultiplier),
      minAmountRub: minAmountRub === undefined ? null : String(minAmountRub),
      expiresAt: expiration,
    })
    .returning();
  await recordCatalogAudit(req, {
    entityType: "offer",
    entityId: created[0].id,
    entityName: created[0].title,
    action: "create",
    changes: {
      partnerId: auditChange(null, created[0].partnerId),
      title: auditChange(null, created[0].title),
      category: auditChange(null, created[0].category),
      bonusMultiplier: auditChange(null, Number(created[0].bonusMultiplier)),
      expiresAt: auditChange(null, created[0].expiresAt.toISOString()),
    },
  });
  res.status(201).json(await formatOffer(created[0]));
});

async function updateOfferAction(
  req: { params: { id?: string | string[] }; headers: Record<string, string | string[] | undefined> },
  res: { status: (code: number) => { json: (body: unknown) => void }; json: (body: unknown) => void },
  action: "save" | "activate",
) {
  const userId = requireUser(req, res);
  if (userId === null) return;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!rawId) {
    res.status(400).json({ error: "Invalid offer id" });
    return;
  }
  const id = Number(rawId);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid offer id" });
    return;
  }

  const [offer] = await db
    .select()
    .from(offersTable)
    .where(eq(offersTable.id, id))
    .limit(1);
  if (!offer) {
    res.status(404).json({ error: "Offer not found" });
    return;
  }
  if (!offer.isActive || offer.expiresAt <= new Date()) {
    res.status(409).json({ error: "Offer is no longer available" });
    return;
  }

  const now = new Date();
  const values = action === "activate"
    ? { savedAt: now, activatedAt: now, updatedAt: now }
    : { savedAt: now, updatedAt: now };
  await db
    .insert(userOfferActionsTable)
    .values({ userId, offerId: id, ...values })
    .onConflictDoUpdate({
      target: [userOfferActionsTable.userId, userOfferActionsTable.offerId],
      set: values,
    });

  const [updatedAction] = await db
    .select({ savedAt: userOfferActionsTable.savedAt, activatedAt: userOfferActionsTable.activatedAt })
    .from(userOfferActionsTable)
    .where(and(eq(userOfferActionsTable.userId, userId), eq(userOfferActionsTable.offerId, id)))
    .limit(1);
  res.json({
    offer: await formatOffer(offer, userId),
    saved: Boolean(updatedAction),
    activated: Boolean(updatedAction?.activatedAt),
  });
}

router.post("/:id/save", requireAuth, async (req, res) => {
  await updateOfferAction(req, res, "save");
});

router.delete("/:id/save", requireAuth, async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (userId === null) return;
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = Number(rawId);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid offer id" });
    return;
  }

  let deleted: Array<{ id: number }>;
  try {
    deleted = await db
      .delete(userOfferActionsTable)
      .where(and(eq(userOfferActionsTable.userId, userId), eq(userOfferActionsTable.offerId, id)))
      .returning({ id: userOfferActionsTable.id });
  } catch {
    res.status(500).json({ error: "Unable to remove saved offer" });
    return;
  }
  if (!deleted.length) {
    res.status(404).json({ error: "Saved offer not found" });
    return;
  }

  res.status(204).end();
});

router.post("/:id/activate", requireAuth, async (req, res) => {
  await updateOfferAction(req, res, "activate");
});

router.patch("/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdateOfferParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const parsed = UpdateOfferBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const [existing] = await db.select().from(offersTable).where(eq(offersTable.id, params.data.id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Offer not found" });
    return;
  }
  const { bonusMultiplier, minAmountRub, expiresAt, ...rest } = parsed.data;
  const expiration = expiresAt === undefined ? undefined : new Date(expiresAt);
  if ((bonusMultiplier !== undefined && (!Number.isFinite(bonusMultiplier) || bonusMultiplier < 0))
    || (minAmountRub !== undefined && minAmountRub !== null && minAmountRub < 0)
    || (expiration !== undefined && Number.isNaN(expiration.getTime()))) {
    res.status(422).json({ error: "Invalid offer values", code: "OFFER_VALIDATION_FAILED" });
    return;
  }
  const updatedRows = await db.update(offersTable).set({
    ...rest,
    ...(bonusMultiplier === undefined ? {} : { bonusMultiplier: String(bonusMultiplier) }),
    ...(minAmountRub === undefined ? {} : { minAmountRub: minAmountRub === null ? null : String(minAmountRub) }),
    ...(expiration === undefined ? {} : { expiresAt: expiration }),
  }).where(eq(offersTable.id, params.data.id)).returning();
  const updated = updatedRows[0];
  if (!updated) {
    res.status(404).json({ error: "Offer not found" });
    return;
  }

  const changes = {
    partnerId: auditChange(existing.partnerId, updated.partnerId),
    title: auditChange(existing.title, updated.title),
    description: auditChange(existing.description, updated.description),
    bonusMultiplier: auditChange(Number(existing.bonusMultiplier), Number(updated.bonusMultiplier)),
    category: auditChange(existing.category, updated.category),
    minAmountRub: auditChange(existing.minAmountRub === null ? null : Number(existing.minAmountRub), updated.minAmountRub === null ? null : Number(updated.minAmountRub)),
    expiresAt: auditChange(existing.expiresAt.toISOString(), updated.expiresAt.toISOString()),
  };
  await recordCatalogAudit(req, {
    entityType: "offer",
    entityId: updated.id,
    entityName: updated.title,
    action: "update",
    changes: Object.fromEntries(Object.entries(changes).filter(([, change]) => change.from !== change.to)),
  });
  res.json(await formatOffer(updated));
});

router.delete("/:id", requireAdmin, async (req, res): Promise<void> => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  let deleted: Array<typeof offersTable.$inferSelect>;
  try {
    deleted = await db.delete(offersTable).where(eq(offersTable.id, id)).returning();
  } catch (error) {
    if ((error as { code?: string }).code === "23503") {
      res.status(409).json({
        error: "Offer has dependent user actions",
        code: "OFFER_HAS_DEPENDENCIES",
      });
      return;
    }
    throw error;
  }
  if (!deleted.length) {
    res.status(404).json({ error: "Offer not found" });
    return;
  }
  await recordCatalogAudit(req, {
    entityType: "offer",
    entityId: deleted[0].id,
    entityName: deleted[0].title,
    action: "delete",
    changes: {
      title: auditChange(deleted[0].title, null),
      partnerId: auditChange(deleted[0].partnerId, null),
    },
  });
  res.status(204).end();
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const offer = await db.select().from(offersTable).where(eq(offersTable.id, id)).limit(1);
  if (!offer.length) {
    res.status(404).json({ error: "Offer not found" });
    return;
  }
  if (!offer[0].isActive || offer[0].expiresAt <= new Date()) {
    res.status(404).json({ error: "Offer is no longer available", code: "OFFER_UNAVAILABLE" });
    return;
  }
  res.json(await formatOffer(offer[0], getOptionalUserId(req)));
});

export default router;
