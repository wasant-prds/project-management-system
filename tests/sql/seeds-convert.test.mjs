import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../../scripts/sql-artifacts.mjs';
import {
  AUTHORITATIVE_BACKUP_PATH,
  COMPANY_POLICY_PATH,
  EXPECTED_SOURCE_COUNTS,
  buildLegacyMappings,
  formatSqlLiteral,
  formatTableInsertSql,
  generateSqlMasterSeeds,
  loadCompanyPolicy,
  parseDumpStream,
  parsePgArray,
  readLegacyMappings,
  toBangkokCalendarDate,
  toIsoTimestamp,
  transformSourceRows,
  unescapeCopyField,
  verifyArchive,
} from '../../scripts/sql-seed-convert.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const canonicalDir = resolve(repoRoot, 'database/seeds/sql-master');
const checksum = 'a'.repeat(64);

function companyRow(id, createdAt = '2025-01-01 00:00:00') {
  return { id, name: `Company ${id}`, createdAt, updatedAt: createdAt };
}

function mapping(overrides) {
  return {
    entityName: 'Company',
    sourceScope: 'seed',
    sourceChecksum: checksum,
    targetRevision: '31.0.0',
    oldId: 'old-1',
    createdAt: '2025-01-01T00:00:00.000',
    newId: '1',
    newPublicId: randomUUID(),
    ...overrides,
  };
}

async function tempDir() {
  return mkdtemp(join(tmpdir(), 'pms-sql-seed-'));
}

test('COPY unescape keeps octal and hex escapes exact', () => {
  assert.equal(unescapeCopyField('\\101'), 'A');
  assert.equal(unescapeCopyField('\\x41'), 'A');
  assert.equal(unescapeCopyField('\\N'), null);
  assert.equal(unescapeCopyField('a\\tb'), 'a\tb');
  assert.equal(unescapeCopyField('line\\nnext'), 'line\nnext');
});

test('COPY parser rejects a short row without echoing the field', async () => {
  const secret = 'secret-cell-value';
  const dump = `COPY public."Company" ("id", "name") FROM stdin;\n${secret}\n\\.\n`;
  await assert.rejects(parseDumpStream(Readable.from([dump])), (err) => {
    assert.equal(err.message.includes(secret), false);
    assert.match(err.message, /has 1 fields, expected 2/);
    return true;
  });
});

test('PostgreSQL array parser keeps quoted commas, NULL, and doubled quotes', () => {
  assert.deepEqual(parsePgArray('{"a,b",NULL,"c""d"}'), ['a,b', null, 'c"d']);
  assert.deepEqual(parsePgArray('{}'), []);
  assert.equal(parsePgArray(null), null);
});

test('decimal literals stay exact text', () => {
  const hours = '1828.000000000000000000000000000000';
  assert.equal(formatSqlLiteral(hours, 'decimal'), hours);
  assert.throws(() => formatSqlLiteral(1.5, 'decimal'), /Invalid decimal literal/);
});

test('calendar conversion accepts only approved Bangkok times', () => {
  assert.equal(toBangkokCalendarDate('2026-08-21 09:00:00', 'work_items.workDate'), '2026-08-21');
  assert.equal(toBangkokCalendarDate('2026-08-21 00:00:00', 'work_items.workDate'), '2026-08-21');
  assert.equal(toBangkokCalendarDate(null, 'work_items.workDate'), null);
  assert.throws(() => toBangkokCalendarDate('2026-08-21 15:00:00', 'work_items.workDate'), /09:00:00/);
  assert.throws(() => toIsoTimestamp(null, 'createdAt'), /Missing or unrecognized timestamp/);
  assert.throws(() => toIsoTimestamp('not-a-date', 'createdAt'), /Missing or unrecognized timestamp/);
});

test('milestone due dates stay timestamps and project due dates stay calendar dates', () => {
  const publicId = randomUUID();
  const milestone = formatTableInsertSql('project_milestones', [{
    id: '1', public_id: publicId, name: 'Gate', description: null,
    due_date: '2025-01-01 00:00:00.000', status: 'Not Started',
    created_at: '2025-01-01 00:00:00.000', updated_at: '2025-01-01 00:00:00.000', project_id: '1',
  }]);
  assert.equal(milestone.includes('::TIMESTAMP(3) WITHOUT TIME ZONE'), true);
  assert.equal(milestone.includes('::DATE'), false);
  const project = formatTableInsertSql('projects', [{
    id: '1', public_id: publicId, name: 'Project', description: null, status: 'Planning', priority: 'Low',
    start_date: '2025-01-01', due_date: '2025-02-01', budget_amount: null, spent_amount: '0.0',
    progress_percent: '0', color: null, created_at: '2025-01-01 00:00:00.000', updated_at: '2025-01-01 00:00:00.000',
    creator_id: null, company_id: '1',
  }]);
  assert.equal(project.includes("'2025-02-01'::DATE"), true);
  assert.equal(project.includes('1970-01-01'), false);
});

