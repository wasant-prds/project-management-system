import { createHash } from 'node:crypto';
import { closeSync, mkdirSync, openSync, readdirSync, readFileSync, readSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadArtifacts } from './sql-artifacts.mjs';

export const SCHEMA_APPROVAL_FILE = 'database/rollout/schema-approval.json';

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

function bangkokTimestamp(now = new Date()) {
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  return `${parts.replace(' ', 'T')}+07:00`;
}

function sqlContractError(contract) {
  if (!contract || !/^[0-9a-f]{64}$/.test(contract.sqlChecksum ?? '')
    || !Array.isArray(contract.migrations) || !/^\d+\.\d+\.\d+$/.test(contract.revision ?? '')) {
    return 'Schema sync approval is missing the SQL revision contract.';
  }
  const migrations = contract.migrations.map(({ version, script, checksum }) => ({ version, script, checksum }));
  const migrationSetSha256 = createHash('sha256').update(JSON.stringify({ revision: contract.revision, migrations })).digest('hex');
  if (contract.migrationSetSha256 !== migrationSetSha256) {
    return 'Schema sync approval does not match the ordered SQL migration set.';
  }
  return null;
}

function baselineDirectories(env) {
  if (typeof env.BACKUP_DIR === 'string' && env.BACKUP_DIR.length > 0) return [resolve(env.BACKUP_DIR)];
  return ['/run/pms-rollout-backups', resolve('database/backups/postgres_data')];
}

function hashFileSync(filePath) {
  const hash = createHash('sha256');
  const fd = openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(1024 * 1024);
    let read = 0;
    while ((read = readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, read));
  } finally {
    closeSync(fd);
  }
  return hash.digest('hex');
}

function inspectReceipt(receiptPath, env, now) {
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  } catch {
    return { status: 'unreadable' };
  }
  const verifiedAt = Date.parse(receipt.verifiedAt);
  const fresh = Number.isFinite(verifiedAt) && verifiedAt <= now && now - verifiedAt <= 24 * 60 * 60 * 1000;
  if (receipt.version !== 1 || receipt.result !== 'isolated-restore-passed' || receipt.site !== env.APP_ENV || !fresh
    || !/^[a-f0-9]{64}$/.test(receipt.sha256 ?? '')) {
    return { status: 'mismatch' };
  }
  const archivePath = receiptPath.slice(0, -'.verified.json'.length);
  try {
    const manifest = JSON.parse(readFileSync(`${archivePath}.json`, 'utf8'));
    const bytes = statSync(archivePath).size;
    const archiveHash = hashFileSync(archivePath);
    if (manifest.version !== 1 || manifest.site !== env.APP_ENV || manifest.sha256 !== archiveHash
      || manifest.bytes !== bytes || receipt.sha256 !== archiveHash) {
      return { status: 'mismatch' };
    }
  } catch {
    return { status: 'unreadable' };
  }
  return { status: 'ok', verifiedAt, receiptPath };
}

export function resolveAutoBaseline(env, now = Date.now()) {
  let newest = null;
  let sawMismatch = false;
  let sawUnreadable = false;
  for (const directory of baselineDirectories(env)) {
    let names;
    try {
      names = readdirSync(directory);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith('.verified.json')) continue;
      const inspected = inspectReceipt(join(directory, name), env, now);
      if (inspected.status === 'mismatch') sawMismatch = true;
      else if (inspected.status === 'unreadable') sawUnreadable = true;
      else if (!newest || inspected.verifiedAt > newest.verifiedAt) newest = inspected;
    }
  }
  if (newest) return { baseline: 'backup-restore', receiptPath: newest.receiptPath, receiptStatus: 'ok' };
  if (sawMismatch) return { baseline: 'unverified', receiptPath: null, receiptStatus: 'mismatch' };
  if (sawUnreadable) return { baseline: 'unverified', receiptPath: null, receiptStatus: 'unreadable' };
  return { baseline: 'unverified', receiptPath: null, receiptStatus: 'missing' };
}

export function upgradeReceiptError(baseline) {
  if (baseline?.baseline === 'backup-restore') return null;
  if (baseline?.receiptStatus === 'unreadable') {
    return 'Schema sync is blocked because the isolated-restore receipt cannot be verified.';
  }
  if (baseline?.receiptStatus === 'mismatch') {
    return 'Schema sync is blocked because the isolated-restore receipt is stale or does not match this environment.';
  }
  return 'Schema sync is blocked until a fresh isolated-restore receipt is provided.';
}

