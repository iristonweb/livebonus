import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const releaseSteps = [
  [
    "API spec codegen",
    ["pnpm", "--filter", "@workspace/api-spec", "run", "codegen"],
  ],
  [
    "openapi and generated contracts",
    ["pnpm", "--filter", "@workspace/api-server", "run", "check:contracts"],
  ],
  [
    "contract drift fixtures",
    ["pnpm", "--filter", "@workspace/api-server", "run", "test:contracts"],
  ],
  ["workspace library typecheck", ["pnpm", "run", "typecheck:libs"]],
  [
    "API typecheck",
    ["pnpm", "--filter", "@workspace/api-server", "run", "typecheck"],
  ],
  [
    "API unit tests",
    ["pnpm", "--filter", "@workspace/api-server", "run", "test:unit"],
  ],
  [
    "API route tests",
    ["pnpm", "--filter", "@workspace/api-server", "run", "test:routes"],
  ],
  [
    "API integration tests (disposable database)",
    ["pnpm", "--filter", "@workspace/api-server", "run", "test:integration"],
  ],
  [
    "web typecheck",
    ["pnpm", "--filter", "@workspace/loyalti", "run", "typecheck"],
  ],
  ["web build", ["pnpm", "--filter", "@workspace/loyalti", "run", "build"]],
  [
    "web smoke",
    ["pnpm", "--filter", "@workspace/loyalti", "run", "test:smoke"],
  ],
  [
    "web live contract",
    ["pnpm", "--filter", "@workspace/loyalti", "run", "test:contract"],
  ],
  [
    "mobile preview build and regressions",
    ["pnpm", "--filter", "@workspace/loyalti-mobile", "run", "test:preview"],
  ],
  [
    "native device release evidence",
    [
      "pnpm",
      "--filter",
      "@workspace/loyalti-mobile",
      "run",
      "test:native-release",
    ],
  ],
  ["production preflight", ["pnpm", "run", "preflight:production"]],
];

const checks = releaseSteps.slice(1);

export function formatReleaseSequence(steps = releaseSteps) {
  return steps
    .flatMap(([name, command], index) => [
      `${index + 1}. ${name}`,
      `   ${command.join(" ")}`,
    ])
    .join("\n");
}

export function formatDryRun(steps = releaseSteps) {
  return [
    "Release gate dry-run (no commands will be executed):",
    formatReleaseSequence(steps),
  ].join("\n");
}

function isDryRun(args = process.argv.slice(2)) {
  return args.includes("--dry-run");
}

export async function runReleaseGate({
  runner = spawnSync,
  reportDirectory = path.join(root, "reports/release-gate"),
  environment = process.env,
  log = console.log,
  errorLog = console.error,
  now = () => Date.now(),
} = {}) {
  await mkdir(reportDirectory, { recursive: true });

  log(
    `\nRelease gate release sequence (planned before checks):\n${formatReleaseSequence()}`,
  );

  const [codegenName, codegenCommand] = releaseSteps[0];
  log(`\n==> ${codegenName}`);
  const codegenResult = runner(codegenCommand[0], codegenCommand.slice(1), {
    cwd: root,
    env: {
      ...environment,
      CI: "true",
      NODE_ENV: environment.NODE_ENV ?? "test",
      RELEASE_REPORT_DIR: reportDirectory,
    },
    stdio: "inherit",
  });
  if (codegenResult.status !== 0) {
    return { report: null, exitCode: codegenResult.status ?? 1 };
  }

  const results = [];
  for (const [name, command] of checks) {
    log(`\n==> ${name}`);
    const startedAt = now();
    const result = runner(command[0], command.slice(1), {
      cwd: root,
      env: {
        ...environment,
        CI: "true",
        NODE_ENV:
          name === "production preflight"
            ? "production"
            : (environment.NODE_ENV ?? "test"),
        PORT: environment.PORT ?? "23657",
        SMOKE_PORT: environment.SMOKE_PORT ?? "23658",
        BASE_PATH: environment.BASE_PATH ?? "/",
        RELEASE_REPORT_DIR: reportDirectory,
        CHROMIUM_PATH: environment.CHROMIUM_PATH ?? "chromium",
        MOBILE_PREVIEW_PORT: environment.MOBILE_PREVIEW_PORT ?? "23907",
      },
      stdio: "inherit",
    });
    const passed = result.status === 0;
    results.push({
      name,
      command: command.join(" "),
      passed,
      exitCode: result.status,
      durationMs: now() - startedAt,
    });
    if (!passed) {
      errorLog(
        `Release gate check failed: ${name}; continuing to collect the full report`,
      );
    }
  }

  const nativeReportPath = path.join(
    reportDirectory,
    "native-device-release-report.json",
  );
  let nativeReport = null;
  try {
    nativeReport = JSON.parse(await readFile(nativeReportPath, "utf8"));
  } catch {
    nativeReport = null;
  }

  const report = {
    generatedAt: new Date(now()).toISOString(),
    passed:
      results.length === checks.length &&
      results.every((result) => result.passed),
    releaseSequence: releaseSteps.map(([name, command]) => ({
      name,
      command: command.join(" "),
    })),
    results,
    browser: {
      executable: process.env.CHROMIUM_PATH ?? "chromium",
      coverage: "Chromium web/Expo-web preview checks are included",
    },
    nativeDeviceCoverage: {
      status:
        nativeReport?.status ??
        (results.find(
          (result) => result.name === "native device release evidence",
        )?.passed
          ? "passed"
          : "missing"),
      report: "reports/release-gate/native-device-release-report.md",
      supportedTargets: ["ios", "android"],
      browserChecksAreNotSubstitute: true,
      note: "Native-device evidence is a blocking release check. FAIL and BLOCKED both fail the release gate.",
    },
    productionConfiguration:
      "mandatory environment names are checked without printing secret values",
  };
  await writeFile(
    path.join(reportDirectory, "release-gate.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  if (!report.passed) return { report, exitCode: 1 };
  log(
    `\nRelease gate passed. Report: ${path.relative(root, path.join(reportDirectory, "release-gate.json"))}`,
  );
  return { report, exitCode: 0 };
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  if (isDryRun()) {
    console.log(formatDryRun());
  } else {
    const { exitCode } = await runReleaseGate();
    if (exitCode !== 0) process.exitCode = exitCode;
  }
}
