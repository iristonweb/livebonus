import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(
  new URL("./release-gate.mjs", import.meta.url),
);
const repositoryRoot = path.resolve(path.dirname(scriptPath), "..");

test("dry-run prints the complete release sequence without executing checks or secrets", async () => {
  const secret = "dry-run-secret-must-not-be-printed";
  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    [scriptPath, "--dry-run"],
    {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        YOOKASSA_SECRET_KEY: secret,
        SESSION_SECRET: secret,
      },
      encoding: "utf8",
    },
  );
  const output = `${stdout}${stderr}`;

  assert.match(output, /Release gate dry-run \(no commands will be executed\)/);
  assert.match(
    output,
    /1\. API spec codegen\s+pnpm --filter @workspace\/api-spec run codegen/,
  );
  assert.match(
    output,
    /2\. openapi and generated contracts\s+pnpm --filter @workspace\/api-server run check:contracts/,
  );
  assert.match(
    output,
    /15\. production preflight\s+pnpm run preflight:production/,
  );
  assert.doesNotMatch(output, /dry-run-secret-must-not-be-printed/);
});

test("dry-run and release sequence use the same numbered command list", async () => {
  const { releaseSteps, formatDryRun, formatReleaseSequence } = await import(
    scriptPath
  );
  const sequence = formatReleaseSequence();
  const dryRun = formatDryRun();

  assert.equal(
    sequence,
    dryRun.replace(
      "Release gate dry-run (no commands will be executed):\n",
      "",
    ),
  );
  assert.equal(sequence.match(/^\d+\. /gm)?.length, releaseSteps.length);
});

test("runs every planned command in order and keeps collecting after a failed check", async () => {
  const { releaseSteps, runReleaseGate } = await import(scriptPath);
  const reportDirectory = await mkdtemp(
    path.join(os.tmpdir(), "release-gate-test-"),
  );
  const calls = [];
  const logs = [];
  const failedStep = releaseSteps[4][0];

  try {
    const { report, exitCode } = await runReleaseGate({
      reportDirectory,
      environment: {
        CI: "test",
      },
      log: (message) => logs.push(String(message)),
      errorLog: (message) => logs.push(String(message)),
      runner: (file, args) => {
        calls.push([file, ...args]);
        return {
          status: calls.length === 5 ? 17 : 0,
        };
      },
      now: () => 1_700_000_000_000,
    });

    assert.equal(exitCode, 1);
    assert.deepEqual(
      calls,
      releaseSteps.map(([, command]) => command),
    );
    assert.equal(report.results.length, releaseSteps.length - 1);
    assert.equal(report.results[3].name, failedStep);
    assert.equal(report.results[3].passed, false);
    assert.equal(report.results.at(-1).name, releaseSteps.at(-1)[0]);
    assert.match(logs.join("\n"), /continuing to collect the full report/);
    assert.doesNotMatch(logs.join("\n"), /fixture-secret-must-not-be-printed/);
  } finally {
    await rm(reportDirectory, { recursive: true, force: true });
  }
});
