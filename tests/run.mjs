import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testRoot = resolve(dirname(fileURLToPath(import.meta.url)));
const suites = {
  contracts: { directory: join(testRoot, "contracts") },
  "api-contracts": { files: [join(testRoot, "contracts", "menu-api-validation.test.mjs")] },
  "migration-contracts": { files: [join(testRoot, "contracts", "customer-project-migration.test.mjs")] },
};
const requestedSuite = process.argv[2];
if (requestedSuite && !Object.hasOwn(suites, requestedSuite)) {
  throw new Error(`Unknown test suite: ${requestedSuite}. Available suites: ${Object.keys(suites).join(", ")}`);
}
const suite = requestedSuite ? suites[requestedSuite] : undefined;

async function findTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) return findTestFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".test.mjs") ? [entryPath] : [];
  }));
  return nested.flat();
}

const testFiles = (suite?.files ?? await findTestFiles(suite?.directory ?? testRoot)).sort();
if (testFiles.length === 0) throw new Error("No .test.mjs files found under tests/");

for (const testFile of testFiles) await import(pathToFileURL(testFile));
