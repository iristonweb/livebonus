import { Router, type Request } from "express";
import { db, partnersTable, transactionsTable } from "@workspace/db";
import { desc, eq, sql } from "drizzle-orm";
import {
  CreatePartnerBody,
  ListPartnerLogoCleanupHistoryQueryParams,
  ListPartnerLogoCleanupHistoryResponse,
  ListPartnersQueryParams,
  UpdatePartnerBody,
  UpdatePartnerParams,
} from "@workspace/api-zod";
import { partnerLogoCleanupRunsTable } from "@workspace/db";
import { ObjectStorageService } from "../lib/objectStorage.js";
import { requireAdmin } from "./auth.js";
import { auditChange, recordCatalogAudit, recordPartnerLogoCleanup } from "../lib/catalog-audit.js";

const router = Router();
const objectStorage = new ObjectStorageService();

function isManagedLogoPath(path: string): boolean {
  return path.startsWith("/objects/") && !path.includes("..");
}

function isManagedPartnerLogoPath(path: string): boolean {
  const prefix = "/objects/partner-logos/";
  return path.startsWith(prefix) && path.slice(prefix.length).length > 0 && !path.includes("..");
}

function parseDryRun(value: unknown): boolean | null {
  if (value === undefined) {
    return true;
  }
  if (typeof value === "boolean") {
    return value;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
}

async function cleanupManagedLogo(path: string | null | undefined, req: Request): Promise<void> {
  if (!path || !isManagedLogoPath(path)) {
    return;
  }

  try {
    await objectStorage.deleteObjectEntity(path);
  } catch (error) {
    req.log.warn({ err: error, objectPath: path }, "Failed to clean up partner logo");
  }
}

function formatPartner(
  partner: typeof partnersTable.$inferSelect,
  stats?: { totalTransactions: number; totalVolumeRub: number }
) {
  return {
    id: partner.id,
    name: partner.name,
    category: partner.category,
    description: partner.description ?? null,
    // Prefer a managed object when available, while keeping the legacy URL
    // field populated for existing consumers and older partner records.
    logoUrl: partner.logoObjectPath ? `/api/storage${partner.logoObjectPath}` : partner.logoUrl ?? null,
    logoObjectPath: partner.logoObjectPath ?? null,
    bonusMultiplier: parseFloat(partner.bonusMultiplier),
    address: partner.address ?? null,
    city: partner.city ?? null,
    isActive: partner.isActive,
    totalTransactions: stats?.totalTransactions ?? null,
    totalVolumeRub: stats ? Number(stats.totalVolumeRub) : null,
  };
}

router.get("/", async (req, res) => {
  const parsed = ListPartnersQueryParams.safeParse(req.query);
  const category = parsed.success ? parsed.data.category : undefined;

  let partners;
  if (category) {
    partners = await db.select().from(partnersTable).where(eq(partnersTable.category, category));
  } else {
    partners = await db.select().from(partnersTable);
  }
  res.json(partners.map((p) => formatPartner(p)));
});

/**
 * Review and remove partner logo objects left behind by older replacements or
 * deleted partners. The operation is deliberately dry-run by default; pass
 * { dryRun: false } to perform the reviewed deletion.
 */
router.post("/maintenance/cleanup-logos", requireAdmin, async (req, res): Promise<void> => {
  const dryRun = parseDryRun(req.body?.dryRun ?? req.query.dryRun);
  if (dryRun === null) {
    res.status(400).json({ error: "dryRun must be a boolean" });
    return;
  }

  const [storedLogoPaths, partnerRows] = await Promise.all([
    objectStorage.listPartnerLogoObjectPaths(),
    db.select({ logoObjectPath: partnersTable.logoObjectPath }).from(partnersTable),
  ]);
  const managedLogoPaths = [...new Set(storedLogoPaths)].filter(isManagedPartnerLogoPath);
  const referencedPaths = new Set(
    partnerRows
      .map((partner) => partner.logoObjectPath)
      .filter((path): path is string => Boolean(path))
      .filter(isManagedPartnerLogoPath),
  );
  const orphanedPaths = managedLogoPaths.filter((path) => !referencedPaths.has(path));

  const removedPaths: string[] = [];
  const failedPaths: Array<{ path: string; error: string }> = [];
  if (!dryRun) {
    for (const path of orphanedPaths) {
      try {
        await objectStorage.deleteObjectEntity(path);
        removedPaths.push(path);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown storage error";
        failedPaths.push({ path, error: message });
        req.log.warn({ err: error, objectPath: path }, "Failed to remove orphaned partner logo");
      }
    }
  }

  const result = {
    dryRun,
    scanned: managedLogoPaths.length,
    referenced: referencedPaths.size,
    orphaned: orphanedPaths,
    removed: removedPaths,
    failed: failedPaths,
  };
  await recordPartnerLogoCleanup(req, result);
  res.json(result);
});

router.get("/maintenance/cleanup-logos/history", requireAdmin, async (req, res): Promise<void> => {
  const parsed = ListPartnerLogoCleanupHistoryQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid logo cleanup history query", details: parsed.error.issues });
    return;
  }

  const historyQuery = db
    .select()
    .from(partnerLogoCleanupRunsTable);
  const rows = await (parsed.data.status === "failed"
    ? historyQuery.where(sql`jsonb_array_length(${partnerLogoCleanupRunsTable.failedPaths}) > 0`)
    : historyQuery)
    .orderBy(desc(partnerLogoCleanupRunsTable.createdAt))
    .limit(parsed.data.limit ?? 50);

  res.json(ListPartnerLogoCleanupHistoryResponse.parse(rows.map((row) => ({
    id: row.id,
    adminUserId: row.adminUserId,
    adminName: row.adminName,
    adminPhone: row.adminPhone,
    mode: row.mode,
    scanned: row.scanned,
    referenced: row.referenced,
    orphaned: row.orphanedPaths,
    removed: row.removedPaths,
    failed: row.failedPaths,
    createdAt: row.createdAt.toISOString(),
  }))));
});