test('legacy mappings sort by code point and reuse public ids', () => {
  const tables = { Company: [companyRow('a'), companyRow('Z')] };
  const first = buildLegacyMappings({ tables, sourceChecksum: checksum, companyPolicy: null });
  assert.equal(first.getNumericId('Company', 'Z'), '1');
  assert.equal(first.getNumericId('Company', 'a'), '2');
  const second = buildLegacyMappings({
    tables, sourceChecksum: checksum, existingMappings: first.mappings, companyPolicy: null,
  });
  assert.equal(second.getPublicId('Company', 'Z'), first.getPublicId('Company', 'Z'));
  const fresh = buildLegacyMappings({ tables, sourceChecksum: checksum, companyPolicy: null });
  assert.notEqual(fresh.getPublicId('Company', 'Z'), first.getPublicId('Company', 'Z'));
});

test('partial, drifted, and conflicting legacy mappings fail before new ids are issued', () => {
  const tables = { Company: [companyRow('old-1'), companyRow('old-2')] };
  assert.throws(() => buildLegacyMappings({
    tables, sourceChecksum: checksum, existingMappings: [mapping({ oldId: 'old-1' })], companyPolicy: null,
  }), /does not cover every Company row/);
  assert.throws(() => buildLegacyMappings({
    tables: { Company: [companyRow('old-1')] },
    sourceChecksum: checksum,
    existingMappings: [mapping({ sourceChecksum: 'b'.repeat(64) })],
    companyPolicy: null,
  }), /source checksum/);
  assert.throws(() => buildLegacyMappings({
    tables: { Company: [companyRow('old-1')] },
    sourceChecksum: checksum,
    existingMappings: [mapping({ createdAt: '2024-01-01T00:00:00.000' })],
    companyPolicy: null,
  }), /timestamp does not match/);
  assert.throws(() => buildLegacyMappings({
    tables: { Company: [companyRow('old-1')] },
    sourceChecksum: checksum,
    existingMappings: [mapping({ sourceScope: 'live' })],
    companyPolicy: null,
  }), /live mapping/);
  const publicId = randomUUID();
  assert.throws(() => buildLegacyMappings({
    tables,
    sourceChecksum: checksum,
    existingMappings: [
      mapping({ oldId: 'old-1', newId: '5', newPublicId: publicId }),
      mapping({ oldId: 'old-2', newId: '5', newPublicId: randomUUID() }),
    ],
    companyPolicy: null,
  }), /numeric id is duplicated/);
});

test('corrupt and missing legacy mapping files do not become an empty map', async () => {
  const dir = await tempDir();
  const corrupt = join(dir, 'legacy-id-map.json');
  await writeFile(corrupt, '{"password":"secret-hash"}');
  await assert.rejects(readLegacyMappings(corrupt, true), (err) => {
    assert.match(err.message, /Legacy mapping/);
    assert.equal(err.message.includes('secret-hash'), false);
    return true;
  });
  await assert.rejects(readLegacyMappings(join(dir, 'missing.json'), true), /does not exist/);
  assert.deepEqual(await readLegacyMappings(join(dir, 'missing.json'), false), []);
});

test('company policy is required and unsafe policy paths are rejected', async () => {
  const policy = await loadCompanyPolicy();
  assert.equal(policy.policyVersion, '1.0.0');
  assert.equal(policy.dhasCompany.code, 'dhas');
  const tables = {
    Company: [companyRow('source-company', '2025-02-01 00:00:00.000')],
    Project: [{
      id: 'project-1', name: 'Project', description: null, status: 'Planning', priority: 'Low',
      startDate: '2025-02-01 15:00:00', dueDate: '2025-03-01 00:00:00', budget: null, spent: '0.0',
      progress: '0', colorProject: null, createdAt: '2025-02-01 00:00:00.000', updatedAt: '2025-02-01 00:00:00.000',
      creatorId: null,
    }],
  };
  const mapper = buildLegacyMappings({ tables, sourceChecksum: checksum, companyPolicy: policy });
  assert.throws(() => transformSourceRows({ tables, legacyMapper: mapper, companyPolicy: null }), /Company policy is required/);
  assert.throws(() => transformSourceRows({
    tables, legacyMapper: mapper, companyPolicy: { ...policy, defaultProjectCompany: '', projectCompanyMap: {} },
  }), /Missing company assignment/);
  assert.throws(() => transformSourceRows({
    tables, legacyMapper: mapper, companyPolicy: { ...policy, defaultProjectCompany: 'other' },
  }), /unknown company code/);
  assert.throws(() => transformSourceRows({ tables, legacyMapper: mapper, companyPolicy: policy }), /approved 00:00:00 or 09:00:00/);
  const raw = JSON.parse(await readFile(COMPANY_POLICY_PATH, 'utf8'));
  const dir = await tempDir();
  await writeFile(join(dir, 'policy.json'), JSON.stringify({ ...raw, evidence: '../package.json' }));
  await assert.rejects(loadCompanyPolicy(join(dir, 'policy.json')), /unsafe/);
});

