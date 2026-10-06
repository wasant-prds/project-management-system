import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import test from 'node:test';
import {
  buildSchemaApproval,
  databaseTargetFingerprint,
  loadSqlContract,
  releaseFingerprint,
  pendingUpgradeReceiptError,
  recordSchemaApproval,
  resolveAutoBaseline,
  schemaSha256,
  schemaRolloutGateError,
  seedRolloutGateError,
  verifySchemaRolloutApproval,
  writeSchemaApproval,
} from '../../scripts/db-schema-rollout-gate.mjs';
import { sha256 } from '../../scripts/sql-artifacts.mjs';
import { APPLIED_SQL, EMPTY_TABLE_SQL, HISTORY_EXISTS_SQL } from '../../scripts/sql-migrate.mjs';
import { applyApprovedSchema } from '../../scripts/sql-runtime.mjs';

const schemaPath = resolve('prisma/schema.prisma');
const schemaHash = schemaSha256(schemaPath);
const contract = loadSqlContract(resolve('.'));
const databaseUrl = 'postgresql://reviewer:synthetic@Db.Internal:5432/uat_db?schema=public&connection_limit=5';
const targetHash = databaseTargetFingerprint(databaseUrl, 'uat');
const approvedEnv = {
  APP_ENV: 'uat',
  DATABASE_URL: databaseUrl,
  DB_SCHEMA_SYNC_APPROVED: 'true',
  BACKUP_DIR: resolve('database/rollout/missing-backup-dir'),
};

test('schema rollout gate requires explicit approval and a valid target', () => {
  assert.match(schemaRolloutGateError({ ...approvedEnv, DB_SCHEMA_SYNC_APPROVED: 'false' }, schemaHash, contract), /explicitly approved/);
  assert.match(schemaRolloutGateError({ ...approvedEnv, APP_ENV: 'staging' }, schemaHash, contract), /APP_ENV local, dev, uat, or prod/);
  assert.equal(schemaRolloutGateError({ ...approvedEnv, DATABASE_URL: undefined }, schemaHash, contract)?.includes('valid DATABASE_URL'), true);
  assert.equal(schemaRolloutGateError(approvedEnv, schemaHash, contract), null);
});

test('schema rollout gate computes the current release instead of reading SHA-256 settings', () => {
  assert.equal(schemaRolloutGateError({
    ...approvedEnv,
    DB_SCHEMA_SYNC_APPROVED_SCHEMA_SHA256: 'a'.repeat(64),
    DB_SCHEMA_SYNC_APPROVED_TARGET_SHA256: 'b'.repeat(64),
    DB_SCHEMA_SYNC_APPROVED_RELEASE_SHA256: 'c'.repeat(64),
  }, schemaHash, contract), null);
  assert.equal(schemaRolloutGateError({ ...approvedEnv, APP_ENV: 'prod', DATABASE_URL: databaseUrl }, schemaHash, contract), null);
  const localTargetHash = databaseTargetFingerprint(databaseUrl, 'local');
  const localRecord = buildSchemaApproval({ ...approvedEnv, APP_ENV: 'local' }, schemaHash, contract, { baseline: 'empty-database', receiptPath: null }, '2026-10-06T09:00:00+07:00');
  assert.equal(localRecord.targetSha256, localTargetHash);
  assert.equal(localRecord.releaseSha256, releaseFingerprint(contract.revision, contract.sqlChecksum, schemaHash, contract, localTargetHash));
  assert.equal(localRecord.recordedAt, '2026-10-06T09:00:00+07:00');
  assert.equal(JSON.stringify(localRecord).includes('synthetic'), false);
  assert.equal(verifySchemaRolloutApproval(schemaPath, approvedEnv), null);
});

test('schema rollout approval rejects an inconsistent migration set', () => {
  const laterMigration = {
    ...contract,
    migrations: [...contract.migrations, { version: '0002', script: 'database/migrations/0002_review.sql', checksum: 'a'.repeat(64) }],
    migrationSetSha256: 'b'.repeat(64),
  };
  assert.match(schemaRolloutGateError(approvedEnv, schemaHash, laterMigration), /ordered SQL migration set/);
});

