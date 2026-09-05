import { Readable } from "node:stream";
import { Router } from "express";
import { db, usersTable, verificationApplicationsTable, verificationAuditEventsTable } from "@workspace/db";
import { and, desc, eq } from "drizzle-orm";
import { UpdateMeBody, VerifyIdentityBody, VerifyIncomeBody } from "@workspace/api-zod";
import { getStatusForPoints, getNextStatus, getPointsToNextStatus, STATUS_MULTIPLIERS } from "../lib/bonus.js";
import { centsToRub, legacyCentsForPoints } from "../lib/finance.js";
import { addScoreEventInTransaction } from "../lib/score.js";
import { KYC_ALLOWED_CONTENT_TYPES, KYC_MAX_FILE_SIZE } from "./storage.js";
import { ObjectStorageService, ObjectNotFoundError } from "../lib/objectStorage.js";
import { getAuthPayloadFromReq, getUserIdFromReq, isAdminPhone, requireAdmin, requireAuth } from "./auth.js";

const router = Router();
const objectStorage = new ObjectStorageService();
const verificationTypes = ["identity", "income"] as const;
type VerificationType = typeof verificationTypes[number];
function verificationStatus(status: string | null | undefined): "not_started" | "pending" | "approved" | "rejected" {
  return status === "pending" || status === "approved" || status === "rejected" ? status : "not_started";
}

function formatUser(user: typeof usersTable.$inferSelect, isAdmin = false) {
  const status = getStatusForPoints(user.pointsBalance);
  return {
    id: user.id,
    phone: user.phone,
    name: user.name,
    email: user.email ?? null,
    pointsBalance: user.pointsBalance,
    bonusBalanceRub: user.bonusBalanceRub === null
      ? centsToRub(legacyCentsForPoints(user.pointsBalance))
      : Number(user.bonusBalanceRub),
    status,
    statusMultiplier: STATUS_MULTIPLIERS[status] ?? 1.0,
    pointsToNextStatus: getPointsToNextStatus(user.pointsBalance, status),
    nextStatus: getNextStatus(status),
    liveScore: user.liveScore,
    isPhoneVerified: user.isPhoneVerified,
    isIdentityVerified: user.isIdentityVerified,
    isIncomeVerified: user.isIncomeVerified,
    verificationLevel: user.verificationLevel,
    identityVerificationStatus: user.isIdentityVerified ? "approved" : (user.identityVerificationStatus ?? "not_started"),
    incomeVerificationStatus: user.isIncomeVerified ? "approved" : (user.incomeVerificationStatus ?? "not_started"),
    isAdmin,
    createdAt: user.createdAt.toISOString(),
  };
}

async function formatVerification(application: typeof verificationApplicationsTable.$inferSelect) {
  return {
    id: application.id,
    verificationType: application.verificationType,
    status: verificationStatus(application.status),
    fileName: application.fileName,
    contentType: application.contentType,
    fileSize: application.fileSize,
    rejectionReason: application.rejectionReason,
    createdAt: application.createdAt.toISOString(),
    decidedAt: application.decidedAt?.toISOString() ?? null,
  };
}

router.get("/me", requireAuth, async (req, res) => {
  const userId = getUserIdFromReq(req as any);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }
  res.json(formatUser(user, getAuthPayloadFromReq(req)?.isAdmin === true));
});

router.patch("/me", requireAuth, async (req, res) => {
  const userId = getUserIdFromReq(req as any);
  const parsed = UpdateMeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "Invalid input" }); return; }
  const [updated] = await db.update(usersTable).set(parsed.data).where(eq(usersTable.id, userId)).returning();
  if (!updated) { res.status(404).json({ error: "User not found" }); return; }
  res.json(formatUser(updated, getAuthPayloadFromReq(req)?.isAdmin === true));
});

router.get("/", requireAdmin, async (_req, res) => {
  const users = await db.select().from(usersTable);
  res.json(users.map((user) => formatUser(user, isAdminPhone(user.phone))));
});

