import { Router } from "express";
import { db, transactionsTable, partnersTable, usersTable, financialLedgerEntriesTable, financialDealsTable } from "@workspace/db";
import { eq, desc, and, sql } from "drizzle-orm";
import { CreateTransactionBody, ListTransactionsQueryParams } from "@workspace/api-zod";
import { getStatusForPoints } from "../lib/bonus";
import { centsToRub, legacyCentsForPoints, parseRub } from "../lib/finance.js";
import { getAuthPayloadFromReq, getUserIdFromReq, requireAdmin, requireAuth } from "./auth.js";

const router = Router();

const DEFAULT_USER_ID = 1;

async function formatTransaction(t: typeof transactionsTable.$inferSelect) {
  let partnerName: string | null = null;
  let partnerLogoUrl: string | null = null;

  if (t.partnerId) {
    const partner = await db
      .select({ name: partnersTable.name, logoUrl: partnersTable.logoUrl })
      .from(partnersTable)
      .where(eq(partnersTable.id, t.partnerId))
      .limit(1);
    if (partner.length) {
      partnerName = partner[0].name;
      partnerLogoUrl = partner[0].logoUrl ?? null;
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
  const pointsEarned = ledgerEntry
    ? (isDebit ? -t.pointsEarned : t.pointsEarned)
    : (t.type === "redeem" || t.type === "expire" ? -t.pointsEarned : t.pointsEarned);

  return {
    id: t.id,
    userId: t.userId,
    type: t.type,
    category: t.category,
    amountRub,
    amountRubSigned,
    bonusValueRub: amountRubSigned,
    pointsEarned,
    direction: ledgerEntry ? (isDebit ? "debit" : "credit") : (t.type === "redeem" || t.type === "expire" ? "debit" : "credit"),
    dealType: ledgerEntry?.dealType ?? null,
    settlementStatus: ledgerEntry?.settlementStatus ?? null,
    operationSource: ledgerEntry?.source ?? null,
    isReversal: Boolean(ledgerEntry?.reversalOfId),
    multiplier: parseFloat(t.multiplier),
    description: t.description,
    partnerName,
    partnerLogoUrl,
    createdAt: t.createdAt.toISOString(),
  };
}

router.get("/", requireAuth, async (req, res) => {
  const parsed = ListTransactionsQueryParams.safeParse(req.query);
  const { category, limit, offset } = parsed.success ? parsed.data : { category: undefined, limit: 50, offset: 0 };

  let query = db
    .select()
    .from(transactionsTable)
    .where(eq(transactionsTable.userId, getUserIdFromReq(req as any)))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(limit ?? 50)
    .offset(offset ?? 0);

  if (category) {
    query = db
      .select()
      .from(transactionsTable)
      .where(and(eq(transactionsTable.userId, getUserIdFromReq(req as any)), eq(transactionsTable.category, category)))
      .orderBy(desc(transactionsTable.createdAt))
      .limit(limit ?? 50)
      .offset(offset ?? 0);
  }

  const txs = await query;
  const formatted = await Promise.all(txs.map(formatTransaction));
  res.json(formatted);
});

router.post("/", requireAdmin, async (req, res) => {
  const parsed = CreateTransactionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const { amountRub, multiplier, ...rest } = parsed.data;
  const userId = parsed.data.userId ?? DEFAULT_USER_ID;

  try {
    const created = await db.transaction(async (tx) => {
      // Serialize every legacy write with financial settlement and
      // reconciliation corrections. Reading the user without this lock would
      // allow concurrent requests to calculate from the same old balance.
      const [user] = await tx
        .select()
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .for("update");
      if (!user) {
        const error = new Error("USER_NOT_FOUND");
        (error as Error & { status?: number }).status = 404;
        throw error;
      }

      const requestedDelta = parsed.data.type === "earn" || parsed.data.type === "bonus"
        ? parsed.data.pointsEarned
        : -parsed.data.pointsEarned;
      const newBalance = Math.max(0, user.pointsBalance + requestedDelta);
      const appliedDelta = newBalance - user.pointsBalance;

      // amountRub on a legacy transaction is the purchase amount, not the
      // monetary value of the award. Keep the authoritative monetary snapshot
      // aligned with the point representation instead of adding the purchase
      // amount to it. Unmigrated users start from the legacy equivalent.
      let currentBonusBalanceCents: bigint;
      if (user.bonusBalanceRub === null) {
        currentBonusBalanceCents = legacyCentsForPoints(user.pointsBalance);
      } else {
        const parsedBalance = parseRub(user.bonusBalanceRub);
        if (!parsedBalance.ok) {
          const error = new Error("INVALID_MONETARY_BALANCE");
          (error as Error & { status?: number }).status = 409;
          throw error;
        }
        currentBonusBalanceCents = parsedBalance.cents;
      }
      const nextBonusBalanceCents = currentBonusBalanceCents
        + (legacyCentsForPoints(newBalance) - legacyCentsForPoints(user.pointsBalance));
      if (nextBonusBalanceCents < 0n) {
        const error = new Error("INSUFFICIENT_BALANCE");
        (error as Error & { status?: number }).status = 409;
        throw error;
      }

      const [createdTransaction] = await tx
        .insert(transactionsTable)
        .values({
          ...rest,
          userId,
          amountRub: String(amountRub),
          multiplier: String(multiplier ?? 1.0),
        })
        .returning();

      const newStatus = getStatusForPoints(newBalance);
      await tx
        .update(usersTable)
        .set({
          pointsBalance: user.pointsBalance + appliedDelta,
          bonusBalanceRub: centsToRub(nextBonusBalanceCents).toFixed(2),
          status: newStatus,
        })
        .where(eq(usersTable.id, userId));

      return createdTransaction;
    });

    res.status(201).json(await formatTransaction(created));
  } catch (error) {
    const message = (error as Error).message;
    const status = (error as Error & { status?: number }).status ?? 500;
    if (message === "USER_NOT_FOUND") {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (status === 409) {
      res.status(409).json({
        error: message === "INSUFFICIENT_BALANCE"
          ? "Transaction would overdraw the balance"
          : "The user's monetary balance is invalid",
        code: message,
      });
      return;
    }
    res.status(500).json({ error: "Unable to create transaction" });
  }
});

router.get("/:id", requireAuth, async (req, res) => {
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const userId = getUserIdFromReq(req as any);
  const isAdmin = getAuthPayloadFromReq(req as any)?.isAdmin === true;
  const tx = await db
    .select()
    .from(transactionsTable)
    .where(and(eq(transactionsTable.id, id), isAdmin ? sql`true` : eq(transactionsTable.userId, userId)))
    .limit(1);
  if (!tx.length) {
    res.status(404).json({ error: "Transaction not found" });
    return;
  }
  res.json(await formatTransaction(tx[0]));
});

export default router;
