import {
  db,
  catalogAuditLogTable,
  partnerLogoCleanupRunsTable,
  type CatalogAuditChange,
  type PartnerLogoCleanupFailedPath,
} from "@workspace/db";
import { getAuthPayloadFromReq } from "../routes/auth.js";

type AuditRequest = {
  headers: Record<string, string | string[] | undefined>;
};

type AuditEntry = {
  entityType: "partner" | "offer";
  entityId: number;
  entityName: string;
  action: "create" | "update" | "delete";
  changes: Record<string, CatalogAuditChange>;
};

export async function recordCatalogAudit(req: AuditRequest, entry: AuditEntry): Promise<void> {
  const payload = getAuthPayloadFromReq(req);
  const administrator = getAdministrator(payload);

  await db.insert(catalogAuditLogTable).values({
    ...administrator,
    entityType: entry.entityType,
    entityId: entry.entityId,
    entityName: entry.entityName,
    action: entry.action,
    changes: entry.changes,
  });
}

type LogoCleanupRun = {
  dryRun: boolean;
  scanned: number;
  referenced: number;
  orphaned: string[];
  removed: string[];
  failed: PartnerLogoCleanupFailedPath[];
};

function getAdministrator(payload: Record<string, unknown> | null): {
  adminUserId: number;
  adminName: string;
  adminPhone: string | null;
} {
  if (!payload || typeof payload.userId !== "number") {
    throw new Error("Cannot record administrator audit without an authenticated administrator");
  }

  return {
    adminUserId: payload.userId,
    adminName: typeof payload.name === "string" && payload.name.trim()
      ? payload.name
      : typeof payload.phone === "string" && payload.phone.trim()
        ? payload.phone
        : `Администратор #${payload.userId}`,
    adminPhone: typeof payload.phone === "string" ? payload.phone : null,
  };
}

export async function recordPartnerLogoCleanup(
  req: AuditRequest,
  result: LogoCleanupRun,
): Promise<void> {
  const administrator = getAdministrator(getAuthPayloadFromReq(req));
  await db.insert(partnerLogoCleanupRunsTable).values({
    ...administrator,
    mode: result.dryRun ? "dry_run" : "confirmed",
    scanned: result.scanned,
    referenced: result.referenced,
    orphanedPaths: result.orphaned,
    removedPaths: result.removed,
    failedPaths: result.failed,
  });
}

export function auditChange(
  from: string | number | boolean | null | undefined,
  to: string | number | boolean | null | undefined,
): CatalogAuditChange {
  return { from: from ?? null, to: to ?? null };
}