import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const workflowPath = path.join(
  repositoryRoot,
  ".github/workflows/native-device-release.yml",
);

export function validateNativeDeviceWorkflowYaml(source) {
  try {
    yaml.load(source);
    return [];
  } catch (error) {
    return [`invalid YAML (${error.message})`];
  }
}

export async function checkNativeDeviceWorkflowYaml(targetPath = workflowPath) {
  let source;
  try {
    source = await readFile(targetPath, "utf8");
  } catch (error) {
    return [
      `cannot read ${path.relative(repositoryRoot, targetPath)} (${error.message})`,
    ];
  }

  return validateNativeDeviceWorkflowYaml(source);
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  const errors = await checkNativeDeviceWorkflowYaml();
  if (errors.length > 0) {
    for (const error of errors) {
      console.error(`Native device workflow YAML check failed: ${error}`);
    }
    process.exitCode = 1;
  } else {
    console.log(
      `Native device workflow YAML valid: ${path.relative(repositoryRoot, workflowPath)}`,
    );
  }
}
