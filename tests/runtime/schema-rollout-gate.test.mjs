import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { resolve } from 'node:path';
import { databaseTargetFingerprint, loadSqlContract, releaseFingerprint, schemaSha256, schemaRolloutGateError, verifySchemaRolloutApproval } from '../../scripts/db-schema-rollout-gate.mjs';
import { sha256 } from '../../scripts/sql-artifacts.mjs';

const schemaPath = resolve('prisma/schema.prisma');
const schemaHash = schemaSha256(schemaPath);
const contract = loadSqlContract(resolve('.'));
const databaseUrl = 'postgresql://reviewer:synthetic@Db.Internal:5432/uat_db?schema=public&connection_limit=5';
const targetHash = databaseTargetFingerprint(databaseUrl, 'uat');
const approvedEnv = {
  APP_ENV: 'uat',
  DATABASE_URL: databaseUrl,
  DB_SCHEMA_BACKUP_RESTORE_VERIFIED: 'false',
  DB_SCHEMA_EMPTY_DATABASE_VERIFIED: 'true',
  DB_SCHEMA_SYNC_APPROVED: 'true',
  DB_SCHEMA_SYNC_APPROVED_ENV: 'uat',
  DB_SCHEMA_SYNC_APPROVED_TARGET_SHA256: targetHash,
  DB_SCHEMA_SYNC_APPROVED_SCHEMA_SHA256: schemaHash,
  DB_SCHEMA_SYNC_APPROVED_SQL_SHA256: contract.sqlChecksum,
  DB_SCHEMA_SYNC_APPROVED_REVISION: contract.revision,
  DB_SCHEMA_SYNC_APPROVED_MIGRATIONS_SHA256: contract.migrationSetSha256,
  DB_SCHEMA_SYNC_APPROVED_RELEASE_SHA256: releaseFingerprint(contract.revision, contract.sqlChecksum, schemaHash, contract, targetHash),
};

test('schema rollout gate requires backup/restore verification and explicit approval', () => {
  assert.match(schemaRolloutGateError({ ...approvedEnv, DB_SCHEMA_EMPTY_DATABASE_VERIFIED: 'false' }, schemaHash, contract), /exactly one target baseline/);
  assert.match(schemaRolloutGateError({
    ...approvedEnv,
    DB_SCHEMA_BACKUP_RESTORE_VERIFIED: 'true',
    DB_SCHEMA_EMPTY_DATABASE_VERIFIED: 'false',
  }, schemaHash, contract), /isolated-restore receipt/);
  assert.match(schemaRolloutGateError({ ...approvedEnv, DB_SCHEMA_SYNC_APPROVED: 'false' }, schemaHash, contract), /explicitly approved/);
});

test('schema rollout gate binds approval to the selected environment and exact Prisma schema', () => {
  assert.match(schemaRolloutGateError({ ...approvedEnv, APP_ENV: 'prod' }, schemaHash, contract), /does not match the selected APP_ENV/);
  assert.match(schemaRolloutGateError({ ...approvedEnv, DB_SCHEMA_SYNC_APPROVED_SCHEMA_SHA256: 'a'.repeat(64) }, schemaHash, contract), /does not match the current Prisma schema/);
  assert.match(schemaRolloutGateError({ ...approvedEnv, DB_SCHEMA_SYNC_APPROVED_SCHEMA_SHA256: 'invalid' }, schemaHash, contract), /does not match the current Prisma schema/);
  assert.match(schemaRolloutGateError({
    ...approvedEnv,
    DATABASE_URL: 'postgresql://reviewer:other@different.internal:5432/uat_db?schema=public',
  }, schemaHash, contract), /does not match the selected database target/);
  assert.match(schemaRolloutGateError({
    ...approvedEnv,
    DATABASE_URL: 'postgresql://another-user:synthetic@db.internal:5432/uat_db',
  }, schemaHash, contract), /does not match the selected database target/);
  assert.equal(schemaRolloutGateError(approvedEnv, schemaHash, contract), null);
  const localTargetHash = databaseTargetFingerprint(databaseUrl, 'local');
  assert.equal(schemaRolloutGateError({
    ...approvedEnv,
    APP_ENV: 'local',
    DB_SCHEMA_SYNC_APPROVED_ENV: 'local',
    DB_SCHEMA_SYNC_APPROVED_TARGET_SHA256: localTargetHash,
    DB_SCHEMA_SYNC_APPROVED_RELEASE_SHA256: releaseFingerprint(contract.revision, contract.sqlChecksum, schemaHash, contract, localTargetHash),
  }, schemaHash, contract), null);
  assert.equal(schemaRolloutGateError({
    ...approvedEnv,
    DATABASE_URL: undefined,
  }, schemaHash, contract)?.includes('valid DATABASE_URL'), true);
  assert.equal(verifySchemaRolloutApproval(schemaPath, approvedEnv), null);
});

