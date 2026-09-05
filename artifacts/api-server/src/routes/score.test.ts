import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test, { after, before, beforeEach } from "node:test";
import express from "express";
import { createHash } from "node:crypto";
import {
  db,
  leasesTable,
  livePassportSharesTable,
  scoreEventsTable,
  usersTable,
} from "@workspace/db";
import scoreRouter from "./score.js";
import { createToken } from "./auth.js";
import { calculateScore, sortScoreEvents } from "../lib/score.js";

type QueryStub = {
  from: (table: unknown) => QueryStub;
  values: (values: Record<string, unknown>) => QueryStub;
  where: (condition?: unknown) => QueryStub;
  orderBy: (...columns: unknown[]) => QueryStub;
  execute: () => Promise<unknown>;
  limit: () => Promise<unknown[]>;
  set: (values: Record<string, unknown>) => QueryStub;
  returning: () => Promise<unknown[]>;
  then: Promise<unknown[]>["then"];
};

type DbStub = {
  select: (...fields: unknown[]) => QueryStub;
  insert: () => QueryStub;
  update: () => QueryStub;
  transaction: <T>(callback: (transaction: DbStub) => Promise<T>) => Promise<T>;
};

const mutableDb = db as unknown as DbStub;
const originalDbMethods = {
  select: mutableDb.select,
  insert: mutableDb.insert,
  update: mutableDb.update,
  transaction: mutableDb.transaction,
};

const user = {
  id: 1,
  phone: "+79990000001",
  name: "Private test user",
  email: "private@example.com",
  isPhoneVerified: true,
  isIdentityVerified: true,
  isIncomeVerified: false,
};

const events = [{ id: 4, userId: 1, eventType: "payment_on_time", scoreChange: 220, description: "private event", createdAt: new Date() }];
const leases = [{
  id: 9,
  userId: 1,
  address: "ул. Private, 9",
  monthlyRentRub: 120_000,
  startDate: new Date("2025-01-01T00:00:00.000Z"),
  endDate: new Date("2025-12-31T00:00:00.000Z"),
  isActive: false,
  onTimePayments: 10,
  latePayments: 2,
}];

let shares: Array<Record<string, unknown>>;
let insertedHashes: string[];
let auditActions: string[];

function findValues(value: unknown, seen = new Set<object>()): unknown[] {
  if (!value || typeof value !== "object" || seen.has(value)) return [];
  seen.add(value);
  if (value.constructor?.name === "Param" && "value" in value) return [(value as { value: unknown }).value];
  if ("queryChunks" in value && Array.isArray(value.queryChunks)) {
    return value.queryChunks.flatMap((chunk) => findValues(chunk, seen));
  }
  return [];
}

function queryStub(projected = false): QueryStub {
  let result: unknown[] = [];
  let table: unknown;
  const query: QueryStub = {
    from: (nextTable) => {
      table = nextTable;
      if (nextTable === usersTable) result = [user];
      else if (nextTable === scoreEventsTable) result = events;
      else if (nextTable === leasesTable) result = leases;
      else if (nextTable === livePassportSharesTable) result = shares;
      else result = [];
      return query;
    },
    values: (values) => {
      if ("tokenHash" in values) {
        insertedHashes.push(String(values.tokenHash));
        const share = {
          id: shares.length + 1,
          userId: 1,
          tokenHash: values.tokenHash,
          expiresAt: values.expiresAt,
          revokedAt: null,
          createdAt: new Date(),
          lastAccessedAt: null,
        };
        shares.push(share);
        result = [share];
      }
      if (values.action) auditActions.push(String(values.action));
      return query;
    },
    where: (condition) => {
      if (table === livePassportSharesTable) {
        const values = findValues(condition);
        const hash = values.find((value) => typeof value === "string" && value.length === 64);
        const id = values.find((value) => typeof value === "number");
        result = shares.filter((share) => {
          if (hash) return share.tokenHash === hash && !share.revokedAt && (share.expiresAt as Date).getTime() > Date.now();
          if (projected) return !share.revokedAt && (share.expiresAt as Date).getTime() > Date.now();
          if (id !== undefined) return share.id === id;
          return true;
        });
      }
      return query;
    },
    orderBy: () => query,
    execute: async () => [],
    limit: async () => result,
    set: (values) => {
      const id = findValues(values).find((value) => typeof value === "number");
      for (const share of shares) {
        if (id === undefined || share.id === id) Object.assign(share, values);
      }
      return query;
    },
    returning: async () => result,
    then: (onFulfilled, onRejected) => Promise.resolve(result).then(onFulfilled, onRejected),
  };
  return query;
}

