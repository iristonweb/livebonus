import { Router } from "express";
import { db, usersTable, transactionsTable, partnersTable, offersTable, financialDealsTable, financialLedgerEntriesTable } from "@workspace/db";
import { eq, sql, desc } from "drizzle-orm";
import { calculateBonus, getStatusForPoints, getNextStatus, getPointsToNextStatus, STATUS_MULTIPLIERS } from "../lib/bonus";
import { centsToRub, legacyCentsForPoints } from "../lib/finance.js";
import { CalculateBonusBody, GetDashboardActivityQueryParams } from "@workspace/api-zod";
import { getUserIdFromReq, requireAuth } from "./auth.js";

const router = Router();
router.get("/summary", requireAuth, async (req, res) => {
  const userId = getUserIdFromReq(req);
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user.length) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const u = user[0];
  const status = getStatusForPoints(u.pointsBalance);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [earnedThisMonth] = await db
    .select({ total: sql<number>`coalesce(sum(${transactionsTable.pointsEarned}), 0)::int` })
    .from(transactionsTable)
    .where(
      sql`${transactionsTable.userId} = ${userId} AND ${transactionsTable.type} IN ('earn', 'bonus') AND ${transactionsTable.createdAt} >= ${startOfMonth}`
    );

  const [spentThisMonth] = await db
    .select({ total: sql<number>`coalesce(sum(${transactionsTable.pointsEarned}), 0)::int` })
    .from(transactionsTable)
    .where(
      sql`${transactionsTable.userId} = ${userId} AND ${transactionsTable.type} = 'redeem' AND ${transactionsTable.createdAt} >= ${startOfMonth}`
    );

  const [bonusEarnedThisMonth] = await db
    .select({ total: sql<string>`coalesce(sum(${financialLedgerEntriesTable.amountRub}::numeric), 0)` })
    .from(financialLedgerEntriesTable)
    .where(
      sql`${financialLedgerEntriesTable.userId} = ${userId} AND ${financialLedgerEntriesTable.entryType} = 'credit' AND ${financialLedgerEntriesTable.source} <> 'refund' AND ${financialLedgerEntriesTable.createdAt} >= ${startOfMonth}`
    );

  const [bonusRedeemedThisMonth] = await db
    .select({ total: sql<string>`coalesce(sum(${financialLedgerEntriesTable.amountRub}::numeric), 0)` })
    .from(financialLedgerEntriesTable)
    .where(
      sql`${financialLedgerEntriesTable.userId} = ${userId} AND ${financialLedgerEntriesTable.entryType} = 'debit' AND ${financialLedgerEntriesTable.source} <> 'refund' AND ${financialLedgerEntriesTable.createdAt} >= ${startOfMonth}`
    );

  const [partnerCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(partnersTable)
    .where(eq(partnersTable.isActive, true));

  const [offerCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(offersTable)
    .where(eq(offersTable.isActive, true));

  res.json({
    pointsBalance: u.pointsBalance,
    bonusBalanceRub: u.bonusBalanceRub === null
      ? centsToRub(legacyCentsForPoints(u.pointsBalance))
      : Number(u.bonusBalanceRub),
    status,
    statusMultiplier: STATUS_MULTIPLIERS[status] ?? 1.0,
    pointsEarnedThisMonth: earnedThisMonth.total ?? 0,
    pointsSpentThisMonth: spentThisMonth.total ?? 0,
    totalPartnersAvailable: partnerCount.count ?? 0,
    activeOffersCount: offerCount.count ?? 0,
    pointsToNextStatus: getPointsToNextStatus(u.pointsBalance, status),
    nextStatus: getNextStatus(status),
    rubEquivalent: u.bonusBalanceRub === null
      ? centsToRub(legacyCentsForPoints(u.pointsBalance))
      : Number(u.bonusBalanceRub),
    bonusEarnedThisMonthRub: Number(bonusEarnedThisMonth?.total ?? 0),
    bonusRedeemedThisMonthRub: Number(bonusRedeemedThisMonth?.total ?? 0),
  });
});

router.get("/activity", requireAuth, async (req, res) => {
  const parsed = GetDashboardActivityQueryParams.safeParse(req.query);
  const limit = parsed.success ? (parsed.data.limit ?? 10) : 10;

  const userId = getUserIdFromReq(req);
  const txs = await db
    .select({
      id: transactionsTable.id,
      type: transactionsTable.type,
      category: transactionsTable.category,
      description: transactionsTable.description,
      pointsEarned: transactionsTable.pointsEarned,
      amountRub: transactionsTable.amountRub,
      partnerId: transactionsTable.partnerId,
      createdAt: transactionsTable.createdAt,
    })
    .from(transactionsTable)
    .where(eq(transactionsTable.userId, userId))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(limit);

  const results = await Promise.all(
    txs.map(async (t) => {
      let partnerName: string | null = null;
      let partnerLogoUrl: string | null = null;
      if (t.partnerId) {
        const p = await db
          .select({ name: partnersTable.name, logoUrl: partnersTable.logoUrl })
          .from(partnersTable)
          .where(eq(partnersTable.id, t.partnerId))
          .limit(1);
        if (p.length) {
          partnerName = p[0].name;
          partnerLogoUrl = p[0].logoUrl ?? null;
        }
      }
      const [ledgerEntry] = await db
        .select({
          entryType: financialLedgerEntriesTable.entryType,
          amountRub: financialLedgerEntriesTable.amountRub,
          source: financialLedgerEntriesTable.source,
          reversalOfId: financialLedgerEntriesTable.reversalOfId,
          dealType: financialDealsTable.kind,
          settlementStatus: financialDealsTable.status,
        })
        .from(financialLedgerEntriesTable)
        .leftJoin(financialDealsTable, eq(financialDealsTable.id, financialLedgerEntriesTable.dealId))
        .where(eq(financialLedgerEntriesTable.transactionId, t.id))
        .limit(1);
      const isDebit = ledgerEntry?.entryType === "debit";
      const amountRub = ledgerEntry ? parseFloat(ledgerEntry.amountRub) : parseFloat(t.amountRub);
      const amountRubSigned = ledgerEntry
        ? (isDebit ? -amountRub : amountRub)
        : (t.type === "redeem" || t.type === "expire" ? -amountRub : amountRub);
      const delta = ledgerEntry
        ? (isDebit ? -t.pointsEarned : t.pointsEarned)
        : (t.type === "redeem" || t.type === "expire" ? -t.pointsEarned : t.pointsEarned);
      return {
        id: t.id,
        type: t.type,
        category: t.category,
        description: t.description,
        pointsDelta: delta,
        amountRub,
        amountRubSigned,
        bonusValueRub: amountRubSigned,
        direction: ledgerEntry ? (isDebit ? "debit" : "credit") : (t.type === "redeem" || t.type === "expire" ? "debit" : "credit"),
        dealType: ledgerEntry?.dealType ?? null,
        settlementStatus: ledgerEntry?.settlementStatus ?? null,
        operationSource: ledgerEntry?.source ?? null,
        isReversal: Boolean(ledgerEntry?.reversalOfId),
        partnerName,
        partnerLogoUrl,
        createdAt: t.createdAt.toISOString(),
      };
    })
  );

  res.json(results);
});

router.get("/stats", requireAuth, async (_req, res) => {
  const userId = getUserIdFromReq(_req);
  const stats = await db
    .select({
      category: transactionsTable.category,
      pointsEarned: sql<number>`sum(${transactionsTable.pointsEarned})::int`,
      transactionCount: sql<number>`count(*)::int`,
      totalAmountRub: sql<number>`coalesce(sum(${transactionsTable.amountRub}::numeric), 0)`,
    })
    .from(transactionsTable)
    .where(
      sql`${transactionsTable.userId} = ${userId} AND ${transactionsTable.type} IN ('earn', 'bonus')`
    )
    .groupBy(transactionsTable.category);

  res.json(
    stats.map((s) => ({
      category: s.category,
      pointsEarned: s.pointsEarned ?? 0,
      transactionCount: s.transactionCount ?? 0,
      totalAmountRub: parseFloat(String(s.totalAmountRub ?? 0)),
    }))
  );
});

export default router;
