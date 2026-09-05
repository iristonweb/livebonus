import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { after, before, test } from "node:test";
import { asc, eq, inArray } from "drizzle-orm";
import {
  db,
  financialBalanceReconciliationsTable,
  financialDealParticipantsTable,
  financialDealsTable,
  financialLedgerEntriesTable,
  financialPoliciesTable,
  leasesTable,
  pool,
  transactionsTable,
  usersTable,
} from "@workspace/db";

const port = 8099;
const providerPort = 8100;
const baseUrl = `http://127.0.0.1:${port}/api`;
let server: ChildProcess;
let providerServer: Server;

type StubPayment = {
  id: string;
  key: string;
  amount: string;
  status: "pending" | "waiting_for_capture" | "succeeded" | "canceled";
  paymentMethod: "sbp" | "mir_pay";
};

const payments = new Map<string, StubPayment>();
const paymentCreateAttempts = new Map<string, number>();
const paymentLookupAttempts = new Map<string, number>();
const refundAttempts = new Map<string, number>();
const refundRequests: Array<{ key: string; paymentId: string; amount: string }> = [];

async function readRequestBody(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) as Record<string, unknown> : {};
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

function headerValue(request: IncomingMessage, name: string): string {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

async function handleProviderRequest(request: IncomingMessage, response: ServerResponse) {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${providerPort}`);
  const key = headerValue(request, "idempotence-key");

  if (request.method === "POST" && url.pathname === "/v3/payments") {
    paymentCreateAttempts.set(key, (paymentCreateAttempts.get(key) ?? 0) + 1);
    if (key.includes("provider-error")) {
      sendJson(response, 500, { description: "stub provider refused checkout" });
      return;
    }
    const body = await readRequestBody(request);
    const amount = (body.amount as { value?: unknown } | undefined)?.value;
    const paymentMethod = (body.payment_method_data as { type?: unknown } | undefined)?.type;
    if (paymentMethod !== "sbp" && paymentMethod !== "mir_pay") {
      sendJson(response, 400, { description: "stub provider requires an explicit payment method" });
      return;
    }
    const payment: StubPayment = {
      id: `payment-${key}`,
      key,
      amount: typeof amount === "string" ? amount : "0.00",
      status: key.includes("cancelled") ? "canceled" : "pending",
      paymentMethod,
    };
    payments.set(payment.id, payment);
    sendJson(response, 200, {
      id: payment.id,
      status: payment.status,
      amount: { value: payment.amount, currency: "RUB" },
      confirmation: { confirmation_url: `https://stub.example/pay/${payment.id}` },
      metadata: { dealId: "stub", userId: "1" },
      ...(payment.status === "canceled"
        ? { cancellation_details: { reason: "stub_user_cancelled" } }
        : {}),
    });
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/v3/payments/")) {
    const paymentId = decodeURIComponent(url.pathname.slice("/v3/payments/".length));
    paymentLookupAttempts.set(paymentId, (paymentLookupAttempts.get(paymentId) ?? 0) + 1);
    const payment = payments.get(paymentId);
    if (!payment) {
      sendJson(response, 404, { description: "stub payment not found" });
      return;
    }
    const shouldSucceed = payment.key.includes("complete")
      || payment.key.includes("mismatch")
      || payment.key.includes("webhook")
      || payment.key.includes("refund");
    const status = payment.key.includes("waiting")
      ? "waiting_for_capture"
      : payment.key.includes("cancelled")
        ? "canceled"
        : shouldSucceed
          ? "succeeded"
          : "pending";
    const amount = payment.key.includes("mismatch") && !payment.key.includes("currency-mismatch")
      ? "99.00"
      : payment.amount;
    const currency = payment.key.includes("currency-mismatch") ? "USD" : "RUB";
    sendJson(response, 200, {
      id: payment.id,
      status,
      amount: { value: amount, currency },
      metadata: { dealId: "stub", userId: "1" },
      ...(status === "canceled"
        ? { cancellation_details: { reason: "stub_user_cancelled" } }
        : {}),
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/v3/refunds") {
    if (key.includes("refund-error")) {
      sendJson(response, 500, { description: "stub provider refused refund" });
      return;
    }
    const body = await readRequestBody(request);
    const paymentId = typeof body.payment_id === "string" ? body.payment_id : "";
    const amount = (body.amount as { value?: unknown } | undefined)?.value;
    const attempt = (refundAttempts.get(key) ?? 0) + 1;
    refundAttempts.set(key, attempt);
    refundRequests.push({
      key,
      paymentId,
      amount: typeof amount === "string" ? amount : "0.00",
    });
    const status = key.includes("refund-pending") && attempt === 1
      ? "pending"
      : "succeeded";
    sendJson(response, 200, {
      id: `refund-${key}`,
      status,
      payment_id: paymentId,
    });
    return;
  }

  sendJson(response, 404, { description: "stub route not found" });
}

async function request(path: string, init?: RequestInit) {
  // Protected API calls are authenticated by default. Tests that intentionally
  // exercise unauthenticated behavior pass an explicit headers object.
  if (init?.headers !== undefined) return fetch(`${baseUrl}${path}`, init);
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: tokenHeaders(1, false),
  });
}

function adminHeaders(): Record<string, string> {
  return tokenHeaders(1, true);
}

function tokenHeaders(userId: number, isAdmin: boolean): Record<string, string> {
  const secret = process.env.SESSION_SECRET?.trim() || "dev-secret-change-in-prod";
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const sid = randomUUID();
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const body = Buffer.from(JSON.stringify({ userId, isAdmin, sid, exp, iat: Date.now() })).toString("base64url");
  const signature = createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return { authorization: `Bearer ${header}.${body}.${signature}` };
}

async function json<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (quoted) {
      if (character === "\"") {
        if (text[index + 1] === "\"") {
          cell += "\"";
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (character === "\"" && cell.length === 0) {
      quoted = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (character !== "\r") {
      cell += character;
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

type UserBalance = {
  pointsBalance: number;
  bonusBalanceRub: number;
};

type LedgerEntry = {
  id: number;
  dealId: number;
  entryType: string;
  source: string;
  amountRub: number;
  reversalOfId: number | null;
  settlementStatus: string | null;
};

type ReconciliationFixture = {
  id: number;
  status: "consistent" | "rounding_difference" | "mismatch" | "unmigrated";
};

const reconciliationFixtureUserIds: number[] = [];
const reconciliationExportFixtureUserIds: number[] = [];
const legacyWriteFixtureUserIds: number[] = [];
const rentalFixtureUserIds: number[] = [];
const rentalFixtureLeaseIds: number[] = [];
const paymentQueueFixtureUserIds: number[] = [];
const paymentQueueFixtureDealIds: number[] = [];

async function createReconciliationFixtures(): Promise<ReconciliationFixture[]> {
  const suffix = randomUUID();
  const users = await db
    .insert(usersTable)
    .values([
      {
        phone: `+7999${suffix.replace(/\D/g, "").slice(-8)}`,
        name: "Reconciliation consistent fixture",
        pointsBalance: 100,
        bonusBalanceRub: "80.00",
      },
      {
        phone: `+7888${suffix.replace(/\D/g, "").slice(-8)}`,
        name: "Reconciliation rounding fixture",
        pointsBalance: 125,
        bonusBalanceRub: "100.40",
      },
      {
        phone: `+7777${suffix.replace(/\D/g, "").slice(-8)}`,
        name: "Reconciliation mismatch fixture",
        pointsBalance: 125,
        bonusBalanceRub: "100.41",
      },
      {
        phone: `+7666${suffix.replace(/\D/g, "").slice(-8)}`,
        name: "Reconciliation unmigrated fixture",
        pointsBalance: 125,
        bonusBalanceRub: null,
      },
    ])
    .returning({ id: usersTable.id, name: usersTable.name });

  reconciliationFixtureUserIds.push(...users.map((user) => user.id));
  const statusByName = new Map([
    ["Reconciliation consistent fixture", "consistent" as const],
    ["Reconciliation rounding fixture", "rounding_difference" as const],
    ["Reconciliation mismatch fixture", "mismatch" as const],
    ["Reconciliation unmigrated fixture", "unmigrated" as const],
  ]);
  return users.map((user) => ({
    id: user.id,
    status: statusByName.get(user.name) as ReconciliationFixture["status"],
  }));
}

async function getUserBalance(userId = 1): Promise<UserBalance> {
  const response = await request("/users/me", { headers: tokenHeaders(userId, false) });
  assert.equal(response.status, 200);
  return json<UserBalance>(response);
}

async function getDashboardBalance(userId = 1) {
  const response = await request("/dashboard/summary", { headers: tokenHeaders(userId, false) });
  assert.equal(response.status, 200);
  return json<{
    pointsBalance: number;
    bonusBalanceRub: number;
    rubEquivalent: number;
  }>(response);
}

async function getLedger(): Promise<LedgerEntry[]> {
  const response = await request("/finance/ledger?limit=100", { headers: tokenHeaders(1, false) });
  assert.equal(response.status, 200);
  return json<LedgerEntry[]>(response);
}

async function getFinancialSnapshot() {
  const [balance, ledger] = await Promise.all([getUserBalance(), getLedger()]);
  return {
    balance,
    ledger: ledger.map(({ id, dealId, entryType, source, amountRub, reversalOfId, settlementStatus }) => ({
      id,
      dealId,
      entryType,
      source,
      amountRub,
      reversalOfId,
      settlementStatus,
    })),
  };
}

async function createLegacyTransaction(
  type: "earn" | "expire",
  pointsEarned: number,
  amountRub: number,
  userId = 1,
) {
  return request("/transactions", {
    method: "POST",
    headers: { ...tokenHeaders(userId, true), "content-type": "application/json" },
    body: JSON.stringify({
      type,
      category: "other",
      amountRub,
      pointsEarned,
      description: `integration legacy transaction ${randomUUID()}`,
      userId,
    }),
  });
}

async function settle(key: string, grossAmountRub = 100, requestedBonusRub = 15) {
  return request("/finance/test/purchases/settle", {
    method: "POST",
    headers: { ...tokenHeaders(1, true), "content-type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({ grossAmountRub, requestedBonusRub, partnerId: 1 }),
  });
}

async function checkout(
  key: string,
  paymentMethod: "sbp" | "mir_pay" = "mir_pay",
  grossAmountRub = 100,
  requestedBonusRub = 15,
) {
  return request("/finance/purchases/checkout", {
    method: "POST",
    headers: { ...tokenHeaders(1, false), "content-type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({
      grossAmountRub,
      requestedBonusRub,
      partnerId: 1,
      paymentMethod,
    }),
  });
}

async function refund(dealId: number, key: string) {
  return request(`/finance/deals/${dealId}/refund`, {
    method: "POST",
    headers: { ...adminHeaders(), "content-type": "application/json", "Idempotency-Key": key },
    body: "{}",
  });
}

async function rentalCheckout(userId: number, leaseId: number, key: string, grossAmountRub = 10_000) {
  return request("/finance/rentals/checkout", {
    method: "POST",
    headers: {
      ...tokenHeaders(userId, false),
      "content-type": "application/json",
      "Idempotency-Key": key,
    },
    body: JSON.stringify({ leaseId, grossAmountRub, paymentMethod: "mir_pay" }),
  });
}

function trustedWebhookHeaders(): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-forwarded-for": "185.71.76.1",
  };
}

async function createRentalFixture() {
  const suffix = randomUUID().replace(/\D/g, "").slice(-8);
  const [tenant, landlord] = await db
    .insert(usersTable)
    .values([
      {
        phone: `+7333${suffix}`,
        name: "Rental payment tenant fixture",
        pointsBalance: 0,
        bonusBalanceRub: "0.00",
      },
      {
        phone: `+7222${suffix}`,
        name: "Rental payment landlord fixture",
        pointsBalance: 0,
        bonusBalanceRub: "0.00",
      },
    ])
    .returning({ id: usersTable.id });
  const [lease] = await db
    .insert(leasesTable)
    .values({
      userId: tenant.id,
      landlordUserId: landlord.id,
      address: `Rental payment fixture ${suffix}`,
      city: "Москва",
      landlordName: "Rental payment landlord fixture",
      monthlyRentRub: "10000.00",
      isActive: true,
    })
    .returning({ id: leasesTable.id });
  rentalFixtureUserIds.push(tenant.id, landlord.id);
  rentalFixtureLeaseIds.push(lease.id);
  return { tenantId: tenant.id, landlordId: landlord.id, leaseId: lease.id };
}

before(async () => {
  providerServer = createServer((request, response) => {
    void handleProviderRequest(request, response).catch((error: unknown) => {
      sendJson(response, 500, { description: error instanceof Error ? error.message : "stub error" });
    });
  });
  await new Promise<void>((resolve, reject) => {
    providerServer.once("error", reject);
    providerServer.listen(providerPort, "127.0.0.1", () => resolve());
  });

  server = spawn("node", ["--enable-source-maps", "dist/index.mjs"], {
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: String(port),
      YOOKASSA_API_URL: `http://127.0.0.1:${providerPort}/v3`,
      YOOKASSA_SHOP_ID: "integration-test-shop",
      YOOKASSA_SECRET_KEY: "integration-test-key",
    },
    stdio: "ignore",
  });

  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await request("/healthz")).ok) return;
    } catch {
      // The API can take a few seconds to build its initial demo data.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Finance integration API did not start");
});

