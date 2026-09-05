import { readdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultRepositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export const regenerationGuidance =
  "Regenerate OpenAPI sources with `pnpm --filter @workspace/api-spec run codegen`, then rebuild workspace declarations with `pnpm -w exec tsc --build --force`.";

export function createContracts(repositoryRoot) {
  return [
    {
      name: "database schema",
      sourceRoot: path.join(repositoryRoot, "lib/db/src/schema"),
      declarationRoot: path.join(repositoryRoot, "lib/db/dist/schema"),
    },
    {
      name: "API Zod",
      sourceRoot: path.join(repositoryRoot, "lib/api-zod/src/generated"),
      declarationRoot: path.join(repositoryRoot, "lib/api-zod/dist/generated"),
    },
    {
      name: "React Query client",
      sourceRoot: path.join(repositoryRoot, "lib/api-client-react/src/generated"),
      declarationRoot: path.join(repositoryRoot, "lib/api-client-react/dist/generated"),
    },
  ];
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(entryPath)));
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".ts") &&
      !entry.name.endsWith(".d.ts")
    ) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

async function declarationFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await declarationFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".d.ts")) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

export async function cleanOrphanDeclarations(
  repositoryRoot = defaultRepositoryRoot,
) {
  const removed = [];

  for (const contract of createContracts(repositoryRoot)) {
    let files;
    let declarations;

    try {
      files = await sourceFiles(contract.sourceRoot);
      declarations = await declarationFiles(contract.declarationRoot);
    } catch {
      // The checker reports missing roots; cleanup must not remove output when
      // it cannot establish the current source set safely.
      continue;
    }

    const sourcePaths = new Set(
      files.map((sourcePath) => path.relative(contract.sourceRoot, sourcePath)),
    );

    for (const declarationPath of declarations) {
      const relativePath = path.relative(
        contract.declarationRoot,
        declarationPath,
      );
      const sourcePath = relativePath.replace(/\.d\.ts$/, ".ts");
      if (sourcePaths.has(sourcePath)) continue;

      await rm(declarationPath, { force: true });
      await rm(`${declarationPath}.map`, { force: true });
      removed.push(declarationPath);
    }
  }

  return removed;
}

