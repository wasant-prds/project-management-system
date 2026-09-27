import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const testRoot = resolve(dirname(fileURLToPath(import.meta.url)));

async function findTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) return findTestFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".test.mjs") ? [entryPath] : [];
  }));
  return nested.flat();
}

const testFiles = (await findTestFiles(testRoot)).sort();
if (testFiles.length === 0) throw new Error("No .test.mjs files found under tests/");

for (const testFile of testFiles) await import(pathToFileURL(testFile));