after(async () => {
  if (rentalFixtureUserIds.length > 0) {
    const rentalDeals = await db
      .select({ id: financialDealsTable.id })
      .from(financialDealsTable)
      .where(inArray(financialDealsTable.userId, rentalFixtureUserIds));
    const rentalDealIds = rentalDeals.map((deal) => deal.id);
    if (rentalDealIds.length > 0) {
      await db.delete(financialLedgerEntriesTable).where(inArray(financialLedgerEntriesTable.dealId, rentalDealIds));
      await db.delete(financialDealParticipantsTable).where(inArray(financialDealParticipantsTable.dealId, rentalDealIds));
      await db.delete(transactionsTable).where(inArray(transactionsTable.userId, rentalFixtureUserIds));
      await db.delete(financialDealsTable).where(inArray(financialDealsTable.id, rentalDealIds));
    }
    if (rentalFixtureLeaseIds.length > 0) {
      await db.delete(leasesTable).where(inArray(leasesTable.id, rentalFixtureLeaseIds));
    }
    await db.delete(usersTable).where(inArray(usersTable.id, rentalFixtureUserIds));
  }
  if (legacyWriteFixtureUserIds.length > 0) {
    await db.delete(transactionsTable).where(inArray(transactionsTable.userId, legacyWriteFixtureUserIds));
    await db.delete(usersTable).where(inArray(usersTable.id, legacyWriteFixtureUserIds));
  }
  if (reconciliationFixtureUserIds.length > 0) {
    await db
      .delete(financialBalanceReconciliationsTable)
      .where(inArray(financialBalanceReconciliationsTable.userId, reconciliationFixtureUserIds));
    await db.delete(usersTable).where(inArray(usersTable.id, reconciliationFixtureUserIds));
  }
  if (reconciliationExportFixtureUserIds.length > 0) {
    await db
      .delete(financialBalanceReconciliationsTable)
      .where(inArray(financialBalanceReconciliationsTable.userId, reconciliationExportFixtureUserIds));
    await db.delete(usersTable).where(inArray(usersTable.id, reconciliationExportFixtureUserIds));
  }
  if (paymentQueueFixtureDealIds.length > 0) {
    await db.delete(financialDealsTable).where(inArray(financialDealsTable.id, paymentQueueFixtureDealIds));
  }
  if (paymentQueueFixtureUserIds.length > 0) {
    await db.delete(usersTable).where(inArray(usersTable.id, paymentQueueFixtureUserIds));
  }
  server.kill("SIGTERM");
  providerServer.close();
  await pool.end();
});

test("empty payment reconciliation summary reports no last-updated timestamp", async () => {
  const response = await request("/finance/payment-reconciliation?status=payment_failed", {
    headers: adminHeaders(),
  });
  assert.equal(response.status, 200);
  const payload = await json<{
    items: unknown[];
    summary: {
      confirmedAwaitingReconciliation: number;
      confirmedAwaitingReconciliationLastUpdatedAt: string | null;
    };
  }>(response);
  assert.deepEqual(payload.items, []);
  assert.equal(payload.summary.confirmedAwaitingReconciliation, 0);
  assert.equal(payload.summary.confirmedAwaitingReconciliationLastUpdatedAt, null);
});

test("public settlement routes reject provider bypasses", async () => {
  const purchase = await request("/finance/purchases/settle", { method: "POST", body: "{}" });
  const rental = await request("/finance/rentals/settle", { method: "POST", body: "{}" });
  assert.equal(purchase.status, 410);
  assert.equal(rental.status, 410);
});

test("refund requires administrator authorization", async () => {
  const key = `refund-admin-${randomUUID()}`;
  const settled = await settle(key);
  assert.equal(settled.status, 201);
  const payload = await json<{ deal: { id: number } }>(settled);
  const denied = await request(`/finance/deals/${payload.deal.id}/refund`, {
    method: "POST",
    headers: { ...tokenHeaders(1, false), "content-type": "application/json", "Idempotency-Key": `${key}-denied` },
    body: "{}",
  });
  assert.equal(denied.status, 403);
  const cleanup = await refund(payload.deal.id, `${key}-cleanup`);
  assert.equal(cleanup.status, 201);
});

test("payment reconciliation counts stay aligned with each filtered queue state", async () => {
  type QueueStatus = "pending" | "payment_failed" | "cancelled";
  type QueueItem = { id: number; status: QueueStatus; needsReview: boolean };
  type QueueSummary = {
    total: number;
    pending: number;
    paymentFailed: number;
    cancelled: number;
    requiresReview: number;
  };
  type QueuePayload = {
    items: QueueItem[];
    summary: QueueSummary;
    status: string;
  };

  const readQueue = async (status: "all" | QueueStatus): Promise<QueuePayload> => {
    const response = await request(`/finance/payment-reconciliation?status=${status}&limit=100`, {
      headers: adminHeaders(),
    });
    assert.equal(response.status, 200);
    return json<QueuePayload>(response);
  };

  const baseline = (await readQueue("all")).summary;
  assert.equal(baseline.total, baseline.pending + baseline.paymentFailed + baseline.cancelled);
  assert.equal(baseline.requiresReview, baseline.pending + baseline.paymentFailed);

  const suffix = randomUUID();
  const [user] = await db
    .insert(usersTable)
    .values({
      phone: `+7127${suffix.replace(/\D/g, "").slice(-10)}`,
      name: "Payment reconciliation queue fixture",
      pointsBalance: 0,
      bonusBalanceRub: "0.00",
    })
    .returning({ id: usersTable.id });
  paymentQueueFixtureUserIds.push(user.id);

  const [policy] = await db
    .select({ id: financialPoliciesTable.id })
    .from(financialPoliciesTable)
    .limit(1);
  assert.ok(policy, "payment reconciliation fixture requires a financial policy");

  const fixtureDefinitions: Array<{
    status: QueueStatus;
    providerPaymentStatus: string;
    paymentFailureReason: string | null;
  }> = [
    { status: "pending", providerPaymentStatus: "pending", paymentFailureReason: null },
    { status: "payment_failed", providerPaymentStatus: "canceled", paymentFailureReason: "fixture payment failed" },
    { status: "cancelled", providerPaymentStatus: "canceled", paymentFailureReason: "fixture payment cancelled" },
  ];
  const fixtures = await db
    .insert(financialDealsTable)
    .values(fixtureDefinitions.map((definition) => ({
      kind: "partner_purchase",
      userId: user.id,
      policyId: policy.id,
      status: definition.status,
      idempotencyKey: `payment-queue-${suffix}-${definition.status}`,
      requestFingerprint: `payment-queue-${suffix}-${definition.status}`,
      paymentProvider: "yookassa",
      paymentMethod: "mir_pay",
      providerPaymentId: `payment-queue-provider-${suffix}-${definition.status}`,
      providerPaymentStatus: definition.providerPaymentStatus,
      paymentFailureReason: definition.paymentFailureReason,
      grossAmountRub: "100.00",
      bonusRedeemedRub: "15.00",
      netAmountRub: "85.00",
      feeAmountRub: "1.50",
    })))
    .returning({ id: financialDealsTable.id, status: financialDealsTable.status });
  paymentQueueFixtureDealIds.push(...fixtures.map((fixture) => fixture.id));

  const expectedAfter = (changes: Record<QueueStatus, number>): QueueSummary => ({
    total: baseline.total + changes.pending + changes.payment_failed + changes.cancelled,
    pending: baseline.pending + changes.pending,
    paymentFailed: baseline.paymentFailed + changes.payment_failed,
    cancelled: baseline.cancelled + changes.cancelled,
    requiresReview: baseline.requiresReview + changes.pending + changes.payment_failed,
  });

  const assertQueueMatrix = async (
    changes: Record<QueueStatus, number>,
    fixtureStatuses: Map<number, QueueStatus>,
  ) => {
    const expectedSummary = expectedAfter(changes);
    for (const status of ["pending", "payment_failed", "cancelled", "all"] as const) {
      const payload = await readQueue(status);
      assert.equal(payload.status, status);
      assert.deepEqual(
        {
          total: payload.summary.total,
          pending: payload.summary.pending,
          paymentFailed: payload.summary.paymentFailed,
          cancelled: payload.summary.cancelled,
          requiresReview: payload.summary.requiresReview,
        },
        expectedSummary,
      );
      assert.equal(payload.summary.total, payload.summary.pending + payload.summary.paymentFailed + payload.summary.cancelled);
      assert.equal(payload.summary.requiresReview, payload.summary.pending + payload.summary.paymentFailed);

      const visibleStatuses = status === "all" ? new Set<QueueStatus>(["pending", "payment_failed", "cancelled"]) : new Set([status]);
      const fixtureItems = payload.items.filter((item) => fixtureStatuses.has(item.id));
      const actualFixtureStatuses: Array<[number, QueueStatus]> = fixtureItems.map((item) => [item.id, item.status]);
      const expectedFixtureStatuses: Array<[number, QueueStatus]> = [...fixtureStatuses]
        .filter(([, fixtureStatus]) => visibleStatuses.has(fixtureStatus))
        .map(([id, fixtureStatus]) => [id, fixtureStatus]);
      assert.deepEqual(
        actualFixtureStatuses.sort((left, right) => left[0] - right[0]),
        expectedFixtureStatuses.sort((left, right) => left[0] - right[0]),
      );
      assert.ok(fixtureItems.every((item) => visibleStatuses.has(item.status)));
      assert.ok(fixtureItems.every((item) => item.needsReview === (item.status === "pending" || item.status === "payment_failed")));
    }
  };

  const fixtureStatuses = new Map(fixtures.map((fixture) => [fixture.id, fixture.status as QueueStatus]));
  await assertQueueMatrix(
    { pending: 1, payment_failed: 1, cancelled: 1 },
    fixtureStatuses,
  );

  const pendingFixture = fixtures.find((fixture) => fixture.status === "pending");
  assert.ok(pendingFixture);
  await db
    .update(financialDealsTable)
    .set({
      status: "payment_failed",
      providerPaymentStatus: "canceled",
      paymentFailureReason: "fixture pending payment later failed",
    })
    .where(eq(financialDealsTable.id, pendingFixture.id));
  fixtureStatuses.set(pendingFixture.id, "payment_failed");
  await assertQueueMatrix(
    { pending: 0, payment_failed: 2, cancelled: 1 },
    fixtureStatuses,
  );

  const failedFixture = fixtures.find((fixture) => fixture.status === "payment_failed");
  assert.ok(failedFixture);
  await db
    .update(financialDealsTable)
    .set({
      status: "cancelled",
      providerPaymentStatus: "canceled",
      paymentFailureReason: "fixture failed payment later cancelled",
    })
    .where(eq(financialDealsTable.id, failedFixture.id));
  fixtureStatuses.set(failedFixture.id, "cancelled");
  await assertQueueMatrix(
    { pending: 0, payment_failed: 1, cancelled: 2 },
    fixtureStatuses,
  );
});