function relativeModulePath(specifier) {
  return specifier.replace(/^\.\//, "").replace(/\.ts$/, "");
}

function exportedNames(source) {
  const names = new Set();
  const starExports = new Set();

  for (const match of source.matchAll(
    /^\s*export\s+(?:(?:declare)\s+)?(?:const|let|var|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm,
  )) {
    names.add(match[1]);
  }

  for (const match of source.matchAll(/^\s*export\s*\{([^}]+)\}/gm)) {
    for (const exportItem of match[1].split(",")) {
      const item = exportItem.trim().replace(/^type\s+/, "");
      if (!item) continue;
      names.add((item.split(/\s+as\s+/).at(-1) ?? item).trim());
    }
  }

  for (const match of source.matchAll(
    /^\s*export\s+\*\s+from\s+["']([^"']+)["']/gm,
  )) {
    starExports.add(relativeModulePath(match[1]));
  }

  return { names, starExports };
}

function formatPath(filePath, repositoryRoot) {
  return path.relative(repositoryRoot, filePath);
}

async function checkContract(contract, repositoryRoot) {
  const problems = [];
  const staleFiles = [];
  let files;

  try {
    files = await sourceFiles(contract.sourceRoot);
  } catch {
    return [`${formatPath(contract.sourceRoot, repositoryRoot)} is missing`];
  }

  const sourcePaths = new Set(
    files.map((sourcePath) => path.relative(contract.sourceRoot, sourcePath)),
  );

  for (const sourcePath of files) {
    const relativePath = path.relative(contract.sourceRoot, sourcePath);
    const declarationPath = path.join(
      contract.declarationRoot,
      relativePath.replace(/\.ts$/, ".d.ts"),
    );

    let sourceStats;
    let declarationStats;
    try {
      [sourceStats, declarationStats] = await Promise.all([
        stat(sourcePath),
        stat(declarationPath),
      ]);
    } catch {
      problems.push(
        `${formatPath(declarationPath, repositoryRoot)} is missing for ${formatPath(sourcePath, repositoryRoot)}`,
      );
      continue;
    }

    if (sourceStats.mtimeMs > declarationStats.mtimeMs) {
      staleFiles.push(
        `${formatPath(declarationPath, repositoryRoot)} (source: ${formatPath(sourcePath, repositoryRoot)})`,
      );
    }

    const [source, declaration] = await Promise.all([
      readFile(sourcePath, "utf8"),
      readFile(declarationPath, "utf8"),
    ]);
    const sourceExports = exportedNames(source);
    const declarationExports = exportedNames(declaration);

    for (const name of sourceExports.names) {
      if (!declarationExports.names.has(name)) {
        problems.push(
          `${formatPath(declarationPath, repositoryRoot)} is missing export ${name} from ${formatPath(sourcePath, repositoryRoot)}`,
        );
      }
    }

    for (const modulePath of sourceExports.starExports) {
      if (!declarationExports.starExports.has(modulePath)) {
        problems.push(
          `${formatPath(declarationPath, repositoryRoot)} is missing re-export ./${modulePath} from ${formatPath(sourcePath, repositoryRoot)}`,
        );
      }
    }
  }

  let declarations = [];
  try {
    declarations = await declarationFiles(contract.declarationRoot);
  } catch {
    // Missing declarations are reported while checking each source file above.
  }

  for (const declarationPath of declarations) {
    const relativePath = path.relative(
      contract.declarationRoot,
      declarationPath,
    );
    const sourcePath = relativePath.replace(/\.d\.ts$/, ".ts");
    if (!sourcePaths.has(sourcePath)) {
      problems.push(
        `${formatPath(declarationPath, repositoryRoot)} has no matching source file`,
      );
    }
  }

  if (staleFiles.length > 0) {
    const preview = staleFiles.slice(0, 3).join(", ");
    const remaining = staleFiles.length - 3;
    problems.push(
      `${staleFiles.length} ${contract.name} declaration file${staleFiles.length === 1 ? " is" : "s are"} older than source (${preview}${remaining > 0 ? `, and ${remaining} more` : ""})`,
    );
  }

  return problems;
}

export async function checkContracts(repositoryRoot = defaultRepositoryRoot) {
  const problems = [];
  for (const contract of createContracts(repositoryRoot)) {
    problems.push(
      ...(await checkContract(contract, repositoryRoot)).map(
        (problem) => `${contract.name}: ${problem}`,
      ),
    );
  }
  return problems;
}

export function formatReport(problems) {
  if (problems.length > 0) {
    return [
      "Generated contract declarations are stale or incomplete.",
      ...problems.map((problem) => `  - ${problem}`),
      regenerationGuidance,
    ].join("\n");
  }

  return "Generated database, API Zod, and React Query declarations are current.";
}

function repositoryRootFromArgs(args) {
  const optionIndex = args.indexOf("--repository-root");
  if (optionIndex === -1) return defaultRepositoryRoot;

  const value = args[optionIndex + 1];
  if (!value) {
    throw new Error("--repository-root requires a directory path");
  }
  return path.resolve(value);
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const args = process.argv.slice(2);
  const repositoryRoot = repositoryRootFromArgs(args);
  const cleanOnly = args.includes("--clean-only");
  if (args.includes("--clean") || cleanOnly) {
    await cleanOrphanDeclarations(repositoryRoot);
  }
  if (cleanOnly) {
    process.exit(0);
  }
  const problems = await checkContracts(repositoryRoot);
  console[problems.length > 0 ? "error" : "log"](formatReport(problems));
  if (problems.length > 0) {
    process.exitCode = 1;
  }
}