function configureDb() {
  shares = [];
  insertedHashes = [];
  auditActions = [];
  mutableDb.select = (...fields) => queryStub(fields.length > 0);
  mutableDb.insert = () => queryStub();
  mutableDb.update = () => queryStub();
  mutableDb.transaction = async (callback) => callback(mutableDb);
}

let server: Server;
let baseUrl: string;
const authHeaders = { authorization: `Bearer ${createToken({ userId: 1 })}` };

async function request(path: string, init: RequestInit = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", ...init.headers },
  });
}

before(async () => {
  configureDb();
  const app = express();
  app.use(express.json());
  app.use("/score", scoreRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(configureDb);

after(async () => {
  mutableDb.select = originalDbMethods.select;
  mutableDb.insert = originalDbMethods.insert;
  mutableDb.update = originalDbMethods.update;
  mutableDb.transaction = originalDbMethods.transaction;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("management requires the current session and creates hashed unpredictable links", async () => {
  assert.equal((await request("/score/passport/shares")).status, 401);

  const response = await request("/score/passport/shares", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ expiresInDays: 3 }),
  });
  assert.equal(response.status, 201);
  const body = await response.json() as Record<string, unknown>;
  assert.match(String(body.token), /^[A-Za-z0-9_-]{40,80}$/);
  assert.notEqual(body.token, "1");
  assert.equal(insertedHashes.length, 1);
  assert.match(insertedHashes[0]!, /^[a-f0-9]{64}$/);
  assert.notEqual(insertedHashes[0], body.token);
  assert.deepEqual(auditActions, ["created"]);
});

test("unknown, expired, revoked, and numeric tokens have the same safe response", async () => {
  const tokens = ["1", "bad-token", "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"];
  for (const token of tokens) {
    const response = await request(`/score/passport/${token}`);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "Passport unavailable", code: "PASSPORT_UNAVAILABLE" });
  }

  const createResponse = await request("/score/passport/shares", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ expiresInDays: 1 }),
  });
  const token = String((await createResponse.json() as { token: string }).token);

  shares[0]!.expiresAt = new Date(Date.now() - 1);
  assert.equal((await request(`/score/passport/${token}`)).status, 404);
  shares[0]!.expiresAt = new Date(Date.now() + 86_400_000);
  shares[0]!.revokedAt = new Date();
  assert.equal((await request(`/score/passport/${token}`)).status, 404);
});

test("public DTO is minimized and revoke is owner-scoped", async () => {
  const createResponse = await request("/score/passport/shares", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ expiresInDays: 7 }),
  });
  const created = await createResponse.json() as { id: number; token: string };
  const publicResponse = await request(`/score/passport/${created.token}`);
  assert.equal(publicResponse.status, 200);
  const publicBody = await publicResponse.json() as Record<string, unknown>;
  assert.deepEqual(Object.keys(publicBody).sort(), [
    "activeLeases", "baseScore", "categoryScore", "components", "generatedAt", "isIdentityVerified",
    "isIncomeVerified", "isPhoneVerified", "score", "tier", "tierLabel",
    "scoreVersion", "totalLatePayments", "totalLeases", "totalOnTimePayments", "totalTenureMonths",
    "completedLeases",
  ].sort());
  assert.equal("name" in publicBody, false);
  assert.equal("email" in publicBody, false);
  assert.equal("monthlyRentRub" in publicBody, false);
  assert.equal("address" in publicBody, false);
  assert.equal("token" in publicBody, false);
  assert.ok(Array.isArray(publicBody.components));
  assert.deepEqual(auditActions, ["created", "read"]);

  const revokeResponse = await request(`/score/passport/shares/${created.id}/revoke`, {
    method: "POST",
    headers: authHeaders,
  });
  assert.equal(revokeResponse.status, 200);
  assert.equal((await request(`/score/passport/${created.token}`)).status, 404);
  assert.deepEqual(auditActions, ["created", "read", "revoked"]);
});