test("concurrent legacy transactions update both balance representations", async () => {
  const before = await getUserBalance();
  const responses = await Promise.all([
    createLegacyTransaction("earn", 20, 100_000),
    createLegacyTransaction("earn", 20, 100_000),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 201]);

  const after = await getUserBalance();
  assert.equal(after.pointsBalance, before.pointsBalance + 40);
  assert.equal(after.bonusBalanceRub, Number((before.bonusBalanceRub + 32).toFixed(2)));

  const dashboardResponse = await request("/dashboard/summary", { headers: tokenHeaders(1, false) });
  assert.equal(dashboardResponse.status, 200);
  const dashboard = await json<{ pointsBalance: number; bonusBalanceRub: number; rubEquivalent: number }>(dashboardResponse);
  assert.deepEqual(
    {
      pointsBalance: dashboard.pointsBalance,
      bonusBalanceRub: dashboard.bonusBalanceRub,
      rubEquivalent: dashboard.rubEquivalent,
    },
    {
      pointsBalance: after.pointsBalance,
      bonusBalanceRub: after.bonusBalanceRub,
      rubEquivalent: after.bonusBalanceRub,
    },
  );

  const cleanup = await createLegacyTransaction("expire", 40, 100_000);
  assert.equal(cleanup.status, 201);
  assert.deepEqual(await getUserBalance(), before);
});

test("legacy writes initialize unmigrated balances and preserve rounding differences", async () => {
  const suffix = randomUUID().replace(/\D/g, "").slice(-8);
  const [unmigrated, rounding] = await db
    .insert(usersTable)
    .values([
      {
        phone: `+7555${suffix}`,
        name: "Legacy write unmigrated fixture",
        pointsBalance: 125,
        bonusBalanceRub: null,
      },
      {
        phone: `+7444${suffix}`,
        name: "Legacy write rounding fixture",
        pointsBalance: 125,
        bonusBalanceRub: "100.40",
      },
    ])
    .returning({ id: usersTable.id });
  legacyWriteFixtureUserIds.push(unmigrated.id, rounding.id);

  const unmigratedBefore = await getUserBalance(unmigrated.id);
  assert.deepEqual(
    { pointsBalance: unmigratedBefore.pointsBalance, bonusBalanceRub: unmigratedBefore.bonusBalanceRub },
    { pointsBalance: 125, bonusBalanceRub: 100 },
  );
  const unmigratedWrite = await createLegacyTransaction("earn", 10, 1_000, unmigrated.id);
  assert.equal(unmigratedWrite.status, 201);

  const unmigratedAfter = await getUserBalance(unmigrated.id);
  assert.deepEqual(
    { pointsBalance: unmigratedAfter.pointsBalance, bonusBalanceRub: unmigratedAfter.bonusBalanceRub },
    { pointsBalance: 135, bonusBalanceRub: 108 },
  );
  const unmigratedDashboard = await getDashboardBalance(unmigrated.id);
  assert.deepEqual(
    {
      pointsBalance: unmigratedDashboard.pointsBalance,
      bonusBalanceRub: unmigratedDashboard.bonusBalanceRub,
      rubEquivalent: unmigratedDashboard.rubEquivalent,
    },
    { pointsBalance: 135, bonusBalanceRub: 108, rubEquivalent: 108 },
  );

  const roundingBefore = await getUserBalance(rounding.id);
  assert.deepEqual(
    { pointsBalance: roundingBefore.pointsBalance, bonusBalanceRub: roundingBefore.bonusBalanceRub },
    { pointsBalance: 125, bonusBalanceRub: 100.4 },
  );
  const roundingWrite = await createLegacyTransaction("earn", 1, 1_000, rounding.id);
  assert.equal(roundingWrite.status, 201);

  const roundingAfter = await getUserBalance(rounding.id);
  assert.deepEqual(
    { pointsBalance: roundingAfter.pointsBalance, bonusBalanceRub: roundingAfter.bonusBalanceRub },
    { pointsBalance: 126, bonusBalanceRub: 101.2 },
  );
  const roundingDashboard = await getDashboardBalance(rounding.id);
  assert.deepEqual(
    {
      pointsBalance: roundingDashboard.pointsBalance,
      bonusBalanceRub: roundingDashboard.bonusBalanceRub,
      rubEquivalent: roundingDashboard.rubEquivalent,
    },
    { pointsBalance: 126, bonusBalanceRub: 101.2, rubEquivalent: 101.2 },
  );

  const reconciliationResponse = await request(`/finance/reconciliation/${rounding.id}`, {
    headers: adminHeaders(),
  });
  assert.equal(reconciliationResponse.status, 200);
  const reconciliation = await json<{
    status: string;
    expectedBalanceRub: number;
    differenceCents: number;
  }>(reconciliationResponse);
  assert.deepEqual(
    {
      status: reconciliation.status,
      expectedBalanceRub: reconciliation.expectedBalanceRub,
      differenceCents: reconciliation.differenceCents,
    },
    { status: "rounding_difference", expectedBalanceRub: 100.8, differenceCents: 40 },
  );
});

test("same idempotency key settles once under concurrent requests", async () => {
  const key = `finance-integration-${randomUUID()}`;
  const responses = await Promise.all([settle(key), settle(key)]);
  const statuses = responses.map((response) => response.status).sort();
  assert.deepEqual(statuses, [200, 201]);

  const payloads = await Promise.all(responses.map((response) => json<{ deal: { id: number } }>(response)));
  assert.equal(payloads[0].deal.id, payloads[1].deal.id);

  const refundResponse = await refund(payloads[0].deal.id, `${key}-refund`);
  assert.equal(refundResponse.status, 201);
  const replayRefund = await refund(payloads[0].deal.id, `${key}-refund`);
  assert.equal(replayRefund.status, 200);
});

test("different concurrent purchases both serialize against the balance row", async () => {
  const keys = [`finance-integration-${randomUUID()}`, `finance-integration-${randomUUID()}`];
  const responses = await Promise.all(keys.map((key) => settle(key)));
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 201]);

  const payloads = await Promise.all(responses.map((response) => json<{ deal: { id: number } }>(response)));
  const ledgerResponses = await Promise.all(payloads.map((payload, index) => refund(payload.deal.id, `${keys[index]}-refund`)));
  assert.deepEqual(ledgerResponses.map((response) => response.status).sort(), [201, 201]);

  const ledger = await request("/finance/ledger", { headers: tokenHeaders(1, false) });
  assert.equal(ledger.status, 200);
  const entries = await json<Array<{ dealId: number; entryType: string; reversalOfId: number | null }>>(ledger);
  for (const payload of payloads) {
    const entriesForDeal = entries.filter((entry) => entry.dealId === payload.deal.id);
    assert.ok(entriesForDeal.some((entry) => entry.entryType === "debit"));
    assert.ok(entriesForDeal.some((entry) => entry.entryType === "credit" && entry.reversalOfId !== null));
  }
});

