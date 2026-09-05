import { Router } from "express";
import {
  db,
  financialDealsTable,
  financialLedgerEntriesTable,
  financialPoliciesTable,
  partnersTable,
  usersTable,
  catalogAuditLogTable,
  webhookSecurityEventsTable,
  scoreDisputesTable,
  scoreDisputeAuditTable,
  leasesTable,
} from "@workspace/db";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  ExportCatalogAuditLogQueryParams,
  GetEconomicsQueryParams,
  GetEconomicsAuditQueryParams,
  ListCatalogAuditLogQueryParams,
  ListCatalogAuditLogResponse,
} from "@workspace/api-zod";
import { getAuthPayloadFromReq, requireAdmin } from "./auth.js";
import { FINANCE_POLICY } from "../lib/finance.js";
import {
  auditEconomicsDeals,
  calculateEconomicsReport,
  type EconomicsPeriod,
} from "../lib/economics.js";
import {
  MAX_WEBHOOK_SECURITY_HISTORY_ROWS,
  YOOKASSA_WEBHOOK_REJECTION_EVENT,
} from "../lib/logger.js";
import { addScoreEventInTransaction } from "../lib/score.js";

const router = Router();

function formatAdminDispute(
  dispute: typeof scoreDisputesTable.$inferSelect,
  lease?: typeof leasesTable.$inferSelect,
  user?: typeof usersTable.$inferSelect,
) {
  return {
    id: dispute.id,
    userId: dispute.userId,
    userName: user?.name ?? null,
    leaseId: dispute.leaseId,
    leaseAddress: lease?.address ?? null,
    scoreEventId: dispute.scoreEventId,
    reason: dispute.reason,
    status: dispute.status,
    resolutionReason: dispute.resolutionReason,
    version: dispute.version,
    createdAt: dispute.createdAt.toISOString(),
    updatedAt: dispute.updatedAt.toISOString(),
    resolvedAt: dispute.resolvedAt?.toISOString() ?? null,
  };
}

router.get("/score/disputes", requireAdmin, async (req, res) => {
  const rawStatus = typeof req.query.status === "string" ? req.query.status : "open";
  const whereStatus = rawStatus === "all"
    ? undefined
    : rawStatus === "created" || rawStatus === "under_review" || rawStatus === "resolved" || rawStatus === "rejected"
      ? eq(scoreDisputesTable.status, rawStatus)
      : sql`${scoreDisputesTable.status} IN ('created', 'under_review')`;
  const disputes = await db.select().from(scoreDisputesTable)
    .where(whereStatus)
    .orderBy(desc(scoreDisputesTable.createdAt))
    .limit(100);
  const response = await Promise.all(disputes.map(async (dispute) => {
    const [[lease], [user]] = await Promise.all([
      db.select().from(leasesTable).where(eq(leasesTable.id, dispute.leaseId)).limit(1),
      db.select().from(usersTable).where(eq(usersTable.id, dispute.userId)).limit(1),
    ]);
    return formatAdminDispute(dispute, lease, user);
  }));
  res.json(response);
});