export function pendingUpgradeReceiptError(env, now = Date.now()) {
  return upgradeReceiptError(resolveAutoBaseline(env, now));
}

export function schemaArtifactError(env, actualSchemaHash, contract) {
  if (!['local', 'dev', 'uat', 'prod'].includes(env.APP_ENV)) {
    return 'Schema sync approval must target APP_ENV local, dev, uat, or prod.';
  }
  try {
    databaseTargetFingerprint(env.DATABASE_URL, env.APP_ENV);
  } catch {
    return 'Schema sync approval requires a valid DATABASE_URL target.';
  }
  if (!/^[0-9a-f]{64}$/.test(actualSchemaHash ?? '')) {
    return 'Prisma schema file is unavailable; schema sync is blocked.';
  }
  return sqlContractError(contract);
}

export function schemaRolloutGateError(env, actualSchemaHash, contract) {
  if (env.DB_SCHEMA_SYNC_APPROVED !== 'true') {
    return 'Schema sync is blocked until the target schema rollout is explicitly approved.';
  }
  return schemaArtifactError(env, actualSchemaHash, contract);
}

export function buildSchemaApproval(env, schemaHash, contract, baseline = resolveAutoBaseline(env), recordedAt = bangkokTimestamp()) {
  const targetSha256 = databaseTargetFingerprint(env.DATABASE_URL, env.APP_ENV);
  return {
    version: 1,
    appEnv: env.APP_ENV,
    baseline: baseline.baseline,
    receiptPath: baseline.receiptPath,
    schemaSha256: schemaHash,
    sqlChecksum: contract.sqlChecksum,
    revision: contract.revision,
    migrationsSha256: contract.migrationSetSha256,
    targetSha256,
    releaseSha256: releaseFingerprint(contract.revision, contract.sqlChecksum, schemaHash, contract, targetSha256),
    schemaSyncApproved: env.DB_SCHEMA_SYNC_APPROVED === 'true',
    recordedAt,
  };
}

export function schemaApprovalPath(root = resolve('.')) {
  return resolve(root, SCHEMA_APPROVAL_FILE);
}

export function writeSchemaApproval(record, filePath = schemaApprovalPath()) {
  mkdirSync(dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
  try {
    renameSync(temporary, filePath);
  } catch (error) {
    if (error.code !== 'EEXIST' && error.code !== 'EPERM' && error.code !== 'EACCES') throw error;
    try {
      unlinkSync(filePath);
      renameSync(temporary, filePath);
    } catch (replaceError) {
      try { unlinkSync(temporary); } catch { /* The temporary file is removed when replacement fails. */ }
      throw replaceError;
    }
  }
  return filePath;
}

export function recordSchemaApproval(record, filePath = schemaApprovalPath()) {
  try {
    writeSchemaApproval(record, filePath);
    return true;
  } catch {
    console.error('Schema approval record was not written; schema sync will continue.');
    return false;
  }
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

export function seedRolloutGateError(env) {
  if (env.RUN_SEED !== 'true') return 'Seed is blocked until RUN_SEED=true.';
  return null;
}

function recordCurrentApproval(requireFlag) {
  const contract = loadSqlContract();
  const schemaHash = schemaSha256();
  const error = requireFlag
    ? schemaRolloutGateError(process.env, schemaHash, contract)
    : schemaArtifactError(process.env, schemaHash, contract);
  if (error) return error;
  return buildSchemaApproval(process.env, schemaHash, contract);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const command = process.argv[2];
  if (command === 'fingerprint' || command === 'approve') {
    try {
      const record = recordCurrentApproval(false);
      if (typeof record === 'string') {
        console.error(record);
        process.exitCode = 1;
      } else {
        writeSchemaApproval(record);
        console.log(JSON.stringify(record, null, 2));
        process.exitCode = 0;
      }
    } catch {
      console.error('Unable to calculate or record the schema rollout fingerprint.');
      process.exitCode = 1;
    }
  } else {
    try {
      const record = recordCurrentApproval(true);
      if (typeof record === 'string') {
        console.error(record);
        process.exitCode = 1;
      } else {
        recordSchemaApproval(record);
        console.log('Schema rollout approval validated.');
      }
    } catch {
      console.error('Unable to calculate the schema rollout fingerprint.');
      process.exitCode = 1;
    }
  }
}