test("provider checkout statuses never settle an unverified purchase", async () => {
  const before = await getFinancialSnapshot();
  const unverifiedDealIds: number[] = [];

  const sbpKey = `provider-sbp-${randomUUID()}`;
  const sbpResponse = await checkout(sbpKey, "sbp");
  assert.equal(sbpResponse.status, 201);
  const sbpPayload = await json<{ deal: { id: number; providerPaymentId: string; paymentMethod: string } }>(sbpResponse);
  unverifiedDealIds.push(sbpPayload.deal.id);
  assert.equal(sbpPayload.deal.paymentMethod, "sbp");
  assert.equal(payments.get(sbpPayload.deal.providerPaymentId)?.paymentMethod, "sbp");

  const mirKey = `provider-mir-pay-${randomUUID()}`;
  const mirResponse = await checkout(mirKey, "mir_pay");
  assert.equal(mirResponse.status, 201);
  const mirPayload = await json<{ deal: { id: number; providerPaymentId: string; paymentMethod: string } }>(mirResponse);
  unverifiedDealIds.push(mirPayload.deal.id);
  assert.equal(mirPayload.deal.paymentMethod, "mir_pay");
  assert.equal(payments.get(mirPayload.deal.providerPaymentId)?.paymentMethod, "mir_pay");

  const pendingKey = `provider-pending-${randomUUID()}`;
  const pendingResponse = await checkout(pendingKey);
  assert.equal(pendingResponse.status, 201);
  const pendingPayload = await json<{ deal: { id: number; status: string; providerPaymentStatus: string } }>(pendingResponse);
  unverifiedDealIds.push(pendingPayload.deal.id);
  assert.equal(pendingPayload.deal.status, "pending");
  assert.equal(pendingPayload.deal.providerPaymentStatus, "pending");

  const pendingStatus = await request(`/finance/purchases/${pendingPayload.deal.id}/status`);
  assert.equal(pendingStatus.status, 200);
  const pendingStatusPayload = await json<{ paymentStatus: string; deal: { status: string } }>(pendingStatus);
  assert.equal(pendingStatusPayload.paymentStatus, "pending");
  assert.equal(pendingStatusPayload.deal.status, "pending");

  const waitingKey = `provider-waiting-${randomUUID()}`;
  const waitingResponse = await checkout(waitingKey);
  assert.equal(waitingResponse.status, 201);
  const waitingPayload = await json<{ deal: { id: number } }>(waitingResponse);
  unverifiedDealIds.push(waitingPayload.deal.id);
  const waitingStatus = await request(`/finance/purchases/${waitingPayload.deal.id}/status`);
  assert.equal(waitingStatus.status, 200);
  assert.equal((await json<{ paymentStatus: string }>(waitingStatus)).paymentStatus, "waiting_for_capture");

  const cancelledKey = `provider-cancelled-${randomUUID()}`;
  const cancelledResponse = await checkout(cancelledKey);
  assert.equal(cancelledResponse.status, 201);
  const cancelledPayload = await json<{
    paymentStatus: string;
    deal: { id: number; status: string; paymentFailureReason: string | null };
  }>(cancelledResponse);
  unverifiedDealIds.push(cancelledPayload.deal.id);
  assert.equal(cancelledPayload.paymentStatus, "canceled");
  assert.equal(cancelledPayload.deal.status, "cancelled");
  assert.equal(cancelledPayload.deal.paymentFailureReason, "stub_user_cancelled");

  const providerErrorResponse = await checkout(`provider-error-${randomUUID()}`);
  assert.equal(providerErrorResponse.status, 502);
  const providerErrorPayload = await json<{
    code: string;
    deal: { id: number; status: string; providerPaymentStatus: string; paymentFailureReason: string };
  }>(providerErrorResponse);
  unverifiedDealIds.push(providerErrorPayload.deal.id);
  assert.equal(providerErrorPayload.code, "PROVIDER_CHECKOUT_FAILED");
  assert.equal(providerErrorPayload.deal.status, "payment_failed");
  assert.equal(providerErrorPayload.deal.providerPaymentStatus, "canceled");
  assert.equal(providerErrorPayload.deal.paymentFailureReason, "stub provider refused checkout");

  const after = await getFinancialSnapshot();
  assert.deepEqual(after.balance, before.balance);
  for (const dealId of unverifiedDealIds) {
    assert.deepEqual(after.ledger.filter((entry) => entry.dealId === dealId), []);
  }
});

test("control purchase sends only net to the provider and debits only the requested bonus", async () => {
  const before = await getFinancialSnapshot();
  const key = `provider-control-complete-${randomUUID()}`;
  const checkoutResponse = await checkout(key, "mir_pay", 10000, 1500);
  assert.equal(checkoutResponse.status, 201);
  const checkoutPayload = await json<{
    deal: {
      id: number;
      providerPaymentId: string;
      grossAmountRub: number;
      bonusRedeemedRub: number;
      netAmountRub: number;
      feeAmountRub: number;
    };
    quote: {
      grossAmountRub: number;
      bonusRedeemedRub: number;
      netAmountRub: number;
      partnerFeeRub: number;
    };
  }>(checkoutResponse);
  assert.deepEqual(
    {
      grossAmountRub: checkoutPayload.deal.grossAmountRub,
      bonusRedeemedRub: checkoutPayload.deal.bonusRedeemedRub,
      netAmountRub: checkoutPayload.deal.netAmountRub,
      feeAmountRub: checkoutPayload.deal.feeAmountRub,
    },
    { grossAmountRub: 10000, bonusRedeemedRub: 1500, netAmountRub: 8500, feeAmountRub: 127.5 },
  );
  assert.deepEqual(
    {
      grossAmountRub: checkoutPayload.quote.grossAmountRub,
      bonusRedeemedRub: checkoutPayload.quote.bonusRedeemedRub,
      netAmountRub: checkoutPayload.quote.netAmountRub,
      partnerFeeRub: checkoutPayload.quote.partnerFeeRub,
    },
    { grossAmountRub: 10000, bonusRedeemedRub: 1500, netAmountRub: 8500, partnerFeeRub: 127.5 },
  );
  assert.equal(payments.get(checkoutPayload.deal.providerPaymentId)?.amount, "8500.00");

  const statusResponse = await request(`/finance/purchases/${checkoutPayload.deal.id}/status`);
  assert.equal(statusResponse.status, 200);
  const statusPayload = await json<{ deal: { status: string } }>(statusResponse);
  assert.equal(statusPayload.deal.status, "settled");

  const afterSettlement = await getFinancialSnapshot();
  assert.equal(afterSettlement.balance.bonusBalanceRub, Number((before.balance.bonusBalanceRub - 1500).toFixed(2)));
  assert.deepEqual(
    afterSettlement.ledger.filter((entry) => entry.dealId === checkoutPayload.deal.id).map(({ entryType, source, amountRub }) => ({
      entryType,
      source,
      amountRub,
    })),
    [{ entryType: "debit", source: "partner_purchase", amountRub: 1500 }],
  );

  const refundResponse = await refund(checkoutPayload.deal.id, `${key}-refund`);
  assert.equal(refundResponse.status, 201);
  const afterRefund = await getFinancialSnapshot();
  assert.deepEqual(afterRefund.balance, before.balance);
  assert.equal(afterRefund.ledger.filter((entry) => entry.dealId === checkoutPayload.deal.id).length, 2);
});

test("provider success after a balance change stays pending for reconciliation", async () => {
  const before = await getFinancialSnapshot();
  assert.ok(before.balance.bonusBalanceRub > 1500, "integration fixture needs at least 1500 RUB of bonus balance");

  const key = `provider-balance-change-complete-${randomUUID()}`;
  const checkoutResponse = await checkout(key, "mir_pay", 10000, 1500);
  assert.equal(checkoutResponse.status, 201);
  const checkoutPayload = await json<{ deal: { id: number; providerPaymentId: string } }>(checkoutResponse);

  const consumeAmount = Number((before.balance.bonusBalanceRub - 1000).toFixed(2));
  const consumeGross = Number((consumeAmount / 0.15 + 0.01).toFixed(2));
  const consumingSettlement = await settle(`balance-consumer-${randomUUID()}`, consumeGross, consumeAmount);
  assert.equal(consumingSettlement.status, 201);
  const consumingPayload = await json<{ deal: { id: number } }>(consumingSettlement);

  const statusResponse = await request(`/finance/purchases/${checkoutPayload.deal.id}/status`);
  assert.equal(statusResponse.status, 200);
  const statusPayload = await json<{
    paymentStatus: string;
    deal: { status: string; providerPaymentStatus: string; paymentFailureReason: string | null };
  }>(statusResponse);
  assert.equal(statusPayload.paymentStatus, "failed");
  assert.equal(statusPayload.deal.status, "pending");
  assert.equal(statusPayload.deal.providerPaymentStatus, "succeeded");
  assert.equal(statusPayload.deal.paymentFailureReason, "Bonus balance changed before provider confirmation");
  assert.deepEqual((await getLedger()).filter((entry) => entry.dealId === checkoutPayload.deal.id), []);

  const queueResponse = await request("/finance/payment-reconciliation?status=pending", { headers: adminHeaders() });
  assert.equal(queueResponse.status, 200);
  const queuePayload = await json<{
    items: Array<{ id: number; needsReview: boolean; reviewReason: string }>;
    summary: {
      confirmedAwaitingReconciliation: number;
      confirmedAwaitingReconciliationLastUpdatedAt: string | null;
    };
  }>(queueResponse);
  const queuedItem = queuePayload.items.find((item) => item.id === checkoutPayload.deal.id);
  assert.ok(queuedItem);
  assert.equal(queuedItem.needsReview, true);
  assert.equal(queuedItem.reviewReason, "Bonus balance changed before provider confirmation");
  assert.equal(queuePayload.summary.confirmedAwaitingReconciliation > 0, true);
  assert.ok(queuePayload.summary.confirmedAwaitingReconciliationLastUpdatedAt);
  assert.equal(Number.isNaN(Date.parse(queuePayload.summary.confirmedAwaitingReconciliationLastUpdatedAt)), false);

  const restoreResponse = await refund(consumingPayload.deal.id, `balance-consumer-refund-${randomUUID()}`);
  assert.equal(restoreResponse.status, 201);
  assert.deepEqual((await getFinancialSnapshot()).balance, before.balance);
});