test('schema rollout approval is bound to every ordered migration artifact', () => {
  const laterMigration = {
    ...contract,
    migrations: [...contract.migrations, { version: '0002', script: 'database/migrations/0002_review.sql', checksum: 'a'.repeat(64) }],
    migrationSetSha256: 'b'.repeat(64),
  };
  assert.match(schemaRolloutGateError(approvedEnv, schemaHash, laterMigration), /ordered SQL migration set/);
});

test('SQL contract fingerprint changes when a later migration is added at the same revision', async () => {
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
    assert.match(schemaRolloutGateError({
      ...approvedEnv,
      DB_SCHEMA_SYNC_APPROVED_MIGRATIONS_SHA256: initial.migrationSetSha256,
    }, schemaHash, extended), /ordered SQL migration set/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('backup baseline requires a fresh, matching isolated-restore receipt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pms-backup-receipt-'));
  const archivePath = join(root, 'backup.dump');
  const receiptPath = `${archivePath}.verified.json`;
  const bytes = Buffer.from('synthetic isolated archive');
  const digest = createHash('sha256').update(bytes).digest('hex');
  const current = {
    ...approvedEnv,
    DB_SCHEMA_BACKUP_RESTORE_VERIFIED: 'true',
    DB_SCHEMA_EMPTY_DATABASE_VERIFIED: 'false',
    DB_SCHEMA_BACKUP_RESTORE_RECEIPT_PATH: receiptPath,
  };
  try {
    await writeFile(archivePath, bytes);
    await writeFile(`${archivePath}.json`, JSON.stringify({ version: 1, site: 'uat', sha256: digest, bytes: bytes.length }));
    await writeFile(receiptPath, JSON.stringify({ version: 1, site: 'uat', sha256: digest, result: 'isolated-restore-passed', verifiedAt: new Date().toISOString() }));
    assert.equal(schemaRolloutGateError(current, schemaHash, contract), null);
    await writeFile(receiptPath, JSON.stringify({ version: 1, site: 'dev', sha256: digest, result: 'isolated-restore-passed', verifiedAt: new Date().toISOString() }));
    assert.match(schemaRolloutGateError(current, schemaHash, contract), /stale or does not match/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('schema rollout gate entrypoint rejects default configuration and accepts a verified approval', () => {
  const blocked = verifySchemaRolloutApproval(schemaPath, {
    APP_ENV: 'uat',
    DB_SCHEMA_BACKUP_RESTORE_VERIFIED: 'false',
    DB_SCHEMA_EMPTY_DATABASE_VERIFIED: 'false',
    DB_SCHEMA_SYNC_APPROVED: 'false',
    DB_SCHEMA_SYNC_APPROVED_ENV: '',
    DB_SCHEMA_SYNC_APPROVED_SCHEMA_SHA256: '',
  }, resolve('.'));
  assert.match(blocked, /exactly one target baseline is verified/);
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
