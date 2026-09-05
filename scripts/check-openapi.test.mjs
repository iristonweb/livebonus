import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checker = path.join(root, "scripts/check-openapi.mjs");

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [checker, ...args], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

const directory = await mkdtemp(path.join(os.tmpdir(), "loyalti-openapi-"));
try {
  const invalidPath = path.join(directory, "invalid.yaml");
  await writeFile(invalidPath, "openapi: [\n");
  const invalid = await run(["--spec", invalidPath]);
  assert.notEqual(invalid.code, 0);
  assert.match(invalid.stderr, /cannot parse/);

  const missing = await run(["--spec", path.join(directory, "missing.yaml")]);
  assert.notEqual(missing.code, 0);
  assert.match(missing.stderr, /cannot parse/);
  console.log("OpenAPI isolated invalid/missing fixtures passed");
} finally {
  await rm(directory, { recursive: true, force: true });
}