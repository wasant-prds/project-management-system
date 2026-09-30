import assert from 'node:assert/strict';
import test from 'node:test';
import { resolve } from 'node:path';
import { schemaSha256, schemaRolloutGateError, verifySchemaRolloutApproval } from '../../scripts/db-schema-rollout-gate.mjs';

const schemaPath = resolve('prisma/schema.prisma');
const schemaHash = schemaSha256(schemaPath);
const approvedEnv = {
  APP_ENV: 'uat',
  DB_SCHEMA_BACKUP_RESTORE_VERIFIED: 'true',
  DB_SCHEMA_EMPTY_DATABASE_VERIFIED: 'false',
  DB_SCHEMA_SYNC_APPROVED: 'true',
  DB_SCHEMA_SYNC_APPROVED_ENV: 'uat',
  DB_SCHEMA_SYNC_APPROVED_SCHEMA_SHA256: schemaHash,
};

test('schema rollout gate requires backup/restore verification and explicit approval', () => {
  assert.match(schemaRolloutGateError({ ...approvedEnv, DB_SCHEMA_BACKUP_RESTORE_VERIFIED: 'false' }, schemaHash), /exactly one target baseline/);
  assert.match(schemaRolloutGateError({ ...approvedEnv, DB_SCHEMA_EMPTY_DATABASE_VERIFIED: 'true' }, schemaHash), /exactly one target baseline/);
  assert.match(schemaRolloutGateError({ ...approvedEnv, DB_SCHEMA_SYNC_APPROVED: 'false' }, schemaHash), /explicitly approved/);
});

test('schema rollout gate binds approval to the selected environment and exact Prisma schema', () => {
  assert.match(schemaRolloutGateError({ ...approvedEnv, APP_ENV: 'prod' }, schemaHash), /does not match the selected APP_ENV/);
  assert.match(schemaRolloutGateError({ ...approvedEnv, DB_SCHEMA_SYNC_APPROVED_SCHEMA_SHA256: 'a'.repeat(64) }, schemaHash), /does not match the current Prisma schema/);
  assert.match(schemaRolloutGateError({ ...approvedEnv, DB_SCHEMA_SYNC_APPROVED_SCHEMA_SHA256: 'invalid' }, schemaHash), /does not match the current Prisma schema/);
  assert.equal(schemaRolloutGateError(approvedEnv, schemaHash), null);
  assert.equal(schemaRolloutGateError({
    ...approvedEnv,
    APP_ENV: 'local',
    DB_SCHEMA_SYNC_APPROVED_ENV: 'local',
  }, schemaHash), null);
  assert.equal(schemaRolloutGateError({
    ...approvedEnv,
    DB_SCHEMA_BACKUP_RESTORE_VERIFIED: 'false',
    DB_SCHEMA_EMPTY_DATABASE_VERIFIED: 'true',
  }, schemaHash), null);
  assert.equal(verifySchemaRolloutApproval(schemaPath, approvedEnv), null);
});

test('schema rollout gate entrypoint rejects default configuration and accepts a verified approval', () => {
  const blocked = verifySchemaRolloutApproval(schemaPath, {
    APP_ENV: 'uat',
    DB_SCHEMA_BACKUP_RESTORE_VERIFIED: 'false',
    DB_SCHEMA_EMPTY_DATABASE_VERIFIED: 'false',
    DB_SCHEMA_SYNC_APPROVED: 'false',
    DB_SCHEMA_SYNC_APPROVED_ENV: '',
    DB_SCHEMA_SYNC_APPROVED_SCHEMA_SHA256: '',
  }, schemaPath);
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