router.post("/score/disputes/:id/decision", requireAdmin, async (req, res) => {
  const disputeId = Number(req.params.id);
  const body = req.body as { status?: unknown; reason?: unknown; expectedVersion?: unknown };
  const status = body.status;
  const resolutionReason = typeof body.reason === "string" ? body.reason.trim() : "";
  const expectedVersion = body.expectedVersion === undefined ? null : Number(body.expectedVersion);
  const idempotencyKey = typeof req.headers["idempotency-key"] === "string"
    ? req.headers["idempotency-key"].trim().slice(0, 200)
    : null;
  if (!Number.isSafeInteger(disputeId) || disputeId <= 0
    || (status !== "under_review" && status !== "resolved" && status !== "rejected")
    || resolutionReason.length < 5 || resolutionReason.length > 1000
    || (expectedVersion !== null && (!Number.isSafeInteger(expectedVersion) || expectedVersion < 1))) {
    res.status(400).json({ error: "Invalid dispute decision", code: "INVALID_DISPUTE_DECISION" });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [dispute] = await tx.select().from(scoreDisputesTable)
      .where(eq(scoreDisputesTable.id, disputeId)).for("update");
    if (!dispute) return { error: "DISPUTE_NOT_FOUND" as const };
    if (idempotencyKey && dispute.decisionIdempotencyKey === idempotencyKey) {
      return { dispute, idempotent: true, newScore: undefined };
    }
    if (dispute.status === "resolved" || dispute.status === "rejected") {
      return { error: "DISPUTE_ALREADY_DECIDED" as const };
    }
    if (expectedVersion !== null && dispute.version !== expectedVersion) {
      return { error: "DISPUTE_VERSION_CONFLICT" as const, currentVersion: dispute.version };
    }
    const now = new Date();
    const [updated] = await tx.update(scoreDisputesTable).set({
      status,
      resolutionReason,
      resolvedByUserId: status === "under_review" ? null : getAuthPayloadFromReq(req)?.userId as number,
      resolvedAt: status === "under_review" ? null : now,
      version: dispute.version + 1,
      ...(idempotencyKey ? { decisionIdempotencyKey: idempotencyKey } : {}),
    }).where(eq(scoreDisputesTable.id, dispute.id)).returning();
    if (!updated) return { error: "DISPUTE_NOT_UPDATED" as const };
    let newScore: number | undefined;
    if (status === "resolved") {
      newScore = await addScoreEventInTransaction(
        tx,
        dispute.userId,
        "dispute_resolved",
        5,
        "Спор одобрен модератором: штраф компенсирован",
        dispute.leaseId,
        `dispute:${dispute.id}:resolved`,
      );
    }
    await tx.insert(scoreDisputeAuditTable).values({
      disputeId: dispute.id,
      actorUserId: getAuthPayloadFromReq(req)?.userId as number,
      action: "decision",
      fromStatus: dispute.status,
      toStatus: status,
      reason: resolutionReason,
    });
    return { dispute: updated, idempotent: false, newScore };
  });

  if ("error" in result) {
    const statusCode = result.error === "DISPUTE_NOT_FOUND" ? 404 : result.error === "DISPUTE_VERSION_CONFLICT" || result.error === "DISPUTE_ALREADY_DECIDED" ? 409 : 503;
    res.status(statusCode).json({
      error: result.error === "DISPUTE_VERSION_CONFLICT" ? "Dispute changed by another moderator" : result.error === "DISPUTE_ALREADY_DECIDED" ? "Dispute already has a final decision" : "Dispute not found",
      code: result.error,
      ...("currentVersion" in result ? { currentVersion: result.currentVersion } : {}),
    });
    return;
  }
  res.json({
    success: true,
    idempotent: result.idempotent,
    dispute: formatAdminDispute(result.dispute),
    ...(result.newScore === undefined ? {} : { newScore: result.newScore }),
  });
});

const catalogAuditExportHeaders = [
  "administrator",
  "timestamp",
  "entityType",
  "entityId",
  "entityName",
  "action",
  "beforeValues",
  "afterValues",
] as const;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function catalogAuditExportRow(
  values: Partial<Record<(typeof catalogAuditExportHeaders)[number], unknown>>,
): string {
  return catalogAuditExportHeaders.map((header) => csvCell(values[header])).join(",");
}

function auditChangeValues(
  changes: Record<string, { from: unknown; to: unknown }>,
  key: "from" | "to",
): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(changes).map(([field, change]) => [field, change[key]])),
  );
}

router.get("/catalog-audit-log/export", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ExportCatalogAuditLogQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid audit log export query", details: parsed.error.issues });
    return;
  }

  const { entityType, action } = parsed.data;
  const filters = [
    entityType ? eq(catalogAuditLogTable.entityType, entityType) : undefined,
    action ? eq(catalogAuditLogTable.action, action) : undefined,
  ].filter((filter): filter is NonNullable<typeof filter> => Boolean(filter));
  const rows = await db
    .select()
    .from(catalogAuditLogTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(catalogAuditLogTable.createdAt));
  const csvRows = rows.map((row) => catalogAuditExportRow({
    administrator: row.adminName,
    timestamp: row.createdAt.toISOString(),
    entityType: row.entityType,
    entityId: row.entityId,
    entityName: row.entityName,
    action: row.action,
    beforeValues: auditChangeValues(row.changes, "from"),
    afterValues: auditChangeValues(row.changes, "to"),
  }));
  const csv = [catalogAuditExportHeaders.join(","), ...csvRows].join("\r\n") + "\r\n";

  res
    .type("text/csv")
    .set("Content-Disposition", 'attachment; filename="catalog-audit-log.csv"')
    .send(csv);
});

