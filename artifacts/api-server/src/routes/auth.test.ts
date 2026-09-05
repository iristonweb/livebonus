import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test, { after, before } from "node:test";
import express from "express";
import { db, otpRequestTimestampsTable, usersTable } from "@workspace/db";
import authRouter, { createToken, normalizePhone, verifyToken } from "./auth.js";
import usersRouter from "./users.js";

type QueryStub = {
  from: (...tables: unknown[]) => QueryStub;
  values: (values: Record<string, unknown>) => QueryStub;
  where: (condition?: unknown) => QueryStub;
  orderBy: (...columns: unknown[]) => QueryStub;
  execute: () => Promise<unknown>;
  limit: () => Promise<unknown[]>;
  set: (values: Record<string, unknown>) => QueryStub;
  returning: () => Promise<unknown[]>;
  onConflictDoNothing: () => QueryStub;
  then: Promise<unknown[]>["then"];
};

type DbStub = {
  select: () => QueryStub;
  insert: () => QueryStub;
  update: () => QueryStub;
  delete: () => QueryStub;
  transaction: <T>(callback: (transaction: DbStub) => Promise<T>) => Promise<T>;
};

const mutableDb = db as unknown as DbStub;
const originalDbMethods = {
  select: mutableDb.select,
  insert: mutableDb.insert,
  update: mutableDb.update,
  delete: mutableDb.delete,
  transaction: mutableDb.transaction,
};

let server: Server;
let baseUrl: string;

function queryStub(
  result: unknown[] | (() => unknown[]),
  onSet?: (values: Record<string, unknown>) => void,
  onFrom?: (tables: unknown[]) => unknown[],
  onWhere?: (condition: unknown, result: unknown[]) => unknown[],
): QueryStub {
  let currentResult = typeof result === "function" ? result() : result;
  const query: QueryStub = {
    from: (...tables) => {
      currentResult = onFrom?.(tables) ?? currentResult;
      return query;
    },
    values: (values) => {
      onSet?.(values);
      return query;
    },
    where: (condition) => {
      currentResult = onWhere?.(condition, currentResult) ?? currentResult;
      return query;
    },
    orderBy: () => query,
    execute: async () => [],
    limit: async () => currentResult,
    set: (values) => {
      onSet?.(values);
      return query;
    },
    returning: async () => currentResult,
    onConflictDoNothing: () => query,
    then: (onFulfilled, onRejected) => Promise.resolve(currentResult).then(onFulfilled, onRejected),
  };
  return query;
}

function findStringParam(value: unknown, seen = new Set<object>()): string | undefined {
  if (!value || typeof value !== "object" || seen.has(value)) return undefined;
  seen.add(value);

  if (value.constructor?.name === "Param" && "value" in value && typeof value.value === "string") {
    return value.value;
  }
  if ("queryChunks" in value && Array.isArray(value.queryChunks)) {
    for (const chunk of value.queryChunks) {
      const param = findStringParam(chunk, seen);
      if (param) return param;
    }
  }
  return undefined;
}

