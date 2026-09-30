import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testRoot = resolve(dirname(fileURLToPath(import.meta.url)));
const suites = {
  "database-rollout": { files: [join(testRoot, "database", "rollout.test.mjs")] },
  "database-rollout-docker": { files: [join(testRoot, "database", "rollout-docker.test.mjs")] },
  seed: { files: [join(testRoot, "seed", "seed.test.mjs")] },
  "seed-docker": { files: [join(testRoot, "seed", "docker.test.mjs")] },
  "runtime-docker": { files: [join(testRoot, "runtime", "docker.test.mjs")] },
  "runtime-security": { files: [join(testRoot, "runtime", "security.test.mjs"), join(testRoot, "runtime", "launcher.test.mjs")] },
  "runtime-container": { files: [join(testRoot, "runtime", "container.test.mjs")] },
  contracts: { directory: join(testRoot, "contracts") },
  "api-contracts": { files: [join(testRoot, "contracts", "menu-api-validation.test.mjs")] },
  "migration-contracts": { files: [join(testRoot, "contracts", "customer-project-migration.test.mjs")] },
  "gitlab-contracts": { files: [join(testRoot, "contracts", "gitlab-issue-import.test.mjs")] },
  auth: { directory: join(testRoot, "auth") },
  "company-projects": { directory: join(testRoot, "company-projects") },
  runner: { directory: join(testRoot, "runner") },
};
const requestedSuite = process.argv[2];
if (requestedSuite === "database-rollout-docker") process.env.PMS_RUN_ROLLOUT_DOCKER_TESTS = "1";
if (requestedSuite === "runtime-container") process.env.PMS_RUN_CONTAINER_TESTS = "1";
if (requestedSuite === "runtime-docker") process.env.PMS_RUN_DOCKER_TESTS = "1";
if (requestedSuite === "seed-docker") process.env.PMS_RUN_SEED_DOCKER_TESTS = "1";
if (requestedSuite && !Object.hasOwn(suites, requestedSuite)) {
  throw new Error(`Unknown test suite: ${requestedSuite}. Available suites: ${Object.keys(suites).join(", ")}`);
}
const suite = suites[requestedSuite ?? ''];

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