router.get("/catalog-audit-log", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ListCatalogAuditLogQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid audit log query", details: parsed.error.issues });
    return;
  }
  const { limit = 100, entityType, action } = parsed.data;
  const filters = [
    entityType ? eq(catalogAuditLogTable.entityType, entityType) : undefined,
    action ? eq(catalogAuditLogTable.action, action) : undefined,
  ].filter((filter): filter is NonNullable<typeof filter> => Boolean(filter));
  const rows = await db
    .select()
    .from(catalogAuditLogTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(catalogAuditLogTable.createdAt))
    .limit(limit);
  res.json(ListCatalogAuditLogResponse.parse(rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }))));
});

router.get("/security/webhook-rejections", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      sourceIp: webhookSecurityEventsTable.sourceIp,
      createdAt: webhookSecurityEventsTable.createdAt,
    })
    .from(webhookSecurityEventsTable)
    .where(eq(webhookSecurityEventsTable.event, YOOKASSA_WEBHOOK_REJECTION_EVENT))
    .orderBy(desc(webhookSecurityEventsTable.createdAt), desc(webhookSecurityEventsTable.id))
    .limit(MAX_WEBHOOK_SECURITY_HISTORY_ROWS);

  const sources = new Map<string | null, {
    sourceIp: string | null;
    occurrenceCount: number;
    firstSeenAt: Date | string;
    lastSeenAt: Date | string;
  }>();
  const recentSourceAddresses: (string | null)[] = [];
  const seenRecentSources = new Set<string | null>();

  for (const row of rows) {
    const existing = sources.get(row.sourceIp);
    if (existing) {
      existing.occurrenceCount += 1;
      existing.firstSeenAt = row.createdAt;
    } else {
      sources.set(row.sourceIp, {
        sourceIp: row.sourceIp,
        occurrenceCount: 1,
        firstSeenAt: row.createdAt,
        lastSeenAt: row.createdAt,
      });
    }
    if (!seenRecentSources.has(row.sourceIp) && recentSourceAddresses.length < 20) {
      seenRecentSources.add(row.sourceIp);
      recentSourceAddresses.push(row.sourceIp);
    }
  }

  res.json({
    totalRejected: rows.length,
    uniqueSources: sources.size,
    sources: [...sources.values()]
      .sort((left, right) => right.occurrenceCount - left.occurrenceCount)
      .map((source) => ({
        sourceIp: source.sourceIp,
        occurrenceCount: source.occurrenceCount,
        firstSeenAt: new Date(source.firstSeenAt).toISOString(),
        lastSeenAt: new Date(source.lastSeenAt).toISOString(),
      })),
    recentSourceAddresses,
  });
});

router.get("/economics/audit", requireAdmin, async (req, res): Promise<void> => {
  const rawQuery = req.query as Record<string, unknown>;
  const parsed = GetEconomicsAuditQueryParams.safeParse({
    ...rawQuery,
    ...(typeof rawQuery.snapshotAt === "string"
      ? { snapshotAt: new Date(rawQuery.snapshotAt) }
      : {}),
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid economics audit query", details: parsed.error.issues });
    return;
  }
  const { limit = 25, offset = 0, snapshotAt: requestedSnapshotAt } = parsed.data;
  const snapshotAt = requestedSnapshotAt ? new Date(requestedSnapshotAt) : new Date();
  if (Number.isNaN(snapshotAt.getTime())) {
    res.status(400).json({ error: "snapshotAt must be a valid ISO date-time" });
    return;
  }
  const [deals, ledgerEntries] = await Promise.all([
    db.select().from(financialDealsTable).orderBy(desc(financialDealsTable.settledAt), desc(financialDealsTable.id)),
    db.select().from(financialLedgerEntriesTable),
  ]);
  res.json(auditEconomicsDeals({ deals, ledgerEntries, limit, offset, snapshotAt }));
});

function parsePeriod(query: { from?: Date | string; to?: Date | string; period?: "day" | "week" | "month" | "custom" }): EconomicsPeriod {
  const now = new Date();
  const type = query.period ?? "month";
  const from = query.from
    ? query.from instanceof Date ? new Date(query.from) : new Date(`${query.from}T00:00:00.000Z`)
    : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  let to: Date;
  if (query.to) {
    to = query.to instanceof Date ? new Date(query.to) : new Date(`${query.to}T23:59:59.999Z`);
  } else if (type === "day") {
    to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), 23, 59, 59, 999));
  } else if (type === "week") {
    to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 6);
    to.setUTCHours(23, 59, 59, 999);
  } else if (type === "month") {
    to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  } else {
    to = new Date(from);
  }
  if (type === "week" && !query.from) {
    const mondayOffset = (now.getUTCDay() + 6) % 7;
    from.setUTCDate(now.getUTCDate() - mondayOffset);
    from.setUTCHours(0, 0, 0, 0);
    to = new Date(from);
    to.setUTCDate(to.getUTCDate() + 6);
    to.setUTCHours(23, 59, 59, 999);
  }
  return { from, to, type };
}

