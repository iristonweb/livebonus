import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const reportDirectory = path.resolve(
  process.env.RELEASE_REPORT_DIR ??
    path.join(projectRoot, "test-results", "native-release"),
);
const reportJsonPath = path.join(
  reportDirectory,
  "native-device-release-report.json",
);
const reportMarkdownPath = path.join(
  reportDirectory,
  "native-device-release-report.md",
);

async function readRequiredReport(filePath, description) {
  try {
    const contents = await readFile(filePath, "utf8");
    if (!contents.trim()) {
      throw new Error(`${description} is empty.`);
    }
    return contents;
  } catch (error) {
    if (error.message === `${description} is empty.`) {
      throw error;
    }
    if (error.code === "ENOENT") {
      throw new Error(`${description} is missing.`);
    }
    throw new Error(`${description} could not be read.`);
  }
}

async function publishDiagnosticMessage(message) {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) return;

  await appendFile(outputPath, `diagnostic-message=${message}\n`, "utf8");
}

try {
  const jsonContents = await readRequiredReport(
    reportJsonPath,
    "Native JSON report",
  );
  const markdownContents = await readRequiredReport(
    reportMarkdownPath,
    "Native Markdown report",
  );

  let report;
  try {
    report = JSON.parse(jsonContents);
  } catch (error) {
    throw new Error("Native JSON report contains invalid JSON.");
  }
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new Error("Native JSON report must contain a JSON object.");
  }
  if (!markdownContents.includes("# Native device release report")) {
    throw new Error("Native Markdown report is missing the report heading.");
  }

  console.log(
    `Native release reports are available: ${reportJsonPath} and ${reportMarkdownPath}`,
  );
} catch (error) {
  const diagnosticMessage =
    error instanceof Error
      ? error.message
      : "Native release reports could not be verified.";
  console.error(
    `Native release report verification failed: ${diagnosticMessage}`,
  );
  try {
    await publishDiagnosticMessage(diagnosticMessage);
  } catch {
    console.error("Native release report diagnostic could not be published.");
  }
  process.exitCode = 1;
}
