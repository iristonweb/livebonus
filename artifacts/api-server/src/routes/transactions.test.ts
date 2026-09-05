import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test, { after, before } from "node:test";
import express from "express";
import {
  db,
  financialLedgerEntriesTable,
  transactionsTable,
} from "@workspace/db";
import { createToken } from "./auth.js";
import transactionsRouter from "./transactions.js";

type QueryStub = {
  from: (...args: unknown[]) => QueryStub;
  leftJoin: (...args: unknown[]) => QueryStub;
  where: (condition?: unknown) => QueryStub;
  orderBy: (...args: unknown[]) => QueryStub;
  limit: (value?: number) => QueryStub;
  offset: (value?: number) => QueryStub;
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

const transaction = {
  id: 901,
  userId: 2,
  partnerId: null,
  type: "earn",
  category: "shopping",
  amountRub: "125.50",
  pointsEarned: 125,
  multiplier: "1.00",
  description: "Покупка в магазине",
  createdAt: new Date("2026-08-31T12:00:00.000Z"),
};

const otherUsersTransaction = {
  ...transaction,
  id: 902,
  userId: 3,
  description: "Чужая покупка",
  createdAt: new Date("2026-08-31T12:01:00.000Z"),
};

let server: Server;
let baseUrl: string;
let mutationCalls: number;

function extractPredicates(condition: unknown): { transactionId?: number; userId?: number } {
  const predicates: { transactionId?: number; userId?: number } = {};

  function visitChunks(chunks: unknown[]): void {
    let column: string | undefined;
    for (const chunk of chunks) {
      if (Array.isArray(chunk)) {
        visitChunks(chunk);
        continue;
      }
      if (typeof chunk === "object" && chunk !== null) {
        const objectChunk = chunk as { name?: unknown; value?: unknown; queryChunks?: unknown };
        if (objectChunk.name === "id" || objectChunk.name === "transaction_id" || objectChunk.name === "user_id") {
          column = objectChunk.name;
        }
        if (typeof objectChunk.value === "number" && column === "id") {
          predicates.transactionId = objectChunk.value;
        } else if (typeof objectChunk.value === "number" && column === "transaction_id") {
          predicates.transactionId = objectChunk.value;
        } else if (typeof objectChunk.value === "number" && column === "user_id") {
          predicates.userId = objectChunk.value;
        }
        if (Array.isArray(objectChunk.queryChunks)) {
          visitChunks(objectChunk.queryChunks);
        }
        continue;
      }
      if (typeof chunk === "number" && column === "id") {
        predicates.transactionId = chunk;
      } else if (typeof chunk === "number" && column === "transaction_id") {
        predicates.transactionId = chunk;
      } else if (typeof chunk === "number" && column === "user_id") {
        predicates.userId = chunk;
      }
    }
  }

  const queryChunks = (condition as { queryChunks?: unknown } | null)?.queryChunks;
  if (Array.isArray(queryChunks)) visitChunks(queryChunks);
  return predicates;
}

function queryStub(result: (condition: unknown) => unknown[]): QueryStub {
  let source: unknown;
  let condition: unknown;
  const query: QueryStub = {
    from: (...args) => {
      source = args[0];
      return query;
    },
    leftJoin: () => query,
    where: (nextCondition) => {
      condition = nextCondition;
      return query;
    },
    orderBy: () => query,
    limit: () => query,
    offset: () => query,
    then: (resolve, reject) => Promise.resolve(
      source === transactionsTable
        ? result(condition)
        : source === financialLedgerEntriesTable
          ? []
          : [],
    ).then(resolve, reject),
  };
  return query;
}

function configureDb(transactions = [transaction]): void {
  mutationCalls = 0;
  mutableDb.select = () => queryStub((condition) => {
    const predicates = extractPredicates(condition);
    return transactions.filter((candidate) => (
      (predicates.transactionId === undefined || predicates.transactionId === candidate.id)
      && (predicates.userId === undefined || predicates.userId === candidate.userId)
    ));
  });
  mutableDb.insert = () => {
    mutationCalls++;
    return queryStub(() => []);
  };
  mutableDb.update = () => {
    mutationCalls++;
    return queryStub(() => []);
  };
  mutableDb.delete = () => {
    mutationCalls++;
    return queryStub(() => []);
  };
}

async function request(path: string, userId: number): Promise<Response> {
  return fetch(`${baseUrl}${path}`, {
    headers: {
      authorization: `Bearer ${createToken({ userId, isAdmin: false })}`,
      "content-type": "application/json",
    },
  });
}

async function responseJson<T = Record<string, unknown>>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

before(async () => {
  process.env.DATABASE_URL ??= "postgres://localhost/transactions-tests";
  process.env.NODE_ENV = "test";

  const app = express();
  app.use(express.json());
  app.use("/api/transactions", transactionsRouter);
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
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test("transaction details stay private to the owner without changing wallet data", async () => {
  configureDb();
  const transactionBefore = { ...transaction };
  const path = `/api/transactions/${transaction.id}`;

  const deniedResponse = await request(path, 3);

  assert.equal(
    deniedResponse.status,
    404,
    `[wallet] GET ${path} exposed another user's transaction to a non-admin session`,
  );
  assert.deepEqual(
    await responseJson(deniedResponse),
    { error: "Transaction not found" },
    `[wallet] GET ${path} returned an unexpected denial response`,
  );
  assert.deepEqual(
    transaction,
    transactionBefore,
    `[wallet] GET ${path} mutated the transaction while denying access`,
  );
  assert.equal(
    mutationCalls,
    0,
    `[wallet] GET ${path} performed a database mutation while denying access`,
  );

  const ownerResponse = await request(path, transaction.userId);

  assert.equal(
    ownerResponse.status,
    200,
    `[wallet] GET ${path} denied the authorized owner`,
  );
  const ownerBody = await responseJson(ownerResponse);
  assert.equal(ownerBody.id, transaction.id, `[wallet] GET ${path} returned the wrong transaction`);
  assert.equal(ownerBody.userId, transaction.userId, `[wallet] GET ${path} returned the wrong wallet owner`);
  assert.equal(mutationCalls, 0, `[wallet] GET ${path} mutated transaction data during a read`);
});

test("wallet history only returns the session user's transactions without changing wallet data", async () => {
  configureDb([transaction, otherUsersTransaction]);
  const transactionsBefore = [{ ...transaction }, { ...otherUsersTransaction }];
  const path = "/api/transactions";

  const response = await request(path, transaction.userId);

  assert.equal(
    response.status,
    200,
    `[wallet] GET ${path} failed for a non-admin session`,
  );
  const body = await responseJson<Array<Record<string, unknown>>>(response);
  assert.deepEqual(
    body.map(({ id, userId }) => ({ id, userId })),
    [{ id: transaction.id, userId: transaction.userId }],
    `[wallet] GET ${path} returned another user's transaction`,
  );
  assert.deepEqual(
    [transaction, otherUsersTransaction],
    transactionsBefore,
    `[wallet] GET ${path} mutated wallet history while reading it`,
  );
  assert.equal(
    mutationCalls,
    0,
    `[wallet] GET ${path} performed a database mutation during a read`,
  );
});
