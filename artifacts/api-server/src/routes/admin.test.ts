import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test, { after, before } from "node:test";
import express from "express";
import { db } from "@workspace/db";
import { createToken } from "./auth.js";
import adminRouter from "./admin.js";

type CatalogAuditRow = {
  id: number;
  adminUserId: number;
  adminName: string;
  adminPhone: string | null;
  entityType: "partner" | "offer";
  entityId: number;
  entityName: string;
  action: "create" | "update" | "delete";
  changes: Record<
    string,
    {
      from: string | number | boolean | null;
      to: string | number | boolean | null;
    }
  >;
  createdAt: Date;
};

type QueryStub = {
  from: () => QueryStub;
  where: (condition?: unknown) => QueryStub;
  orderBy: (...columns: unknown[]) => QueryStub;
  limit: (value: number) => QueryStub;
  then: Promise<unknown[]>["then"];
};

type DbStub = {
  select: () => QueryStub;
};

const mutableDb = db as unknown as DbStub;
const originalSelect = mutableDb.select;

let server: Server;
let baseUrl: string;
let selectedRows: unknown[] = [];
let whereConditions: unknown[] = [];

function queryStub(result: unknown[]): QueryStub {
  const resultPromise = Promise.resolve(result);
  const query: QueryStub = {
    from: () => query,
    where: (condition) => {
      whereConditions.push(condition);
      return query;
    },
    orderBy: () => query,
    limit: () => query,
    then: resultPromise.then.bind(resultPromise),
  };
  return query;
}

function configureDb(rows: unknown[]): void {
  selectedRows = rows;
  whereConditions = [];
  mutableDb.select = () => queryStub(selectedRows);
}

function authHeaders(): Record<string, string> {
  return {
    authorization: `Bearer ${createToken({ userId: 7, isAdmin: true })}`,
  };
}

async function request(path: string): Promise<Response> {
  return fetch(`${baseUrl}${path}`, { headers: authHeaders() });
}