function configureDb({
  user = [],
  insertedUser = [],
  updatedUser = [],
  otpRequests = [],
  resetOtpRequests = true,
}: {
  user?: unknown[];
  insertedUser?: unknown[];
  updatedUser?: unknown[];
  otpRequests?: Record<string, unknown>[];
  resetOtpRequests?: boolean;
} = {}): void {
  const persistedOtpRequests: Record<string, unknown>[] = resetOtpRequests ? [...otpRequests] : otpRequests;

  mutableDb.select = () => {
    return queryStub([], undefined, (tables) => {
      if (tables[0] === otpRequestTimestampsTable) {
        return persistedOtpRequests;
      }
      if (tables[0] === usersTable) {
        return user;
      }
      return [];
    }, (condition, result) => {
      const phone = findStringParam(condition);
      return phone
        ? result.filter((row) => (row as Record<string, unknown>).phone === phone)
        : result;
    });
  };
  mutableDb.insert = () => {
    return queryStub([], (values) => {
      if ("requestedAt" in values) {
        persistedOtpRequests.push(values);
      }
    }, undefined, undefined);
  };
  mutableDb.update = () => queryStub(updatedUser);
  mutableDb.delete = () => queryStub([], undefined, undefined, () => {
    const now = Date.now();
    const cutoff = now - 10 * 60 * 1000;
    for (let index = persistedOtpRequests.length - 1; index >= 0; index--) {
      const requestedAt = persistedOtpRequests[index]?.requestedAt;
      if (requestedAt instanceof Date && requestedAt.getTime() < cutoff) {
        persistedOtpRequests.splice(index, 1);
      }
    }
    return [];
  });
  mutableDb.transaction = async (callback) => callback(mutableDb);

  // The first insert with a returning() call is the new user. Throttle
  // inserts have no returning() call, so defer the user result until then.
  const originalInsert = mutableDb.insert;
  mutableDb.insert = () => {
    const query = originalInsert();
    query.returning = async () => insertedUser;
    return query;
  };
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

async function responseJson(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function authHeaders(userId: number, isAdmin = false): Record<string, string> {
  return { authorization: `Bearer ${createToken({ userId, isAdmin })}` };
}

before(async () => {
  configureDb();
  const app = express();
  app.use(express.json());
  app.use("/auth", authRouter);
  app.use("/users", usersRouter);

  server = createServer(app);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  mutableDb.select = originalDbMethods.select;
  mutableDb.insert = originalDbMethods.insert;
  mutableDb.update = originalDbMethods.update;
  mutableDb.delete = originalDbMethods.delete;
  mutableDb.transaction = originalDbMethods.transaction;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("missing and expired OTPs return the expected errors", async () => {
  configureDb();
  const missingResponse = await request("/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ phone: "+79990000001", code: "1234" }),
  });

  assert.equal(missingResponse.status, 400);
  assert.deepEqual(await responseJson(missingResponse), {
    error: "Код не запрашивался или истёк. Запросите новый.",
  });

  const phone = "+79990000002";
  const requestResponse = await request("/auth/request-otp", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
  assert.equal(requestResponse.status, 200);

  const realDateNow = Date.now;
  Date.now = () => realDateNow() + 10 * 60 * 1000 + 1;
  try {
    const expiredResponse = await request("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ phone, code: "1234" }),
    });

    assert.equal(expiredResponse.status, 400);
    assert.deepEqual(await responseJson(expiredResponse), {
      error: "Срок действия кода истёк. Запросите новый.",
    });
  } finally {
    Date.now = realDateNow;
  }
});

test("three invalid OTP codes block the next verification attempt", async () => {
  configureDb();
  const phone = "+79990000003";
  const requestResponse = await request("/auth/request-otp", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
  assert.equal(requestResponse.status, 200);

  for (const attemptsLeft of [2, 1, 0]) {
    const invalidResponse = await request("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ phone, code: "0000" }),
    });

    assert.equal(invalidResponse.status, 400);
    assert.deepEqual(await responseJson(invalidResponse), {
      error: "Неверный код",
      attemptsLeft,
    });
  }

  const rateLimitedResponse = await request("/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ phone, code: "1234" }),
  });

  assert.equal(rateLimitedResponse.status, 429);
  assert.deepEqual(await responseJson(rateLimitedResponse), {
    error: "Слишком много попыток. Запросите новый код.",
  });
});

test("a fresh OTP unlocks a phone after the invalid-code limit", async () => {
  const phone = "+79990000005";
  const user = {
    id: 102,
    phone,
    name: "Пользователь 0005",
    isPhoneVerified: true,
  };
  configureDb({ user: [user] });

  const initialRequest = await request("/auth/request-otp", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
  assert.equal(initialRequest.status, 200);

  for (const attemptsLeft of [2, 1, 0]) {
    const invalidResponse = await request("/auth/verify-otp", {
      method: "POST",
      body: JSON.stringify({ phone, code: "0000" }),
    });

    assert.equal(invalidResponse.status, 400);
    assert.deepEqual(await responseJson(invalidResponse), {
      error: "Неверный код",
      attemptsLeft,
    });
  }

  const blockedResponse = await request("/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ phone, code: "1234" }),
  });
  assert.equal(blockedResponse.status, 429);

  const freshRequest = await request("/auth/request-otp", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
  assert.equal(freshRequest.status, 200);
  assert.equal((await responseJson(freshRequest)).devCode, "1234");

  const freshVerifyResponse = await request("/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ phone, code: "1234" }),
  });

  assert.equal(freshVerifyResponse.status, 200);
  const body = await responseJson(freshVerifyResponse);
  assert.equal(body.userId, user.id);
  assert.equal(body.phone, user.phone);
  assert.equal(typeof body.token, "string");
});

test("OTP resend requests are limited per phone and allowed again after the window", async () => {
  configureDb();
  const phone = "+79990000006";

  for (let requestNumber = 0; requestNumber < 3; requestNumber++) {
    const response = await request("/auth/request-otp", {
      method: "POST",
      body: JSON.stringify({ phone }),
    });
    assert.equal(response.status, 200);
  }

  const limitedResponse = await request("/auth/request-otp", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
  assert.equal(limitedResponse.status, 429);
  const retryAfter = limitedResponse.headers.get("retry-after");
  assert.ok(retryAfter);
  assert.ok(Number(retryAfter) > 0);
  assert.deepEqual(await responseJson(limitedResponse), {
    error: "Слишком много запросов кода. Повторите позже.",
    retryAfter: Number(retryAfter),
  });

  const realDateNow = Date.now;
  Date.now = () => realDateNow() + 10 * 60 * 1000 + 1;
  try {
    const allowedResponse = await request("/auth/request-otp", {
      method: "POST",
      body: JSON.stringify({ phone }),
    });
    assert.equal(allowedResponse.status, 200);
  } finally {
    Date.now = realDateNow;
  }
});

test("persisted OTP resend history is enforced after an API restart", async () => {
  const phone = "+79990000007";
  const now = Date.now();
  const persistedHistory = [0, 1, 2].map((minutesAgo) => ({
    phone: "79990000007",
    requestedAt: new Date(now - minutesAgo * 60 * 1000),
  }));

  // A fresh route instance sees the rows left by the previous process.
  configureDb({ otpRequests: persistedHistory });

  const response = await request("/auth/request-otp", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });

  assert.equal(response.status, 429);
  assert.equal((await responseJson(response)).error, "Слишком много запросов кода. Повторите позже.");
});

test("simultaneous OTP requests cannot exceed the resend limit for one phone", async () => {
  configureDb();
  const phone = "+79990000010";

  const responses = await Promise.all(
    Array.from({ length: 8 }, () =>
      request("/auth/request-otp", {
        method: "POST",
        body: JSON.stringify({ phone }),
      }),
    ),
  );

  assert.equal(responses.filter((response) => response.status === 200).length, 3);
  assert.equal(responses.filter((response) => response.status === 429).length, 5);
});

test("simultaneous OTP request limits remain independent for different phones", async () => {
  configureDb();
  const phones = ["+79990000011", "+79990000012"];

  const responses = await Promise.all(
    phones.flatMap((phone) =>
      Array.from({ length: 3 }, () =>
        request("/auth/request-otp", {
          method: "POST",
          body: JSON.stringify({ phone }),
        }),
      ),
    ),
  );

  assert.equal(responses.filter((response) => response.status === 200).length, 6);
  assert.equal(responses.filter((response) => response.status === 429).length, 0);
});

test("expired throttle rows are cleaned without removing an active verification code", async () => {
  const activePhone = "+79990000008";
  const cleanupPhone = "+79990000009";
  const user = {
    id: 103,
    phone: activePhone,
    name: "Пользователь 0008",
    isPhoneVerified: true,
  };

  configureDb();
  const activeRequest = await request("/auth/request-otp", {
    method: "POST",
    body: JSON.stringify({ phone: activePhone }),
  });
  assert.equal(activeRequest.status, 200);

  configureDb({
    user: [user],
    otpRequests: [{
      phone: "79990000009",
      requestedAt: new Date(Date.now() - 10 * 60 * 1000 - 1),
    }],
  });
  const cleanupRequest = await request("/auth/request-otp", {
    method: "POST",
    body: JSON.stringify({ phone: cleanupPhone }),
  });
  assert.equal(cleanupRequest.status, 200);

  const verifyResponse = await request("/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ phone: activePhone, code: "1234" }),
  });
  assert.equal(verifyResponse.status, 200);
  assert.equal((await responseJson(verifyResponse)).userId, user.id);
});

test("a fresh valid OTP creates a user and returns a session token", async () => {
  const phone = "+79990000004";
  const user = {
    id: 101,
    phone,
    name: "Пользователь 0004",
    isPhoneVerified: true,
  };
  configureDb({ insertedUser: [user] });

  const requestResponse = await request("/auth/request-otp", {
    method: "POST",
    body: JSON.stringify({ phone }),
  });
  assert.equal(requestResponse.status, 200);
  assert.equal((await responseJson(requestResponse)).devCode, "1234");

  const verifyResponse = await request("/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ phone, code: "1234" }),
  });

  assert.equal(verifyResponse.status, 200);
  const body = await responseJson(verifyResponse);
  assert.equal(body.userId, user.id);
  assert.equal(body.phone, user.phone);
  assert.equal(body.name, user.name);
  assert.equal(body.isAdmin, false);
  assert.equal(typeof body.token, "string");
  assert.ok((body.token as string).split(".").length === 3);
});