test('a non-authoritative archive does not replace an existing dataset', async () => {
  const dir = await tempDir();
  const sentinel = join(dir, 'sentinel.txt');
  await writeFile(sentinel, 'keep');
  const archive = join(dir, 'fake.sql.gz');
  await writeFile(archive, gzipSync(Buffer.from('COPY public."Company" ("id") FROM stdin;\n\\.\n')));
  await assert.rejects(generateSqlMasterSeeds({
    archivePath: archive,
    outputDir: dir,
    companyPolicy: await loadCompanyPolicy(),
  }), /authoritative backup/);
  assert.equal(await readFile(sentinel, 'utf8'), 'keep');
  await assert.rejects(access(join(dir, 'manifest.json')));
});

test('a corrupt gzip fails closed', async () => {
  const dir = await tempDir();
  const archive = join(dir, 'bad.sql.gz');
  const bytes = gzipSync(Buffer.from('hello'));
  bytes[bytes.length - 1] ^= 0xff;
  await writeFile(archive, bytes);
  await assert.rejects(verifyArchive(archive));
});

test('dockerignore excludes staged SQL master seeds', async () => {
  const ignore = await readFile(resolve(repoRoot, '.dockerignore'), 'utf8');
  assert.match(ignore, /^database\/seeds\/sql-master$/m);
});

test('authoritative conversion reuses public ids and stays outside the staged dataset', async (t) => {
  let archiveExists = true;
  try {
    await access(resolve(repoRoot, AUTHORITATIVE_BACKUP_PATH));
  } catch {
    archiveExists = false;
  }
  if (!archiveExists) {
    t.skip('authoritative backup is not in this checkout');
    return;
  }
  let canonicalManifest = null;
  try {
    canonicalManifest = sha256(await readFile(join(canonicalDir, 'manifest.json')));
  } catch {
    canonicalManifest = null;
  }
  let canonicalMap = null;
  try {
    canonicalMap = JSON.parse(await readFile(join(canonicalDir, 'legacy-id-map.json'), 'utf8'));
  } catch {
    canonicalMap = null;
  }
  const firstDir = await tempDir();
  const secondDir = await tempDir();
  const first = await generateSqlMasterSeeds({
    outputDir: firstDir,
    existingMappingsPath: canonicalMap ? join(canonicalDir, 'legacy-id-map.json') : null,
  });
  const second = await generateSqlMasterSeeds({
    outputDir: secondDir,
    existingMappingsPath: join(firstDir, 'legacy-id-map.json'),
  });
  assert.equal(first.manifest.datasetFingerprint, second.manifest.datasetFingerprint);
  assert.equal(first.manifest.summary.totalSourceRows, 725);
  assert.equal(first.manifest.summary.totalTargetRows, 719);
  assert.equal(first.manifest.summary.excludedSourceRows, 7);
  assert.equal(first.manifest.anomalies.companyCountDelta, 1);
  assert.equal(first.manifest.anomalies.activityLogUnresolvedReferences, 3);
  assert.deepEqual(first.manifest.anomalies.activityLogUnresolvedByEntity, { task: 3 });
  assert.equal(first.manifest.anomalies.workItemsUpdatedBeforeCreated, 1);
  assert.equal(first.manifest.anomalies.calendarTimeHistogram.workDate['09:00:00'], 236);
  assert.equal(first.manifest.anomalies.calendarTimeHistogram.workDate['00:00:00'], 49);
  assert.equal(first.manifest.anomalies.calendarTimeHistogram.workDate.null, 1);
  assert.equal(first.manifest.provenance.syntheticUserTheme, 11);
  assert.equal(first.manifest.provenance.syntheticUserLocale, 11);
  assert.equal(first.manifest.provenance.projectMemberTimestampsCopiedFromJoinedAt, 19);
  assert.equal(first.manifest.documents.physicalFilesVerified, false);
  assert.deepEqual(first.manifest.source.sourceCounts, EXPECTED_SOURCE_COUNTS);
  const activity = await readFile(join(firstDir, '110_activity_logs.sql'), 'utf8');
  assert.equal(activity.includes("'null'::JSONB"), true);
  assert.equal(activity.includes('1970-01-01'), false);
  const workItems = await readFile(join(firstDir, '050_work_items.sql'), 'utf8');
  assert.equal(workItems.includes('::DATE'), true);
  assert.equal(workItems.includes('1970-01-01'), false);
  if (canonicalMap) {
    const generated = JSON.parse(await readFile(join(firstDir, 'legacy-id-map.json'), 'utf8'));
    assert.equal(publicIdMismatches(canonicalMap, generated), 0);
  }
  if (canonicalManifest) {
    assert.equal(sha256(await readFile(join(canonicalDir, 'manifest.json'))), canonicalManifest);
  }
});

function publicIdMismatches(left, right) {
  const rightByKey = new Map(right.map((row) => [`${row.entityName}\u0000${row.oldId}`, row.newPublicId]));
  if (left.length !== right.length) return Math.abs(left.length - right.length) + left.length;
  return left.filter((row) => rightByKey.get(`${row.entityName}\u0000${row.oldId}`) !== row.newPublicId).length;
}
