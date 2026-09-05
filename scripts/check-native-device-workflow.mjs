import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const workflowPath = path.join(
  repositoryRoot,
  ".github/workflows/native-device-release.yml",
);

function withoutInlineComment(value) {
  return value.replace(/\s+#.*$/, "").trim();
}

function unquote(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function jobBlock(lines, jobName) {
  const start = lines.findIndex((line) =>
    new RegExp(`^  ${jobName}:\\s*(?:#.*)?$`).test(line),
  );
  if (start === -1) return null;

  const end = lines.findIndex(
    (line, index) => index > start && /^  [A-Za-z0-9_-]+:/.test(line),
  );
  return lines.slice(start, end === -1 ? lines.length : end);
}

function hasPullRequestWorkflowTrigger(lines) {
  const triggerLine = lines.findIndex((line) =>
    /^  pull_request:\s*(?:#.*)?$/.test(line),
  );
  if (triggerLine === -1) return false;

  let paths;
  for (let index = triggerLine + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^  \S/.test(line)) break;
    if (/^    paths:\s*(?:#.*)?$/.test(line)) {
      paths = [];
      continue;
    }
    const pathEntry = /^      -\s*(.*)$/.exec(line);
    if (pathEntry && paths)
      paths.push(unquote(withoutInlineComment(pathEntry[1])));
  }

  return (
    paths?.length === 1 &&
    paths[0] === ".github/workflows/native-device-release.yml"
  );
}

export function validateNativeDeviceWorkflow(source) {
  const lines = source.split(/\r?\n/);
  const concurrencyLine = lines.findIndex((line) =>
    /^concurrency:\s*(?:#.*)?$/.test(line),
  );
  const errors = [];

  if (concurrencyLine === -1) {
    return ["top-level concurrency mapping is required"];
  }

  const entries = new Map();
  for (let index = concurrencyLine + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\S/.test(line) && !/^\s*(?:#.*)?$/.test(line)) break;

    const entry = /^ {2}([A-Za-z0-9_-]+):(?:\s*(.*))?$/.exec(line);
    if (!entry) continue;
    if (entries.has(entry[1])) {
      errors.push(`concurrency.${entry[1]} must not be duplicated`);
      continue;
    }
    entries.set(entry[1], withoutInlineComment(entry[2] ?? ""));
  }

  if (!entries.has("group")) {
    errors.push("concurrency.group must be native-device-lab");
  } else if (unquote(entries.get("group")) !== "native-device-lab") {
    errors.push(
      `concurrency.group must be native-device-lab (got ${entries.get("group") || "empty"})`,
    );
  }

  if (!entries.has("cancel-in-progress")) {
    errors.push("concurrency.cancel-in-progress must be false");
  } else if (entries.get("cancel-in-progress") !== "false") {
    errors.push(
      `concurrency.cancel-in-progress must be false (got ${entries.get("cancel-in-progress") || "empty"})`,
    );
  }

  if (!hasPullRequestWorkflowTrigger(lines)) {
    errors.push(
      "pull_request trigger must watch .github/workflows/native-device-release.yml",
    );
  }

  const contractJob = jobBlock(lines, "workflow-contract");
  if (!contractJob) {
    errors.push("workflow-contract job is required");
  } else {
    if (
      !contractJob.some((line) => /^\s+runs-on:\s*ubuntu-latest\s*$/.test(line))
    ) {
      errors.push("workflow-contract must run on ubuntu-latest");
    }
    if (
      !contractJob.some((line) =>
        /^\s+run:\s*node scripts\/check-native-device-workflow\.mjs\s*$/.test(
          line,
        ),
      )
    ) {
      errors.push(
        "workflow-contract must run the native workflow checker directly with node",
      );
    }
    if (
      !contractJob.some((line) =>
        /^\s+run:\s*node scripts\/check-native-device-workflow-yaml\.mjs\s*$/.test(
          line,
        ),
      )
    ) {
      errors.push(
        "workflow-contract must run the native workflow YAML checker directly with node",
      );
    }
    if (contractJob.some((line) => /secrets\./.test(line))) {
      errors.push("workflow-contract must not require secrets");
    }
  }

  const releaseJob = jobBlock(lines, "native-device-release");
  if (!releaseJob) {
    errors.push("native-device-release job is required");
  } else {
    if (
      !releaseJob.some((line) =>
        /^\s+needs:\s*workflow-contract\s*$/.test(line),
      )
    ) {
      errors.push("native-device-release must need workflow-contract");
    }
    if (
      !releaseJob.some((line) =>
        /^\s+if:\s*\$\{\{\s*github\.event_name\s*!=\s*['"]pull_request['"]\s*\}\}\s*$/.test(
          line,
        ),
      )
    ) {
      errors.push("native-device-release must be skipped for pull_request");
    }
  }

  return errors;
}

export async function checkNativeDeviceWorkflow(targetPath = workflowPath) {
  let source;
  try {
    source = await readFile(targetPath, "utf8");
  } catch (error) {
    return [
      `cannot read ${path.relative(repositoryRoot, targetPath)} (${error.message})`,
    ];
  }

  return validateNativeDeviceWorkflow(source);
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const errors = await checkNativeDeviceWorkflow();
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`Native device workflow contract failed: ${error}`);
    }
    process.exitCode = 1;
  } else {
    console.log(
      `Native device workflow contract valid: ${path.relative(repositoryRoot, workflowPath)}`,
    );
  }
}
