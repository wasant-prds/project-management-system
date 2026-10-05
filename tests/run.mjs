import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runTestFiles } from '../scripts/unit-test-process.mjs';

const testRoot = resolve(dirname(fileURLToPath(import.meta.url)));
const suites = {
  "database-rollout": { files: [join(testRoot, "database", "rollout.test.mjs")] },
  "database-rollout-docker": { files: [join(testRoot, "database", "rollout-docker.test.mjs")] },
  seed: { files: [join(testRoot, "seed", "seed.test.mjs")] },
  "seed-docker": { files: [join(testRoot, "seed", "docker.test.mjs")] },
  "work-item-schema-docker": { files: [join(testRoot, "seed", "docker.test.mjs")] },
  "runtime-docker": { files: [join(testRoot, "runtime", "docker.test.mjs")] },
  "schema-rollout-gate": { files: [join(testRoot, "runtime", "schema-rollout-gate.test.mjs")] },
  "sql-schema": { files: [
    join(testRoot, "sql", "id-contract.test.mjs"),
    join(testRoot, "sql", "legacy-id.test.mjs"),
    join(testRoot, "sql", "schema-contract.test.mjs"),
    join(testRoot, "sql", "migrate-runner.test.mjs"),
  ] },
  "sql-migrations-docker": { files: [join(testRoot, "sql", "migrations-docker.test.mjs")] },
  "sql-live-upgrade-docker": { files: [join(testRoot, "identity", "live-upgrade-docker.test.mjs")] },
  identity: { directory: join(testRoot, "identity") },
  "sql-seeds": { files: [
    join(testRoot, "sql", "seeds-convert.test.mjs"),
    join(testRoot, "sql", "seed-runner.test.mjs"),
  ] },
  "sql-seeds-docker": { files: [join(testRoot, "sql", "seeds-docker.test.mjs")] },
  "runtime-security": { files: [join(testRoot, "runtime", "security.test.mjs"), join(testRoot, "runtime", "launcher.test.mjs"), join(testRoot, "runtime", "owner-origin.test.mjs")] },
  "runtime-container": { files: [join(testRoot, "runtime", "container.test.mjs")] },
  gitlab: { directory: join(testRoot, "gitlab") },
  contracts: { directory: join(testRoot, "contracts") },
  "api-contracts": { files: [join(testRoot, "contracts", "menu-api-validation.test.mjs")] },
  "migration-contracts": { files: [join(testRoot, "contracts", "customer-project-migration.test.mjs")] },
  "gitlab-contracts": { files: [join(testRoot, "contracts", "gitlab-issue-import.test.mjs")] },
  auth: { directory: join(testRoot, "auth") },
  "company-projects": { directory: join(testRoot, "company-projects") },
  board: { directory: join(testRoot, "board") },
  dashboard: { directory: join(testRoot, "dashboard") },
  analysis: { directory: join(testRoot, "analysis") },
  settings: { directory: join(testRoot, "settings") },
  "frontend-redesign": { files: [join(testRoot, "frontend-ui", "redesign.test.mjs")] },
  "frontend-motion": { files: [join(testRoot, "frontend-ui", "motion-system.test.mjs")] },
  "frontend-cinematic": { files: [join(testRoot, "frontend-ui", "cinematic-experience.test.mjs")] },
  "frontend-identity": { files: [join(testRoot, "frontend-ui", "product-identity.test.mjs")] },
  "frontend-competition": { files: [join(testRoot, "frontend-ui", "competition-audit.test.mjs")] },
  "frontend-polish": { files: [join(testRoot, "frontend-ui", "polish.test.mjs")] },
  "frontend-performance": { files: [join(testRoot, "frontend-ui", "performance.test.mjs")] },
  "frontend-ui": { directory: join(testRoot, "frontend-ui") },
  "filter-select": { files: [join(testRoot, "frontend-ui", "filter-select.test.mjs"), join(testRoot, "dashboard", "summary.test.mjs"), join(testRoot, "board", "workflow.test.mjs")] },
  "color-system": { files: [join(testRoot, "frontend-ui", "color-system.test.mjs"), join(testRoot, "settings", "provider.test.mjs")] },
  "work-items": { directory: join(testRoot, "work-items") },
  "daily-work": { directory: join(testRoot, "daily-work") },
  runner: { directory: join(testRoot, "runner") },
};
const requestedSuite = process.argv[2];
if (requestedSuite === "database-rollout-docker") process.env.PMS_RUN_ROLLOUT_DOCKER_TESTS = "1";
if (requestedSuite === "runtime-container") process.env.PMS_RUN_CONTAINER_TESTS = "1";
if (requestedSuite === "runtime-docker") process.env.PMS_RUN_DOCKER_TESTS = "1";
if (requestedSuite === "seed-docker") process.env.PMS_RUN_SEED_DOCKER_TESTS = "1";
if (requestedSuite === "sql-migrations-docker") process.env.PMS_RUN_SQL_MIGRATION_DOCKER_TESTS = "1";
if (requestedSuite === "sql-live-upgrade-docker") process.env.PMS_RUN_SQL_LIVE_UPGRADE_DOCKER_TESTS = "1";
if (requestedSuite === "sql-seeds-docker") process.env.PMS_RUN_SQL_SEED_DOCKER_TESTS = "1";
if (requestedSuite === "work-item-schema-docker") {
  process.env.PMS_RUN_SEED_DOCKER_TESTS = "1";
  process.env.PMS_SKIP_INSTALLATION_SEED_DOCKER = "1";
}
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

const reporter = process.execArgv.find((argument) => argument.startsWith('--test-reporter='))?.split('=')[1] ?? 'spec';
process.exitCode = runTestFiles(testFiles, { reporter });
