import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { loadArtifacts, sha256 } from '../../scripts/sql-artifacts.mjs';
import { SEED_TABLE_FILES, manifestChecksumFor } from '../../scripts/sql-seed-convert.mjs';
import {
  buildSeedTransaction,
  executeSqlSeed,
  loadSeedManifest,
  repairIdentityAfterFailedSeed,
  resolveSeedFile,
  sanitizeSqlError,
} from '../../scripts/sql-seed-runner.mjs';
import { parseArgs, promoteSeedDataset, runCli } from '../../scripts/sql-seeds.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

async function tempDir() {
  return mkdtemp(join(tmpdir(), 'pms-sql-runner-'));
}

async function writeDataset(dir, mutate) {
  await mkdir(dir, { recursive: true });
  const artifacts = loadArtifacts(repoRoot);
  const tables = [];
  for (const entry of SEED_TABLE_FILES) {
    const sql = `-- Table "${entry.table}" (0 rows)\n`;
    await writeFile(join(dir, entry.file), sql);
    tables.push({
      table: entry.table,
      file: entry.file,
      sourceTable: entry.sourceTable,
      sourceRows: 0,
      targetRows: 0,
      checksum: sha256(Buffer.from(sql, 'utf8')),
      emptySequencePolicy: 'start-with-1',
    });
  }
  const body = {
    datasetVersion: '1.0.0',
    datasetFingerprint: 'fixture',
    schema: {
      targetRevision: artifacts.revision,
      contractChecksum: artifacts.migrations[0].checksum,
      tableCount: SEED_TABLE_FILES.length,
    },
    tables,
    summary: { totalTargetRows: 0 },
  };
  if (mutate) mutate(body);
  const manifest = { ...body, manifestChecksum: manifestChecksumFor(body) };
  await writeFile(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

test('seed transaction checks schema and emptiness before inserts and aligns after them', () => {
  const checksum = 'a'.repeat(64);
  const sql = buildSeedTransaction({
    schemaRevision: '31.0.0',
    schemaChecksum: checksum,
    seedSql: 'INSERT INTO "companies" ("name") VALUES (\'Probe\')',
  });
  const begin = sql.indexOf('BEGIN');
  const lock = sql.indexOf("pg_advisory_xact_lock(hashtext('pms_sql_seed'))");
  const guard = sql.indexOf('schema contract mismatch');
  const nonempty = sql.indexOf('nonempty target table companies');
  const insert = sql.indexOf('INSERT INTO "companies"');
  const align = sql.indexOf('pms_align_identity');
  const commit = sql.lastIndexOf('COMMIT');
  assert.ok(begin >= 0 && begin < lock && lock < guard && guard < nonempty && nonempty < insert && insert < align && align < commit);
  assert.equal(sql.includes("SET LOCAL TIME ZONE 'Asia/Bangkok'"), true);
  assert.equal(sql.includes("pms.preserve_source_timestamps = 'on'"), true);
  assert.throws(() => buildSeedTransaction({ schemaRevision: 'bad', schemaChecksum: checksum, seedSql: '' }), /Invalid schema contract/);
});

test('seed file names cannot escape the dataset directory', async () => {
  const dir = await tempDir();
  assert.throws(() => resolveSeedFile(dir, '../010_companies.sql'), /Unsafe seed file name/);
  assert.throws(() => resolveSeedFile(dir, '010_companies.sql/../../secret.sql'), /Unsafe seed file name/);
  const safe = resolveSeedFile(dir, '010_companies.sql');
  assert.equal(safe, resolve(dir, '010_companies.sql'));
});

test('manifest checksum and schema contract are enforced before SQL execution', async () => {
  const dir = await tempDir();
  await writeDataset(dir);
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
  manifest.manifestChecksum = 'b'.repeat(64);
  await writeFile(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  let called = false;
  await assert.rejects(executeSqlSeed({
    seedDir: dir,
    target: 'docker:pms-sql-seed-test',
    targetLabel: 'sql-seed-test',
    query: () => { called = true; return '0'; },
    env: {},
  }), /checksum mismatch/);
  assert.equal(called, false);

  await writeDataset(dir, (body) => { body.schema.contractChecksum = 'c'.repeat(64); });
  await assert.rejects(executeSqlSeed({
    seedDir: dir,
    target: 'docker:pms-sql-seed-test',
    targetLabel: 'sql-seed-test',
    query: () => { called = true; return '0'; },
    env: {},
  }), /schema contract does not match/);
  assert.equal(called, false);
  const loaded = await loadSeedManifest(dir);
  assert.equal(loaded.schema.contractChecksum, 'c'.repeat(64));
});

test('SQL errors keep the error class and drop row data', async () => {
  const nasty = "SQL command failed: ERROR: duplicate key postgres://user:secret-pass@db.internal/pms LINE 1: INSERT INTO users (email) VALUES ('person@example.com') DETAIL: Key (email)=(person@example.com) CONTEXT: $2b$hash";
  const sanitized = sanitizeSqlError(nasty);
  assert.match(sanitized, /duplicate key/);
  assert.equal(sanitized.includes('secret-pass'), false);
  assert.equal(sanitized.includes('person@example.com'), false);
  assert.equal(sanitized.includes('$2b$hash'), false);
  assert.equal(sanitized.includes('postgres://'), false);

  const dir = await tempDir();
  await writeDataset(dir);
  const calls = [];
  await assert.rejects(executeSqlSeed({
    seedDir: dir,
    target: 'docker:pms-sql-seed-test',
    targetLabel: 'sql-seed-test',
    env: {},
    query: (sql) => {
      calls.push(sql);
      if (calls.length === 1) throw new Error(nasty);
      if (sql.includes('to_regclass')) return 't';
      if (sql.includes('count(*)')) return '0';
      if (sql.includes('pms_align_identity')) return '1';
      throw new Error('unexpected query');
    },
  }), (err) => {
    assert.equal(err.message.includes('secret-pass'), false);
    assert.equal(err.message.includes('person@example.com'), false);
    assert.match(err.message, /duplicate key/);
    return true;
  });
  assert.equal(calls.some((sql) => sql.includes('pms_align_identity') && sql.includes('companies')), true);
});

test('sequence repair resets only empty tables', () => {
  const calls = [];
  const result = repairIdentityAfterFailedSeed((sql) => {
    calls.push(sql);
    if (sql.includes('to_regclass')) return 't';
    if (sql.includes('FROM "companies"')) return '4';
    if (sql.includes('count(*)')) return '0';
    if (sql.includes('pms_align_identity')) return '1';
    throw new Error('unexpected query');
  });
  assert.equal(result.repaired.includes('companies'), false);
  assert.equal(result.repaired.includes('users'), true);
  assert.equal(calls.some((sql) => sql.includes('pms_align_identity') && sql.includes('companies')), false);
  assert.deepEqual(repairIdentityAfterFailedSeed(() => 'f'), { repaired: [] });
});

test('a valid empty dataset is applied as one transaction', async () => {
  const dir = await tempDir();
  await writeDataset(dir);
  const calls = [];
  const result = await executeSqlSeed({
    seedDir: dir,
    target: 'docker:pms-sql-seed-test',
    targetLabel: 'sql-seed-test',
    env: {},
    query: (sql) => {
      calls.push(sql);
      if (calls.length === 1) return '';
      if (sql.includes('count(*)')) return '0';
      throw new Error('unexpected query');
    },
  });
  assert.equal(result.success, true);
  assert.equal(calls.length, 1 + SEED_TABLE_FILES.length);
  assert.equal(calls[0].includes('BEGIN'), true);
  assert.equal(calls[0].includes('COMMIT'), true);
  assert.ok(calls[0].indexOf('nonempty target table companies') < calls[0].lastIndexOf('COMMIT'));
});

test('active application database targets are refused', async () => {
  const dir = await tempDir();
  await writeDataset(dir);
  let called = false;
  await assert.rejects(executeSqlSeed({
    seedDir: dir,
    target: 'docker:pms-postgres-prod',
    targetLabel: 'sql-seed-test',
    env: {},
    query: () => { called = true; return '0'; },
  }), /Refusing the active application database target/);
  assert.equal(called, false);
  await assert.rejects(executeSqlSeed({
    seedDir: dir,
    target: 'postgresql://postgres@localhost:5432/pms',
    targetLabel: 'sql-seed-test',
    env: { DATABASE_URL: 'postgresql://postgres@localhost:5432/pms' },
    query: () => { called = true; return '0'; },
  }), /Refusing the active application database target/);
  assert.equal(called, false);
});

test('promotion replaces a destination atomically and restores it after failure', async () => {
  const root = await tempDir();
  const source = join(root, 'source');
  const dest = join(root, 'dest');
  await writeDataset(source);
  await mkdir(dest, { recursive: true });
  await writeFile(join(dest, 'keep.txt'), 'original');
  await assert.rejects(promoteSeedDataset({ sourceDir: source, destDir: dest, failPoint: 'after-move-aside' }), /Atomic promotion failed/);
  assert.equal(await readFile(join(dest, 'keep.txt'), 'utf8'), 'original');
  const namesAfterFailure = await readdir(root);
  assert.equal(namesAfterFailure.some((name) => name.includes('.promoting-')), false);
  assert.equal(namesAfterFailure.some((name) => name.includes('.previous-')), false);
  const promoted = await promoteSeedDataset({ sourceDir: source, destDir: dest });
  assert.equal(promoted.promotedTables, SEED_TABLE_FILES.length);
  assert.equal(await readFile(join(dest, '010_companies.sql'), 'utf8').then((text) => text.includes('companies')), true);
  assert.equal(await readFile(join(promoted.previousDir, 'keep.txt'), 'utf8'), 'original');
  await assert.rejects(promoteSeedDataset({
    sourceDir: source,
    destDir: resolve(repoRoot, 'database/seeds/master'),
  }), /active JSON seed directory/);
  await assert.rejects(promoteSeedDataset({ sourceDir: source, destDir: join(source, 'child') }), /separate directories/);
});

test('CLI flags are accepted only for their command', async () => {
  assert.throws(() => parseArgs(['seed', '--archive', 'backup.sql.gz']), /Unexpected flag/);
  assert.throws(() => parseArgs(['convert', '--output', 'a', '--output', 'b']), /Duplicate flag/);
  const promote = parseArgs(['promote', '--source', 'in', '--dest', 'out', '--confirm-active-master']);
  assert.equal(promote.flags.dest, 'out');
  assert.equal(promote.flags['confirm-active-master'], true);
  await assert.rejects(runCli(['promote', '--source', 'database/seeds/sql-master']), /Explicit promotion destination is required/);
  const fakeDir = await tempDir();
  const fakeArchive = join(fakeDir, 'fake.sql.gz');
  await writeFile(fakeArchive, gzipSync(Buffer.from('not-the-backup')));
  await assert.rejects(runCli(['inspect-archive', '--archive', fakeArchive]), /authoritative backup/);
  await assert.rejects(runCli(['inspect-archive', '--archive', join(tmpdir(), 'missing-backup.sql.gz')]));
});
