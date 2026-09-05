import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  checkNativeDeviceWorkflow,
  validateNativeDeviceWorkflow,
  workflowPath,
} from "./check-native-device-workflow.mjs";
import {
  checkNativeDeviceWorkflowYaml,
  validateNativeDeviceWorkflowYaml,
} from "./check-native-device-workflow-yaml.mjs";

const workflow = await readFile(workflowPath, "utf8");
const execFileAsync = promisify(execFile);

function summaryScriptFromWorkflow(source) {
  const stepStart = source.indexOf(
    "      - name: Publish native release summary\n",
  );
  assert.notEqual(stepStart, -1, "native Summary step must exist");

  const scriptStart = source.indexOf("        run: |\n", stepStart);
  assert.notEqual(scriptStart, -1, "native Summary step must contain a script");

  const nextStep = source.indexOf("\n      - ", scriptStart);
  const script = source.slice(
    scriptStart + "        run: |\n".length,
    nextStep === -1 ? source.length : nextStep,
  );

  return script.replace(/^ {10}/gm, "").trimEnd();
}

async function renderNativeSummary(values) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "native-summary-"));
  const summaryPath = path.join(directory, "summary.md");

  try {
    await execFileAsync(
      "bash",
      ["-euo", "pipefail", "-c", summaryScriptFromWorkflow(workflow)],
      {
        env: {
          ...process.env,
          GITHUB_STEP_SUMMARY: summaryPath,
          NATIVE_RELEASE_OUTCOME: values.native,
          REPORT_VERIFICATION_OUTCOME: values.verification,
          REPORT_VERIFICATION_MESSAGE: values.message ?? "",
          ARTIFACT_UPLOAD_OUTCOME: values.upload,
          ARTIFACT_URL: values.url,
        },
      },
    );
    return await readFile(summaryPath, "utf8");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function runReportVerifier(reportDirectory) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ["artifacts/loyalti-mobile/scripts/verify-native-release-reports.mjs"],
      {
        cwd: path.resolve(path.dirname(workflowPath), "..", ".."),
        env: {
          ...process.env,
          RELEASE_REPORT_DIR: reportDirectory,
          GITHUB_OUTPUT: path.join(reportDirectory, "github-output.txt"),
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      resolve({ code: code ?? 1, signal, stdout, stderr }),
    );
  });
}

