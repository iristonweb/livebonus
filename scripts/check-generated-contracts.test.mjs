import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";
import {
  cleanOrphanDeclarations,
  regenerationGuidance,
} from "./check-generated-contracts.mjs";

const execFileAsync = promisify(execFile);
const checkerPath = fileURLToPath(
  new URL("./check-generated-contracts.mjs", import.meta.url),
);
const repositoryRoot = path.resolve(path.dirname(checkerPath), "..");

function countForcedTypeScriptBuilds(command) {
  return [...command.matchAll(/\btsc\s+--build\s+--force\b/g)].length;
}

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), "generated-contracts-"));
  await Promise.all([
    mkdir(path.join(root, "lib/db/src/schema"), { recursive: true }),
    mkdir(path.join(root, "lib/db/dist/schema"), { recursive: true }),
    mkdir(path.join(root, "lib/api-zod/src/generated"), { recursive: true }),
    mkdir(path.join(root, "lib/api-zod/dist/generated"), { recursive: true }),
    mkdir(path.join(root, "lib/api-client-react/src/generated"), {
      recursive: true,
    }),
    mkdir(path.join(root, "lib/api-client-react/dist/generated"), {
      recursive: true,
    }),
  ]);
  return root;
}

async function writeFixture(root, relativePath, contents) {
  const filePath = path.join(root, relativePath);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, contents);
  return filePath;
}

async function runChecker(root) {
  try {
    await execFileAsync(
      process.execPath,
      [checkerPath, "--repository-root", root],
      { encoding: "utf8" },
    );
    assert.fail("The checker should reject an incomplete fixture");
  } catch (error) {
    assert.equal(error.code, 1);
    return `${error.stdout ?? ""}${error.stderr ?? ""}`;
  }
}

function assertRegenerationGuidance(output) {
  assert.ok(output.includes(regenerationGuidance));
}

test("reports a missing declaration using an isolated fixture", async () => {
  const root = await createFixture();
  try {
    await writeFixture(
      root,
      "lib/db/src/schema/missing.ts",
      "export const missingDeclaration = 1;\n",
    );

    const output = await runChecker(root);

    assert.match(
      output,
      /lib\/db\/dist\/schema\/missing\.d\.ts is missing for lib\/db\/src\/schema\/missing\.ts/,
    );
    assertRegenerationGuidance(output);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reports a declaration with no matching source file", async () => {
  const root = await createFixture();
  try {
    await writeFixture(
      root,
      "lib/db/dist/schema/removed.d.ts",
      "export declare const removedContract: number;\n",
    );

    const output = await runChecker(root);

    assert.match(
      output,
      /lib\/db\/dist\/schema\/removed\.d\.ts has no matching source file/,
    );
    assertRegenerationGuidance(output);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("removes orphan declarations and source maps for deleted generated types", async () => {
  const root = await createFixture();
  try {
    const declarationPath = await writeFixture(
      root,
      "lib/api-zod/dist/generated/types/removed.d.ts",
      "export declare const removedContract: number;\n",
    );
    const sourceMapPath = await writeFixture(
      root,
      "lib/api-zod/dist/generated/types/removed.d.ts.map",
      '{"version":3,"sources":["removed.ts"]}\n',
    );

    const removed = await cleanOrphanDeclarations(root);

    assert.equal(removed.length, 1);
    await assert.rejects(() => stat(declarationPath), { code: "ENOENT" });
    await assert.rejects(() => stat(sourceMapPath), { code: "ENOENT" });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reports a declaration older than its source", async () => {
  const root = await createFixture();
  try {
    const sourcePath = await writeFixture(
      root,
      "lib/db/src/schema/stale.ts",
      "export const staleValue = 1;\n",
    );
    const declarationPath = await writeFixture(
      root,
      "lib/db/dist/schema/stale.d.ts",
      "export declare const staleValue: number;\n",
    );
    await utimes(declarationPath, new Date(1_000), new Date(1_000));
    await utimes(sourcePath, new Date(2_000), new Date(2_000));

    const output = await runChecker(root);

    assert.match(
      output,
      /1 database schema declaration file is older than source/,
    );
    assertRegenerationGuidance(output);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reports missing named and barrel exports", async () => {
  const root = await createFixture();
  try {
    await writeFixture(
      root,
      "lib/api-zod/src/generated/named.ts",
      "export const expectedNamed = 1;\n",
    );
    await writeFixture(
      root,
      "lib/api-zod/dist/generated/named.d.ts",
      "export {};\n",
    );
    await writeFixture(
      root,
      "lib/api-zod/src/generated/barrel.ts",
      "export const barrelValue = 1;\n",
    );
    await writeFixture(
      root,
      "lib/api-zod/dist/generated/barrel.d.ts",
      "export declare const barrelValue: number;\n",
    );
    await writeFixture(
      root,
      "lib/api-zod/src/generated/index.ts",
      'export * from "./barrel";\n',
    );
    await writeFixture(
      root,
      "lib/api-zod/dist/generated/index.d.ts",
      "export {};\n",
    );

    const output = await runChecker(root);

    assert.match(
      output,
      /lib\/api-zod\/dist\/generated\/named\.d\.ts is missing export expectedNamed from lib\/api-zod\/src\/generated\/named\.ts/,
    );
    assert.match(
      output,
      /lib\/api-zod\/dist\/generated\/index\.d\.ts is missing re-export \.\/barrel from lib\/api-zod\/src\/generated\/index\.ts/,
    );
    assertRegenerationGuidance(output);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("reports missing React Query client declarations", async () => {
  const root = await createFixture();
  try {
    await writeFixture(
      root,
      "lib/api-client-react/src/generated/api.ts",
      "export const getWidget = () => 1;\n",
    );

    const output = await runChecker(root);

    assert.match(
      output,
      /lib\/api-client-react\/dist\/generated\/api\.d\.ts is missing for lib\/api-client-react\/src\/generated\/api\.ts/,
    );
    assertRegenerationGuidance(output);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("keeps the forced declaration build in codegen only", async () => {
  const workspacePackage = JSON.parse(
    await readFile(path.join(repositoryRoot, "package.json"), "utf8"),
  );
  const apiSpecPackage = JSON.parse(
    await readFile(
      path.join(repositoryRoot, "lib/api-spec/package.json"),
      "utf8",
    ),
  );
  const releaseGate = workspacePackage.scripts["release:gate"];
  const codegen = apiSpecPackage.scripts.codegen;
  const releaseGateScript = await readFile(
    path.join(repositoryRoot, "scripts/release-gate.mjs"),
    "utf8",
  );

  assert.match(
    releaseGateScript,
    /\["pnpm",\s+"--filter",\s+"@workspace\/api-spec",\s+"run",\s+"codegen"\]/,
    "release:gate must run the API spec codegen command",
  );
  assert.equal(
    countForcedTypeScriptBuilds(releaseGate),
    0,
    "release:gate must not add a second forced declaration build",
  );
  assert.equal(
    countForcedTypeScriptBuilds(codegen),
    1,
    "api-spec codegen must own exactly one forced declaration build",
  );
});