router.get("/verifications", requireAdmin, async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : "pending";
  if (!["pending", "approved", "rejected", "all"].includes(status)) {
    res.status(400).json({ error: "Invalid verification status" });
    return;
  }
  const applications = await db.select().from(verificationApplicationsTable)
    .where(status === "all" ? undefined : eq(verificationApplicationsTable.status, status))
    .orderBy(desc(verificationApplicationsTable.createdAt));
  const users = await db.select().from(usersTable);
  const userById = new Map(users.map((user) => [user.id, user]));
  res.json((await Promise.all(applications.map(formatVerification))).map((application) => ({
    ...application,
    user: (() => {
      const user = userById.get(applications.find((item) => item.id === application.id)!.userId);
      return user ? { id: user.id, name: user.name, phone: user.phone } : null;
    })(),
  })));
});

router.get("/verifications/:applicationId/document", requireAdmin, async (req, res) => {
  const applicationId = Number(req.params.applicationId);
  const [application] = await db.select().from(verificationApplicationsTable)
    .where(eq(verificationApplicationsTable.id, applicationId)).limit(1);
  if (!application) { res.status(404).json({ error: "Document not found" }); return; }
  return streamPrivateDocument(req, res, application.fileObjectPath, application.contentType, application.fileName);
});

// ---------------------------------------------------------------------------
// Phone verification is completed only by the OTP flow. Identity and income
// endpoints create reviewable requests and never grant score themselves.
// ---------------------------------------------------------------------------

async function handleVerify(
  req: Parameters<typeof getUserIdFromReq>[0],
  res: { status: (n: number) => { json: (d: unknown) => void }; json: (d: unknown) => void },
  field: "isIdentityVerified" | "isIncomeVerified",
  statusField: "identityVerificationStatus" | "incomeVerificationStatus",
  verificationType: VerificationType,
) {
  const userId = getUserIdFromReq(req);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  if (user[field]) {
    res.status(409).json({ error: "Уже верифицировано", alreadyDone: true });
    return;
  }
  const currentStatus = verificationStatus(user[statusField]);
  if (currentStatus === "pending") {
    res.status(409).json({ error: "Заявка уже отправлена на проверку", status: "pending" });
    return;
  }
  const parsed = (verificationType === "identity" ? VerifyIdentityBody : VerifyIncomeBody).safeParse((req as any).body);
  if (!parsed.success) {
    res.status(400).json({ error: "Загрузите допустимый документ через защищённое хранилище" });
    return;
  }
  if (!parsed.data.objectPath.startsWith(`/objects/kyc/${userId}/`)) {
    res.status(403).json({ error: "Документ принадлежит другому пользователю" });
    return;
  }
  let actualMetadata: { contentType: string; size: number };
  try {
    const actual = await objectStorage.getObjectEntityMetadata(parsed.data.objectPath);
    actualMetadata = actual;
    if (
      actual.contentType !== parsed.data.contentType
      || !KYC_ALLOWED_CONTENT_TYPES.includes(actual.contentType as typeof KYC_ALLOWED_CONTENT_TYPES[number])
      || actual.size < 1
      || actual.size > KYC_MAX_FILE_SIZE
      || actual.size !== parsed.data.fileSize
    ) {
      res.status(400).json({ error: "Файл не прошёл проверку формата или размера" });
      return;
    }
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(400).json({ error: "Документ не найден в хранилище. Загрузите его повторно." });
      return;
    }
    (req as any).log?.error?.({ err: error }, "KYC storage validation failed");
    res.status(503).json({ error: "Не удалось проверить документ в хранилище. Повторите попытку." });
    return;
  }
  let application: typeof verificationApplicationsTable.$inferSelect;
  try {
    [application] = await db.transaction(async (tx) => {
      const [created] = await tx.insert(verificationApplicationsTable).values({
        userId,
        verificationType,
        status: "pending",
        fileObjectPath: parsed.data.objectPath,
        fileName: parsed.data.fileName.replace(/[\\/]/g, "_"),
        contentType: actualMetadata.contentType,
        fileSize: actualMetadata.size,
      }).returning();
      await tx.insert(verificationAuditEventsTable).values({
        applicationId: created.id,
        actorUserId: userId,
        action: "submitted",
        fromStatus: currentStatus,
        toStatus: "pending",
      });
      const [updated] = await tx.update(usersTable)
        .set({ [statusField]: "pending" })
        .where(and(eq(usersTable.id, userId), eq(statusColumnFor(statusField), currentStatus)))
        .returning();
      if (!updated) throw new Error("VERIFICATION_ALREADY_STARTED");
      return [created];
    });
  } catch (error) {
    await objectStorage.deleteObjectEntity(parsed.data.objectPath).catch((cleanupError) => {
      (req as any).log?.warn?.({ err: cleanupError }, "KYC orphan cleanup failed");
    });
    if (error instanceof Error && error.message === "VERIFICATION_ALREADY_STARTED") {
      res.status(409).json({ error: "Заявка уже отправлена на проверку", status: "pending" });
      return;
    }
    throw error;
  }
  res.status(202).json({
    success: true,
    verificationType,
    status: "pending",
    scoreChange: 0,
    newScore: user.liveScore,
    applicationId: application.id,
    application: await formatVerification(application),
  });
}