async function verifyReportsFixture({
  json,
  markdown,
  markdownIsDirectory = false,
}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "native-report-"));
  try {
    if (json !== undefined) {
      await writeFile(
        path.join(directory, "native-device-release-report.json"),
        json,
      );
    }
    if (markdown !== undefined) {
      const markdownPath = path.join(
        directory,
        "native-device-release-report.md",
      );
      if (markdownIsDirectory) {
        await mkdir(markdownPath);
      } else {
        await writeFile(markdownPath, markdown);
      }
    }
    const result = await runReportVerifier(directory);
    const output = await readFile(
      path.join(directory, "github-output.txt"),
      "utf8",
    ).catch(() => "");
    return { ...result, output };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("accepts the checked-in native device workflow contract", async () => {
  assert.deepEqual(await checkNativeDeviceWorkflow(), []);
});

test("accepts the checked-in native device workflow YAML", async () => {
  assert.deepEqual(await checkNativeDeviceWorkflowYaml(), []);
});

test("rejects intentionally malformed native device workflow YAML", () => {
  const errors = validateNativeDeviceWorkflowYaml(
    workflow.replace(
      "name: Native device release",
      "name: [Native device release",
    ),
  );

  assert.equal(errors.length, 1);
  assert.match(errors[0], /^invalid YAML /);
});

test("requires the shared device-lab group and queueing behavior", () => {
  assert.deepEqual(
    validateNativeDeviceWorkflow(
      workflow.replace("group: native-device-lab", "group: another-lab"),
    ),
    ["concurrency.group must be native-device-lab (got another-lab)"],
  );
  assert.deepEqual(
    validateNativeDeviceWorkflow(
      workflow.replace("cancel-in-progress: false", "cancel-in-progress: true"),
    ),
    ["concurrency.cancel-in-progress must be false (got true)"],
  );
  assert.deepEqual(
    validateNativeDeviceWorkflow(
      workflow.replace(
        /concurrency:\n(?:  #.*\n){2}  group: native-device-lab\n  cancel-in-progress: false\n/,
        "",
      ),
    ),
    ["top-level concurrency mapping is required"],
  );
});

test("requires an isolated, device-free pull request contract check", () => {
  assert.deepEqual(
    validateNativeDeviceWorkflow(
      workflow.replace(
        '  pull_request:\n    paths:\n      - ".github/workflows/native-device-release.yml"\n',
        "",
      ),
    ),
    [
      "pull_request trigger must watch .github/workflows/native-device-release.yml",
    ],
  );
  assert.deepEqual(
    validateNativeDeviceWorkflow(
      workflow.replace(
        "    if: ${{ github.event_name != 'pull_request' }}\n",
        "",
      ),
    ),
    ["native-device-release must be skipped for pull_request"],
  );
  assert.deepEqual(
    validateNativeDeviceWorkflow(
      workflow.replace("    needs: workflow-contract\n", ""),
    ),
    ["native-device-release must need workflow-contract"],
  );
  assert.deepEqual(
    validateNativeDeviceWorkflow(
      workflow.replace(
        "        run: node scripts/check-native-device-workflow.mjs",
        "        run: pnpm test:native-device-workflow",
      ),
    ),
    [
      "workflow-contract must run the native workflow checker directly with node",
    ],
  );
  assert.deepEqual(
    validateNativeDeviceWorkflow(
      workflow.replace(
        "        run: node scripts/check-native-device-workflow-yaml.mjs",
        "        run: pnpm test:native-device-workflow-yaml",
      ),
    ),
    [
      "workflow-contract must run the native workflow YAML checker directly with node",
    ],
  );
});

test("publishes both native report links after a successful artifact upload", async () => {
  const summary = await renderNativeSummary({
    native: "success",
    verification: "success",
    upload: "success",
    url: "https://github.example/actions/runs/123/artifacts/456",
  });

  assert.match(summary, /\| Native run \| `success` \|/);
  assert.match(summary, /\| Report verification \| `success` \|/);
  assert.match(summary, /\| Artifact upload \| `success` \|/);
  assert.match(
    summary,
    /- \[JSON report\]\(https:\/\/github\.example\/actions\/runs\/123\/artifacts\/456\)/,
  );
  assert.match(
    summary,
    /- \[Markdown report\]\(https:\/\/github\.example\/actions\/runs\/123\/artifacts\/456\)/,
  );
});

test("keeps native failure visible while retaining links to a successfully uploaded artifact", async () => {
  const summary = await renderNativeSummary({
    native: "failure",
    verification: "success",
    upload: "success",
    url: "https://github.example/actions/runs/789/artifacts/101",
  });

  assert.match(summary, /\| Native run \| `failure` \|/);
  assert.match(summary, /\| Report verification \| `success` \|/);
  assert.match(summary, /\| Artifact upload \| `success` \|/);
  assert.match(
    summary,
    /- \[JSON report\]\(https:\/\/github\.example\/actions\/runs\/789\/artifacts\/101\)/,
  );
  assert.match(
    summary,
    /- \[Markdown report\]\(https:\/\/github\.example\/actions\/runs\/789\/artifacts\/101\)/,
  );
});

test("keeps report verification failure visible when the native run succeeds", async () => {
  const summary = await renderNativeSummary({
    native: "success",
    verification: "failure",
    message: "Native JSON report is missing.",
    upload: "success",
    url: "https://github.example/actions/runs/246/artifacts/135",
  });

  assert.match(summary, /\| Native run \| `success` \|/);
  assert.match(summary, /\| Report verification \| `failure` \|/);
  assert.doesNotMatch(summary, /\| Report verification \| `success` \|/);
  assert.match(summary, /### Report verification diagnosis/);
  assert.match(summary, /Native JSON report is missing\./);
  assert.match(summary, /\| Artifact upload \| `success` \|/);
  assert.match(
    summary,
    /- \[JSON report\]\(https:\/\/github\.example\/actions\/runs\/246\/artifacts\/135\)/,
  );
  assert.match(
    summary,
    /- \[Markdown report\]\(https:\/\/github\.example\/actions\/runs\/246\/artifacts\/135\)/,
  );
});

test("reports safe diagnostics for missing and empty native reports", async () => {
  const validMarkdown = "# Native device release report\n";
  const missingJson = await verifyReportsFixture({
    markdown: validMarkdown,
  });
  assert.equal(missingJson.code, 1);
  assert.match(
    missingJson.output,
    /^diagnostic-message=Native JSON report is missing\.\n$/,
  );
  assert.doesNotMatch(missingJson.stderr, /credentials|password|token/i);

  const emptyJson = await verifyReportsFixture({
    json: " \n",
    markdown: validMarkdown,
  });
  assert.equal(emptyJson.code, 1);
  assert.match(
    emptyJson.output,
    /^diagnostic-message=Native JSON report is empty\.\n$/,
  );
});

test("reports safe diagnostics for unreadable and invalid native reports", async () => {
  const invalidJson = await verifyReportsFixture({
    json: '{"credentials":"do-not-print"',
    markdown: "# Native device release report\n",
  });
  assert.equal(invalidJson.code, 1);
  assert.match(
    invalidJson.output,
    /^diagnostic-message=Native JSON report contains invalid JSON\.\n$/,
  );
  assert.doesNotMatch(invalidJson.output, /do-not-print|credentials/i);

  const unreadableMarkdown = await verifyReportsFixture({
    json: "{}",
    markdown: "not used",
    markdownIsDirectory: true,
  });
  assert.equal(unreadableMarkdown.code, 1);
  assert.match(
    unreadableMarkdown.output,
    /^diagnostic-message=Native Markdown report could not be read\.\n$/,
  );
});

test("reports missing Markdown heading without changing a successful native status", async () => {
  const summary = await renderNativeSummary({
    native: "success",
    verification: "failure",
    message: "Native Markdown report is missing the report heading.",
    upload: "success",
    url: "https://github.example/actions/runs/246/artifacts/135",
  });

  assert.match(summary, /\| Native run \| `success` \|/);
  assert.match(summary, /\| Report verification \| `failure` \|/);
  assert.match(
    summary,
    /Native Markdown report is missing the report heading\./,
  );
});

test("does not create empty native report links when artifact upload fails", async () => {
  const summary = await renderNativeSummary({
    native: "success",
    verification: "success",
    upload: "failure",
    url: "",
  });

  assert.match(summary, /\| Native run \| `success` \|/);
  assert.match(summary, /\| Report verification \| `success` \|/);
  assert.match(summary, /\| Artifact upload \| `failure` \|/);
  assert.match(
    summary,
    /Report links are unavailable because the artifact was not uploaded\./,
  );
  assert.doesNotMatch(summary, /\[[^\]]+\]\(\s*\)/);
});

test("runs against an explicit workflow path without device access", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "native-workflow-"));
  const fixturePath = path.join(directory, "workflow.yml");
  try {
    await writeFile(
      fixturePath,
      [
        "name: fixture",
        "on:",
        "  pull_request:",
        "    paths:",
        '      - ".github/workflows/native-device-release.yml"',
        "concurrency:",
        "  group: native-device-lab",
        "  cancel-in-progress: false",
        "jobs:",
        "  workflow-contract:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - name: Verify device-lab serialization",
        "        run: node scripts/check-native-device-workflow.mjs",
        "      - name: Check native workflow YAML",
        "        run: node scripts/check-native-device-workflow-yaml.mjs",
        "  native-device-release:",
        "    if: ${{ github.event_name != 'pull_request' }}",
        "    needs: workflow-contract",
      ].join("\n"),
    );
    assert.deepEqual(await checkNativeDeviceWorkflow(fixturePath), []);
    assert.deepEqual(await checkNativeDeviceWorkflowYaml(fixturePath), []);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
