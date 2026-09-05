import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test, { after, before } from "node:test";
import express from "express";
import { db } from "@workspace/db";
import { createToken } from "./auth.js";
import offersRouter from "./offers.js";

type OfferRow = {
  id: number;
  partnerId: number;
  title: string;
  description: string | null;
  bonusMultiplier: string;
  category: string;
  minAmountRub: string | null;
  isActive: boolean;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
};

type SavedAction = {
  id: number;
  userId: number;
  offerId: number;
  savedAt: Date;
  activatedAt: Date | null;
  updatedAt: Date;
};

type QueryStub = {
  from: (...args: unknown[]) => QueryStub;
  innerJoin: (...args: unknown[]) => QueryStub;
  where: (condition?: unknown) => QueryStub;
  orderBy: (...columns: unknown[]) => QueryStub;
  limit: (value?: number) => QueryStub;
  returning: (...args: unknown[]) => QueryStub;
  then: Promise<unknown[]>["then"];
};

type DbStub = {
  select: () => QueryStub;
  delete: () => QueryStub;
};

const mutableDb = db as unknown as DbStub;
const originalDbMethods = {
  select: mutableDb.select,
  delete: mutableDb.delete,
};

const offer: OfferRow = {
  id: 501,
  partnerId: 601,
  title: "Общее сохранённое предложение",
  description: "Предложение, сохранённое двумя пользователями",
  bonusMultiplier: "1.50",
  category: "food",
  minAmountRub: null,
  isActive: true,
  expiresAt: new Date("2026-12-31T00:00:00.000Z"),
  createdAt: new Date("2026-08-31T00:00:00.000Z"),
  updatedAt: new Date("2026-08-31T00:00:00.000Z"),
};

const partner = {
  name: "Общий партнёр",
  logoUrl: null,
};

let savedActions: SavedAction[];
let selectCalls: number;
let deleteError: Error | undefined;
let server: Server;
let baseUrl: string;
const originalNodeEnv = process.env.NODE_ENV;

function extractPredicates(condition: unknown): { userId?: number; offerId?: number } {
  const predicates: { userId?: number; offerId?: number } = {};

  function visitChunks(chunks: unknown[]): void {
    let column: string | undefined;
    for (const chunk of chunks) {
      if (Array.isArray(chunk)) {
        visitChunks(chunk);
        continue;
      }
      if (typeof chunk === "object" && chunk !== null) {
        const objectChunk = chunk as { name?: unknown; value?: unknown; queryChunks?: unknown };
        if (objectChunk.name === "user_id" || objectChunk.name === "offer_id") {
          column = objectChunk.name;
        }
        if (typeof objectChunk.value === "number" && column === "user_id") {
          predicates.userId = objectChunk.value;
        } else if (typeof objectChunk.value === "number" && column === "offer_id") {
          predicates.offerId = objectChunk.value;
        }
        if (Array.isArray(objectChunk.queryChunks)) {
          visitChunks(objectChunk.queryChunks);
        }
        continue;
      }
      if (typeof chunk === "number" && column === "user_id") {
        predicates.userId = chunk;
      } else if (typeof chunk === "number" && column === "offer_id") {
        predicates.offerId = chunk;
      }
    }
  }

  const queryChunks = (condition as { queryChunks?: unknown } | null)?.queryChunks;
  if (Array.isArray(queryChunks)) visitChunks(queryChunks);
  return predicates;
}

function queryStub(result: () => unknown[]): QueryStub {
  const query: QueryStub = {
    from: () => query,
    innerJoin: () => query,
    where: () => query,
    orderBy: () => query,
    limit: () => query,
    returning: () => query,
    then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject),
  };
  return query;
}