test('current SQL artifacts are accepted after a migration is added', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pms-sql-contract-'));
  try {
    await mkdir(join(root, 'database', 'migrations'), { recursive: true });
    await mkdir(join(root, 'database'), { recursive: true });
    await writeFile(join(root, 'database', 'schema.sql'), await readFile(resolve('database/schema.sql')));
    const manifest = JSON.parse(await readFile(resolve('database/migrations/manifest.json'), 'utf8'));
    await writeFile(join(root, 'database', 'migrations', 'manifest.json'), JSON.stringify(manifest, null, 2));
    const initial = loadSqlContract(root);
    const script = 'SELECT 1;\n';
    await writeFile(join(root, 'database', 'migrations', '0002_review.sql'), script);
    manifest.migrations.push({
      version: '0002', name: 'review', kind: 'sql', script: 'database/migrations/0002_review.sql',
      checksum: sha256(Buffer.from(script)),
    });
    await writeFile(join(root, 'database', 'migrations', 'manifest.json'), JSON.stringify(manifest, null, 2));
    const extended = loadSqlContract(root);
    assert.equal(extended.revision, initial.revision);
    assert.notEqual(extended.migrationSetSha256, initial.migrationSetSha256);
    assert.equal(schemaRolloutGateError(approvedEnv, schemaHash, extended), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

async function writeVerifiedArchive(directory, bytes, { site = 'uat', digest = createHash('sha256').update(bytes).digest('hex') } = {}) {
  const archivePath = join(directory, 'backup.dump');
  await writeFile(archivePath, bytes);
  await writeFile(`${archivePath}.json`, JSON.stringify({ version: 1, site, sha256: digest, bytes: bytes.length }));
  const receiptPath = `${archivePath}.verified.json`;
  await writeFile(receiptPath, JSON.stringify({
    version: 1, site, sha256: digest, result: 'isolated-restore-passed', verifiedAt: new Date().toISOString(),
  }));
  return receiptPath;
}

test('baseline requires a receipt whose archive bytes and checksum match', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pms-backup-receipt-'));
  const env = { ...approvedEnv, BACKUP_DIR: root };
  const bytes = Buffer.from('synthetic isolated archive');
  try {
    assert.equal(resolveAutoBaseline(env).baseline, 'unverified');
    assert.match(pendingUpgradeReceiptError(env), /fresh isolated-restore receipt/);
    const receiptPath = await writeVerifiedArchive(root, bytes);
    const selected = resolveAutoBaseline(env);
    assert.equal(selected.baseline, 'backup-restore');
    assert.equal(selected.receiptPath, receiptPath);
    assert.equal(pendingUpgradeReceiptError(env), null);
    await writeFile(join(root, 'backup.dump'), Buffer.from('tampered archive bytes'));
    assert.equal(resolveAutoBaseline(env).receiptStatus, 'mismatch');
    assert.match(pendingUpgradeReceiptError(env), /stale or does not match/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('approval record is written outside .env and omits the database password', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pms-schema-approval-'));
  const filePath = join(root, 'schema-approval.json');
  try {
    const record = buildSchemaApproval(approvedEnv, schemaHash, contract, { baseline: 'empty-database', receiptPath: null }, '2026-10-06T09:05:00+07:00');
    writeSchemaApproval(record, filePath);
    const stored = JSON.parse(await readFile(filePath, 'utf8'));
    assert.equal(stored.targetSha256, targetHash);
    assert.equal(stored.schemaSha256, schemaHash);
    assert.equal(stored.appEnv, 'uat');
    assert.equal(stored.baseline, 'empty-database');
    assert.equal(stored.schemaSyncApproved, true);
    assert.equal(JSON.stringify(stored).includes('synthetic'), false);
    const blocked = recordSchemaApproval(stored, join(filePath, 'nested.json'));
    assert.equal(blocked, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('schema rollout gate entrypoint rejects an unapproved environment', () => {
  const blocked = verifySchemaRolloutApproval(schemaPath, {
    APP_ENV: 'uat',
    DATABASE_URL: databaseUrl,
    DB_SCHEMA_SYNC_APPROVED: 'false',
    BACKUP_DIR: approvedEnv.BACKUP_DIR,
  }, resolve('.'));
  assert.match(blocked, /explicitly approved/);
  assert.equal(verifySchemaRolloutApproval(schemaPath, approvedEnv), null);
});

test('schema rollout approval defaults to the process environment and repository schema', () => {
  const previousValues = new Map(Object.keys(approvedEnv).map(key => [key, process.env[key]]));
  Object.assign(process.env, approvedEnv);
  try {
    assert.equal(verifySchemaRolloutApproval(), null);
  } finally {
    for (const [key, value] of previousValues) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('seed runs when RUN_SEED is true and does not require a fingerprint setting', () => {
  assert.match(seedRolloutGateError({ RUN_SEED: 'false' }), /RUN_SEED=true/);
  assert.equal(seedRolloutGateError({ RUN_SEED: 'true' }), null);
});

function runtimeQuery({ history, tables = '0', applied = '' }) {
  const calls = [];
  const query = (sql) => {
    calls.push(sql);
    if (sql === HISTORY_EXISTS_SQL) return history;
    if (sql === EMPTY_TABLE_SQL) return tables;
    if (sql === APPLIED_SQL) return applied;
    return '';
  };
  return { query, calls };
}

test('pending upgrades require a verified receipt and an empty database can bootstrap', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pms-upgrade-receipt-'));
  const approvalPath = join(root, 'schema-approval.json');
  const env = { ...approvedEnv, BACKUP_DIR: root, PMS_SQL_RUNTIME_APPLY: '1' };
  const applied = contract.migrations.map((migration) => `${migration.version} ${migration.checksum}`).join('\n');
  try {
    const empty = runtimeQuery({ history: 'f' });
    const bootstrapped = applyApprovedSchema({ env, query: empty.query, targetLabel: 'uat', approvalPath });
    assert.equal(bootstrapped.action, 'empty-bootstrap');
    assert.equal(JSON.parse(await readFile(approvalPath, 'utf8')).baseline, 'empty-database');

    const current = runtimeQuery({ history: 't', applied });
    const unchanged = applyApprovedSchema({ env, query: current.query, targetLabel: 'uat', approvalPath });
    assert.deepEqual(unchanged.applied, []);
    assert.equal(JSON.parse(await readFile(approvalPath, 'utf8')).baseline, 'unverified');

    const pending = runtimeQuery({ history: 't', applied: '' });
    assert.throws(() => applyApprovedSchema({ env, query: pending.query, targetLabel: 'uat', approvalPath }), /fresh isolated-restore receipt/);
    assert.equal(pending.calls.includes(APPLIED_SQL), true);
    assert.equal(pending.calls.some((sql) => sql.startsWith('BEGIN')), false);

    await writeVerifiedArchive(root, Buffer.from('verified archive'));
    await writeFile(join(root, 'backup.dump'), Buffer.from('tampered archive bytes'));
    const tampered = runtimeQuery({ history: 't', applied: '' });
    assert.throws(() => applyApprovedSchema({ env, query: tampered.query, targetLabel: 'uat', approvalPath }), /stale or does not match/);
    assert.equal(tampered.calls.some((sql) => sql.startsWith('BEGIN')), false);

    await writeVerifiedArchive(root, Buffer.from('verified archive'));
    const ready = runtimeQuery({ history: 't', applied: '' });
    const upgraded = applyApprovedSchema({ env, query: ready.query, targetLabel: 'uat', approvalPath });
    assert.equal(upgraded.action, 'upgrade');
    assert.equal(upgraded.applied.length > 0, true);
    assert.equal(JSON.parse(await readFile(approvalPath, 'utf8')).baseline, 'backup-restore');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
