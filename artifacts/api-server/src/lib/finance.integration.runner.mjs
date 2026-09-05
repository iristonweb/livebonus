import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";

// Resolve pg from the database package, which already owns this dependency.
const requireFromDatabasePackage = createRequire(new URL("../../../../lib/db/src/index.ts", import.meta.url));
const { Pool } = requireFromDatabasePackage("pg");
const testBundle = "/tmp/loyalti-finance.integration.test.mjs";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL must be set to run finance integration tests");
}
const database = `finance_test_${process.pid}_${randomBytes(6).toString("hex")}`;

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function connectionUrlForDatabase(url, databaseName) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("DATABASE_URL must be a valid PostgreSQL connection URL");
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname || parsed.pathname === "/") {
    throw new Error("DATABASE_URL must be a PostgreSQL connection URL with a database name");
  }
  parsed.pathname = `/${databaseName}`;
  return parsed.toString();
}

function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: "inherit",
    });
    activeProcess = child;
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      activeProcess = undefined;
      if (signal) {
        reject(new Error(`${command} exited with signal ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

const adminPool = new Pool({ connectionString: databaseUrl });
const testDatabaseUrl = connectionUrlForDatabase(databaseUrl, database);
let activeProcess;
let shuttingDown = false;

async function removeDatabase() {
  await adminPool.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(database)} WITH (FORCE)`);
}

function forwardSignal(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  activeProcess?.kill(signal);
}

process.once("SIGINT", () => forwardSignal("SIGINT"));
process.once("SIGTERM", () => forwardSignal("SIGTERM"));

let exitCode = 1;
try {
  await adminPool.query(`CREATE DATABASE ${quoteIdentifier(database)}`);

  const schemaSetupCode = await run(
    "pnpm",
    ["--filter", "@workspace/db", "run", "push"],
    { ...process.env, DATABASE_URL: testDatabaseUrl },
  );
  if (schemaSetupCode !== 0) {
    exitCode = schemaSetupCode;
  } else {
    activeProcess = spawn(process.execPath, ["--test", "--test-force-exit", testBundle], {
      env: { ...process.env, DATABASE_URL: testDatabaseUrl, NODE_ENV: "test" },
      stdio: "inherit",
    });
    exitCode = await new Promise((resolve, reject) => {
      activeProcess.once("error", reject);
      activeProcess.once("exit", (code, signal) => {
        activeProcess = undefined;
        if (signal) {
          resolve(1);
          return;
        }
        resolve(code ?? 1);
      });
    });
  }
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  try {
    await removeDatabase();
  } catch (error) {
    console.error("Failed to remove finance integration database", error);
    exitCode = 1;
  }
  await adminPool.end();
}

process.exitCode = exitCode;