function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index];
    if (inQuotes) {
      if (character === '"' && csv[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"' && cell.length === 0) {
      inQuotes = true;
    } else if (character === ",") {
      row.push(cell);
      cell = "";
    } else if (character === "\r" || character === "\n") {
      if (character === "\r" && csv[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (inQuotes) throw new Error("CSV ended inside a quoted cell");
  if (row.length > 0 || cell.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function rowRecord(
  headers: string[],
  values: string[],
): Record<string, string> {
  assert.equal(values.length, headers.length);
  return Object.fromEntries(
    headers.map((header, index) => [header, values[index] ?? ""]),
  );
}

async function exportRecords(path: string): Promise<{
  headers: string[];
  records: Record<string, string>[];
}> {
  const response = await request(path);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/csv/);
  assert.equal(
    response.headers.get("content-disposition"),
    'attachment; filename="catalog-audit-log.csv"',
  );

  const rows = parseCsv(await response.text());
  const [headers, ...dataRows] = rows;
  assert.ok(headers);
  return {
    headers,
    records: dataRows.map((values) => rowRecord(headers, values)),
  };
}

before(async () => {
  process.env.NODE_ENV = "test";

  const app = express();
  app.use("/admin", adminRouter);
  server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  mutableDb.select = originalSelect;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("unfiltered catalog audit exports preserve special characters and audit-only fields", async () => {
  const firstChanges = {
    description: {
      from: 'Old description, with "quotes"\nand a second line',
      to: 'New description, with "quotes"\nand a second line',
    },
    logoUrl: {
      from: null,
      to: 'https://cdn.example/logo, "v2".svg',
    },
  } as const;
  configureDb([
    {
      id: 1,
      adminUserId: 7,
      adminName: 'Admin, "Review"\nTeam',
      adminPhone: "+79990000000",
      entityType: "offer",
      entityId: 42,
      entityName: 'Offer, "Special"\nName',
      action: "update",
      changes: firstChanges,
      createdAt: new Date("2026-08-30T12:00:00.000Z"),
    },
    {
      id: 2,
      adminUserId: 7,
      adminName: "Another administrator",
      adminPhone: "+79991111111",
      entityType: "partner",
      entityId: 9,
      entityName: "Plain partner",
      action: "create",
      changes: { title: { from: null, to: "New partner" } },
      createdAt: new Date("2026-08-30T11:00:00.000Z"),
    },
  ]);

  const { headers, records } = await exportRecords(
    "/admin/catalog-audit-log/export",
  );

  assert.deepEqual(headers, [
    "administrator",
    "timestamp",
    "entityType",
    "entityId",
    "entityName",
    "action",
    "beforeValues",
    "afterValues",
  ]);
  assert.equal(records.length, 2);
  assert.equal(records[0]?.administrator, 'Admin, "Review"\nTeam');
  assert.equal(records[0]?.entityName, 'Offer, "Special"\nName');
  assert.equal(
    records[0]?.beforeValues,
    JSON.stringify({
      description: firstChanges.description.from,
      logoUrl: firstChanges.logoUrl.from,
    }),
  );
  assert.equal(
    records[0]?.afterValues,
    JSON.stringify({
      description: firstChanges.description.to,
      logoUrl: firstChanges.logoUrl.to,
    }),
  );
  assert.equal(records[1]?.entityName, "Plain partner");
  assert.equal(
    records.some((record) => "adminPhone" in record),
    false,
  );
  assert.equal(JSON.stringify(records).includes("+79990000000"), false);
  assert.deepEqual(whereConditions, [undefined]);
});

test("filtered catalog audit export returns only the selected audit slice", async () => {
  const filteredRow: CatalogAuditRow = {
    id: 3,
    adminUserId: 7,
    adminName: "Catalog reviewer",
    adminPhone: "+79992222222",
    entityType: "offer",
    entityId: 84,
    entityName: "Filtered offer",
    action: "update",
    changes: {
      logoUrl: {
        from: "old-logo.svg",
        to: 'new-logo, "approved".svg',
      },
    },
    createdAt: new Date("2026-08-30T10:00:00.000Z"),
  };
  configureDb([filteredRow]);

  const { records } = await exportRecords(
    "/admin/catalog-audit-log/export?entityType=offer&action=update",
  );

  assert.equal(records.length, 1);
  assert.equal(records[0]?.entityType, "offer");
  assert.equal(records[0]?.action, "update");
  assert.equal(records[0]?.entityName, "Filtered offer");
  assert.equal(
    records[0]?.afterValues,
    JSON.stringify({ logoUrl: filteredRow.changes.logoUrl.to }),
  );
  assert.equal("adminPhone" in (records[0] ?? {}), false);
  assert.equal(whereConditions.length, 1);
  assert.notEqual(whereConditions[0], undefined);
});

test("webhook rejection history returns safe source aggregates for administrators", async () => {
  configureDb([
    {
      sourceIp: "203.0.113.10",
      createdAt: new Date("2026-08-31T12:00:00.000Z"),
    },
    {
      sourceIp: "203.0.113.10",
      createdAt: new Date("2026-08-31T11:00:00.000Z"),
    },
    {
      sourceIp: null,
      createdAt: new Date("2026-08-31T10:00:00.000Z"),
    },
  ]);

  const response = await request("/admin/security/webhook-rejections");
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    totalRejected: 3,
    uniqueSources: 2,
    sources: [
      {
        sourceIp: "203.0.113.10",
        occurrenceCount: 2,
        firstSeenAt: "2026-08-31T11:00:00.000Z",
        lastSeenAt: "2026-08-31T12:00:00.000Z",
      },
      {
        sourceIp: null,
        occurrenceCount: 1,
        firstSeenAt: "2026-08-31T10:00:00.000Z",
        lastSeenAt: "2026-08-31T10:00:00.000Z",
      },
    ],
    recentSourceAddresses: ["203.0.113.10", null],
  });
});

test("webhook rejection history is not available without administrator authentication", async () => {
  const response = await fetch(`${baseUrl}/admin/security/webhook-rejections`);
  assert.equal(response.status, 401);
});