function statusColumnFor(statusField: "identityVerificationStatus" | "incomeVerificationStatus") {
  return statusField === "identityVerificationStatus" ? usersTable.identityVerificationStatus : usersTable.incomeVerificationStatus;
}

/** POST /users/me/verify/phone */
router.post("/me/verify/phone", requireAuth, async (req, res) => {
  const userId = getUserIdFromReq(req as any);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (user.isPhoneVerified) {
    res.status(409).json({ error: "Телефон подтверждается только одноразовым кодом", alreadyDone: true });
    return;
  }
  res.status(403).json({ error: "Для подтверждения телефона используйте OTP-код" });
});

router.post("/me/verify/identity", requireAuth, (req, res) =>
  handleVerify(
    req as any,
    res as any,
    "isIdentityVerified",
    "identityVerificationStatus",
    "identity",
  ),
);

router.post("/me/verify/income", requireAuth, (req, res) =>
  handleVerify(
    req as any,
    res as any,
    "isIncomeVerified",
    "incomeVerificationStatus",
    "income",
  ),
);

/** Admin-only decision; score is issued only once after approval. */
router.post("/:userId/verify/:verificationType/decision", requireAdmin, async (req, res) => {
  const userId = Number(req.params.userId);
  const verificationType = Array.isArray(req.params.verificationType)
    ? req.params.verificationType[0]
    : req.params.verificationType;
  const { approved, comment } = req.body as { approved?: unknown; comment?: unknown };
  if (!Number.isInteger(userId) || userId <= 0 || !["identity", "income"].includes(verificationType)) {
    res.status(400).json({ error: "Invalid verification decision" });
    return;
  }
  if (typeof approved !== "boolean") {
    res.status(400).json({ error: "approved must be a boolean" });
    return;
  }
  if (!approved && (typeof comment !== "string" || comment.trim().length < 3 || comment.trim().length > 1000)) {
    res.status(400).json({ error: "Комментарий обязателен при отказе" });
    return;
  }

  const field = verificationType === "identity" ? "isIdentityVerified" : "isIncomeVerified";
  const statusField = verificationType === "identity" ? "identityVerificationStatus" : "incomeVerificationStatus";
  const statusColumn = verificationType === "identity"
    ? usersTable.identityVerificationStatus
    : usersTable.incomeVerificationStatus;
  const scoreEventType = verificationType === "identity" ? "identity_verified" : "income_verified";
  const scoreDescription = verificationType === "identity" ? "Паспорт / ID верифицирован" : "Доход подтверждён";
  const reviewerId = getUserIdFromReq(req as any);
  try {
    const result = await db.transaction(async (tx) => {
      const [application] = await tx.select().from(verificationApplicationsTable)
        .where(and(eq(verificationApplicationsTable.userId, userId), eq(verificationApplicationsTable.verificationType, verificationType), eq(verificationApplicationsTable.status, "pending")))
        .orderBy(desc(verificationApplicationsTable.createdAt)).limit(1);
      if (!application) throw new Error("VERIFICATION_ALREADY_DECIDED");
      const [user] = await tx.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
      if (!user) throw new Error("USER_NOT_FOUND");
      const nextStatus = approved ? "approved" : "rejected";
      const [updated] = await tx.update(usersTable).set({
        [field]: approved,
        [statusField]: nextStatus,
        ...(approved ? { verificationLevel: Math.min(3, user.verificationLevel + 1) } : {}),
      }).where(and(eq(usersTable.id, userId), eq(statusColumn, "pending"))).returning();
      if (!updated) throw new Error("VERIFICATION_ALREADY_DECIDED");
      await tx.update(verificationApplicationsTable).set({
        status: nextStatus,
        reviewerId,
        rejectionReason: approved ? null : (comment as string).trim(),
        decidedAt: new Date(),
      }).where(and(eq(verificationApplicationsTable.id, application.id), eq(verificationApplicationsTable.status, "pending")));
      await tx.insert(verificationAuditEventsTable).values({
        applicationId: application.id,
        actorUserId: reviewerId,
        action: approved ? "approved" : "rejected",
        fromStatus: "pending",
        toStatus: nextStatus,
        comment: approved && typeof comment === "string" ? comment.trim().slice(0, 1000) || null : (comment as string).trim(),
      });
      const newScore = approved
        ? await addScoreEventInTransaction(tx, userId, scoreEventType, 100, scoreDescription, undefined, `kyc:${userId}:${verificationType}:approved`)
        : updated.liveScore;
      return { application, status: nextStatus, newScore };
    });
    res.json({
      success: true,
      verificationType,
      status: result.status,
      scoreChange: approved ? 100 : 0,
      newScore: result.newScore,
      applicationId: result.application.id,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "USER_NOT_FOUND") {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (error instanceof Error && error.message === "VERIFICATION_ALREADY_DECIDED") {
      res.status(409).json({ error: "Заявка уже обработана" });
      return;
    }
    throw error;
  }
});

router.get("/me/verifications", requireAuth, async (req, res) => {
  const applications = await db.select().from(verificationApplicationsTable)
    .where(eq(verificationApplicationsTable.userId, getUserIdFromReq(req as any)))
    .orderBy(desc(verificationApplicationsTable.createdAt));
  res.json(await Promise.all(applications.map(formatVerification)));
});

router.get("/me/verifications/:applicationId/document", requireAuth, async (req, res) => {
  const applicationId = Number(req.params.applicationId);
  const [application] = await db.select().from(verificationApplicationsTable)
    .where(and(eq(verificationApplicationsTable.id, applicationId), eq(verificationApplicationsTable.userId, getUserIdFromReq(req as any)))).limit(1);
  if (!application) { res.status(404).json({ error: "Document not found" }); return; }
  return streamPrivateDocument(req, res, application.fileObjectPath, application.contentType, application.fileName);
});

async function streamPrivateDocument(req: any, res: any, objectPath: string, contentType: string, fileName: string) {
  try {
    const response = await objectStorage.downloadObject(await objectStorage.getObjectEntityFile(objectPath));
    res.status(response.status).set({
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${fileName.replace(/["\r\n]/g, "_")}"`,
      "Cache-Control": "private, no-store, max-age=0",
    });
    if (response.body) Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    else res.end();
  } catch (error) {
    if (error instanceof ObjectNotFoundError) { res.status(404).json({ error: "Document not found" }); return; }
    req.log?.error?.({ err: error }, "Private document read failed");
    res.status(503).json({ error: "Не удалось открыть документ" });
  }
}

export default router;
