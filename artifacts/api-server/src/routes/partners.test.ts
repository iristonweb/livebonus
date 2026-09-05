import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test, { after, before } from "node:test";
import express from "express";
import { db } from "@workspace/db";
import { createToken } from "./auth.js";
import partnersRouter from "./partners.js";
import offersRouter from "./offers.js";
import transactionsRouter from "./transactions.js";
import dashboardRouter from "./dashboard.js";
import { ObjectStorageService } from "../lib/objectStorage.js";

type PartnerRow = {
  id: number;
  name: string;
  category: "food";
  description: string | null;
  logoUrl: string | null;
  logoObjectPath: string | null;
  bonusMultiplier: string;
  address: string | null;
  city: string | null;
  isActive: boolean;
};

type QueryStub = {
  from: (...args: unknown[]) => QueryStub;
  innerJoin: (...args: unknown[]) => QueryStub;
  values: (values: Record<string, unknown>) => QueryStub;
  where: (condition?: unknown) => QueryStub;
  orderBy: (...columns: unknown[]) => QueryStub;
  offset: (value: number) => QueryStub;
  leftJoin: (...args: unknown[]) => QueryStub;
  limit: (value?: number) => QueryStub;
  set: (values: Record<string, unknown>) => QueryStub;
  returning: () => QueryStub;
  then: Promise<unknown[]>["then"];
};

type DbStub = {
  select: () => QueryStub;
  insert: () => QueryStub;
  update: () => QueryStub;
  delete: () => QueryStub;
};

const mutableDb = db as unknown as DbStub;
const originalDbMethods = {
  select: mutableDb.select,
  insert: mutableDb.insert,
  update: mutableDb.update,
  delete: mutableDb.delete,
};
const originalDeleteObjectEntity = ObjectStorageService.prototype.deleteObjectEntity;
const originalListPartnerLogoObjectPaths = ObjectStorageService.prototype.listPartnerLogoObjectPaths;

let server: Server;
let baseUrl: string;
let deletedObjectPaths: string[];
let listedObjectPaths: string[];
let deleteObjectError: Error | undefined;
let updateValues: Record<string, unknown> | undefined;
let insertedValues: Record<string, unknown>[] = [];

const existingPartner: PartnerRow = {
  id: 42,
  name: "Старый партнёр",
  category: "food",
  description: null,
  logoUrl: "/api/storage/objects/old-logo",
  logoObjectPath: "/objects/old-logo",
  bonusMultiplier: "1.00",
  address: null,
  city: null,
  isActive: true,
};

const updatedPartner: PartnerRow = {
  ...existingPartner,
  name: "Новый партнёр",
  logoUrl: "/api/storage/objects/new-logo",
  logoObjectPath: "/objects/new-logo",
};

function queryStub(
  result: unknown[],
  onSet?: (values: Record<string, unknown>) => void,
  onWhere?: (condition: unknown, result: unknown[]) => unknown[],
): QueryStub {
  let currentResult = result;
  const query: QueryStub = {
    from: () => query,
    innerJoin: () => query,
    values: (values) => {
      onSet?.(values);
      return query;
    },
    where: (condition) => {
      currentResult = onWhere?.(condition, currentResult) ?? currentResult;
      return query;
    },
    orderBy: () => query,
    offset: () => query,
    leftJoin: () => query,
    limit: () => query,
    set: (values) => {
      onSet?.(values);
      return query;
    },
    returning: () => query,
    then: (onFulfilled, onRejected) => Promise.resolve(currentResult).then(onFulfilled, onRejected),
  };
  return query;
}

function configureDb({
  existing = [existingPartner],
  updated = [updatedPartner],
  deleted = [existingPartner],
  whereResult,
}: {
  existing?: unknown[];
  updated?: unknown[];
  deleted?: unknown[];
  whereResult?: unknown[];
} = {}): void {
  mutableDb.select = () => queryStub(existing, undefined, () => whereResult ?? existing);
  insertedValues = [];
  mutableDb.insert = () => queryStub([], (values) => { insertedValues.push(values); });
  updateValues = undefined;
  mutableDb.update = () => queryStub(updated, (values) => { updateValues = values; });
  mutableDb.delete = () => queryStub(deleted);
}

