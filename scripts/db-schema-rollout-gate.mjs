import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadArtifacts } from './sql-artifacts.mjs';

export function schemaSha256(schemaPath = resolve('prisma/schema.prisma')) {
  return createHash('sha256').update(readFileSync(schemaPath)).digest('hex');
}

export function databaseTargetFingerprint(databaseUrl, appEnv) {
  let url;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('Invalid database target');
  }
  const protocol = url.protocol.replace(/:$/, '').toLowerCase();
  if (!['postgres', 'postgresql'].includes(protocol) || !url.hostname || !url.pathname || !appEnv) {
    throw new Error('Invalid database target');
  }
  let database;
  let user;
  try {
    database = decodeURIComponent(url.pathname.replace(/^\//, ''));
    user = decodeURIComponent(url.username);
  } catch {
    throw new Error('Invalid database target');
  }
  if (!database || database.includes('/') || !user) throw new Error('Invalid database target');
  const identity = {
    appEnv,
    protocol,
    host: url.hostname.toLowerCase(),
    port: url.port || '5432',
    database,
    user,
  };
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}

export function releaseFingerprint(revision, sqlChecksum, schemaHash, contract, targetHash) {
  const migrations = Array.isArray(contract?.migrations)
    ? contract.migrations.map(({ version, script, checksum }) => ({ version, script, checksum }))
    : [];
  return createHash('sha256').update(JSON.stringify({
    revision,
    sqlChecksum,
    schemaHash,
    migrations,
    targetHash,
  })).digest('hex');
}

export function loadSqlContract(root = resolve('.')) {
  const loaded = loadArtifacts(root);
  const baseline = loaded.migrations[0];
  if (!baseline) throw new Error('SQL baseline is missing');
  const migrations = loaded.migrations.map(({ version, script, checksum }) => ({ version, script, checksum }));
  const migrationSetSha256 = createHash('sha256').update(JSON.stringify({ revision: loaded.revision, migrations })).digest('hex');
  return { revision: loaded.revision, sqlChecksum: baseline.checksum, version: baseline.version, migrations, migrationSetSha256 };
}

function backupReceiptError(env, now = Date.now()) {
  const receiptPath = env.DB_SCHEMA_BACKUP_RESTORE_RECEIPT_PATH;
  if (typeof receiptPath !== 'string' || !receiptPath.endsWith('.verified.json')) {
    return 'Schema sync is blocked until a fresh isolated-restore receipt is provided.';
  }
  try {
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    const archivePath = receiptPath.slice(0, -'.verified.json'.length);
    const manifest = JSON.parse(readFileSync(`${archivePath}.json`, 'utf8'));
    const archive = readFileSync(archivePath);
    const archiveHash = createHash('sha256').update(archive).digest('hex');
    const verifiedAt = Date.parse(receipt.verifiedAt);
    const fresh = Number.isFinite(verifiedAt) && verifiedAt <= now && now - verifiedAt <= 24 * 60 * 60 * 1000;
    if (receipt.version !== 1 || receipt.result !== 'isolated-restore-passed' || receipt.site !== env.APP_ENV
      || manifest.version !== 1 || manifest.site !== env.APP_ENV || manifest.sha256 !== archiveHash
      || manifest.bytes !== archive.length || receipt.sha256 !== archiveHash || !fresh) {
      return 'Schema sync is blocked because the isolated-restore receipt is stale or does not match this environment.';
    }
  } catch {
    return 'Schema sync is blocked because the isolated-restore receipt cannot be verified.';
  }
  return null;
}

export function schemaRolloutGateError(env, actualSchemaHash, contract) {
  const backupRestoreVerified = env.DB_SCHEMA_BACKUP_RESTORE_VERIFIED === 'true';
  const emptyDatabaseVerified = env.DB_SCHEMA_EMPTY_DATABASE_VERIFIED === 'true';
  if (backupRestoreVerified === emptyDatabaseVerified) {
    return 'Schema sync is blocked until exactly one target baseline is verified: backup/restore or an empty database.';
  }
  if (backupRestoreVerified) {
    const receiptError = backupReceiptError(env);
    if (receiptError) return receiptError;
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
  let actualTargetHash;
  try {
    actualTargetHash = databaseTargetFingerprint(env.DATABASE_URL, env.APP_ENV);
  } catch {
    return 'Schema sync approval requires a valid DATABASE_URL target.';
  }
  if (!/^[a-f0-9]{64}$/.test(env.DB_SCHEMA_SYNC_APPROVED_TARGET_SHA256 ?? '')
    || env.DB_SCHEMA_SYNC_APPROVED_TARGET_SHA256 !== actualTargetHash) {
    return 'Schema sync approval does not match the selected database target.';
  }
  const approvedHash = env.DB_SCHEMA_SYNC_APPROVED_SCHEMA_SHA256;
  if (!/^[a-f0-9]{64}$/.test(approvedHash ?? '') || approvedHash !== actualSchemaHash) {
    return 'Schema sync approval does not match the current Prisma schema SHA-256.';
  }
  if (!contract || !/^[0-9a-f]{64}$/.test(contract.sqlChecksum ?? '')
    || !/^[0-9a-f]{64}$/.test(contract.migrationSetSha256 ?? '')
    || !Array.isArray(contract.migrations) || !/^\d+\.\d+\.\d+$/.test(contract.revision ?? '')) {
    return 'Schema sync approval is missing the SQL revision contract.';
  }
  if (env.DB_SCHEMA_SYNC_APPROVED_REVISION !== contract.revision) {
    return 'Schema sync approval does not match the SQL revision.';
  }
  if (env.DB_SCHEMA_SYNC_APPROVED_SQL_SHA256 !== contract.sqlChecksum) {
    return 'Schema sync approval does not match the SQL checksum.';
  }
  if (env.DB_SCHEMA_SYNC_APPROVED_MIGRATIONS_SHA256 !== contract.migrationSetSha256) {
    return 'Schema sync approval does not match the ordered SQL migration set.';
  }
  const release = releaseFingerprint(contract.revision, contract.sqlChecksum, actualSchemaHash, contract, actualTargetHash);
  if (!/^[a-f0-9]{64}$/.test(env.DB_SCHEMA_SYNC_APPROVED_RELEASE_SHA256 ?? '') || env.DB_SCHEMA_SYNC_APPROVED_RELEASE_SHA256 !== release) {
    return 'Schema sync approval does not match the release fingerprint.';
  }
  return null;
}

export function verifySchemaRolloutApproval(schemaPath, env, artifactsRoot) {
  const approvalEnvironment = env ?? process.env
  let actualSchemaHash;
  try {
    actualSchemaHash = schemaSha256(schemaPath);
  } catch {
    return 'Prisma schema file is unavailable; schema sync is blocked.';
  }
  let contract;
  try {
    contract = loadSqlContract(artifactsRoot ?? resolve('.'));
  } catch {
    return 'SQL revision contract is unavailable; schema sync is blocked.';
  }
  return schemaRolloutGateError(approvalEnvironment, actualSchemaHash, contract);
}

export function seedRolloutGateError(env, fingerprint) {
  if (env.DB_SEED_APPROVED !== 'true') return 'Seed is blocked until the dataset is explicitly approved.';
  if (env.DB_SEED_APPROVED_ENV !== env.APP_ENV) return 'Seed approval does not match the selected APP_ENV.';
  if (!/^[a-f0-9]{64}$/.test(env.DB_SEED_APPROVED_FINGERPRINT ?? '') || env.DB_SEED_APPROVED_FINGERPRINT !== fingerprint) {
    return 'Seed approval does not match the dataset fingerprint.';
  }
  return null;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'fingerprint') {
    try {
      const contract = loadSqlContract();
      const targetHash = databaseTargetFingerprint(process.env.DATABASE_URL, process.env.APP_ENV);
      const schemaHash = schemaSha256();
      console.log(JSON.stringify({
        appEnv: process.env.APP_ENV,
        schemaSha256: schemaHash,
        sqlChecksum: contract.sqlChecksum,
        revision: contract.revision,
        migrationsSha256: contract.migrationSetSha256,
        targetSha256: targetHash,
        releaseSha256: releaseFingerprint(contract.revision, contract.sqlChecksum, schemaHash, contract, targetHash),
      }, null, 2));
      process.exitCode = 0;
    } catch {
      console.error('Unable to calculate the schema rollout fingerprint.');
      process.exitCode = 1;
    }
  } else {
  const error = verifySchemaRolloutApproval();
  if (error) {
    console.error(error);
    process.exitCode = 1;
  } else {
    console.log('Schema rollout approval validated.');
  }
  }
}
