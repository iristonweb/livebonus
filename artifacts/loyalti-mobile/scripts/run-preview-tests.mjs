import { execFileSync, spawn } from "node:child_process";
import { mkdtemp, readFile, unlink } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportDirectory =
  process.env.RELEASE_REPORT_DIR ??
  (await mkdtemp(path.join(os.tmpdir(), "loyalti-mobile-preview-")));
let chromiumPath;
try {
  chromiumPath = execFileSync("which", ["chromium"], {
    encoding: "utf8",
  }).trim();
} catch {
  throw new Error(
    "Chromium is required for mobile preview checks; the Nix Chromium binary was not found.",
  );
}

function run(command, args, env = process.env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { env, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) reject(new Error(`${command} exited with ${signal}`));
      else resolve(code ?? 1);
    });
  });
}

function canBindPort(candidatePort) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.listen(candidatePort, "127.0.0.1", () => {
      server.close(() => resolve(true));
    });
  });
}

function findEphemeralPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const candidatePort =
        typeof address === "object" && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (candidatePort) resolve(String(candidatePort));
        else reject(new Error("Could not determine an available preview port"));
      });
    });
  });
}

function terminateProcessGroup(child, signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    try {
      child.kill(signal);
    } catch {
      // The process may have exited between the two cleanup attempts.
    }
  }
}

function runInterruptedBuild(signal, metroPort) {
  return new Promise((resolve, reject) => {
    const buildEnv = {
      ...process.env,
      METRO_BUILD_PORT: String(metroPort),
      RELEASE_REPORT_DIR: reportDirectory,
      REPLIT_DEV_DOMAIN: process.env.REPLIT_DEV_DOMAIN ?? "localhost",
    };
    const child = spawn("pnpm", ["run", "build"], {
      cwd: projectRoot,
      env: buildEnv,
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    let output = "";
    let terminationRequested = false;
    let timedOut = false;
    let settled = false;
    let terminationTimer;
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      requestTermination();
    }, 120_000);
    const forceTimer = setTimeout(() => {
      if (terminationRequested && child.exitCode === null && child.signalCode === null) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          child.kill("SIGKILL");
        }
      }
    }, 130_000);

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutTimer);
      clearTimeout(forceTimer);
      clearTimeout(terminationTimer);
      callback();
    };

    const requestTermination = () => {
      if (terminationRequested) return;
      terminationRequested = true;
      terminateProcessGroup(child, signal);
      terminationTimer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) {
          try {
            process.kill(-child.pid, "SIGKILL");
          } catch {
            child.kill("SIGKILL");
          }
        }
      }, 10_000);
    };

    const captureOutput = (chunk) => {
      output += chunk.toString();
      if (!terminationRequested && output.includes("Fetching ios bundle...")) {
        setTimeout(requestTermination, 100);
      }
    };

    child.stdout?.on("data", captureOutput);
    child.stderr?.on("data", captureOutput);
    child.once("error", (error) =>
      finish(() => reject(new Error(`Interrupted preview build could not start: ${error.message}`))),
    );
    child.once("exit", (code, signal) =>
      finish(() => {
        if (timedOut) {
          reject(
            new Error(
              `Interrupted preview build did not reach the bundle stage before timeout.\n${output.slice(-4_000)}`,
            ),
          );
          return;
        }
        resolve({ code, signal, output });
      }),
    );
  });
}

async function waitForPortRelease(candidatePort) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await canBindPort(Number(candidatePort))) return true;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return false;
}

async function assertInterruptedBuildReport(signal, result, metroPort) {
  if (result.code === 0 && !result.signal) {
    throw new Error(`${signal} regression build unexpectedly completed successfully`);
  }
  if (!(await waitForPortRelease(metroPort))) {
    throw new Error(`Metro port ${metroPort} remained occupied after ${signal}`);
  }

  let report;
  try {
    report = JSON.parse(
      await readFile(
        path.join(reportDirectory, `mobile-preview-build-${signal}.json`),
        "utf8",
      ),
    );
  } catch (error) {
    throw new Error(`${signal} regression report is missing or invalid: ${error.message}`);
  }

  if (report.passed !== false) {
    throw new Error(`${signal} regression report did not record a failed build`);
  }
  if (report.status !== "interrupted") {
    throw new Error(`${signal} regression report is missing the interrupted status`);
  }
  if (report.signal !== signal) {
    throw new Error(
      `${signal} regression report recorded signal ${report.signal ?? "none"}`,
    );
  }
  if (!report.stage || report.stage === "initializing") {
    throw new Error(`${signal} regression report is missing the active build stage`);
  }
  if (!report.request?.url) {
    throw new Error(`${signal} regression report is missing the Metro request URL`);
  }
  if (!report.error?.message) {
    throw new Error(`${signal} regression report is missing the interruption error`);
  }

  console.log(
    `Preview termination regression passed for ${signal}: ` +
      `exit=${result.code ?? result.signal}, stage=${report.stage}, url=${report.request.url}`,
  );
}

