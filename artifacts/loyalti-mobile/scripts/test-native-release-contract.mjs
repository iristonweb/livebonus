import { strict as assert } from "node:assert";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const runnerPath = path.join(scriptDirectory, "run-native-release-check.mjs");
const fixturePath = path.join(scriptDirectory, "native-release-contract-fixture.mjs");
const reportVerifierPath = path.join(scriptDirectory, "verify-native-release-reports.mjs");
const fixtureCommand = `${process.execPath} ${fixturePath}`;
const platforms = ["ios", "android"];
const paymentStatuses = ["succeeded", "canceled", "failed"];
const requiredScenarios = [
  "authSession",
  "passportPrivacy",
  "scoreDispute",
  "hostedCheckoutReturn",
];

const targets = [
  {
    platform: "ios",
    targetId: "fixture-ios-01",
    model: "iPhone 16",
    os: "iOS 18.6",
    expoGoVersion: "54.0.20",
    buildVersion: "1.0.0-ios",
  },
  {
    platform: "android",
    targetId: "fixture-android-01",
    model: "Pixel 9",
    os: "Android 15",
    expoGoVersion: "54.0.20",
    buildVersion: "1.0.0-android",
  },
];
const duplicateIosTargets = [
  ...targets,
  { ...targets[0], targetId: "fixture-ios-02", model: "iPhone 15" },
];
const duplicateAndroidTargets = [
  ...targets,
  { ...targets[1], targetId: "fixture-android-02", model: "Pixel 8" },
];
const unknownPlatformTargets = [
  ...targets,
  {
    platform: "windows",
    targetId: "fixture-windows-01",
    model: "Surface",
    os: "Windows 11",
  },
];
const incompleteTargets = [targets[0]];

function runRunner(env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [runnerPath], {
      cwd: projectRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({
      code: code ?? 1,
      signal,
      stdout,
      stderr,
    }));
  });
}

function runReportVerifier(reportDirectory) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [reportVerifierPath], {
      cwd: projectRoot,
      env: { ...process.env, RELEASE_REPORT_DIR: reportDirectory },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", chunk => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({
      code: code ?? 1,
      signal,
      stdout,
      stderr,
    }));
  });
}

async function readReport(reportDirectory) {
  const jsonPath = path.join(reportDirectory, "native-device-release-report.json");
  const markdownPath = path.join(reportDirectory, "native-device-release-report.md");
  const report = JSON.parse(await readFile(jsonPath, "utf8"));
  const markdown = await readFile(markdownPath, "utf8");
  return { report, markdown };
}

function baseEnvironment(reportDirectory, mode) {
  const env = {
    ...process.env,
    RELEASE_REPORT_DIR: reportDirectory,
    NATIVE_DEVICE_TARGETS_JSON: JSON.stringify(targets),
    NATIVE_DEVICE_TEST_COMMAND: fixtureCommand,
    NATIVE_DEVICE_RUNNER: "contract-fixture",
    NATIVE_DEVICE_TEST_TIMEOUT_MS: "10000",
    NATIVE_RELEASE_FIXTURE_MODE: mode,
  };
  for (const key of [
    "NATIVE_DEVICE_LAB_COMMAND",
    "NATIVE_IOS_DEVICE_TEST_COMMAND",
    "NATIVE_ANDROID_DEVICE_TEST_COMMAND",
    "NATIVE_IOS_TARGET_ID",
    "NATIVE_ANDROID_TARGET_ID",
  ]) {
    delete env[key];
  }
  return env;
}

