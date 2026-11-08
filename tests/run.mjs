import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runTestFiles } from '../scripts/unit-test-process.mjs';

const testRoot = resolve(dirname(fileURLToPath(import.meta.url)));
const suites = {
  database: { directory: join(testRoot, "database") },
  "database-docker": { files: [join(testRoot,"database","postgres-docker.test.mjs"),join(testRoot,"database","backup-docker.test.mjs")] },
  identity: { directory: join(testRoot, "identity") },
  "runtime-security": { files: [join(testRoot, "runtime", "security.test.mjs"), join(testRoot, "runtime", "launcher.test.mjs"), join(testRoot, "runtime", "owner-origin.test.mjs")] },
  https: { files: [join(testRoot, "runtime", "https-certificate.test.mjs")] },
  "https-docker": { files: [join(testRoot, "runtime", "https-certificate-docker.test.mjs")] },
  "issue-sync": { directory: join(testRoot, "issue-sync") },
  contracts: { directory: join(testRoot, "contracts") },
  "api-contracts": { files: [join(testRoot, "contracts", "menu-api-validation.test.mjs")] },
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
  "date-picker": { files: [join(testRoot, "frontend-ui", "date-picker.test.mjs")] },
  "filter-select": { files: [join(testRoot, "frontend-ui", "filter-select.test.mjs"), join(testRoot, "dashboard", "summary.test.mjs"), join(testRoot, "board", "workflow.test.mjs")] },
  "color-system": { files: [join(testRoot, "frontend-ui", "color-system.test.mjs"), join(testRoot, "settings", "provider.test.mjs")] },
  "work-items": { directory: join(testRoot, "work-items") },
  "daily-work": { directory: join(testRoot, "daily-work") },
  runner: { directory: join(testRoot, "runner") },
};
const requestedSuite = process.argv[2];
if (requestedSuite === 'database-docker') process.env.PMS_RUN_POSTGRES_TESTS = '1';
if (requestedSuite === 'https-docker') process.env.PMS_RUN_HTTPS_DOCKER_TESTS = '1';
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