test("admin reconciliation verifies a provider payment and keeps settlement history auditable", async () => {
  const key = `admin-reconcile-complete-${randomUUID()}`;
  const checkoutResponse = await checkout(key);
  assert.equal(checkoutResponse.status, 201);
  const checkoutPayload = await json<{ deal: { id: number; providerPaymentId: string } }>(checkoutResponse);

  const queueResponse = await request("/finance/payment-reconciliation?status=pending", {
    headers: adminHeaders(),
  });
  assert.equal(queueResponse.status, 200);
  const queuePayload = await json<{
    items: Array<{
      id: number;
      idempotencyKey: string;
      policyVersion: number;
      grossAmountRub: number;
      bonusRedeemedRub: number;
      netAmountRub: number;
      feeAmountRub: number;
      providerPaymentId: string | null;
      needsReview: boolean;
    }>;
  }>(queueResponse);
  const queuedItem = queuePayload.items.find((item) => item.id === checkoutPayload.deal.id);
  assert.ok(queuedItem);
  assert.equal(queuedItem.idempotencyKey, key);
  assert.equal(queuedItem.policyVersion > 0, true);
  assert.equal(queuedItem.grossAmountRub, 100);
  assert.equal(queuedItem.bonusRedeemedRub, 15);
  assert.equal(queuedItem.netAmountRub, 85);
  assert.equal(queuedItem.feeAmountRub, 1.28);
  assert.equal(queuedItem.providerPaymentId, checkoutPayload.deal.providerPaymentId);
  assert.equal(queuedItem.needsReview, true);

  const beforeLedger = await getLedger();
  const beforeEntries = beforeLedger.filter((entry) => entry.dealId === checkoutPayload.deal.id);
  assert.deepEqual(beforeEntries, []);

  const resolveResponse = await request(`/finance/payment-reconciliation/${checkoutPayload.deal.id}/resolve`, {
    method: "POST",
    headers: adminHeaders(),
  });
  assert.equal(resolveResponse.status, 200);
  const resolvePayload = await json<{
    paymentStatus: string;
    providerPaymentId: string;
    idempotent: boolean;
    deal: { status: string };
  }>(resolveResponse);
  assert.equal(resolvePayload.paymentStatus, "succeeded");
  assert.equal(resolvePayload.providerPaymentId, checkoutPayload.deal.providerPaymentId);
  assert.equal(resolvePayload.deal.status, "settled");
  assert.equal(resolvePayload.idempotent, false);

  const afterLedger = await getLedger();
  const afterEntries = afterLedger.filter((entry) => entry.dealId === checkoutPayload.deal.id);
  assert.equal(afterEntries.length, 1);

  const replayResponse = await request(`/finance/payment-reconciliation/${checkoutPayload.deal.id}/resolve`, {
    method: "POST",
    headers: adminHeaders(),
  });
  assert.equal(replayResponse.status, 200);
  assert.equal((await json<{ idempotent: boolean }>(replayResponse)).idempotent, true);
  assert.equal((await getLedger()).filter((entry) => entry.dealId === checkoutPayload.deal.id).length, 1);
});

test("checkout idempotency reuses the same provider payment without a duplicate charge", async () => {
  const before = await getFinancialSnapshot();
  const key = `provider-checkout-retry-${randomUUID()}`;
  const firstResponse = await checkout(key);
  assert.equal(firstResponse.status, 201);
  const firstPayload = await json<{ deal: { id: number; providerPaymentId: string } }>(firstResponse);

  const replayResponse = await checkout(key);
  assert.equal(replayResponse.status, 200);
  const replayPayload = await json<{ deal: { id: number; providerPaymentId: string } }>(replayResponse);
  assert.equal(replayPayload.deal.id, firstPayload.deal.id);
  assert.equal(replayPayload.deal.providerPaymentId, firstPayload.deal.providerPaymentId);
  assert.equal(paymentCreateAttempts.get(key), 1);
  assert.deepEqual(await getFinancialSnapshot(), before);
});

test("successful and mismatched provider payments cannot settle the wrong quote", async () => {
  const beforeSuccess = await getFinancialSnapshot();
  const completeResponse = await checkout(`provider-complete-${randomUUID()}`);
  assert.equal(completeResponse.status, 201);
  const completePayload = await json<{ deal: { id: number; status: string } }>(completeResponse);
  assert.equal(completePayload.deal.status, "pending");

  const completeStatus = await request(`/finance/purchases/${completePayload.deal.id}/status`);
  assert.equal(completeStatus.status, 200);
  const completeStatusPayload = await json<{
    paymentStatus: string;
    deal: { status: string; providerPaymentStatus: string };
  }>(completeStatus);
  assert.equal(completeStatusPayload.paymentStatus, "succeeded");
  assert.equal(completeStatusPayload.deal.status, "settled");
  assert.equal(completeStatusPayload.deal.providerPaymentStatus, "succeeded");

  const afterSuccess = await getFinancialSnapshot();
  assert.equal(afterSuccess.balance.bonusBalanceRub, Number((beforeSuccess.balance.bonusBalanceRub - 15).toFixed(2)));
  const successEntries = afterSuccess.ledger.filter((entry) => entry.dealId === completePayload.deal.id);
  assert.deepEqual(successEntries, [{
    id: successEntries[0]?.id,
    dealId: completePayload.deal.id,
    entryType: "debit",
    source: "partner_purchase",
    amountRub: 15,
    reversalOfId: null,
    settlementStatus: "settled",
  }]);

  const replayStatus = await request(`/finance/purchases/${completePayload.deal.id}/status`);
  assert.equal(replayStatus.status, 200);
  assert.equal((await json<{ deal: { status: string } }>(replayStatus)).deal.status, "settled");
  assert.deepEqual(await getFinancialSnapshot(), afterSuccess);

  const beforeMismatch = await getFinancialSnapshot();
  const mismatchResponse = await checkout(`provider-mismatch-${randomUUID()}`);
  assert.equal(mismatchResponse.status, 201);
  const mismatchPayload = await json<{ deal: { id: number } }>(mismatchResponse);
  const mismatchStatus = await request(`/finance/purchases/${mismatchPayload.deal.id}/status`);
  assert.equal(mismatchStatus.status, 200);
  const mismatchStatusPayload = await json<{
    paymentStatus: string;
    deal: { status: string; paymentFailureReason: string | null };
  }>(mismatchStatus);
  assert.equal(mismatchStatusPayload.paymentStatus, "failed");
  assert.equal(mismatchStatusPayload.deal.status, "payment_failed");
  assert.equal(
    mismatchStatusPayload.deal.paymentFailureReason,
    "Provider amount or currency did not match the server quote",
  );
  const afterMismatch = await getFinancialSnapshot();
  assert.deepEqual(afterMismatch.balance, beforeMismatch.balance);
  assert.deepEqual(afterMismatch.ledger.filter((entry) => entry.dealId === mismatchPayload.deal.id), []);
});

test("webhook rejects unauthenticated notifications before provider lookup", async () => {
  const before = await getFinancialSnapshot();
  const paymentId = `forged-payment-${randomUUID()}`;

  for (const headers of [
    { "content-type": "application/json" },
    { ...trustedWebhookHeaders(), "x-forwarded-for": "203.0.113.10" },
  ]) {
    const webhookResponse = await request("/finance/yookassa/webhook", {
      method: "POST",
      headers,
      body: JSON.stringify({ object: { id: paymentId } }),
    });
    assert.equal(webhookResponse.status, 401);
    assert.deepEqual(
      await json<{ error: string }>(webhookResponse),
      { error: "Invalid YooKassa webhook authentication" },
    );
  }

  assert.equal(paymentLookupAttempts.get(paymentId) ?? 0, 0);
  assert.deepEqual(await getFinancialSnapshot(), before);
});

test("authenticated webhook settles a completed payment and refund retries stay idempotent", async () => {
  const beforeCheckout = await getFinancialSnapshot();
  const checkoutKey = `provider-webhook-${randomUUID()}`;
  const checkoutResponse = await checkout(checkoutKey);
  assert.equal(checkoutResponse.status, 201);
  const checkoutPayload = await json<{ deal: { id: number; providerPaymentId: string } }>(checkoutResponse);

  const webhookResponse = await request("/finance/yookassa/webhook", {
    method: "POST",
    headers: trustedWebhookHeaders(),
    body: JSON.stringify({ object: { id: checkoutPayload.deal.providerPaymentId } }),
  });
  assert.equal(webhookResponse.status, 200);
  assert.deepEqual(await json<{ received: boolean }>(webhookResponse), { received: true });

  const settledStatus = await request(`/finance/purchases/${checkoutPayload.deal.id}/status`);
  assert.equal(settledStatus.status, 200);
  assert.equal((await json<{ deal: { status: string } }>(settledStatus)).deal.status, "settled");
  const afterSettlement = await getFinancialSnapshot();
  assert.equal(afterSettlement.balance.bonusBalanceRub, Number((beforeCheckout.balance.bonusBalanceRub - 15).toFixed(2)));
  assert.equal(afterSettlement.ledger.filter((entry) => entry.dealId === checkoutPayload.deal.id).length, 1);

  const refundKey = `refund-pending-${randomUUID()}`;
  const pendingRefund = await refund(checkoutPayload.deal.id, refundKey);
  assert.equal(pendingRefund.status, 202);
  const pendingRefundPayload = await json<{
    code: string;
    deal: { status: string; providerRefundStatus: string };
  }>(pendingRefund);
  assert.equal(pendingRefundPayload.code, "REFUND_PENDING");
  assert.equal(pendingRefundPayload.deal.status, "settled");
  assert.equal(pendingRefundPayload.deal.providerRefundStatus, "pending");
  assert.equal(refundAttempts.get(refundKey), 1);
  assert.deepEqual(await getFinancialSnapshot(), afterSettlement);

  const completedRefund = await refund(checkoutPayload.deal.id, refundKey);
  assert.equal(completedRefund.status, 201);
  assert.equal((await json<{ deal: { status: string; providerRefundStatus: string } }>(completedRefund)).deal.status, "refunded");
  assert.equal(refundAttempts.get(refundKey), 2);
  const afterRefund = await getFinancialSnapshot();
  assert.deepEqual(afterRefund.balance, beforeCheckout.balance);
  const refundEntries = afterRefund.ledger.filter((entry) => entry.dealId === checkoutPayload.deal.id);
  assert.equal(refundEntries.length, 2);
  assert.ok(refundEntries.some((entry) => entry.entryType === "credit" && entry.source === "refund" && entry.reversalOfId !== null));

  const replayRefund = await refund(checkoutPayload.deal.id, refundKey);
  assert.equal(replayRefund.status, 200);
  assert.equal((await json<{ idempotent: boolean }>(replayRefund)).idempotent, true);
  assert.equal(refundAttempts.get(refundKey), 2);
  assert.deepEqual(await getFinancialSnapshot(), afterRefund);

  const providerRefund = refundRequests.find((entry) => entry.key === refundKey);
  assert.deepEqual(providerRefund, {
    key: refundKey,
    paymentId: checkoutPayload.deal.providerPaymentId,
    amount: "85.00",
  });

  const refundFailureCheckout = await checkout(`provider-refund-${randomUUID()}`);
  assert.equal(refundFailureCheckout.status, 201);
  const refundFailureCheckoutPayload = await json<{ deal: { id: number } }>(refundFailureCheckout);
  const refundFailureSettlement = await request(`/finance/purchases/${refundFailureCheckoutPayload.deal.id}/status`);
  assert.equal(refundFailureSettlement.status, 200);
  assert.equal((await json<{ deal: { status: string } }>(refundFailureSettlement)).deal.status, "settled");
  const beforeRefundFailure = await getFinancialSnapshot();
  const refundFailure = await refund(refundFailureCheckoutPayload.deal.id, `refund-error-${randomUUID()}`);
  assert.equal(refundFailure.status, 502);
  const afterRefundFailure = await getFinancialSnapshot();
  assert.deepEqual(afterRefundFailure, beforeRefundFailure);
});