function configureSelectSequence(results: unknown[][]): void {
  let resultIndex = 0;
  mutableDb.select = () => queryStub(results[resultIndex++] ?? []);
}

function resetStorageSpy(): void {
  deletedObjectPaths = [];
  listedObjectPaths = [];
  deleteObjectError = undefined;
  ObjectStorageService.prototype.deleteObjectEntity = async function (objectPath: string) {
    deletedObjectPaths.push(objectPath);
    if (deleteObjectError) {
      throw deleteObjectError;
    }
  };
  ObjectStorageService.prototype.listPartnerLogoObjectPaths = async function () {
    return listedObjectPaths;
  };
}

function authHeaders(): Record<string, string> {
  return {
    authorization: `Bearer ${createToken({ userId: 7, isAdmin: true })}`,
    "content-type": "application/json",
  };
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...authHeaders(),
      ...init.headers,
    },
  });
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

before(async () => {
  process.env.DATABASE_URL ??= "postgres://localhost/partners-tests";
  process.env.NODE_ENV = "test";

  const app = express();
  app.use((req, _res, next) => {
    Object.defineProperty(req, "log", { value: { warn: () => undefined }, configurable: true });
    next();
  });
  app.use(express.json());
  app.use("/partners", partnersRouter);
  app.use("/offers", offersRouter);
  app.use("/transactions", transactionsRouter);
  app.use("/dashboard", dashboardRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  mutableDb.select = originalDbMethods.select;
  mutableDb.insert = originalDbMethods.insert;
  mutableDb.update = originalDbMethods.update;
  mutableDb.delete = originalDbMethods.delete;
  ObjectStorageService.prototype.deleteObjectEntity = originalDeleteObjectEntity;
  ObjectStorageService.prototype.listPartnerLogoObjectPaths = originalListPartnerLogoObjectPaths;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test("updates delete the old managed logo only after a successful partner update", async () => {
  configureDb();
  resetStorageSpy();

  const response = await request("/partners/42", {
    method: "PATCH",
    body: JSON.stringify({ name: "Новый партнёр", logoObjectPath: "/objects/new-logo" }),
  });

  assert.equal(response.status, 200);
  assert.equal((await responseJson(response)).logoObjectPath, "/objects/new-logo");
  assert.deepEqual(deletedObjectPaths, ["/objects/old-logo"]);

  configureDb({ updated: [] });
  resetStorageSpy();

  const unsuccessfulUpdate = await request("/partners/42", {
    method: "PATCH",
    body: JSON.stringify({ logoObjectPath: "/objects/new-logo" }),
  });

  assert.equal(unsuccessfulUpdate.status, 404);
  assert.deepEqual(deletedObjectPaths, []);
});

test("legacy logo URLs stay readable until an administrator explicitly clears them", async () => {
  const legacyPartner = {
    ...existingPartner,
    logoObjectPath: null,
    logoUrl: "https://legacy.example/logo.png",
  };
  configureDb({ existing: [legacyPartner] });
  resetStorageSpy();

  const beforeClear = await request("/partners/42");

  assert.equal(beforeClear.status, 200);
  assert.equal((await responseJson(beforeClear)).logoUrl, "https://legacy.example/logo.png");
  assert.deepEqual(deletedObjectPaths, []);
});

test("clearing a legacy logo removes it from the update and subsequent reads", async () => {
  const legacyPartner = {
    ...existingPartner,
    logoObjectPath: null,
    logoUrl: "https://legacy.example/logo.png",
  };
  const clearedPartner = {
    ...legacyPartner,
    logoUrl: null,
  };
  configureDb({ existing: [legacyPartner], updated: [clearedPartner] });
  resetStorageSpy();

  const updateResponse = await request("/partners/42", {
    method: "PATCH",
    body: JSON.stringify({ logoObjectPath: null }),
  });

  assert.equal(updateResponse.status, 200);
  const updatedBody = await responseJson(updateResponse);
  assert.equal(updatedBody.logoUrl, null);
  assert.equal(updatedBody.logoObjectPath, null);
  assert.deepEqual(updateValues, { logoObjectPath: null, logoUrl: null });
  assert.deepEqual(deletedObjectPaths, []);

  configureDb({ existing: [clearedPartner] });
  const readResponse = await request("/partners/42");

  assert.equal(readResponse.status, 200);
  const readBody = await responseJson(readResponse);
  assert.equal(readBody.logoUrl, null);
  assert.equal(readBody.logoObjectPath, null);
});

test("clearing a partner logo removes it from offer, transaction, and dashboard activity responses", async () => {
  const legacyPartner = {
    ...existingPartner,
    logoObjectPath: null,
    logoUrl: "https://legacy.example/logo.png",
  };
  const clearedPartner = {
    ...legacyPartner,
    logoUrl: null,
  };

  configureDb({ existing: [legacyPartner], updated: [clearedPartner] });
  resetStorageSpy();

  const clearResponse = await request("/partners/42", {
    method: "PATCH",
    body: JSON.stringify({ logoObjectPath: null }),
  });

  assert.equal(clearResponse.status, 200);
  assert.equal((await responseJson(clearResponse)).logoUrl, null);

  const offer = {
    id: 101,
    partnerId: 42,
    title: "Скидка партнёра",
    description: null,
    bonusMultiplier: "1.50",
    category: "food",
    minAmountRub: null,
    isActive: true,
    expiresAt: new Date("2026-12-31T00:00:00.000Z"),
    createdAt: new Date("2026-08-30T00:00:00.000Z"),
    updatedAt: new Date("2026-08-30T00:00:00.000Z"),
  };
  const transaction = {
    id: 202,
    userId: 7,
    partnerId: 42,
    type: "earn",
    category: "food",
    amountRub: "100.00",
    pointsEarned: 150,
    multiplier: "1.50",
    description: "Покупка у партнёра",
    createdAt: new Date("2026-08-30T12:00:00.000Z"),
  };

  configureSelectSequence([[offer], [clearedPartner], []]);
  const offersResponse = await request("/offers");
  assert.equal(offersResponse.status, 200);
  const offersBody = (await offersResponse.json()) as Array<Record<string, unknown>>;
  assert.equal(offersBody[0]?.partnerLogoUrl, null);

  configureSelectSequence([[transaction], [clearedPartner], []]);
  const transactionsResponse = await request("/transactions");
  assert.equal(transactionsResponse.status, 200);
  const transactionsBody = (await transactionsResponse.json()) as Array<Record<string, unknown>>;
  assert.equal(transactionsBody[0]?.partnerLogoUrl, null);

  configureSelectSequence([[transaction], [clearedPartner], []]);
  const dashboardResponse = await request("/dashboard/activity");
  assert.equal(dashboardResponse.status, 200);
  const dashboardBody = (await dashboardResponse.json()) as Array<Record<string, unknown>>;
  assert.equal(dashboardBody[0]?.partnerLogoUrl, null);
});

test("managed partner logos stay visible in offer list, detail, and saved-offer responses", async () => {
  const managedPartner = {
    ...existingPartner,
    logoUrl: "/api/storage/objects/legacy-logo",
    logoObjectPath: "/objects/partner-logos/active-logo",
  };
  const offer = {
    id: 101,
    partnerId: 42,
    title: "Скидка партнёра",
    description: null,
    bonusMultiplier: "1.50",
    category: "food",
    minAmountRub: null,
    isActive: true,
    expiresAt: new Date("2026-12-31T00:00:00.000Z"),
    createdAt: new Date("2026-08-30T00:00:00.000Z"),
    updatedAt: new Date("2026-08-30T00:00:00.000Z"),
  };
  const expectedLogoUrl = "/api/storage/objects/partner-logos/active-logo";

  configureSelectSequence([[offer], [managedPartner], []]);
  const listResponse = await request("/offers");
  assert.equal(listResponse.status, 200);
  const listBody = (await listResponse.json()) as Array<Record<string, unknown>>;
  assert.equal(listBody[0]?.partnerLogoUrl, expectedLogoUrl);

  configureSelectSequence([[offer], [managedPartner], []]);
  const detailResponse = await request("/offers/101");
  assert.equal(detailResponse.status, 200);
  assert.equal((await responseJson(detailResponse)).partnerLogoUrl, expectedLogoUrl);

  configureSelectSequence([[{ offer }], [managedPartner], []]);
  const savedResponse = await request("/offers/saved");
  assert.equal(savedResponse.status, 200);
  const savedBody = (await savedResponse.json()) as Array<Record<string, unknown>>;
  assert.equal(savedBody[0]?.partnerLogoUrl, expectedLogoUrl);
});

test("cleared partner logos stay hidden in offer detail and saved-offer responses", async () => {
  const legacyPartner = {
    ...existingPartner,
    logoObjectPath: null,
    logoUrl: "https://legacy.example/logo.png",
  };
  const clearedPartner = {
    ...legacyPartner,
    logoUrl: null,
  };
  const offer = {
    id: 101,
    partnerId: 42,
    title: "Скидка партнёра",
    description: null,
    bonusMultiplier: "1.50",
    category: "food",
    minAmountRub: null,
    isActive: true,
    expiresAt: new Date("2026-12-31T00:00:00.000Z"),
    createdAt: new Date("2026-08-30T00:00:00.000Z"),
    updatedAt: new Date("2026-08-30T00:00:00.000Z"),
  };

  configureSelectSequence([[offer], [legacyPartner], []]);
  const listBeforeClear = await request("/offers");
  assert.equal(listBeforeClear.status, 200);
  const listBeforeClearBody = (await listBeforeClear.json()) as Array<Record<string, unknown>>;
  assert.equal(listBeforeClearBody[0]?.partnerLogoUrl, legacyPartner.logoUrl);

  configureSelectSequence([[offer], [legacyPartner], []]);
  const detailBeforeClear = await request("/offers/101");
  assert.equal(detailBeforeClear.status, 200);
  assert.equal((await responseJson(detailBeforeClear)).partnerLogoUrl, legacyPartner.logoUrl);

  configureSelectSequence([[{ offer }], [legacyPartner], []]);
  const savedBeforeClear = await request("/offers/saved");
  assert.equal(savedBeforeClear.status, 200);
  const savedBeforeClearBody = (await savedBeforeClear.json()) as Array<Record<string, unknown>>;
  assert.equal(savedBeforeClearBody[0]?.partnerLogoUrl, legacyPartner.logoUrl);

  configureDb({ existing: [legacyPartner], updated: [clearedPartner] });
  resetStorageSpy();
  const clearResponse = await request("/partners/42", {
    method: "PATCH",
    body: JSON.stringify({ logoObjectPath: null }),
  });
  assert.equal(clearResponse.status, 200);
  assert.equal((await responseJson(clearResponse)).logoUrl, null);

  configureSelectSequence([[offer], [clearedPartner], []]);
  const detailAfterClear = await request("/offers/101");
  assert.equal(detailAfterClear.status, 200);
  assert.equal((await responseJson(detailAfterClear)).partnerLogoUrl, null);

  configureSelectSequence([[{ offer }], [clearedPartner], []]);
  const savedAfterClear = await request("/offers/saved");
  assert.equal(savedAfterClear.status, 200);
  const savedAfterClearBody = (await savedAfterClear.json()) as Array<Record<string, unknown>>;
  assert.equal(savedAfterClearBody[0]?.partnerLogoUrl, null);
});

test("deleting a partner removes its managed logo", async () => {
  configureDb();
  resetStorageSpy();

  const response = await request("/partners/42", { method: "DELETE" });

  assert.equal(response.status, 204);
  assert.deepEqual(deletedObjectPaths, ["/objects/old-logo"]);
});

test("legacy logo URLs are never sent to object storage deletion", async () => {
  configureDb({
    deleted: [{ ...existingPartner, logoObjectPath: null, logoUrl: "https://legacy.example/logo.png" }],
  });
  resetStorageSpy();

  const response = await request("/partners/42", { method: "DELETE" });

  assert.equal(response.status, 204);
  assert.deepEqual(deletedObjectPaths, []);
});

test("storage cleanup failures do not change a successful partner update response", async () => {
  configureDb();
  resetStorageSpy();
  deleteObjectError = new Error("storage unavailable");

  const response = await request("/partners/42", {
    method: "PATCH",
    body: JSON.stringify({ logoObjectPath: "/objects/new-logo" }),
  });

  assert.equal(response.status, 200);
  assert.equal((await responseJson(response)).logoObjectPath, "/objects/new-logo");
  assert.deepEqual(deletedObjectPaths, ["/objects/old-logo"]);
});

test("logo maintenance dry-run reports only unreferenced managed objects", async () => {
  configureDb({
    existing: [
      existingPartner,
      { ...existingPartner, id: 43, logoObjectPath: "/objects/partner-logos/kept-logo" },
    ],
  });
  resetStorageSpy();
  listedObjectPaths = [
    "/objects/partner-logos/kept-logo",
    "/objects/partner-logos/orphan-logo",
    "/objects/not-a-partner-logo",
  ];

  const response = await request("/partners/maintenance/cleanup-logos", {
    method: "POST",
    body: JSON.stringify({ dryRun: true }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await responseJson(response), {
    dryRun: true,
    scanned: 2,
    referenced: 1,
    orphaned: ["/objects/partner-logos/orphan-logo"],
    removed: [],
    failed: [],
  });
  assert.deepEqual(deletedObjectPaths, []);
  assert.deepEqual(insertedValues, [{
    adminUserId: 7,
    adminName: "Администратор #7",
    adminPhone: null,
    mode: "dry_run",
    scanned: 2,
    referenced: 1,
    orphanedPaths: ["/objects/partner-logos/orphan-logo"],
    removedPaths: [],
    failedPaths: [],
  }]);
});

test("logo maintenance removes only unreferenced managed objects when confirmed", async () => {
  configureDb({ existing: [{ ...existingPartner, logoObjectPath: null, logoUrl: "https://legacy.example/logo.png" }] });
  resetStorageSpy();
  listedObjectPaths = ["/objects/partner-logos/orphan-logo"];

  const response = await request("/partners/maintenance/cleanup-logos", {
    method: "POST",
    body: JSON.stringify({ dryRun: false }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await responseJson(response), {
    dryRun: false,
    scanned: 1,
    referenced: 0,
    orphaned: ["/objects/partner-logos/orphan-logo"],
    removed: ["/objects/partner-logos/orphan-logo"],
    failed: [],
  });
  assert.deepEqual(deletedObjectPaths, ["/objects/partner-logos/orphan-logo"]);
  assert.deepEqual(insertedValues, [{
    adminUserId: 7,
    adminName: "Администратор #7",
    adminPhone: null,
    mode: "confirmed",
    scanned: 1,
    referenced: 0,
    orphanedPaths: ["/objects/partner-logos/orphan-logo"],
    removedPaths: ["/objects/partner-logos/orphan-logo"],
    failedPaths: [],
  }]);
});

test("confirmed logo cleanup records failed storage deletions in history", async () => {
  configureDb({ existing: [{ ...existingPartner, logoObjectPath: null, logoUrl: "https://legacy.example/logo.png" }] });
  resetStorageSpy();
  listedObjectPaths = [
    "/objects/partner-logos/removed-logo",
    "/objects/partner-logos/failed-logo",
  ];
  deleteObjectError = new Error("storage unavailable");

  const response = await request("/partners/maintenance/cleanup-logos", {
    method: "POST",
    body: JSON.stringify({ dryRun: false }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await responseJson(response), {
    dryRun: false,
    scanned: 2,
    referenced: 0,
    orphaned: [
      "/objects/partner-logos/removed-logo",
      "/objects/partner-logos/failed-logo",
    ],
    removed: [],
    failed: [
      { path: "/objects/partner-logos/removed-logo", error: "storage unavailable" },
      { path: "/objects/partner-logos/failed-logo", error: "storage unavailable" },
    ],
  });
  assert.deepEqual(insertedValues, [{
    adminUserId: 7,
    adminName: "Администратор #7",
    adminPhone: null,
    mode: "confirmed",
    scanned: 2,
    referenced: 0,
    orphanedPaths: [
      "/objects/partner-logos/removed-logo",
      "/objects/partner-logos/failed-logo",
    ],
    removedPaths: [],
    failedPaths: [
      { path: "/objects/partner-logos/removed-logo", error: "storage unavailable" },
      { path: "/objects/partner-logos/failed-logo", error: "storage unavailable" },
    ],
  }]);
});

test("logo cleanup history is admin-only, ordered newest first, and read-only", async () => {
  const historyRow = {
    id: 2,
    adminUserId: 7,
    adminName: "Администратор",
    adminPhone: "+79990000000",
    mode: "confirmed",
    scanned: 4,
    referenced: 2,
    orphanedPaths: ["/objects/partner-logos/orphan.svg"],
    removedPaths: [],
    failedPaths: [{ path: "/objects/partner-logos/orphan.svg", error: "storage unavailable" }],
    createdAt: new Date("2026-08-31T12:30:00.000Z"),
  };
  configureDb({ existing: [historyRow] });

  const response = await request("/partners/maintenance/cleanup-logos/history?limit=10");

  assert.equal(response.status, 200);
  assert.deepEqual(await responseJson(response), [{
    id: 2,
    adminUserId: 7,
    adminName: "Администратор",
    adminPhone: "+79990000000",
    mode: "confirmed",
    scanned: 4,
    referenced: 2,
    orphaned: ["/objects/partner-logos/orphan.svg"],
    removed: [],
    failed: [{ path: "/objects/partner-logos/orphan.svg", error: "storage unavailable" }],
    createdAt: "2026-08-31T12:30:00.000Z",
  }]);
  assert.deepEqual(insertedValues, []);

  const nonAdminResponse = await request("/partners/maintenance/cleanup-logos/history", {
    headers: {
      authorization: `Bearer ${createToken({ userId: 8, isAdmin: false })}`,
    },
  });
  assert.equal(nonAdminResponse.status, 403);
});

test("logo cleanup history can return only runs with failed deletions", async () => {
  const failedHistoryRow = {
    id: 2,
    adminUserId: 7,
    adminName: "Администратор с ошибкой",
    adminPhone: null,
    mode: "confirmed",
    scanned: 2,
    referenced: 0,
    orphanedPaths: ["/objects/partner-logos/unavailable.svg"],
    removedPaths: [],
    failedPaths: [{ path: "/objects/partner-logos/unavailable.svg", error: "storage unavailable" }],
    createdAt: new Date("2026-08-31T12:30:00.000Z"),
  };
  const cleanHistoryRow = {
    id: 1,
    adminUserId: 7,
    adminName: "Администратор без ошибок",
    adminPhone: null,
    mode: "dry_run",
    scanned: 1,
    referenced: 1,
    orphanedPaths: [],
    removedPaths: [],
    failedPaths: [],
    createdAt: new Date("2026-08-30T12:30:00.000Z"),
  };

  configureDb({ existing: [failedHistoryRow, cleanHistoryRow] });
  const allResponse = await request("/partners/maintenance/cleanup-logos/history?status=all");
  assert.equal(allResponse.status, 200);
  const allHistory = (await allResponse.json()) as Array<{ id: number }>;
  assert.deepEqual(allHistory.map((row) => row.id), [2, 1]);

  configureDb({ existing: [failedHistoryRow, cleanHistoryRow], whereResult: [failedHistoryRow] });
  const failedResponse = await request("/partners/maintenance/cleanup-logos/history?status=failed");
  assert.equal(failedResponse.status, 200);
  const failedHistory = (await failedResponse.json()) as Array<{ id: number }>;
  assert.deepEqual(failedHistory.map((row) => row.id), [2]);
  assert.deepEqual(insertedValues, []);
});
