import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function schemaSha256(schemaPath = resolve('prisma/schema.prisma')) {
  return createHash('sha256').update(readFileSync(schemaPath)).digest('hex');
}

export function schemaRolloutGateError(env, actualSchemaHash) {
  const backupRestoreVerified = env.DB_SCHEMA_BACKUP_RESTORE_VERIFIED === 'true';
  const emptyDatabaseVerified = env.DB_SCHEMA_EMPTY_DATABASE_VERIFIED === 'true';
  if (backupRestoreVerified === emptyDatabaseVerified) {
    return 'Schema sync is blocked until exactly one target baseline is verified: backup/restore or an empty database.';
  }
  if (env.DB_SCHEMA_SYNC_APPROVED !== 'true') {
    return 'Schema sync is blocked until the target schema rollout is explicitly approved.';
  }
  if (!['local', 'dev', 'uat', 'prod'].includes(env.APP_ENV)) {
    return 'Schema sync approval must target APP_ENV local, dev, uat, or prod.';
  }
  if (env.DB_SCHEMA_SYNC_APPROVED_ENV !== env.APP_ENV) {
    return 'Schema sync approval does not match the selected APP_ENV.';
  }
  const approvedHash = env.DB_SCHEMA_SYNC_APPROVED_SCHEMA_SHA256;
  if (!/^[a-f0-9]{64}$/.test(approvedHash ?? '') || approvedHash !== actualSchemaHash) {
    return 'Schema sync approval does not match the current Prisma schema SHA-256.';
  }
  return null;
}

export function verifySchemaRolloutApproval(schemaPath, env) {
  const approvalEnvironment = env ?? process.env
  let actualSchemaHash;
  try {
    actualSchemaHash = schemaSha256(schemaPath);
  } catch {
    return 'Prisma schema file is unavailable; schema sync is blocked.';
  }
  return schemaRolloutGateError(approvalEnvironment, actualSchemaHash);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const error = verifySchemaRolloutApproval();
  if (error) {
    console.error(error);
    process.exitCode = 1;
  } else {
    console.log('Schema rollout approval validated.');
  }
}