test("rental provider success credits tenant and landlord exactly once", async () => {
  const fixture = await createRentalFixture();
  const tenantBefore = await getUserBalance(fixture.tenantId);
  const landlordBefore = await getUserBalance(fixture.landlordId);
  const key = `rental-provider-webhook-${randomUUID()}`;

  const checkoutResponse = await rentalCheckout(fixture.tenantId, fixture.leaseId, key);
  assert.equal(checkoutResponse.status, 201);
  const checkoutPayload = await json<{
    deal: {
      id: number;
      providerPaymentId: string;
      status: string;
      grossAmountRub: number;
      netAmountRub: number;
      landlordBonusRub: number;
      tenantBonusRub: number;
    };
  }>(checkoutResponse);
  assert.deepEqual(
    {
      status: checkoutPayload.deal.status,
      grossAmountRub: checkoutPayload.deal.grossAmountRub,
      netAmountRub: checkoutPayload.deal.netAmountRub,
      landlordBonusRub: checkoutPayload.deal.landlordBonusRub,
      tenantBonusRub: checkoutPayload.deal.tenantBonusRub,
    },
    {
      status: "pending",
      grossAmountRub: 10_000,
      netAmountRub: 10_000,
      landlordBonusRub: 1_000,
      tenantBonusRub: 1_000,
    },
  );
  assert.equal(payments.get(checkoutPayload.deal.providerPaymentId)?.amount, "10000.00");

  const statusResponse = await request(`/finance/rentals/${checkoutPayload.deal.id}/status`, {
    headers: tokenHeaders(fixture.tenantId, false),
  });
  assert.equal(statusResponse.status, 200);
  const statusPayload = await json<{
    paymentStatus: string;
    deal: { status: string };
  }>(statusResponse);
  assert.equal(statusPayload.paymentStatus, "succeeded");
  assert.equal(statusPayload.deal.status, "settled");

  const tenantAfter = await getUserBalance(fixture.tenantId);
  const landlordAfter = await getUserBalance(fixture.landlordId);
  assert.deepEqual(
    { pointsBalance: tenantAfter.pointsBalance, bonusBalanceRub: tenantAfter.bonusBalanceRub },
    { pointsBalance: tenantBefore.pointsBalance + 1_250, bonusBalanceRub: tenantBefore.bonusBalanceRub + 1_000 },
  );
  assert.deepEqual(
    { pointsBalance: landlordAfter.pointsBalance, bonusBalanceRub: landlordAfter.bonusBalanceRub },
    { pointsBalance: landlordBefore.pointsBalance + 1_250, bonusBalanceRub: landlordBefore.bonusBalanceRub + 1_000 },
  );

  const participants = await db
    .select({
      userId: financialDealParticipantsTable.userId,
      role: financialDealParticipantsTable.role,
      bonusAmountRub: financialDealParticipantsTable.bonusAmountRub,
    })
    .from(financialDealParticipantsTable)
    .where(eq(financialDealParticipantsTable.dealId, checkoutPayload.deal.id));
  assert.deepEqual(
    participants.map((participant) => ({
      userId: participant.userId,
      role: participant.role,
      bonusAmountRub: Number(participant.bonusAmountRub),
    })).sort((left, right) => left.userId - right.userId),
    [
      { userId: fixture.tenantId, role: "tenant", bonusAmountRub: 1_000 },
      { userId: fixture.landlordId, role: "landlord", bonusAmountRub: 1_000 },
    ].sort((left, right) => left.userId - right.userId),
  );

  const transactions = await db
    .select({
      userId: transactionsTable.userId,
      category: transactionsTable.category,
      pointsEarned: transactionsTable.pointsEarned,
      description: transactionsTable.description,
    })
    .from(transactionsTable)
    .where(inArray(transactionsTable.userId, [fixture.tenantId, fixture.landlordId]));
  const rentalTransactions = transactions.filter((transaction) =>
    transaction.description.includes(`сделке #${checkoutPayload.deal.id}`),
  );
  assert.deepEqual(
    rentalTransactions.map(({ userId, category, pointsEarned }) => ({ userId, category, pointsEarned }))
      .sort((left, right) => left.userId - right.userId),
    [
      { userId: fixture.tenantId, category: "rent", pointsEarned: 1_250 },
      { userId: fixture.landlordId, category: "rent", pointsEarned: 1_250 },
    ].sort((left, right) => left.userId - right.userId),
  );

  const settledLedger = await db
    .select({
      userId: financialLedgerEntriesTable.userId,
      entryType: financialLedgerEntriesTable.entryType,
      source: financialLedgerEntriesTable.source,
      amountRub: financialLedgerEntriesTable.amountRub,
    })
    .from(financialLedgerEntriesTable)
    .where(eq(financialLedgerEntriesTable.dealId, checkoutPayload.deal.id));
  assert.deepEqual(
    settledLedger.map(({ userId, entryType, source, amountRub }) => ({
      userId,
      entryType,
      source,
      amountRub: Number(amountRub),
    })).sort((left, right) => (left.userId ?? 0) - (right.userId ?? 0)),
    [
      { userId: null, entryType: "debit", source: "landlord_fee", amountRub: 150 },
      { userId: fixture.tenantId, entryType: "credit", source: "rental_deal", amountRub: 1_000 },
      { userId: fixture.landlordId, entryType: "credit", source: "rental_deal", amountRub: 1_000 },
    ].sort((left, right) => (left.userId ?? 0) - (right.userId ?? 0)),
  );

  const replayWebhook = await request("/finance/yookassa/webhook", {
    method: "POST",
    headers: trustedWebhookHeaders(),
    body: JSON.stringify({ object: { id: checkoutPayload.deal.providerPaymentId } }),
  });
  assert.equal(replayWebhook.status, 200);
  assert.deepEqual(await json<{ received: boolean }>(replayWebhook), { received: true });

  const replayStatus = await request(`/finance/rentals/${checkoutPayload.deal.id}/status`, {
    headers: tokenHeaders(fixture.tenantId, false),
  });
  assert.equal(replayStatus.status, 200);
  assert.equal((await json<{ deal: { status: string } }>(replayStatus)).deal.status, "settled");
  const tenantAfterReplay = await getUserBalance(fixture.tenantId);
  const landlordAfterReplay = await getUserBalance(fixture.landlordId);
  assert.deepEqual(
    { pointsBalance: tenantAfterReplay.pointsBalance, bonusBalanceRub: tenantAfterReplay.bonusBalanceRub },
    { pointsBalance: tenantAfter.pointsBalance, bonusBalanceRub: tenantAfter.bonusBalanceRub },
  );
  assert.deepEqual(
    { pointsBalance: landlordAfterReplay.pointsBalance, bonusBalanceRub: landlordAfterReplay.bonusBalanceRub },
    { pointsBalance: landlordAfter.pointsBalance, bonusBalanceRub: landlordAfter.bonusBalanceRub },
  );
  assert.equal(
    (await db.select({ id: financialDealParticipantsTable.id })
      .from(financialDealParticipantsTable)
      .where(eq(financialDealParticipantsTable.dealId, checkoutPayload.deal.id))).length,
    2,
  );
  assert.equal(rentalTransactions.length, 2);
  assert.equal(
    (await db.select({ id: financialLedgerEntriesTable.id })
      .from(financialLedgerEntriesTable)
      .where(eq(financialLedgerEntriesTable.dealId, checkoutPayload.deal.id))).length,
    3,
  );

  for (const mismatchType of ["amount", "currency"] as const) {
    const mismatchKey = `rental-provider-${mismatchType}-mismatch-${randomUUID()}`;
    const mismatchResponse = await rentalCheckout(fixture.tenantId, fixture.leaseId, mismatchKey);
    assert.equal(mismatchResponse.status, 201);
    const mismatchPayload = await json<{ deal: { id: number } }>(mismatchResponse);
    const mismatchStatus = await request(`/finance/rentals/${mismatchPayload.deal.id}/status`, {
      headers: tokenHeaders(fixture.tenantId, false),
    });
    assert.equal(mismatchStatus.status, 200);
    const mismatchStatusPayload = await json<{
      paymentStatus: string;
      deal: { status: string; paymentFailureReason: string | null };
    }>(mismatchStatus);
    assert.equal(mismatchStatusPayload.paymentStatus, "failed");
    assert.equal(mismatchStatusPayload.deal.status, "payment_failed");
    assert.equal(
      mismatchStatusPayload.deal.paymentFailureReason,
      "Provider amount or currency did not match the server quote",
    );
    assert.equal(
      (await db.select({ id: financialLedgerEntriesTable.id })
        .from(financialLedgerEntriesTable)
        .where(eq(financialLedgerEntriesTable.dealId, mismatchPayload.deal.id))).length,
      0,
    );
  }
  const tenantAfterMismatch = await getUserBalance(fixture.tenantId);
  const landlordAfterMismatch = await getUserBalance(fixture.landlordId);
  assert.deepEqual(
    { pointsBalance: tenantAfterMismatch.pointsBalance, bonusBalanceRub: tenantAfterMismatch.bonusBalanceRub },
    { pointsBalance: tenantAfter.pointsBalance, bonusBalanceRub: tenantAfter.bonusBalanceRub },
  );
  assert.deepEqual(
    { pointsBalance: landlordAfterMismatch.pointsBalance, bonusBalanceRub: landlordAfterMismatch.bonusBalanceRub },
    { pointsBalance: landlordAfter.pointsBalance, bonusBalanceRub: landlordAfter.bonusBalanceRub },
  );
});