test("invalid expiry and active-share limit are enforced", async () => {
  for (const expiresInDays of [0, 31, 1.5]) {
    const response = await request("/score/passport/shares", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ expiresInDays }),
    });
    assert.equal(response.status, 400);
  }
  for (let index = 0; index < 3; index += 1) {
    const response = await request("/score/passport/shares", {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ expiresInDays: 1 }),
    });
    assert.equal(response.status, 201);
  }
  const limited = await request("/score/passport/shares", {
    method: "POST",
    headers: authHeaders,
    body: JSON.stringify({ expiresInDays: 1 }),
  });
  assert.equal(limited.status, 409);
  assert.deepEqual(await limited.json(), {
    error: "Too many active passport links",
    code: "ACTIVE_SHARE_LIMIT",
    limit: 3,
  });
});

test("score model is deterministic, caps each category, and clamps the final range", () => {
  const scoreUser = {
    isPhoneVerified: false,
    isIdentityVerified: false,
    isIncomeVerified: false,
  };
  const events = [
    { id: 2, userId: 1, eventType: "payment_on_time", scoreChange: 900, description: "many payments", relatedLeaseId: null, idempotencyKey: null, createdAt: new Date("2026-01-01T00:00:00.000Z") },
    { id: 3, userId: 1, eventType: "payment_late", scoreChange: -900, description: "late payments", relatedLeaseId: null, idempotencyKey: null, createdAt: new Date("2026-01-02T00:00:00.000Z") },
    { id: 4, userId: 1, eventType: "dispute_opened", scoreChange: -1000, description: "dispute", relatedLeaseId: null, idempotencyKey: null, createdAt: new Date("2026-01-03T00:00:00.000Z") },
  ];
  const first = calculateScore(scoreUser, events);
  const second = calculateScore(scoreUser, [...events]);
  assert.equal(first.score, 400);
  assert.equal(first.components.find((component) => component.key === "payment_history")?.score, 0);
  assert.equal(first.components.find((component) => component.key === "disputes")?.score, -100);
  assert.deepEqual(first, second);
  assert.ok(first.score >= 0 && first.score <= 1000);
  const minimum = calculateScore(scoreUser, [
    ...events,
    { id: 5, userId: 1, eventType: "lease_started", scoreChange: -900, description: "tenure penalty", relatedLeaseId: null, idempotencyKey: null, createdAt: new Date("2026-01-04T00:00:00.000Z") },
    { id: 6, userId: 1, eventType: "landlord_review", scoreChange: -900, description: "review penalty", relatedLeaseId: null, idempotencyKey: null, createdAt: new Date("2026-01-05T00:00:00.000Z") },
  ]);
  assert.equal(minimum.score, 0);
  const maximum = calculateScore(scoreUser, [
    { id: 10, userId: 1, eventType: "payment_on_time", scoreChange: 900, description: "payments", relatedLeaseId: null, idempotencyKey: null, createdAt: new Date("2026-01-01T00:00:00.000Z") },
    { id: 11, userId: 1, eventType: "lease_started", scoreChange: 900, description: "tenure", relatedLeaseId: null, idempotencyKey: null, createdAt: new Date("2026-01-02T00:00:00.000Z") },
    { id: 12, userId: 1, eventType: "landlord_review", scoreChange: 900, description: "review", relatedLeaseId: null, idempotencyKey: null, createdAt: new Date("2026-01-03T00:00:00.000Z") },
    { id: 13, userId: 1, eventType: "no_disputes", scoreChange: 900, description: "clean", relatedLeaseId: null, idempotencyKey: null, createdAt: new Date("2026-01-04T00:00:00.000Z") },
  ]);
  assert.equal(maximum.score, 1000);
});

test("score event ordering uses id as a stable tie breaker", () => {
  const timestamp = new Date("2026-01-01T00:00:00.000Z");
  const ordered = sortScoreEvents([
    { id: 7, createdAt: timestamp },
    { id: 2, createdAt: timestamp },
  ]);
  assert.deepEqual(ordered.map((event) => event.id), [2, 7]);
});