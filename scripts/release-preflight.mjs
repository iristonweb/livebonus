import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportDirectory = process.env.RELEASE_REPORT_DIR ?? path.join(root, "reports");
await mkdir(reportDirectory, { recursive: true });

const required = [
  "DATABASE_URL",
  "SESSION_SECRET",
  "YOOKASSA_SHOP_ID",
  "YOOKASSA_SECRET_KEY",
  "YOOKASSA_WEBHOOK_ALLOWED_CIDRS",
];
const missing = required.filter((key) => !process.env[key]?.trim());
const checks = [];

function record(name, passed, details) {
  checks.push({ name, passed, details });
}

record("production environment", process.env.NODE_ENV === "production", {
  required: "NODE_ENV=production",
});
record("required environment", missing.length === 0, {
  missing,
  checked: required,
});
record("port", /^\d+$/.test(process.env.PORT ?? "") && Number(process.env.PORT) > 0, {
  required: "a positive PORT",
});

if (missing.includes("DATABASE_URL")) {
  record("database connectivity/schema", false, { reason: "DATABASE_URL is missing" });
} else {
  const result = spawnSync(
    "psql",
    ["-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", "select count(*) from information_schema.tables where table_schema = 'public'"],
    { env: process.env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const tableCount = Number(result.stdout?.trim());
  record("database connectivity/schema", result.status === 0 && Number.isInteger(tableCount) && tableCount > 0, {
    exitCode: result.status,
    publicTableCount: result.status === 0 ? tableCount : null,
  });
}

const report = {
  generatedAt: new Date().toISOString(),
  productionPreflight: true,
  passed: checks.every((check) => check.passed),
  checks,
  secrets: { valuesPrinted: false, checkedNames: required },
  nativeDeviceCoverage: {
    status: "not_available",
    report: "artifacts/loyalti-mobile/docs/native-device-release-report.md",
    note: "This browser-only preflight does not substitute for iOS/Android device validation.",
  },
};
await writeFile(path.join(reportDirectory, "production-preflight.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(
  report.passed
    ? "Production preflight passed (secret values were not printed)."
    : `Production preflight failed: ${checks.filter((check) => !check.passed).map((check) => check.name).join(", ")}`,
);
if (!report.passed) process.exitCode = 1;