test("protected balance reconciliation covers authorization, classifications, pagination, and audited corrections", async () => {
  const fixtures = await createReconciliationFixtures();
  const fixtureByStatus = new Map(fixtures.map((fixture) => [fixture.status, fixture]));
  const mismatch = fixtureByStatus.get("mismatch") as ReconciliationFixture;
  const rounding = fixtureByStatus.get("rounding_difference") as ReconciliationFixture;
  const unmigrated = fixtureByStatus.get("unmigrated") as ReconciliationFixture;

  const regularHeaders = tokenHeaders(1, false);
  const deniedList = await request("/finance/reconciliation?status=all", { headers: regularHeaders });
  assert.equal(deniedList.status, 403);
  const deniedDetail = await request(`/finance/reconciliation/${mismatch.id}`, { headers: regularHeaders });
  assert.equal(deniedDetail.status, 403);
  const deniedExport = await request("/finance/reconciliation/export?status=all", { headers: regularHeaders });
  assert.equal(deniedExport.status, 403);
  assert.match(deniedExport.headers.get("content-type") ?? "", /^application\/json/);
  const deniedExportBody = await deniedExport.text();
  assert.deepEqual(JSON.parse(deniedExportBody), { error: "Administrator access required" });
  assert.ok(!deniedExportBody.includes("recordType,reconciliationId"));
  const deniedCorrection = await request(`/finance/reconciliation/${mismatch.id}/correct`, {
    method: "POST",
    headers: { ...regularHeaders, "content-type": "application/json", "Idempotency-Key": `denied-${randomUUID()}` },
    body: JSON.stringify({ target: "monetary", reason: "not allowed" }),
  });
  assert.equal(deniedCorrection.status, 403);

  const allResponse = await request("/finance/reconciliation?status=all&limit=100&offset=0", {
    headers: adminHeaders(),
  });
  assert.equal(allResponse.status, 200);
  const allPayload = await json<{
    items: Array<{
      userId: number;
      status: ReconciliationFixture["status"];
      pointsBalance: number;
      bonusBalanceRub: number | null;
      differenceCents: number | null;
      canCorrect: boolean;
    }>;
    summary: {
      totalUsers: number;
      consistent: number;
      roundingDifference: number;
      mismatch: number;
      unmigrated: number;
      returned: number;
    };
    status: string;
    limit: number;
    offset: number;
  }>(allResponse);
  assert.equal(allPayload.status, "all");
  assert.equal(allPayload.limit, 100);
  assert.equal(allPayload.offset, 0);
  assert.equal(allPayload.summary.returned, allPayload.items.length);
  for (const fixture of fixtures) {
    const item = allPayload.items.find((candidate) => candidate.userId === fixture.id);
    assert.ok(item, `fixture ${fixture.status} should be returned by the admin report`);
    assert.equal(item.status, fixture.status);
  }
  assert.equal(allPayload.items.find((item) => item.userId === fixtureByStatus.get("consistent")?.id)?.canCorrect, false);
  assert.equal(allPayload.items.find((item) => item.userId === rounding.id)?.differenceCents, 40);
  assert.equal(allPayload.items.find((item) => item.userId === mismatch.id)?.differenceCents, 41);
  assert.equal(allPayload.items.find((item) => item.userId === unmigrated.id)?.bonusBalanceRub, null);

  for (const fixture of fixtures) {
    const filteredResponse = await request(`/finance/reconciliation?status=${fixture.status}&limit=100`, {
      headers: adminHeaders(),
    });
    assert.equal(filteredResponse.status, 200);
    const filteredPayload = await json<{ items: Array<{ userId: number; status: string }>; status: string }>(filteredResponse);
    assert.equal(filteredPayload.status, fixture.status);
    assert.ok(filteredPayload.items.some((item) => item.userId === fixture.id));
    assert.ok(filteredPayload.items.every((item) => item.status === fixture.status));
  }

  const mismatchIndex = allPayload.items.findIndex((item) => item.userId === mismatch.id);
  assert.ok(mismatchIndex >= 0);
  const pagedResponse = await request(`/finance/reconciliation?status=all&limit=1&offset=${mismatchIndex}`, {
    headers: adminHeaders(),
  });
  assert.equal(pagedResponse.status, 200);
  const pagedPayload = await json<{ items: Array<{ userId: number }>; limit: number; offset: number }>(pagedResponse);
  assert.equal(pagedPayload.limit, 1);
  assert.equal(pagedPayload.offset, mismatchIndex);
  assert.deepEqual(pagedPayload.items.map((item) => item.userId), [mismatch.id]);

  const initialDetailResponse = await request(`/finance/reconciliation/${mismatch.id}`, { headers: adminHeaders() });
  assert.equal(initialDetailResponse.status, 200);
  const initialDetail = await json<{
    status: string;
    differenceCents: number | null;
    corrections: unknown[];
  }>(initialDetailResponse);
  assert.equal(initialDetail.status, "mismatch");
  assert.equal(initialDetail.differenceCents, 41);
  assert.deepEqual(initialDetail.corrections, []);

  const roundingCorrection = await request(`/finance/reconciliation/${rounding.id}/correct`, {
    method: "POST",
    headers: { ...adminHeaders(), "content-type": "application/json", "Idempotency-Key": `rounding-${randomUUID()}` },
    body: JSON.stringify({ target: "monetary", reason: "rounding should be rejected" }),
  });
  assert.equal(roundingCorrection.status, 409);
  assert.equal((await json<{ code: string }>(roundingCorrection)).code, "RECONCILIATION_ROUNDING_ONLY");

  const unmigratedPointsKey = `unmigrated-points-${randomUUID()}`;
  const unmigratedPointsCorrection = await request(`/finance/reconciliation/${unmigrated.id}/correct`, {
    method: "POST",
    headers: { ...adminHeaders(), "content-type": "application/json", "Idempotency-Key": unmigratedPointsKey },
    body: JSON.stringify({ target: "points", reason: "cannot sync without money" }),
  });
  assert.equal(unmigratedPointsCorrection.status, 409);
  assert.equal((await json<{ code: string }>(unmigratedPointsCorrection)).code, "MONETARY_BALANCE_REQUIRED");
  const unmigratedAfterRejected = await request(`/finance/reconciliation/${unmigrated.id}`, { headers: adminHeaders() });
  const unmigratedRejectedPayload = await json<{ status: string; corrections: unknown[] }>(unmigratedAfterRejected);
  assert.equal(unmigratedRejectedPayload.status, "unmigrated");
  assert.deepEqual(unmigratedRejectedPayload.corrections, []);

  const mismatchKey = `mismatch-correction-${randomUUID()}`;
  const correctionBody = { target: "monetary", reason: "align monetary balance to points" };
  const correctionResponse = await request(`/finance/reconciliation/${mismatch.id}/correct`, {
    method: "POST",
    headers: { ...adminHeaders(), "content-type": "application/json", "Idempotency-Key": mismatchKey },
    body: JSON.stringify(correctionBody),
  });
  assert.equal(correctionResponse.status, 201);
  const correctionPayload = await json<{
    reconciliation: { status: string; differenceCents: number; pointsBalance: number; bonusBalanceRub: number };
    correction: {
      id: number;
      userId: number;
      operatorUserId: number;
      correctionTarget: string;
      reason: string;
      idempotencyKey: string;
      beforePointsBalance: number;
      afterPointsBalance: number;
      beforeBonusBalanceRub: number | null;
      afterBonusBalanceRub: number;
      beforeDifferenceCents: number | null;
      afterDifferenceCents: number;
    };
    idempotent: boolean;
  }>(correctionResponse);
  assert.equal(correctionPayload.idempotent, false);
  assert.deepEqual(
    {
      status: correctionPayload.reconciliation.status,
      differenceCents: correctionPayload.reconciliation.differenceCents,
      pointsBalance: correctionPayload.reconciliation.pointsBalance,
      bonusBalanceRub: correctionPayload.reconciliation.bonusBalanceRub,
    },
    { status: "consistent", differenceCents: 0, pointsBalance: 125, bonusBalanceRub: 100 },
  );
  assert.deepEqual(
    {
      userId: correctionPayload.correction.userId,
      operatorUserId: correctionPayload.correction.operatorUserId,
      correctionTarget: correctionPayload.correction.correctionTarget,
      reason: correctionPayload.correction.reason,
      idempotencyKey: correctionPayload.correction.idempotencyKey,
      beforePointsBalance: correctionPayload.correction.beforePointsBalance,
      afterPointsBalance: correctionPayload.correction.afterPointsBalance,
      beforeBonusBalanceRub: correctionPayload.correction.beforeBonusBalanceRub,
      afterBonusBalanceRub: correctionPayload.correction.afterBonusBalanceRub,
      beforeDifferenceCents: correctionPayload.correction.beforeDifferenceCents,
      afterDifferenceCents: correctionPayload.correction.afterDifferenceCents,
    },
    {
      userId: mismatch.id,
      operatorUserId: 1,
      correctionTarget: "monetary",
      reason: correctionBody.reason,
      idempotencyKey: mismatchKey,
      beforePointsBalance: 125,
      afterPointsBalance: 125,
      beforeBonusBalanceRub: 100.41,
      afterBonusBalanceRub: 100,
      beforeDifferenceCents: 41,
      afterDifferenceCents: 0,
    },
  );

  const replayResponse = await request(`/finance/reconciliation/${mismatch.id}/correct`, {
    method: "POST",
    headers: { ...adminHeaders(), "content-type": "application/json", "Idempotency-Key": mismatchKey },
    body: JSON.stringify(correctionBody),
  });
  assert.equal(replayResponse.status, 200);
  const replayPayload = await json<{ correction: { id: number }; idempotent: boolean }>(replayResponse);
  assert.equal(replayPayload.idempotent, true);
  assert.equal(replayPayload.correction.id, correctionPayload.correction.id);

  const changedPayloadResponse = await request(`/finance/reconciliation/${mismatch.id}/correct`, {
    method: "POST",
    headers: { ...adminHeaders(), "content-type": "application/json", "Idempotency-Key": mismatchKey },
    body: JSON.stringify({ ...correctionBody, reason: "changed correction payload" }),
  });
  assert.equal(changedPayloadResponse.status, 409);
  assert.equal((await json<{ code: string }>(changedPayloadResponse)).code, "RECONCILIATION_IDEMPOTENCY_CONFLICT");

  const unmigratedKey = `unmigrated-monetary-${randomUUID()}`;
  const unmigratedCorrection = await request(`/finance/reconciliation/${unmigrated.id}/correct`, {
    method: "POST",
    headers: { ...adminHeaders(), "content-type": "application/json", "Idempotency-Key": unmigratedKey },
    body: JSON.stringify({ target: "monetary", reason: "initialize migrated monetary balance" }),
  });
  assert.equal(unmigratedCorrection.status, 201);
  const unmigratedCorrectionPayload = await json<{
    reconciliation: { status: string; bonusBalanceRub: number; differenceCents: number };
    correction: { beforeBonusBalanceRub: number | null; beforeDifferenceCents: number | null; afterBonusBalanceRub: number };
    idempotent: boolean;
  }>(unmigratedCorrection);
  assert.equal(unmigratedCorrectionPayload.idempotent, false);
  assert.deepEqual(
    {
      status: unmigratedCorrectionPayload.reconciliation.status,
      bonusBalanceRub: unmigratedCorrectionPayload.reconciliation.bonusBalanceRub,
      differenceCents: unmigratedCorrectionPayload.reconciliation.differenceCents,
    },
    { status: "consistent", bonusBalanceRub: 100, differenceCents: 0 },
  );
  assert.deepEqual(
    {
      beforeBonusBalanceRub: unmigratedCorrectionPayload.correction.beforeBonusBalanceRub,
      beforeDifferenceCents: unmigratedCorrectionPayload.correction.beforeDifferenceCents,
      afterBonusBalanceRub: unmigratedCorrectionPayload.correction.afterBonusBalanceRub,
    },
    { beforeBonusBalanceRub: null, beforeDifferenceCents: null, afterBonusBalanceRub: 100 },
  );

  const historyResponse = await request(`/finance/reconciliation/${mismatch.id}`, { headers: adminHeaders() });
  assert.equal(historyResponse.status, 200);
  const historyPayload = await json<{
    status: string;
    corrections: Array<{
      userId: number;
      correctionTarget: string;
      beforeBonusBalanceRub: number | null;
      beforeDifferenceCents: number | null;
      afterDifferenceCents: number;
    }>;
  }>(historyResponse);
  assert.equal(historyPayload.status, "consistent");
  assert.equal(historyPayload.corrections.length, 1);
  assert.deepEqual(
    {
      userId: historyPayload.corrections[0]?.userId,
      correctionTarget: historyPayload.corrections[0]?.correctionTarget,
      beforeBonusBalanceRub: historyPayload.corrections[0]?.beforeBonusBalanceRub,
      beforeDifferenceCents: historyPayload.corrections[0]?.beforeDifferenceCents,
      afterDifferenceCents: historyPayload.corrections[0]?.afterDifferenceCents,
    },
    {
      userId: mismatch.id,
      correctionTarget: "monetary",
      beforeBonusBalanceRub: 100.41,
      beforeDifferenceCents: 41,
      afterDifferenceCents: 0,
    },
  );

  const mismatchExportResponse = await request("/finance/reconciliation/export?status=mismatch", {
    headers: adminHeaders(),
  });
  assert.equal(mismatchExportResponse.status, 200);
  const mismatchExportLines = (await mismatchExportResponse.text()).trimEnd().split("\r\n");
  assert.equal(
    mismatchExportLines[0],
    "recordType,reconciliationId,userId,classification,operatorUserId,correctionTarget,reason,beforePointsBalance,afterPointsBalance,beforeBonusBalanceRub,afterBonusBalanceRub,beforeDifferenceCents,afterDifferenceCents,currentPointsBalance,currentBonusBalanceRub,currentExpectedBalanceRub,currentDifferenceCents,createdAt",
  );
  assert.equal(
    mismatchExportLines.filter((line) => line.startsWith(`correction,`) && line.includes(`,${mismatch.id},mismatch,`)).length,
    1,
  );
  assert.equal(
    mismatchExportLines.some((line) => line.startsWith("reconciliation,") && line.includes(`,${mismatch.id},`)),
    false,
  );
});