router.get("/economics", requireAdmin, async (req, res): Promise<void> => {
  const rawQuery = req.query as Record<string, unknown>;
  const parsed = GetEconomicsQueryParams.safeParse({
    ...rawQuery,
    ...(typeof rawQuery.from === "string" ? { from: new Date(`${rawQuery.from}T00:00:00.000Z`) } : {}),
    ...(typeof rawQuery.to === "string" ? { to: new Date(`${rawQuery.to}T23:59:59.999Z`) } : {}),
  });
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid economics query", details: parsed.error.issues });
    return;
  }
  const query = parsed.data;
  if (query.period === "custom" && (!query.from || !query.to)) {
    res.status(400).json({ error: "Custom period requires both from and to dates" });
    return;
  }
  const period = parsePeriod(query);
  if (period.from.toString() === "Invalid Date" || period.to.toString() === "Invalid Date" || period.from > period.to) {
    res.status(400).json({ error: "Period must contain valid dates with from before to" });
    return;
  }

  const [deals, ledgerEntries, partners, users, policy] = await Promise.all([
    db.select().from(financialDealsTable),
    db.select().from(financialLedgerEntriesTable),
    db.select({ id: partnersTable.id, name: partnersTable.name, category: partnersTable.category }).from(partnersTable),
    db.select({ pointsBalance: usersTable.pointsBalance, bonusBalanceRub: usersTable.bonusBalanceRub }).from(usersTable),
    db.select().from(financialPoliciesTable).orderBy(desc(financialPoliciesTable.effectiveFrom), desc(financialPoliciesTable.version)).limit(1),
  ]);
  const activePolicy = policy[0];
  const report = calculateEconomicsReport({
    deals,
    ledgerEntries,
    partners,
    users,
    period,
    status: query.status ?? "all",
    policy: activePolicy
      ? {
          currency: "RUB",
          purchaseMaxRedemptionRate: Number(activePolicy.purchaseRedemptionRate),
          partnerFeeRate: Number(activePolicy.partnerFeeRate),
          landlordFeeRate: Number(activePolicy.partnerFeeRate),
          rentalTenantBonusRate: Number(activePolicy.rentalBonusRate),
          rentalLandlordBonusRate: Number(activePolicy.rentalBonusRate),
        }
      : {
          currency: "RUB",
          purchaseMaxRedemptionRate: FINANCE_POLICY.purchaseRedemptionBps / 10000,
          partnerFeeRate: FINANCE_POLICY.partnerFeeBps / 10000,
          landlordFeeRate: FINANCE_POLICY.partnerFeeBps / 10000,
          rentalTenantBonusRate: FINANCE_POLICY.rentalBonusBps / 10000,
          rentalLandlordBonusRate: FINANCE_POLICY.rentalBonusBps / 10000,
        },
  });
  const usersByStatus = users.reduce<Record<string, number>>((counts, user) => {
    const status = user.pointsBalance >= 300000 ? "platinum" : user.pointsBalance >= 150000 ? "gold" : user.pointsBalance >= 50000 ? "silver" : "novice";
    counts[status] = (counts[status] ?? 0) + 1;
    return counts;
  }, {});
  res.json({
    ...report,
    activeUsers: users.length,
    usersByStatus,
  });
});

export default router;
