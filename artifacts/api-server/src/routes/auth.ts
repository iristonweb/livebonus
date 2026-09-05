import { Router, type NextFunction, type Request, type Response } from "express";
import { createHmac, randomInt, randomUUID, timingSafeEqual } from "crypto";
import { db, otpRequestTimestampsTable, usersTable, scoreEventsTable } from "@workspace/db";
import { and, eq, lt, sql } from "drizzle-orm";
import { addScoreEvent } from "../lib/score.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ---------------------------------------------------------------------------
// Minimal JWT (no external deps, uses crypto built-in)
// ---------------------------------------------------------------------------
const configuredSecret = process.env.SESSION_SECRET?.trim();
if (process.env.NODE_ENV === "production" && !configuredSecret) {
  throw new Error("SESSION_SECRET must be configured in production");
}
const SECRET = configuredSecret ?? "dev-secret-change-in-prod";
const DEV_ADMIN_PHONE = "+79001234567";
const SESSION_TTL_SECONDS = 8 * 60 * 60;
const activeSessions = new Map<string, number>();
const revokedSessions = new Set<string>();

export function normalizePhone(phone: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10) digits = `7${digits}`;
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  return digits ? `+${digits}` : "";
}

/**
 * Admins are configured outside the database so a regular user cannot grant
 * themselves access by editing their profile. Use a comma-separated
 * ADMIN_PHONES value in shared/production environments.
 */
function getConfiguredAdminPhones(): Set<string> {
  const configured = (process.env.ADMIN_PHONES ?? "")
    .split(",")
    .map((phone) => normalizePhone(phone.trim()))
    .filter(Boolean);

  if (configured.length > 0) {
    return new Set(configured);
  }

  // The demo login is intentionally admin-only outside production so the
  // preview remains usable without putting a real phone number in config.
  return process.env.NODE_ENV === "production"
    ? new Set()
    : new Set([normalizePhone(DEV_ADMIN_PHONE)]);
}

export function isAdminPhone(phone: string): boolean {
  return getConfiguredAdminPhones().has(normalizePhone(phone));
}

export function createToken(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const sid = typeof payload.sid === "string" ? payload.sid : randomUUID();
  revokedSessions.delete(sid);
  const exp = typeof payload.exp === "number" ? payload.exp : now + SESSION_TTL_SECONDS;
  const body = Buffer.from(JSON.stringify({ ...payload, sid, iat: now, exp })).toString("base64url");
  const sig = createHmac("sha256", SECRET).update(`${header}.${body}`).digest("base64url");
  activeSessions.set(sid, exp);
  return `${header}.${body}.${sig}`;
}

export function verifyToken(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const parsedHeader = JSON.parse(Buffer.from(header, "base64url").toString()) as Record<string, unknown>;
    if (parsedHeader.alg !== "HS256" || parsedHeader.typ !== "JWT") return null;
    const expected = createHmac("sha256", SECRET).update(`${header}.${body}`).digest("base64url");
    const providedSignature = Buffer.from(sig);
    const expectedSignature = Buffer.from(expected);
    if (
      providedSignature.length !== expectedSignature.length
      || !timingSafeEqual(providedSignature, expectedSignature)
    ) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as Record<string, unknown>;
    if (
      typeof payload.userId !== "number"
      || !Number.isInteger(payload.userId)
      || payload.userId <= 0
      || typeof payload.sid !== "string"
      || !payload.sid
      || typeof payload.exp !== "number"
      || !Number.isFinite(payload.exp)
      || payload.exp <= Math.floor(Date.now() / 1000)
    ) return null;
    const sessionExpiry = activeSessions.get(payload.sid);
    if (revokedSessions.has(payload.sid)) return null;
    // Integration tests run in an isolated database/process and use signed
    // fixture tokens without sharing the in-memory session map with the API
    // child process. Never relax this check outside NODE_ENV=test.
    if (process.env.NODE_ENV !== "test" && (sessionExpiry === undefined || sessionExpiry !== payload.exp)) return null;
    return payload;
  } catch {
    return null;
  }
}