async function expectInvalidTargetConfiguration(name, configuredTargets, expectedReason) {
  const reportDirectory = await mkdtemp(path.join(os.tmpdir(), "loyalti-native-contract-"));
  const invocationPath = path.join(reportDirectory, "adapter-invoked");
  try {
    const env = baseEnvironment(reportDirectory, "passed");
    env.NATIVE_DEVICE_TARGETS_JSON = JSON.stringify(configuredTargets);
    env.NATIVE_ADAPTER_INVOCATION_PATH = invocationPath;
    env.NATIVE_DEVICE_TEST_COMMAND =
      `${process.execPath} -e "require('node:fs').writeFileSync(process.env.NATIVE_ADAPTER_INVOCATION_PATH, 'invoked')"`;
    const result = await runRunner(env);
    assert.equal(result.code, 1, `${name} should return exit code 1\n${result.stdout}\n${result.stderr}`);
    assert.equal(result.signal, null);

    const { report, markdown } = await readReport(reportDirectory);
    assert.equal(report.status, "failed");
    assert.equal(report.runner.targetConfiguration.status, "invalid");
    assert.match(report.runner.targetConfiguration.errors.join("\n"), expectedReason);
    for (const platform of platforms) {
      assert.equal(report.targets[platform].status, "failed");
      assert.match(report.targets[platform].reason, /native check was not started|not covered by exactly one configured target/i);
    }
    assert.match(markdown, /\*\*FAILED\*\*/);
    assert.match(markdown, expectedReason);
    await assert.rejects(readFile(invocationPath, "utf8"));
  } finally {
    await rm(reportDirectory, { recursive: true, force: true });
  }
}

async function expectFailedFixture(mode, reason) {
  const reportDirectory = await mkdtemp(path.join(os.tmpdir(), "loyalti-native-contract-"));
  try {
    const result = await runRunner(baseEnvironment(reportDirectory, mode));
    assert.equal(result.code, 1, `${mode} should return exit code 1\n${result.stdout}\n${result.stderr}`);
    assert.equal(result.signal, null);

    const { report, markdown } = await readReport(reportDirectory);
    const reportVerification = await runReportVerifier(reportDirectory);
    assert.equal(
      reportVerification.code,
      0,
      `${mode} reports should be available\n${reportVerification.stdout}\n${reportVerification.stderr}`,
    );
    assert.equal(reportVerification.signal, null);
    assert.equal(report.status, "failed");
    assert.match(report.targets.ios.reason, reason);
    assert.match(report.targets.android.reason, reason);
    assert.match(markdown, /\*\*FAILED\*\*/);
  } finally {
    await rm(reportDirectory, { recursive: true, force: true });
  }
}

async function expectBlockedFixture() {
  const reportDirectory = await mkdtemp(path.join(os.tmpdir(), "loyalti-native-contract-"));
  try {
    const result = await runRunner(baseEnvironment(reportDirectory, "blocked"));
    assert.equal(result.code, 2, `${"blocked"} should return exit code 2\n${result.stdout}\n${result.stderr}`);
    assert.equal(result.signal, null);

    const { report, markdown } = await readReport(reportDirectory);
    const reportVerification = await runReportVerifier(reportDirectory);
    assert.equal(
      reportVerification.code,
      0,
      "blocked reports should be available\n" +
        `${reportVerification.stdout}\n${reportVerification.stderr}`,
    );
    assert.equal(reportVerification.signal, null);
    assert.equal(report.status, "blocked");
    for (const platform of platforms) {
      assert.equal(report.targets[platform].status, "blocked");
      assert.equal(report.targets[platform].reason, "Fixture device lab blocked this target");
    }
    assert.match(markdown, /\*\*BLOCKED\*\*/);
  } finally {
    await rm(reportDirectory, { recursive: true, force: true });
  }
}