async function runBuildTerminationRegression(signal) {
  const metroPort = await findEphemeralPort();
  for (const reportName of [
    "mobile-preview-build.json",
    `mobile-preview-build-${signal}.json`,
  ]) {
    try {
      await unlink(path.join(reportDirectory, reportName));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  const result = await runInterruptedBuild(signal, metroPort);
  await assertInterruptedBuildReport(signal, result, metroPort);
}

const reportWriteFailureCode = await run(process.execPath, [
  path.join(projectRoot, "scripts/test-preview-report-failure.mjs"),
]);
if (reportWriteFailureCode !== 0) {
  throw new Error(
    `Preview report write failure regression failed with exit code ${reportWriteFailureCode}`,
  );
}

const requestedPort = process.env.MOBILE_PREVIEW_PORT;
let port = requestedPort ?? "23906";
if (
  !process.env.MOBILE_PREVIEW_BASE_URL &&
  !(await canBindPort(Number(port)))
) {
  port = await findEphemeralPort();
  console.log(
    `Preview port ${requestedPort ?? "23906"} is busy; using available port ${port}`,
  );
}
const baseUrl =
  process.env.MOBILE_PREVIEW_BASE_URL ?? `http://127.0.0.1:${port}/`;

for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  await runBuildTerminationRegression(signal);
}

async function waitForPreview() {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(baseUrl, {
        signal: AbortSignal.timeout(5_000),
      });
      if (response.ok) return;
    } catch {
      // The static server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Mobile preview did not become ready at ${baseUrl}`);
}

const buildEnv = { ...process.env };
delete buildEnv.CI;
if (!process.env.METRO_BUILD_PORT) {
  delete buildEnv.METRO_BUILD_PORT;
}
const buildCode = await run("pnpm", ["run", "build"], {
  ...buildEnv,
  BASE_PATH: process.env.BASE_PATH ?? "/",
  RELEASE_REPORT_DIR: reportDirectory,
});
if (buildCode !== 0) {
  throw new Error(`Mobile preview build failed with exit code ${buildCode}`);
}

const buildReportPath = path.join(reportDirectory, "mobile-preview-build.json");
try {
  const buildReport = JSON.parse(await readFile(buildReportPath, "utf8"));
  if (buildReport.passed !== true) {
    throw new Error(`report recorded passed=${String(buildReport.passed)}`);
  }
} catch (error) {
  throw new Error(
    `Mobile preview build report is missing or invalid: file "${buildReportPath}" ` +
      `in directory "${reportDirectory}": ${error.message}`,
  );
}

let server;
let ownsServer = false;
try {
  const existing = await fetch(baseUrl);
  if (!existing.ok) throw new Error("existing preview is not healthy");
} catch {
  const previewEnv = { ...process.env, PORT: port };
  delete previewEnv.CI;
  previewEnv.EXPO_PACKAGER_PROXY_URL = `https://${process.env.REPLIT_EXPO_DEV_DOMAIN ?? ""}`;
  previewEnv.EXPO_PUBLIC_DOMAIN = process.env.REPLIT_DEV_DOMAIN ?? "";
  previewEnv.EXPO_PUBLIC_REPL_ID = process.env.REPL_ID ?? "";
  previewEnv.REACT_NATIVE_PACKAGER_HOSTNAME = process.env.REPLIT_DEV_DOMAIN ?? "";
  server = spawn("pnpm", ["exec", "expo", "start", "--localhost", "--port", port], {
    env: previewEnv,
    stdio: "inherit",
    detached: true,
  });
  ownsServer = true;
}

let exitCode = 1;
try {
  await waitForPreview();
  exitCode = await run(
    "pnpm",
    ["exec", "playwright", "test", "--config", "playwright.finance.config.ts"],
    { ...process.env, CHROMIUM_PATH: chromiumPath, MOBILE_PREVIEW_BASE_URL: baseUrl, RELEASE_REPORT_DIR: reportDirectory },
  );
} finally {
  if (ownsServer && server?.pid) {
    try {
      process.kill(-server.pid, "SIGTERM");
    } catch {
      server.kill("SIGTERM");
    }
    await new Promise((resolve) => {
      const timeout = setTimeout(resolve, 5_000);
      server.once("exit", () => {
        clearTimeout(timeout);
        resolve();
      });
    });
    if (server.exitCode === null && server.signalCode === null) {
      try {
        process.kill(-server.pid, "SIGKILL");
      } catch {
        server.kill("SIGKILL");
      }
    }
  }
}

process.exitCode = exitCode;