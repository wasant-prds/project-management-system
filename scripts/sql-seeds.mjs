import { randomUUID } from 'node:crypto';
import { cp, rename, rm } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AUTHORITATIVE_BACKUP_PATH,
  assertAuthoritativeArchive,
  generateSqlMasterSeeds,
  parseDumpFile,
  verifyArchive,
} from './sql-seed-convert.mjs';
import {
  executeSqlSeed,
  loadSeedManifest,
  verifySeedFilesChecksums,
} from './sql-seed-runner.mjs';

const COMMANDS = new Set(['inspect-archive', 'convert', 'verify-dataset', 'seed', 'promote']);
const COMMAND_FLAGS = Object.freeze({
  'inspect-archive': new Set(['archive']),
  convert: new Set(['archive', 'output', 'mapping', 'revision']),
  'verify-dataset': new Set(['dir']),
  seed: new Set(['seed-dir', 'target', 'target-label']),
  promote: new Set(['source', 'dest', 'confirm-active-master']),
});
const BOOLEAN_FLAGS = new Set(['confirm-active-master']);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ACTIVE_JSON_MASTER = resolve(repoRoot, 'database', 'seeds', 'master');

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!COMMANDS.has(command)) throw new Error(`Unknown SQL seed command: ${command ?? ''}`);
  const allowed = COMMAND_FLAGS[command];
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new Error(`Unexpected argument: ${token}`);
    const name = token.slice(2);
    if (!allowed.has(name)) throw new Error(`Unexpected flag: ${name}`);
    if (Object.hasOwn(flags, name)) throw new Error(`Duplicate flag: --${name}`);
    if (BOOLEAN_FLAGS.has(name)) {
      flags[name] = true;
      continue;
    }
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) throw new Error(`Missing value for flag: --${name}`);
    flags[name] = value;
    index += 1;
  }
  return { command, flags };
}

function isNestedPath(parent, child) {
  const fromParent = relative(parent, child);
  if (fromParent === '') return true;
  if (isAbsolute(fromParent)) return false;
  return !fromParent.startsWith('..');
}

export async function promoteSeedDataset({
  sourceDir,
  destDir,
  confirmActiveMaster = false,
  failPoint = null,
}) {
  if (!destDir) throw new Error('Explicit promotion destination is required');
  const source = resolve(sourceDir);
  const dest = resolve(destDir);
  if (isNestedPath(source, dest) || isNestedPath(dest, source)) {
    throw new Error('Promotion source and destination must be separate directories');
  }
  if (dest === ACTIVE_JSON_MASTER && !confirmActiveMaster) {
    throw new Error('Refusing to replace the active JSON seed directory without explicit confirmation');
  }
  const manifest = await loadSeedManifest(source);
  await verifySeedFilesChecksums(source, manifest);
  const stage = `${dest}.promoting-${randomUUID()}`;
  const previous = `${dest}.previous-${randomUUID()}`;
  await cp(source, stage, { recursive: true });
  let movedDest = false;
  try {
    try {
      await rename(dest, previous);
      movedDest = true;
    } catch (err) {
      if (!err || err.code !== 'ENOENT') throw err;
    }
    if (failPoint === 'after-move-aside') throw new Error('Simulated promotion failure');
    await rename(stage, dest);
  } catch {
    try {
      if (movedDest) {
        await rm(dest, { recursive: true, force: true });
        await rename(previous, dest);
      }
      await rm(stage, { recursive: true, force: true });
    } catch {
      throw new Error('Atomic promotion failed and the previous dataset remains aside');
    }
    throw new Error('Atomic promotion failed');
  }
  return {
    success: true,
    sourceDir: source,
    destDir: dest,
    promotedTables: manifest.tables.length,
    previousDir: movedDest ? previous : null,
  };
}