test("private user routes reject missing and ordinary-user admin requests", async () => {
  configureDb();

  const missingResponse = await request("/users/me");
  assert.equal(missingResponse.status, 401);

  const ordinaryToken = createToken({ userId: 101, isAdmin: false });
  const adminListResponse = await request("/users", {
    headers: { authorization: `Bearer ${ordinaryToken}` },
  });
  assert.equal(adminListResponse.status, 403);
});

test("session tokens expire and logout revokes the active session", async () => {
  const expiredToken = createToken({
    userId: 101,
    exp: Math.floor(Date.now() / 1000) - 1,
  });
  assert.equal(verifyToken(expiredToken), null);

  const token = createToken({ userId: 101, isAdmin: false });
  assert.ok(verifyToken(token));

  const logoutResponse = await request("/auth/logout", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(logoutResponse.status, 200);
  assert.equal(verifyToken(token), null);

  const repeatedLogoutResponse = await request("/auth/logout", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(repeatedLogoutResponse.status, 401);
});

test("OTP accepts common Russian phone formats but stores and returns one canonical form", async () => {
  const canonicalPhone = "+79990000013";
  const user = {
    id: 104,
    phone: canonicalPhone,
    name: "Пользователь 0013",
    isPhoneVerified: true,
  };
  configureDb({ insertedUser: [user] });

  const requestResponse = await request("/auth/request-otp", {
    method: "POST",
    body: JSON.stringify({ phone: "8 (999) 000-00-13" }),
  });
  assert.equal(requestResponse.status, 200);
  assert.equal(normalizePhone("8 (999) 000-00-13"), canonicalPhone);

  const verifyResponse = await request("/auth/verify-otp", {
    method: "POST",
    body: JSON.stringify({ phone: canonicalPhone, code: "1234" }),
  });
  assert.equal(verifyResponse.status, 200);
  assert.equal((await responseJson(verifyResponse)).phone, canonicalPhone);
});

test("identity and income requests require a document instead of creating a fake pending request", async () => {
  const user = {
    id: 105,
    phone: "+79990000015",
    name: "Заявитель",
    isIdentityVerified: false,
    isIncomeVerified: false,
    identityVerificationStatus: "not_started",
    incomeVerificationStatus: "not_started",
    verificationLevel: 1,
  };
  configureDb({ user: [user] });

  const requestResponse = await request("/users/me/verify/identity", {
    method: "POST",
    headers: authHeaders(user.id),
  });
  assert.equal(requestResponse.status, 400);
  assert.match(String((await responseJson(requestResponse)).error), /документ/i);
});