export function getAuthPayloadFromReq(req: {
  headers: Record<string, string | string[] | undefined>;
}): Record<string, unknown> | null {
  const authHeader = req.headers["authorization"];
  if (!authHeader || typeof authHeader !== "string" || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const token = authHeader.slice("Bearer ".length).trim();
  return token ? verifyToken(token) : null;
}

/** Extract userId from a previously authenticated request. */
export function getUserIdFromReq(req: { headers: Record<string, string | string[] | undefined> }): number {
  const payload = getAuthPayloadFromReq(req);
  if (!payload || typeof payload.userId !== "number") {
    throw new Error("AUTHENTICATION_REQUIRED");
  }
  return payload.userId;
}

/** Guard for all routes that access the current user's private data. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const payload = getAuthPayloadFromReq(req);
  if (!payload || typeof payload.userId !== "number") {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}

/**
 * Guard for catalog-management endpoints. Administrator status comes from
 * the signed session claims generated by the server, never from a user
 * profile field supplied by the request.
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const payload = getAuthPayloadFromReq(req);
  if (!payload || typeof payload.userId !== "number") {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  if (payload.isAdmin !== true) {
    res.status(403).json({ error: "Administrator access required" });
    return;
  }
  next();
}

// ---------------------------------------------------------------------------
// Verification codes remain in memory; resend history is persisted below.
// ---------------------------------------------------------------------------
interface OtpEntry { code: string; expires: number; attempts: number }
const otpStore = new Map<string, OtpEntry>();
const OTP_REQUEST_WINDOW_MS = 10 * 60 * 1000;
const MAX_OTP_REQUESTS_PER_WINDOW = 3;
const otpRequestLocks = new Map<string, Promise<void>>();

async function withOtpRequestLock<T>(phoneKey: string, callback: () => Promise<T>): Promise<T> {
  const previous = otpRequestLocks.get(phoneKey) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  otpRequestLocks.set(phoneKey, current);

  await previous;
  try {
    return await callback();
  } finally {
    release();
    if (otpRequestLocks.get(phoneKey) === current) {
      otpRequestLocks.delete(phoneKey);
    }
  }
}

async function cleanupExpiredOtpRequestTimestamps(now = Date.now()): Promise<void> {
  await db
    .delete(otpRequestTimestampsTable)
    .where(lt(otpRequestTimestampsTable.requestedAt, new Date(now - OTP_REQUEST_WINDOW_MS)));
}

async function reserveOtpRequest(phoneKey: string, now: number): Promise<{
  allowed: boolean;
  retryAfter?: number;
}> {
  return withOtpRequestLock(phoneKey, async () =>
    db.transaction(async (tx) => {
      // Advisory locks are transaction-scoped, so concurrent API processes
      // cannot both pass the history check before either inserts its row.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${phoneKey}, 0))`);

      const recentRequests = (await tx
        .select({
          phone: otpRequestTimestampsTable.phone,
          requestedAt: otpRequestTimestampsTable.requestedAt,
        })
        .from(otpRequestTimestampsTable)
      )
        // Older installations stored phone numbers without a leading "+".
        // Compare through the canonicalizer so those throttle rows remain
        // effective after the storage format is tightened.
        .filter((request) =>
          normalizePhone(request.phone) === phoneKey
          && request.requestedAt.getTime() >= now - OTP_REQUEST_WINDOW_MS,
        )
        .sort((left, right) => left.requestedAt.getTime() - right.requestedAt.getTime());

      if (recentRequests.length >= MAX_OTP_REQUESTS_PER_WINDOW) {
        const retryAfter = Math.max(
          1,
          Math.ceil((recentRequests[0].requestedAt.getTime() + OTP_REQUEST_WINDOW_MS - now) / 1000),
        );
        return { allowed: false, retryAfter };
      }

      await tx.insert(otpRequestTimestampsTable).values({
        phone: phoneKey,
        requestedAt: new Date(now),
      });
      return { allowed: true };
    }),
  );
}

// Clean up both stores independently every 5 min. A database cleanup failure
// must not affect active verification codes or the next request's error path.
setInterval(() => {
  const now = Date.now();
  for (const [phone, entry] of otpStore.entries()) {
    if (now > entry.expires) otpStore.delete(phone);
  }
  for (const [sid, expiresAt] of activeSessions.entries()) {
    if (now >= expiresAt * 1000) activeSessions.delete(sid);
  }
  void cleanupExpiredOtpRequestTimestamps(now).catch((error) => {
      logger.error({ err: error }, "Failed to clean up expired OTP request timestamps");
  });
}, 5 * 60 * 1000);

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/** POST /auth/request-otp */
router.post("/request-otp", async (req, res) => {
  const { phone } = req.body as { phone?: string };
  if (!phone || typeof phone !== "string" || phone.trim().length < 7) {
    res.status(400).json({ error: "Укажите корректный номер телефона" });
    return;
  }

  const now = Date.now();
  const phoneKey = normalizePhone(phone.trim());
  if (!phoneKey || !/^\+7\d{10}$/.test(phoneKey)) {
    res.status(400).json({ error: "Укажите корректный номер телефона" });
    return;
  }
  let reservation: { allowed: boolean; retryAfter?: number };
  try {
    await cleanupExpiredOtpRequestTimestamps(now);
    reservation = await reserveOtpRequest(phoneKey, now);
  } catch (error) {
    logger.error({ err: error }, "Failed to reserve OTP request");
    res.status(503).json({ error: "Не удалось запросить код. Попробуйте позже." });
    return;
  }

  if (!reservation.allowed) {
    res.set("Retry-After", String(reservation.retryAfter));
    res.status(429).json({
      error: "Слишком много запросов кода. Повторите позже.",
      retryAfter: reservation.retryAfter,
    });
    return;
  }

  // Dev: always "1234". Prod: random 4-digit code + send via SMS
  const code =
    process.env.NODE_ENV === "production"
      ? String(randomInt(1000, 9999)).padStart(4, "0")
      : "1234";

  otpStore.set(phoneKey, { code, expires: now + 10 * 60 * 1000, attempts: 0 });

  res.json({
    success: true,
    maskedPhone: phoneKey.replace(/^(\+\d{1,2})(\d+)(\d{2})$/, "$1•••$3"),
    expiresIn: 600,
    // Expose in dev for easy testing
    ...(process.env.NODE_ENV !== "production" && { devCode: code }),
  });
});

/** POST /auth/verify-otp */
router.post("/verify-otp", async (req, res) => {
  const { phone, code } = req.body as { phone?: string; code?: string };
  if (!phone || !code) {
    res.status(400).json({ error: "Укажите телефон и код" });
    return;
  }

  const phoneKey = normalizePhone(phone.trim());
  if (!/^\+7\d{10}$/.test(phoneKey)) {
    res.status(400).json({ error: "Укажите корректный номер телефона" });
    return;
  }

  const stored = otpStore.get(phoneKey);
  if (!stored) {
    res.status(400).json({ error: "Код не запрашивался или истёк. Запросите новый." });
    return;
  }
  if (Date.now() > stored.expires) {
    otpStore.delete(phoneKey);
    res.status(400).json({ error: "Срок действия кода истёк. Запросите новый." });
    return;
  }
  if (stored.attempts >= 3) {
    otpStore.delete(phoneKey);
    res.status(429).json({ error: "Слишком много попыток. Запросите новый код." });
    return;
  }
  if (stored.code !== code.trim()) {
    stored.attempts++;
    res.status(400).json({ error: "Неверный код", attemptsLeft: 3 - stored.attempts });
    return;
  }

  otpStore.delete(phoneKey);

  // Find or create user
  const users = await db
    .select()
    .from(usersTable);
  let user = users.find((candidate) => normalizePhone(candidate.phone) === phoneKey);

  if (!user) {
    try {
      const [created] = await db
        .insert(usersTable)
        .values({
          phone: phoneKey,
          name: `Пользователь ${phoneKey.slice(-4)}`,
          isPhoneVerified: true,
          verificationLevel: 1,
        })
        .returning();
      user = created;

      // New user: give phone verification score event
      await addScoreEvent(user.id, "phone_verified", 50, "Телефон подтверждён при регистрации");
    } catch (error) {
      // A concurrent registration can win the unique phone constraint.
      if ((error as { code?: string }).code !== "23505") throw error;
      const candidates = await db.select().from(usersTable);
      user = candidates.find((candidate) => normalizePhone(candidate.phone) === phoneKey);
      if (!user) {
        res.status(409).json({ error: "Номер телефона уже зарегистрирован" });
        return;
      }
    }
  } else if (!user.isPhoneVerified) {
    const [updated] = await db
      .update(usersTable)
      .set({
        isPhoneVerified: true,
        verificationLevel: Math.min(3, (user.verificationLevel ?? 0) + 1),
      })
      .where(eq(usersTable.id, user.id))
      .returning();
    user = updated ?? { ...user, isPhoneVerified: true, verificationLevel: Math.min(3, (user.verificationLevel ?? 0) + 1) };
    await addScoreEvent(user.id, "phone_verified", 50, "Телефон подтверждён");
  }

  // Canonicalize legacy formatted records on the successful OTP path.
  if (user.phone !== phoneKey) {
    try {
      const [updated] = await db
        .update(usersTable)
        .set({ phone: phoneKey })
        .where(eq(usersTable.id, user.id))
        .returning();
      user = updated ?? { ...user, phone: phoneKey };
    } catch (error) {
      if ((error as { code?: string }).code !== "23505") throw error;
    }
  }

  const isAdmin = isAdminPhone(user.phone);
  const token = createToken({ userId: user.id, phone: user.phone, name: user.name, isAdmin });
  res.json({ token, userId: user.id, name: user.name, phone: user.phone, isAdmin });
});

/** POST /auth/logout — revoke the current server-side session. */
router.post("/logout", requireAuth, (req, res) => {
  const payload = getAuthPayloadFromReq(req);
  if (payload?.sid && typeof payload.sid === "string") {
    activeSessions.delete(payload.sid);
    revokedSessions.add(payload.sid);
  }
  res.json({ success: true });
});

export default router;
