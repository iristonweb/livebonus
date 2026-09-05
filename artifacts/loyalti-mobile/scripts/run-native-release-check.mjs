import { execFileSync, spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const reportDirectory = path.resolve(
  process.env.RELEASE_REPORT_DIR ??
    path.join(projectRoot, "test-results", "native-release"),
);
const reportJsonPath = path.join(reportDirectory, "native-device-release-report.json");
const reportMarkdownPath = path.join(reportDirectory, "native-device-release-report.md");
const timeoutMs = Number(process.env.NATIVE_DEVICE_TEST_TIMEOUT_MS ?? 30 * 60 * 1_000);
const platforms = ["ios", "android"];
const requiredScenarios = [
  "authSession",
  "passportPrivacy",
  "scoreDispute",
  "hostedCheckoutReturn",
];
const paymentStatuses = ["succeeded", "canceled", "failed"];

const packageJson = JSON.parse(
  await readFile(path.join(projectRoot, "package.json"), "utf8"),
);
const appConfig = JSON.parse(
  await readFile(path.join(projectRoot, "app.json"), "utf8"),
);
const expoConfig = appConfig.expo ?? {};

function commandExists(command) {
  try {
    execFileSync("sh", ["-c", `command -v ${command}`], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} must be valid JSON: ${error.message}`);
  }
}

function normalizePlatform(value) {
  const platform = String(value ?? "").toLowerCase();
  return platform === "ios" || platform === "android" ? platform : null;
}

function normalizeTarget(target, source = "configured") {
  const platform = normalizePlatform(target?.platform);
  if (!platform) return null;
  const targetId = String(target?.targetId ?? target?.id ?? "").trim();
  if (!targetId) return null;
  return {
    platform,
    targetId,
    model: target.model ?? "Unknown target",
    os: target.os ?? "Unknown OS",
    expoGoVersion: target.expoGoVersion ?? null,
    buildVersion: target.buildVersion ?? expoConfig.version ?? packageJson.version,
    source,
  };
}

function configuredTargets() {
  const raw = process.env.NATIVE_DEVICE_TARGETS_JSON;
  if (raw) {
    let targets;
    try {
      targets = parseJson(raw, "NATIVE_DEVICE_TARGETS_JSON");
    } catch (error) {
      return {
        targets: [],
        errors: [error.message],
        counts: { ios: 0, android: 0 },
      };
    }
    if (!Array.isArray(targets)) {
      return {
        targets: [],
        errors: ["NATIVE_DEVICE_TARGETS_JSON must be an array"],
        counts: { ios: 0, android: 0 },
      };
    }
    const errors = [];
    const normalizedTargets = [];
    const counts = { ios: 0, android: 0 };
    for (const [index, target] of targets.entries()) {
      const rawPlatform = String(target?.platform ?? "").trim();
      const platform = normalizePlatform(rawPlatform);
      if (!platform) {
        errors.push(
          `Unknown target platform "${rawPlatform || "missing"}" at index ${index}; expected ios or android`,
        );
        continue;
      }
      const normalized = normalizeTarget(target);
      if (!normalized) {
        errors.push(
          `NATIVE_DEVICE_TARGETS_JSON[${index}] must include platform (ios/android) and targetId`,
        );
        continue;
      }
      normalizedTargets.push(normalized);
      counts[platform] += 1;
    }
    for (const platform of platforms) {
      if (counts[platform] !== 1) {
        const displayPlatform = platform === "ios" ? "iOS" : "Android";
        errors.push(
          `${displayPlatform} platform is not covered by exactly one configured target (found ${counts[platform]})`,
        );
      }
    }
    return { targets: normalizedTargets, errors, counts };
  }

  const configured = [];
  for (const platform of platforms) {
    const id = process.env[`NATIVE_${platform.toUpperCase()}_TARGET_ID`];
    if (!id) continue;
    configured.push(
      normalizeTarget({
        platform,
        targetId: id,
        model: process.env[`NATIVE_${platform.toUpperCase()}_MODEL`],
        os: process.env[`NATIVE_${platform.toUpperCase()}_OS`],
        expoGoVersion: process.env.NATIVE_EXPO_GO_VERSION,
        buildVersion: process.env.NATIVE_BUILD_VERSION,
      }),
    );
  }
  return {
    targets: configured.filter(Boolean),
    errors: [],
    counts: Object.fromEntries(
      platforms.map((platform) => [
        platform,
        configured.filter((target) => target?.platform === platform).length,
      ]),
    ),
  };
}

function discoverAndroidTarget() {
  if (!commandExists("adb")) return null;
  try {
    const output = execFileSync("adb", ["devices", "-l"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const deviceLine = output
      .split("\n")
      .find((line) => /^\S+\s+device\b/.test(line));
    if (!deviceLine) return null;
    const [, targetId, ...details] = deviceLine.trim().split(/\s+/);
    const modelDetail = details.find((detail) => detail.startsWith("model:"));
    let os = "Unknown Android OS";
    try {
      os = execFileSync("adb", ["-s", targetId, "shell", "getprop", "ro.build.version.release"], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim() || os;
    } catch {
      // The device is still a valid target if getprop is unavailable.
    }
    return normalizeTarget({
      platform: "android",
      targetId,
      model: modelDetail ? modelDetail.slice("model:".length).replaceAll("_", " ") : targetId,
      os,
    }, "adb");
  } catch {
    return null;
  }
}

function discoverIosTarget() {
  if (!commandExists("xcrun")) return null;
  try {
    const output = execFileSync("xcrun", ["simctl", "list", "devices", "available", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const devices = parseJson(output, "xcrun simctl output").devices ?? {};
    for (const [runtime, runtimeDevices] of Object.entries(devices)) {
      const device = runtimeDevices.find((candidate) => candidate.isAvailable !== false);
      if (!device?.udid) continue;
      const os = runtime
        .replace(/^com\.apple\.CoreSimulator\.SimRuntime\./, "")
        .replace(/^iOS-/, "iOS ");
      return normalizeTarget({
        platform: "ios",
        targetId: device.udid,
        model: device.name,
        os,
      }, "simctl");
    }
  } catch {
    return null;
  }
  return null;
}

function findTargets() {
  const configuration = configuredTargets();
  if (configuration.errors.length > 0) {
    return {
      targets: new Map(),
      configuration,
    };
  }
  const targets = new Map();
  for (const target of configuration.targets) {
    if (!targets.has(target.platform)) targets.set(target.platform, target);
  }
  if (!targets.has("ios")) {
    const iosTarget = discoverIosTarget();
    if (iosTarget) targets.set("ios", iosTarget);
  }
  if (!targets.has("android")) {
    const androidTarget = discoverAndroidTarget();
    if (androidTarget) targets.set("android", androidTarget);
  }
  return { targets, configuration };
}

function invalidConfigurationResult(platform, configuration) {
  const displayPlatform = platform === "ios" ? "iOS" : "Android";
  const coverageError = configuration.counts[platform] === 1
    ? `${displayPlatform} is represented, but its native check was not started because the target configuration is invalid`
    : `${displayPlatform} platform is not covered by exactly one configured target (found ${configuration.counts[platform]})`;
  return {
    status: "failed",
    reason: `Invalid target configuration: ${configuration.errors.join("; ")}. ${coverageError}.`,
    target: null,
  };
}

function safeName(value) {
  return value.replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80) || "target";
}

function targetBlocked(target, reason) {
  return {
    status: "blocked",
    reason,
    target: target ? {
      platform: target.platform,
      targetId: target.targetId,
      model: target.model,
      os: target.os,
      expoGoVersion: target.expoGoVersion,
      buildVersion: target.buildVersion,
      source: target.source,
    } : null,
  };
}

function runCommand(command, env, output) {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", command], {
      cwd: projectRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => {
        if (child.exitCode === null) child.kill("SIGKILL");
      }, 5_000).unref();
    }, timeoutMs);
    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr: `${stderr}\n${error.message}`, timedOut });
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr, timedOut });
    });
    output.child = child;
  });
}

async function readAdapterResult(outputPath, stdout) {
  try {
    return parseJson(await readFile(outputPath, "utf8"), outputPath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw new Error(`Native adapter report is not valid JSON: ${error.message}`);
    }
  }
  const jsonLine = stdout
    .split("\n")
    .map((line) => line.trim())
    .reverse()
    .find((line) => line.startsWith("{") && line.endsWith("}"));
  if (jsonLine) return parseJson(jsonLine, "native adapter stdout");
  return null;
}

function isPassed(value) {
  return value === "passed" || value?.status === "passed";
}

function validateAdapterResult(result, target) {
  if (!result || typeof result !== "object") {
    return "Native adapter did not write a JSON result";
  }
  if (result.status !== "passed") {
    return result.reason || `Native adapter returned status ${result.status ?? "missing"}`;
  }
  const device = result.device ?? result.target ?? {};
  for (const key of ["model", "os", "buildVersion"]) {
    if (!String(device[key] ?? "").trim()) {
      return `Native result is missing device.${key}`;
    }
  }
  if (!String(device.expoGoVersion ?? "").trim() && !String(device.buildVersion ?? "").trim()) {
    return "Native result is missing device.expoGoVersion or device.buildVersion";
  }
  const scenarios = result.scenarios ?? result.scenarioResults;
  if (!scenarios || typeof scenarios !== "object") {
    return "Native result is missing scenarios";
  }
  for (const scenario of requiredScenarios) {
    if (!isPassed(scenarios[scenario])) {
      return `Native scenario did not pass: ${scenario}`;
    }
  }

  const polling = result.paymentPolling;
  if (!polling || typeof polling !== "object") {
    return "Native result is missing paymentPolling";
  }
  const cases = polling.statuses ?? polling.cases;
  if (!cases || typeof cases !== "object") return "Native result is missing paymentPolling.statuses";
  for (const paymentStatus of paymentStatuses) {
    const paymentCase = cases[paymentStatus];
    if (!paymentCase || paymentCase.status !== "passed") {
      return `Payment polling did not pass for ${paymentStatus}`;
    }
    if (!String(paymentCase.paymentId ?? "").trim()) {
      return `Payment polling is missing paymentId for ${paymentStatus}`;
    }
    if (!Number.isFinite(paymentCase.backgroundDurationMs) || paymentCase.backgroundDurationMs <= 0) {
      return `Payment polling is missing backgroundDurationMs for ${paymentStatus}`;
    }
    const intervals = paymentCase.backgroundIntervalsMs;
    if (!Array.isArray(intervals) || intervals.length === 0 || intervals.some((value) => !Number.isFinite(value) || value < 0)) {
      return `Payment polling is missing backgroundIntervalsMs for ${paymentStatus}`;
    }
    const counts = paymentCase.statusRequestCounts;
    const countKeys = ["foregroundBeforeBackground", "duringBackground", "foregroundAfterBackground", "terminal"];
    if (!counts || countKeys.some((key) => !Number.isInteger(counts[key]) || counts[key] < 0)) {
      return `Payment polling is missing statusRequestCounts for ${paymentStatus}`;
    }
    if (counts.duringBackground !== 0) {
      return `Payment polling made requests in background for ${paymentStatus}`;
    }
    if (counts.foregroundAfterBackground < 1) {
      return `Payment polling did not refresh after foreground for ${paymentStatus}`;
    }
  }
  return null;
}

async function runTarget(platform, target, command) {
  if (!target) {
    return targetBlocked(null, `No ${platform} target was discovered`);
  }
  if (!command) {
    return targetBlocked(
      target,
      "NATIVE_DEVICE_TEST_COMMAND is not configured; connect the device-lab native suite",
    );
  }

  const outputPath = path.join(
    reportDirectory,
    `native-${target.platform}-${safeName(target.targetId)}.json`,
  );
  await rm(outputPath, { force: true });
  const configuredPlatformCommand =
    process.env[`NATIVE_${platform.toUpperCase()}_DEVICE_TEST_COMMAND`]?.trim();
  const selectedCommand = configuredPlatformCommand || command?.trim();
  const result = await runCommand(
    selectedCommand,
    {
      ...process.env,
      NATIVE_PLATFORM: target.platform,
      NATIVE_TARGET_ID: target.targetId,
      NATIVE_TARGET_MODEL: target.model,
      NATIVE_TARGET_OS: target.os,
      NATIVE_EXPO_GO_VERSION: target.expoGoVersion ?? "",
      NATIVE_BUILD_VERSION: target.buildVersion,
      NATIVE_DEEP_LINK_SCHEME: expoConfig.scheme ?? "loyalti-mobile",
      NATIVE_PAYMENT_STATUSES: paymentStatuses.join(","),
      NATIVE_REQUIRED_SCENARIOS: requiredScenarios.join(","),
      NATIVE_REPORT_PATH: outputPath,
    },
    {},
  );
  if (result.timedOut) {
    return {
      status: "failed",
      reason: `Native adapter timed out after ${timeoutMs} ms`,
      target,
      exitCode: result.code,
    };
  }
  let adapterResult;
  try {
    adapterResult = await readAdapterResult(outputPath, result.stdout);
  } catch (error) {
    return { status: "failed", reason: error.message, target, exitCode: result.code };
  }
  const validationError = validateAdapterResult(adapterResult, target);
  if (adapterResult?.status === "blocked") {
    return {
      status: "blocked",
      reason: adapterResult.reason ?? "Native device-lab adapter blocked the target",
      target,
      exitCode: result.code,
      adapter: adapterResult,
      stderr: result.stderr.trim().slice(-4_000),
    };
  }
  if (result.code !== 0 || validationError) {
    return {
      status: "failed",
      reason: validationError ?? `Native adapter exited with code ${result.code}`,
      target,
      exitCode: result.code,
      adapter: adapterResult,
      stderr: result.stderr.trim().slice(-4_000),
    };
  }
  return {
    status: "passed",
    target: {
      ...target,
      ...(adapterResult.device ?? adapterResult.target ?? {}),
    },
    scenarios: adapterResult.scenarios ?? adapterResult.scenarioResults,
    paymentPolling: adapterResult.paymentPolling,
    adapter: {
      exitCode: result.code,
      runner: process.env.NATIVE_DEVICE_RUNNER ?? "configured command",
    },
  };
}

function renderTargetMarkdown(result) {
  if (result.status !== "passed") {
    return `**${result.status.toUpperCase()}** — ${result.reason}`;
  }
  const target = result.target;
  const rows = paymentStatuses
    .map((status) => {
      const paymentCase = result.paymentPolling.statuses[status];
      const counts = paymentCase.statusRequestCounts;
      return `| ${status} | ${paymentCase.paymentId} | ${paymentCase.backgroundDurationMs} | ${paymentCase.backgroundIntervalsMs.join(", ")} | ${counts.foregroundBeforeBackground} | ${counts.duringBackground} | ${counts.foregroundAfterBackground} | ${counts.terminal} |`;
    })
    .join("\n");
  return [
    `**PASS** — ${target.model}, ${target.os}; Expo Go ${target.expoGoVersion}; build ${target.buildVersion}`,
    "",
    "| Payment | ID | Background (ms) | Background intervals (ms) | FG before | During BG | FG after | Terminal |",
    "| --- | --- | ---: | --- | ---: | ---: | ---: | ---: |",
    rows,
  ].join("\n");
}

function renderMarkdown(report) {
  return `# Native device release report

Generated: ${report.generatedAt}

## Result

**${report.status.toUpperCase()}**

The native release check is green only when one iOS and one Android target
complete every required scenario. Browser preview evidence is not substituted
for native evidence.

## Targets

### iOS

${renderTargetMarkdown(report.targets.ios)}

### Android

${renderTargetMarkdown(report.targets.android)}

## Required scenarios

- Auth/session
- Passport privacy and deep-link open/share
- Score/dispute
- Hosted checkout return
- Payment polling in foreground/background/foreground for succeeded, canceled, and failed

## Device-lab contract

The adapter receives \`NATIVE_PLATFORM\`, \`NATIVE_TARGET_ID\`,
\`NATIVE_DEEP_LINK_SCHEME\`, \`NATIVE_PAYMENT_STATUSES\`, and
\`NATIVE_REQUIRED_SCENARIOS\`. It must write JSON to \`NATIVE_REPORT_PATH\` (or print
one JSON object as its last stdout line). The exact result shape is documented
in \`docs/native-device-release-report.md\`.
`;
}

const targetResolution = findTargets();
const targets = targetResolution.targets;
const defaultCommand =
  process.env.NATIVE_DEVICE_TEST_COMMAND ?? process.env.NATIVE_DEVICE_LAB_COMMAND;
await mkdir(reportDirectory, { recursive: true });

const results = {};
if (targetResolution.configuration.errors.length > 0) {
  for (const platform of platforms) {
    results[platform] = invalidConfigurationResult(
      platform,
      targetResolution.configuration,
    );
  }
} else {
  for (const platform of platforms) {
    const platformCommand =
      process.env[`NATIVE_${platform.toUpperCase()}_DEVICE_TEST_COMMAND`]?.trim() ||
      defaultCommand?.trim();
    results[platform] = await runTarget(platform, targets.get(platform), platformCommand);
  }
}

const hasFailure = Object.values(results).some((result) => result.status === "failed");
const hasBlocked = Object.values(results).some((result) => result.status === "blocked");
const report = {
  schemaVersion: 1,
  status: hasFailure ? "failed" : hasBlocked ? "blocked" : "passed",
  generatedAt: new Date().toISOString(),
  app: {
    name: expoConfig.name ?? packageJson.name,
    slug: expoConfig.slug ?? null,
    scheme: expoConfig.scheme ?? "loyalti-mobile",
    buildVersion: expoConfig.version ?? packageJson.version,
  },
  runner: {
    targetConfiguration: {
      status: targetResolution.configuration.errors.length > 0 ? "invalid" : "valid",
      errors: targetResolution.configuration.errors,
      requiredPlatforms: platforms,
    },
    commandConfigured: platforms.some(
      (platform) =>
        Boolean(
          process.env[`NATIVE_${platform.toUpperCase()}_DEVICE_TEST_COMMAND`]?.trim() ||
            defaultCommand?.trim(),
        ),
    ),
    name: process.env.NATIVE_DEVICE_RUNNER ?? null,
    host: os.hostname(),
  },
  targets: results,
};
await writeFile(reportJsonPath, `${JSON.stringify(report, null, 2)}\n`);
await writeFile(reportMarkdownPath, renderMarkdown(report));

console.log(`Native release check: ${report.status.toUpperCase()}`);
console.log(`JSON report: ${reportJsonPath}`);
console.log(`Markdown report: ${reportMarkdownPath}`);
for (const platform of platforms) {
  console.log(`${platform}: ${results[platform].status} — ${results[platform].reason ?? "complete"}`);
}

// 0 = release evidence passed, 2 = explicitly blocked, 1 = an executed check failed.
process.exitCode = hasFailure ? 1 : hasBlocked ? 2 : 0;