function configureDb({ savedUserId = 2, deleteFailure }: { savedUserId?: number; deleteFailure?: Error } = {}): void {
  selectCalls = 0;
  deleteError = deleteFailure;
  mutableDb.select = () => {
    selectCalls += 1;
    if (selectCalls === 1) {
      return queryStub(() =>
        savedActions
          .filter((action) => action.userId === savedUserId)
          .map(() => ({ offer })),
      );
    }
    if (selectCalls === 2) {
      return queryStub(() => [partner]);
    }
    return queryStub(() => savedActions.filter((action) => action.userId === savedUserId && action.offerId === offer.id));
  };
  mutableDb.delete = () => {
    let condition: unknown;
    const query: QueryStub = {
      from: () => {
        throw new Error("Unexpected from() call on delete query");
      },
      innerJoin: () => {
        throw new Error("Unexpected innerJoin() call on delete query");
      },
      where: (nextCondition) => {
        condition = nextCondition;
        return query;
      },
      orderBy: () => {
        throw new Error("Unexpected orderBy() call on delete query");
      },
      limit: () => query,
      returning: () => queryStub(() => {
        if (deleteError) {
          throw deleteError;
        }
        const predicates = extractPredicates(condition);
        const deleted = savedActions.filter((action) =>
          (predicates.userId === undefined || action.userId === predicates.userId)
          && (predicates.offerId === undefined || action.offerId === predicates.offerId),
        );
        savedActions = savedActions.filter((action) => !deleted.includes(action));
        return deleted.map((action) => ({ id: action.id }));
      }),
      then: (resolve, reject) => Promise.resolve([]).then(resolve, reject),
    };
    return query;
  };
}

function authHeaders(userId: number): Record<string, string> {
  return {
    authorization: `Bearer ${createToken({ userId, isAdmin: false })}`,
    "content-type": "application/json",
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

before(async () => {
  process.env.DATABASE_URL ??= "postgres://localhost/offers-tests";
  process.env.NODE_ENV = "production";

  const app = express();
  app.use(express.json());
  app.use("/offers", offersRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});


after(async () => {
  mutableDb.select = originalDbMethods.select;
  mutableDb.delete = originalDbMethods.delete;
  if (originalNodeEnv === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = originalNodeEnv;
  }
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

test("removing a saved offer only removes it from the signed-in user's list", async () => {
  const now = new Date("2026-08-31T10:00:00.000Z");
  savedActions = [
    { id: 701, userId: 1, offerId: offer.id, savedAt: now, activatedAt: null, updatedAt: now },
    { id: 702, userId: 2, offerId: offer.id, savedAt: now, activatedAt: null, updatedAt: now },
  ];
  configureDb();

  const unauthorizedResponse = await request(`/offers/${offer.id}/save`, { method: "DELETE" });
  assert.equal(unauthorizedResponse.status, 401);
  assert.equal(savedActions.length, 2);

  const removeResponse = await request(`/offers/${offer.id}/save`, {
    method: "DELETE",
    headers: authHeaders(1),
  });
  assert.equal(removeResponse.status, 204);
  assert.equal(savedActions.length, 1);
  assert.equal(savedActions[0].userId, 2);
  assert.equal(savedActions[0].offerId, offer.id);

  configureDb();
  const otherUserResponse = await request("/offers/saved", {
    headers: authHeaders(2),
  });
  assert.equal(otherUserResponse.status, 200);
  assert.deepEqual(await otherUserResponse.json(), [{
    id: offer.id,
    partnerId: offer.partnerId,
    partnerName: partner.name,
    partnerLogoUrl: null,
    title: offer.title,
    description: offer.description,
    bonusMultiplier: 1.5,
    category: offer.category,
    minAmountRub: null,
    isActive: true,
    expiresAt: offer.expiresAt.toISOString(),
    isSaved: true,
    isActivated: false,
  }]);
});

test("a failed saved-offer removal returns an error and keeps the offer saved", async () => {
  const now = new Date("2026-08-31T11:00:00.000Z");
  const savedAction = { id: 703, userId: 1, offerId: offer.id, savedAt: now, activatedAt: null, updatedAt: now };
  savedActions = [savedAction];
  configureDb({ savedUserId: 1, deleteFailure: new Error("database unavailable") });

  const removeResponse = await request(`/offers/${offer.id}/save`, {
    method: "DELETE",
    headers: authHeaders(1),
  });
  assert.equal(removeResponse.status, 500);
  assert.deepEqual(await removeResponse.json(), { error: "Unable to remove saved offer" });
  assert.deepEqual(savedActions, [savedAction]);

  configureDb({ savedUserId: 1 });
  const savedResponse = await request("/offers/saved", {
    headers: authHeaders(1),
  });
  assert.equal(savedResponse.status, 200);
  assert.deepEqual(await savedResponse.json(), [{
    id: offer.id,
    partnerId: offer.partnerId,
    partnerName: partner.name,
    partnerLogoUrl: null,
    title: offer.title,
    description: offer.description,
    bonusMultiplier: 1.5,
    category: offer.category,
    minAmountRub: null,
    isActive: true,
    expiresAt: offer.expiresAt.toISOString(),
    isSaved: true,
    isActivated: false,
  }]);
});