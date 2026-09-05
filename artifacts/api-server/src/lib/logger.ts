import pino from "pino";
import { db, webhookSecurityEventsTable } from "@workspace/db";
import { lt, or, sql } from "drizzle-orm";

const usePrettyTransport =
  process.env.NODE_ENV !== "production" && process.env.NODE_ENV !== "test";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: [
    "req.headers.authorization",
    "req.headers.cookie",
    "res.headers['set-cookie']",
  ],
  ...(usePrettyTransport
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }
    : {}),
});

const securityEventCounts = new Map<string, number>();

export const YOOKASSA_WEBHOOK_REJECTION_EVENT =
  "yookassa_webhook_rejected_unrecognized_source";
export const WEBHOOK_SECURITY_HISTORY_RETENTION_DAYS = 90;
export const MAX_WEBHOOK_SECURITY_HISTORY_ROWS = 1_000;

export type SecurityEventDetails = {
  sourceIp: string | null;
};

export type SecurityEventCount = {
  event: string;
  occurrenceCount: number;
};

/**
 * Record a security signal without attaching request bodies or provider data.
 * The count is intentionally process-local: the structured log is the durable
 * operational record, while the count makes repeated events easy to spot in a
 * log stream.
 */
export function recordSecurityEvent(
  event: string,
  details: SecurityEventDetails,
): SecurityEventCount {
  const occurrenceCount = (securityEventCounts.get(event) ?? 0) + 1;
  securityEventCounts.set(event, occurrenceCount);
  logger.warn(
    {
      event: "security",
      securityEvent: event,
      sourceIp: details.sourceIp,
      occurrenceCount,
    },
    "Security event recorded",
  );
  return { event, occurrenceCount };
}

/**
 * Return aggregate counts for operational checks without exposing event
 * details or notification payloads.
 */
export function getSecurityEventCounts(): Record<string, number> {
  return Object.fromEntries(securityEventCounts);
}

/**
 * Persist only the safe operational fields for a rejected webhook request.
 * Cleanup runs in the same database write path so the table stays bounded by
 * both age and row count instead of relying on a periodic job.
 */
export async function persistSecurityEvent(
  event: string,
  details: SecurityEventDetails,
): Promise<void> {
  if (event !== YOOKASSA_WEBHOOK_REJECTION_EVENT) return;

  await db.insert(webhookSecurityEventsTable).values({
    event,
    sourceIp: details.sourceIp,
  });

  const retentionCutoff = new Date(
    Date.now() - WEBHOOK_SECURITY_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
  await db.delete(webhookSecurityEventsTable).where(
    or(
      lt(webhookSecurityEventsTable.createdAt, retentionCutoff),
      sql`${webhookSecurityEventsTable.id} IN (
        SELECT id
        FROM webhook_security_events
        ORDER BY created_at DESC, id DESC
        OFFSET ${MAX_WEBHOOK_SECURITY_HISTORY_ROWS}
      )`,
    ),
  );
}