async function expectPassedFixture() {
  const reportDirectory = await mkdtemp(path.join(os.tmpdir(), "loyalti-native-contract-"));
  try {
    const result = await runRunner(baseEnvironment(reportDirectory, "passed"));
    assert.equal(result.code, 0, `${"passed"} should return exit code 0\n${result.stdout}\n${result.stderr}`);
    assert.equal(result.signal, null);

    const { report, markdown } = await readReport(reportDirectory);
    const reportVerification = await runReportVerifier(reportDirectory);
    assert.equal(
      reportVerification.code,
      0,
      `passed reports should be available\n${reportVerification.stdout}\n${reportVerification.stderr}`,
    );
    assert.equal(reportVerification.signal, null);
    assert.equal(report.status, "passed");
    for (const target of targets) {
      const saved = report.targets[target.platform];
      assert.equal(saved.status, "passed");
      assert.equal(saved.target.model, target.model);
      assert.equal(saved.target.os, target.os);
      assert.equal(saved.target.expoGoVersion, target.expoGoVersion);
      assert.equal(saved.target.buildVersion, target.buildVersion);
      for (const scenario of requiredScenarios) {
        assert.equal(saved.scenarios[scenario], "passed");
      }
      for (const paymentStatus of paymentStatuses) {
        const paymentCase = saved.paymentPolling.statuses[paymentStatus];
        assert.equal(paymentCase.status, "passed");
        assert.match(paymentCase.paymentId, new RegExp(`^${target.platform}-${paymentStatus}-`));
        assert.ok(paymentCase.backgroundDurationMs > 0);
        assert.deepEqual(paymentCase.backgroundIntervalsMs, [8200]);
        assert.deepEqual(paymentCase.statusRequestCounts, {
          foregroundBeforeBackground: 2,
          duringBackground: 0,
          foregroundAfterBackground: 1,
          terminal: 1,
        });
      }
      assert.match(markdown, new RegExp(target.model));
      assert.match(markdown, new RegExp(target.os.replace(".", "\\.")));
      assert.match(markdown, new RegExp(target.expoGoVersion.replace(".", "\\.")));
      assert.match(markdown, new RegExp(target.buildVersion.replace(".", "\\.")));
      for (const paymentStatus of paymentStatuses) {
        assert.match(markdown, new RegExp(`${target.platform}-${paymentStatus}-`));
      }
    }
  } finally {
    await rm(reportDirectory, { recursive: true, force: true });
  }
}

async function expectMissingReportFailure(fileName, expectedMessage) {
  const reportDirectory = await mkdtemp(path.join(os.tmpdir(), "loyalti-native-report-"));
  try {
    await writeFile(
      path.join(reportDirectory, "native-device-release-report.json"),
      "{}\n",
    );
    await writeFile(
      path.join(reportDirectory, "native-device-release-report.md"),
      "# Native device release report\n",
    );
    await rm(path.join(reportDirectory, fileName));

    const result = await runReportVerifier(reportDirectory);
    assert.equal(result.code, 1, `${fileName} should make report verification fail`);
    assert.equal(result.signal, null);
    assert.match(result.stderr, expectedMessage);
  } finally {
    await rm(reportDirectory, { recursive: true, force: true });
  }
}

await expectFailedFixture("missing-device", /Native result is missing device\.model/);
await expectFailedFixture("incomplete-scenarios", /Native scenario did not pass: passportPrivacy/);
await expectFailedFixture("bad-payment-counters", /Payment polling made requests in background for succeeded/);
await expectFailedFixture("adapter-fail", /Native adapter exited with code 7/);
await expectBlockedFixture();
await expectPassedFixture();
await expectInvalidTargetConfiguration(
  "duplicate iOS targets",
  duplicateIosTargets,
  /iOS platform is not covered by exactly one configured target \(found 2\)/,
);
await expectInvalidTargetConfiguration(
  "duplicate Android targets",
  duplicateAndroidTargets,
  /Android platform is not covered by exactly one configured target \(found 2\)/,
);
await expectInvalidTargetConfiguration(
  "unknown target platform",
  unknownPlatformTargets,
  /Unknown target platform "windows"/,
);
await expectInvalidTargetConfiguration(
  "incomplete target list",
  incompleteTargets,
  /Android platform is not covered by exactly one configured target \(found 0\)/,
);
await expectMissingReportFailure(
  "native-device-release-report.json",
  /Native JSON report is missing\./,
);
await expectMissingReportFailure(
  "native-device-release-report.md",
  /Native Markdown report is missing\./,
);

console.log("Native release contract fixtures: PASS");
