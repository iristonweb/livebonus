import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import net from "node:net";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const buildScript = path.join(scriptDirectory, "build.js");

function reservePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      if (!port) {
        server.close();
        reject(new Error("Could not determine the reserved Metro port"));
        return;
      }
      resolve({ server, port });
    });
  });
}

function runBuild(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [buildScript], {
      cwd: projectRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      child.kill("SIGKILL");
      settled = true;
      reject(new Error(`Diagnostic build did not exit in time.\n${output}`));
    }, 15_000);

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      callback();
    };

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.once("error", (error) =>
      finish(() =>
        reject(new Error(`Diagnostic build could not start: ${error.message}`)),
      ),
    );
    child.once("exit", (code, signal) =>
      finish(() => resolve({ code: code ?? 1, signal, output })),
    );
  });
}

const temporaryDirectory = await mkdtemp(
  path.join(os.tmpdir(), "loyalti-preview-report-failure-"),
);
const reportDirectory = path.join(temporaryDirectory, "unavailable-report-dir");
const reportPath = path.join(reportDirectory, "mobile-preview-build.json");
let reservedPort;

try {
  await writeFile(
    reportDirectory,
    "This file blocks the report directory path",
  );
  reservedPort = await reservePort();

  const sourceBuildError =
    `Metro build port ${reservedPort.port} is already in use. ` +
    "Stop the process or choose another METRO_BUILD_PORT.";
  const result = await runBuild({
    ...process.env,
    METRO_BUILD_PORT: String(reservedPort.port),
    RELEASE_REPORT_DIR: reportDirectory,
    REPLIT_DEV_DOMAIN: process.env.REPLIT_DEV_DOMAIN ?? "localhost",
  });

  assert.notEqual(
    result.code,
    0,
    `Diagnostic build unexpectedly succeeded.\n${result.output}`,
  );
  assert.equal(result.signal, null, result.output);
  assert.match(
    result.output,
    new RegExp(
      `Build failed during starting Metro: ${sourceBuildError.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
    ),
  );
  assert.match(
    result.output,
    new RegExp(
      `Could not write mobile preview build report file "${reportPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" ` +
        `in directory "${reportDirectory.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}":`,
    ),
  );
  assert.match(result.output, /EEXIST|not a directory/);

  console.log("Preview report write failure regression: PASS");
} finally {
  if (reservedPort?.server) {
    await new Promise((resolve) => reservedPort.server.close(resolve));
  }
  await rm(temporaryDirectory, { recursive: true, force: true });
}
