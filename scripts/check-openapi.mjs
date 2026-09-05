import { readdir, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const specArgumentIndex = process.argv.indexOf("--spec");
const specPath = specArgumentIndex === -1
  ? path.join(repositoryRoot, "lib/api-spec/openapi.yaml")
  : path.resolve(process.argv[specArgumentIndex + 1] ?? "");
const require = createRequire(import.meta.url);
const orvalPackageDirectory = (
  await readdir(path.join(repositoryRoot, "node_modules/.pnpm"))
).find((entry) => entry.startsWith("orval@"));
if (!orvalPackageDirectory) {
  fail("Orval is not installed; run the workspace install before checking OpenAPI");
}
const yamlPath = require.resolve("js-yaml", {
  paths: [
    path.join(
      repositoryRoot,
      "node_modules/.pnpm",
      orvalPackageDirectory,
      "node_modules/orval",
    ),
  ],
});
const { load } = await import(pathToFileURL(yamlPath));

function fail(message) {
  console.error(`OpenAPI contract check failed: ${message}`);
  process.exitCode = 1;
}

let document;
try {
  document = load(await readFile(specPath, "utf8"));
} catch (error) {
  fail(`cannot parse ${path.relative(repositoryRoot, specPath)} (${error.message})`);
  process.exit();
}

if (!document || typeof document !== "object" || Array.isArray(document)) {
  fail("document must be a YAML object");
  process.exit();
}

if (!/^3\.(0|1)\.\d+$/.test(String(document.openapi ?? ""))) {
  fail("openapi must be a supported 3.0.x or 3.1.x version");
}

if (!document.info || typeof document.info !== "object") {
  fail("info is required");
}

const paths = document.paths;
if (!paths || typeof paths !== "object" || Array.isArray(paths)) {
  fail("paths is required and must be an object");
}

const operations = ["get", "put", "post", "delete", "options", "head", "patch", "trace"];
for (const [route, pathItem] of Object.entries(paths ?? {})) {
  if (!route.startsWith("/")) fail(`path "${route}" must start with /`);
  if (!pathItem || typeof pathItem !== "object") {
    fail(`path "${route}" must be an object`);
    continue;
  }
  for (const method of operations) {
    const operation = pathItem[method];
    if (operation === undefined) continue;
    if (!operation || typeof operation !== "object") {
      fail(`${method.toUpperCase()} ${route} must be an object`);
      continue;
    }
    if (!operation.operationId) fail(`${method.toUpperCase()} ${route} is missing operationId`);
    if (!operation.responses || typeof operation.responses !== "object") {
      fail(`${method.toUpperCase()} ${route} is missing responses`);
    }
  }
}

if (document.components?.securitySchemes?.BearerAuth?.type !== "http") {
  fail("components.securitySchemes.BearerAuth must be an HTTP bearer scheme");
}

const refs = [];
function visit(value, location = "$") {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visit(entry, `${location}[${index}]`));
    return;
  }
  if (typeof value.$ref === "string") refs.push([value.$ref, location]);
  for (const [key, child] of Object.entries(value)) visit(child, `${location}.${key}`);
}
visit(document);
for (const [ref, location] of refs) {
  if (!ref.startsWith("#/")) continue;
  const target = ref
    .slice(2)
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((value, key) => value?.[key], document);
  if (target === undefined) fail(`${location} references missing ${ref}`);
}

if (process.exitCode) process.exit();
console.log(`OpenAPI contract valid: ${path.relative(repositoryRoot, specPath)}`);