export async function runCli(argv = process.argv.slice(2)) {
  const { command, flags } = parseArgs(argv);

  if (command === 'inspect-archive') {
    const archivePath = flags.archive ?? AUTHORITATIVE_BACKUP_PATH;
    const archiveInfo = await verifyArchive(archivePath);
    if (!archiveInfo.isAuthoritative) throw new Error('Archive checksum or size does not match the authoritative backup');
    const parsed = await parseDumpFile(archivePath);
    assertAuthoritativeArchive(archiveInfo, parsed.counts);
    console.log('=== Authoritative Backup Archive Inspection ===');
    console.log('Path:                ', archivePath);
    console.log('Compressed SHA-256:  ', archiveInfo.compressedSha256);
    console.log('Compressed Bytes:    ', archiveInfo.compressedBytes);
    console.log('Decompressed SHA-256:', archiveInfo.decompressedSha256);
    console.log('Decompressed Bytes:  ', archiveInfo.decompressedBytes);
    console.log('Is Baseline Match:   ', archiveInfo.isAuthoritative);
    console.log('Total Source Rows:   ', parsed.totalRows);
    console.log('Source Table Counts:');
    for (const [table, count] of Object.entries(parsed.counts).sort()) {
      console.log(`  ${table.padEnd(20)}: ${count}`);
    }
    return { archiveInfo, counts: parsed.counts, totalRows: parsed.totalRows };
  }

  if (command === 'convert') {
    const archivePath = flags.archive ?? AUTHORITATIVE_BACKUP_PATH;
    const outputDir = flags.output ?? 'database/seeds/sql-master';
    const targetRevision = flags.revision ?? '31.0.0';
    const existingMappingsPath = flags.mapping ?? null;

    console.log(`Converting backup archive: ${archivePath} -> ${outputDir}...`);
    const result = await generateSqlMasterSeeds({
      archivePath,
      outputDir,
      targetRevision,
      existingMappingsPath,
    });

    console.log('=== Conversion Complete ===');
    console.log('Dataset Fingerprint:', result.manifest.datasetFingerprint);
    console.log('Total Source Rows:  ', result.manifest.summary.totalSourceRows);
    console.log('Total Target Rows:  ', result.manifest.summary.totalTargetRows);
    console.log('Excluded Source:    ', result.manifest.summary.excludedSourceRows);
    console.log('Derived Target Rows:', result.manifest.summary.derivedTargetRows);
    console.log('Legacy ID Mappings: ', result.legacyMappingsCount);
    console.log('Generated Files:');
    for (const file of result.files) {
      console.log(`  ${file.file.padEnd(40)} rows: ${String(file.targetRows).padStart(4)} sha256: ${file.checksum}`);
    }
    return result;
  }

  if (command === 'verify-dataset') {
    const seedDir = flags.dir ?? 'database/seeds/sql-master';
    const manifest = await loadSeedManifest(seedDir);
    await verifySeedFilesChecksums(seedDir, manifest);
    console.log(`Dataset at ${seedDir} verified successfully.`);
    console.log(`Fingerprint: ${manifest.datasetFingerprint}`);
    console.log(`Tables: ${manifest.tables.length}, Total target rows: ${manifest.summary.totalTargetRows}`);
    return manifest;
  }

  if (command === 'seed') {
    const seedDir = flags['seed-dir'] ?? 'database/seeds/sql-master';
    const target = flags.target;
    const targetLabel = flags['target-label'];
    if (!target || !targetLabel) throw new Error('Both --target and --target-label are required for seed');

    console.log(`Seeding target ${target} (${targetLabel}) from ${seedDir}...`);
    const result = await executeSqlSeed({
      seedDir,
      target,
      targetLabel,
      env: process.env,
    });
    console.log(`Seeding completed successfully: ${result.seededTables.length} tables populated.`);
    return result;
  }

  if (command === 'promote') {
    const sourceDir = flags.source ?? 'database/seeds/sql-master';
    if (!flags.dest) throw new Error('Explicit promotion destination is required');
    console.log(`Promoting ${sourceDir} -> ${flags.dest}...`);
    const result = await promoteSeedDataset({
      sourceDir,
      destDir: flags.dest,
      confirmActiveMaster: flags['confirm-active-master'] === true,
    });
    console.log(`Promotion complete. ${result.promotedTables} tables promoted.`);
    return result;
  }
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runCli().catch((err) => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