test("reconciliation CSV export preserves batched ordering, filters, history, and read-only behavior", async () => {
  const fixtureCount = 505;
  const suffix = randomUUID();
  const statusByIndex = ["consistent", "rounding_difference", "mismatch", "unmigrated"] as const;
  const users = await db
    .insert(usersTable)
    .values(Array.from({ length: fixtureCount }, (_, index) => {
      const status = index < 3 ? "consistent" : statusByIndex[(index - 3) % statusByIndex.length];
      return {
        phone: `+7-export-${suffix}-${index}`,
        name: `Reconciliation export fixture ${index}`,
        pointsBalance: status === "consistent" ? 100 : 125,
        bonusBalanceRub: status === "consistent"
          ? "80.00"
          : status === "rounding_difference"
            ? "100.40"
            : status === "mismatch"
              ? "100.41"
              : null,
      };
    }))
    .returning({ id: usersTable.id });
  const fixtureUserIds = users.map((user) => user.id);
  reconciliationExportFixtureUserIds.push(...fixtureUserIds);

  const mismatchCreatedAt = new Date("2026-08-16T23:59:59.999Z");
  const unmigratedCreatedAt = new Date("2026-08-15T00:00:00.000Z");
  const excludedCreatedAt = new Date("2026-08-14T23:59:59.999Z");
  const corrections = await db
    .insert(financialBalanceReconciliationsTable)
    .values([
      {
        userId: fixtureUserIds[0]!,
        operatorUserId: 1,
        correctionTarget: "monetary",
        reason: "historical, mismatch\nreview",
        idempotencyKey: `export-mismatch-${suffix}`,
        beforePointsBalance: 125,
        afterPointsBalance: 100,
        beforeBonusBalanceRub: "100.41",
        afterBonusBalanceRub: "80.00",
        beforeDifferenceCents: 41,
        afterDifferenceCents: 0,
        createdAt: mismatchCreatedAt,
      },
      {
        userId: fixtureUserIds[1]!,
        operatorUserId: 1,
        correctionTarget: "monetary",
        reason: "historical unmigrated account",
        idempotencyKey: `export-unmigrated-${suffix}`,
        beforePointsBalance: 125,
        afterPointsBalance: 100,
        beforeBonusBalanceRub: null,
        afterBonusBalanceRub: "80.00",
        beforeDifferenceCents: null,
        afterDifferenceCents: 0,
        createdAt: unmigratedCreatedAt,
      },
      {
        userId: fixtureUserIds[2]!,
        operatorUserId: 1,
        correctionTarget: "monetary",
        reason: "outside requested date range",
        idempotencyKey: `export-excluded-${suffix}`,
        beforePointsBalance: 125,
        afterPointsBalance: 100,
        beforeBonusBalanceRub: "100.41",
        afterBonusBalanceRub: "80.00",
        beforeDifferenceCents: 41,
        afterDifferenceCents: 0,
        createdAt: excludedCreatedAt,
      },
    ])
    .returning({ id: financialBalanceReconciliationsTable.id });
  const correctionIds = corrections.map((correction) => correction.id);
  const dateQuery = "from=2026-08-15&to=2026-08-16";
  const headers = [
    "recordType",
    "reconciliationId",
    "userId",
    "classification",
    "operatorUserId",
    "correctionTarget",
    "reason",
    "beforePointsBalance",
    "afterPointsBalance",
    "beforeBonusBalanceRub",
    "afterBonusBalanceRub",
    "beforeDifferenceCents",
    "afterDifferenceCents",
    "currentPointsBalance",
    "currentBonusBalanceRub",
    "currentExpectedBalanceRub",
    "currentDifferenceCents",
    "createdAt",
  ];

  const snapshot = async () => ({
    users: await db
      .select()
      .from(usersTable)
      .where(inArray(usersTable.id, fixtureUserIds))
      .orderBy(asc(usersTable.id)),
    corrections: await db
      .select()
      .from(financialBalanceReconciliationsTable)
      .where(inArray(financialBalanceReconciliationsTable.id, correctionIds))
      .orderBy(asc(financialBalanceReconciliationsTable.id)),
  });

  const beforeExport = await snapshot();
  const exportResponse = await request(`/finance/reconciliation/export?${dateQuery}`, {
    headers: adminHeaders(),
  });
  assert.equal(exportResponse.status, 200);
  assert.match(exportResponse.headers.get("content-type") ?? "", /^text\/csv/);
  const rows = parseCsv(await exportResponse.text());
  assert.deepEqual(rows[0], headers);
  assert.ok(rows.length > fixtureCount, "the export should include more than one user batch");
  assert.ok(rows.slice(1).every((row) => row.length === headers.length), "every CSV row should match the header");

  const column = (row: string[], name: string) => row[headers.indexOf(name)];
  const fixtureRows = rows.slice(1).filter((row) => fixtureUserIds.includes(Number(column(row, "userId"))));
  const currentRows = fixtureRows.filter((row) => column(row, "recordType") === "reconciliation");
  const correctionRows = fixtureRows.filter((row) => column(row, "recordType") === "correction");
  assert.equal(currentRows.length, fixtureCount);
  assert.deepEqual(
    currentRows.map((row) => Number(column(row, "userId"))),
    fixtureUserIds,
    "current rows should stay in ascending user ID order across batches",
  );
  assert.equal(correctionRows.length, 2);
  assert.deepEqual(
    correctionRows.map((row) => Number(column(row, "reconciliationId"))),
    [correctionIds[0], correctionIds[1]],
    "correction rows should stay in descending created-at order",
  );

  const currentFixtureStatuses = new Map(
    fixtureUserIds.map((userId, index) => [
      userId,
      index < 3 ? "consistent" : statusByIndex[(index - 3) % statusByIndex.length],
    ]),
  );
  const expectedStatusUsers = (status: string) => fixtureUserIds.filter((userId) => currentFixtureStatuses.get(userId) === status);
  for (const status of ["consistent", "rounding_difference", "mismatch", "unmigrated"] as const) {
    const filteredResponse = await request(`/finance/reconciliation/export?status=${status}&${dateQuery}`, {
      headers: adminHeaders(),
    });
    assert.equal(filteredResponse.status, 200);
    const filteredRows = parseCsv(await filteredResponse.text());
    assert.deepEqual(filteredRows[0], headers);
    const filteredFixtureRows = filteredRows
      .slice(1)
      .filter((row) => fixtureUserIds.includes(Number(column(row, "userId"))));
    const filteredCurrentRows = filteredFixtureRows.filter((row) => column(row, "recordType") === "reconciliation");
    assert.deepEqual(filteredCurrentRows.map((row) => Number(column(row, "userId"))), expectedStatusUsers(status));
    assert.ok(filteredCurrentRows.every((row) => column(row, "classification") === status));
    const filteredCorrections = filteredFixtureRows.filter((row) => column(row, "recordType") === "correction");
    const expectedCorrectionCount = status === "mismatch" || status === "unmigrated" ? 1 : 0;
    assert.equal(filteredCorrections.length, expectedCorrectionCount);
    assert.ok(filteredCorrections.every((row) => column(row, "classification") === status));
  }

  const mismatchCorrectionRow = correctionRows[0]!;
  assert.deepEqual(
    headers.map((header) => column(mismatchCorrectionRow, header)),
    [
      "correction",
      String(correctionIds[0]),
      String(fixtureUserIds[0]),
      "mismatch",
      "1",
      "monetary",
      "historical, mismatch\nreview",
      "125",
      "100",
      "100.41",
      "80.00",
      "41",
      "0",
      "",
      "",
      "",
      "",
      mismatchCreatedAt.toISOString(),
    ],
  );
  const unmigratedCorrectionRow = correctionRows[1]!;
  assert.equal(column(unmigratedCorrectionRow, "classification"), "unmigrated");
  assert.equal(column(unmigratedCorrectionRow, "beforeBonusBalanceRub"), "");
  assert.equal(column(unmigratedCorrectionRow, "beforeDifferenceCents"), "");
  assert.equal(column(unmigratedCorrectionRow, "createdAt"), unmigratedCreatedAt.toISOString());
  assert.equal(
    fixtureRows.some((row) => column(row, "reconciliationId") === String(correctionIds[2])),
    false,
    "corrections outside the inclusive date bounds should be excluded",
  );

  const afterExport = await snapshot();
  assert.deepEqual(afterExport, beforeExport, "GET export must not mutate users or correction history");
});