router.post("/", requireAdmin, async (req, res) => {
  const parsed = CreatePartnerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  if (parsed.data.logoObjectPath && !isManagedLogoPath(parsed.data.logoObjectPath)) {
    res.status(400).json({ error: "Invalid logo object path" });
    return;
  }
  const { bonusMultiplier, logoObjectPath, ...rest } = parsed.data;
  const created = await db
    .insert(partnersTable)
    .values({
      ...rest,
      ...(logoObjectPath
        ? { logoObjectPath, logoUrl: `/api/storage${logoObjectPath}` }
        : {}),
      bonusMultiplier: String(bonusMultiplier),
    })
    .returning();
  await recordCatalogAudit(req, {
    entityType: "partner",
    entityId: created[0].id,
    entityName: created[0].name,
    action: "create",
    changes: {
      name: auditChange(null, created[0].name),
      category: auditChange(null, created[0].category),
      description: auditChange(null, created[0].description),
      logoUrl: auditChange(null, created[0].logoUrl),
      bonusMultiplier: auditChange(null, Number(created[0].bonusMultiplier)),
      logoObjectPath: auditChange(null, created[0].logoObjectPath),
      address: auditChange(null, created[0].address),
      city: auditChange(null, created[0].city),
      isActive: auditChange(null, created[0].isActive),
    },
  });
  res.status(201).json(formatPartner(created[0]));
});

router.delete("/:id", requireAdmin, async (req, res) => {
  const rawId = req.params.id;
  const id = parseInt(Array.isArray(rawId) ? rawId[0] : rawId);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid id" }); return; }
  let deleted: Array<typeof partnersTable.$inferSelect>;
  try {
    deleted = await db.delete(partnersTable).where(eq(partnersTable.id, id)).returning();
  } catch (error) {
    if ((error as { code?: string }).code === "23503") {
      res.status(409).json({
        error: "Partner has dependent offers or transactions",
        code: "PARTNER_HAS_DEPENDENCIES",
      });
      return;
    }
    throw error;
  }
  if (!deleted.length) {
    res.status(404).json({ error: "Partner not found" });
    return;
  }
  await recordCatalogAudit(req, {
    entityType: "partner",
    entityId: deleted[0].id,
    entityName: deleted[0].name,
    action: "delete",
    changes: {
      name: auditChange(deleted[0].name, null),
      logoObjectPath: auditChange(deleted[0].logoObjectPath, null),
      logoUrl: auditChange(deleted[0].logoUrl, null),
    },
  });
  await cleanupManagedLogo(deleted[0]?.logoObjectPath, req);
  res.status(204).end();
});

router.get("/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const partner = await db.select().from(partnersTable).where(eq(partnersTable.id, id)).limit(1);
  if (!partner.length) {
    res.status(404).json({ error: "Partner not found" });
    return;
  }
  const stats = await db
    .select({
      totalTransactions: sql<number>`count(*)::int`,
      totalVolumeRub: sql<number>`coalesce(sum(${transactionsTable.amountRub}::numeric), 0)`,
    })
    .from(transactionsTable)
    .where(eq(transactionsTable.partnerId, id));

  res.json(formatPartner(partner[0], stats[0]));
});

router.patch("/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = UpdatePartnerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  const parsed = UpdatePartnerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  if (parsed.data.logoObjectPath && !isManagedLogoPath(parsed.data.logoObjectPath)) {
    res.status(400).json({ error: "Invalid logo object path" });
    return;
  }

  const { bonusMultiplier, logoObjectPath, ...rest } = parsed.data;
  const existing = await db
    .select()
    .from(partnersTable)
    .where(eq(partnersTable.id, params.data.id))
    .limit(1);
  if (!existing.length) {
    res.status(404).json({ error: "Partner not found" });
    return;
  }

  const values = {
    ...rest,
    ...(logoObjectPath
      ? { logoObjectPath, logoUrl: `/api/storage${logoObjectPath}` }
      : logoObjectPath === null
        ? { logoObjectPath: null, logoUrl: null }
        : {}),
    ...(bonusMultiplier === undefined ? {} : { bonusMultiplier: String(bonusMultiplier) }),
  };
  const updated = await db
    .update(partnersTable)
    .set(values)
    .where(eq(partnersTable.id, params.data.id))
    .returning();

  if (!updated.length) {
    res.status(404).json({ error: "Partner not found" });
    return;
  }

  const before = existing[0];
  const after = updated[0];
  const changes = {
    name: auditChange(before.name, after.name),
    category: auditChange(before.category, after.category),
    description: auditChange(before.description, after.description),
    logoUrl: auditChange(before.logoUrl, after.logoUrl),
    logoObjectPath: auditChange(before.logoObjectPath, after.logoObjectPath),
    bonusMultiplier: auditChange(Number(before.bonusMultiplier), Number(after.bonusMultiplier)),
    address: auditChange(before.address, after.address),
    city: auditChange(before.city, after.city),
    isActive: auditChange(before.isActive, after.isActive),
  };
  const changedFields = Object.fromEntries(
    Object.entries(changes).filter(([, change]) => change.from !== change.to),
  );
  await recordCatalogAudit(req, {
    entityType: "partner",
    entityId: after.id,
    entityName: after.name,
    action: "update",
    changes: changedFields,
  });

  if (existing[0].logoObjectPath !== updated[0].logoObjectPath) {
    await cleanupManagedLogo(existing[0].logoObjectPath, req);
  }

  res.json(formatPartner(updated[0]));
});

export default router;
