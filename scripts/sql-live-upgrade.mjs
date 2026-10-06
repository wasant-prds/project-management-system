import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { BUSINESS_TABLES, MUTABLE_TIMESTAMP_TABLES, loadArtifacts } from './sql-artifacts.mjs';
import { parseDecimalId, parsePublicId, serializeDecimalId } from './sql-id.mjs';
import { compareOrdinal, validateLegacyMapping } from './sql-legacy-id.mjs';
import { transformSourceRows, formatTableInsertSql, formatSqlLiteral, TABLE_COLUMNS, toIsoTimestamp } from './sql-seed-convert.mjs';
import { assertLabel, assertTargetAllowed, createQuery, HISTORY_EXISTS_SQL, readMigrationState } from './sql-migrate.mjs';
import { databaseTargetFingerprint } from './db-schema-rollout-gate.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const LEGACY_TABLES = new Set(['User', 'Company', 'Project', 'ProjectMember', 'WorkItem', 'TimeEntry', 'Milestone', 'Document', 'ActivityLog', 'Comment', 'Notification', 'GitLabProjectMapping', 'ExternalWorkItemReference']);
const PRESERVE_WITHOUT_TARGET = ['Comment', 'Notification', '_prisma_migrations', 'schema_migrations'];
const SOURCE_TABLES = Object.freeze([
  'User', 'Company', 'Project', 'ProjectMember', 'work_items', 'TimeEntry', 'Milestone', 'Document',
  'ActivityLog', 'Comment', 'Notification', 'GitLabProjectMapping', 'ExternalWorkItemReference',
  '_prisma_migrations', 'schema_migrations',
]);
const INTERNAL_SOURCE_TABLES = new Set(['_prisma_migrations']);
const LIVE_SOURCE_ENTITIES = Object.freeze([
  { sourceTable: 'User', entityName: 'users', createdAt: 'createdAt' },
  { sourceTable: 'Company', entityName: 'companies', createdAt: 'createdAt' },
  { sourceTable: 'Project', entityName: 'projects', createdAt: 'createdAt' },
  { sourceTable: 'ProjectMember', entityName: 'project_members', createdAt: 'joinedAt' },
  { sourceTable: 'work_items', entityName: 'work_items', createdAt: 'createdAt' },
  { sourceTable: 'GitLabProjectMapping', entityName: 'external_project_mappings', createdAt: 'createdAt' },
  { sourceTable: 'ExternalWorkItemReference', entityName: 'external_work_item_references', createdAt: 'createdAt', fallbackCreatedAt: 'remoteCreatedAt' },
  { sourceTable: 'Milestone', entityName: 'project_milestones', createdAt: 'createdAt' },
  { sourceTable: 'Document', entityName: 'project_documents', createdAt: 'createdAt' },
  { sourceTable: 'TimeEntry', entityName: 'work_logs', createdAt: 'createdAt' },
  { sourceTable: 'ActivityLog', entityName: 'activity_logs', createdAt: 'createdAt' },
]);
const SOURCE_ENTITY_ALIASES = Object.freeze({
  User: 'users', Company: 'companies', Project: 'projects', ProjectMember: 'project_members', work_items: 'work_items',
  GitLabProjectMapping: 'external_project_mappings', ExternalWorkItemReference: 'external_work_item_references',
  Milestone: 'project_milestones', Document: 'project_documents', TimeEntry: 'work_logs', ActivityLog: 'activity_logs',
});

export function classifySourceSchema(tableNames) {
  const names = new Set(tableNames);
  const legacy = [...names].some((name) => LEGACY_TABLES.has(name) && name !== 'WorkItem');
  const hasLegacyUser = names.has('User');
  const hasTargetUsers = names.has('users');
  const hasHistory = names.has('schema_migrations');
  if (hasTargetUsers && hasHistory && !hasLegacyUser) return { kind: 'sql-target', preserve: [] };
  if (hasLegacyUser) {
    return {
      kind: 'legacy',
      newer: names.has('GitLabProjectMapping') || names.has('ExternalWorkItemReference'),
      preserve: PRESERVE_WITHOUT_TARGET.filter((name) => names.has(name)),
    };
  }
  if (legacy) return { kind: 'unknown', reason: 'User table is missing from the legacy inventory' };
  return { kind: 'unknown', reason: 'Unrecognized table set' };
}

export function planConversion(rows, existingRecords, options = {}) {
  const settings = typeof options === 'function' ? { createPublicId: options } : options;
  const sourceChecksum = settings.sourceChecksum ?? rows[0]?.sourceChecksum;
  const targetRevision = settings.targetRevision ?? rows[0]?.targetRevision;
  const createPublicId = settings.createPublicId ?? randomUUID;
  if (!/^[0-9a-f]{64}$/.test(sourceChecksum ?? '') || !/^[A-Za-z0-9._-]{1,64}$/.test(targetRevision ?? '')) {
    throw new Error('Live conversion requires a source checksum and target revision');
  }
  const mappings = existingRecords.map((record) => validateLegacyMapping(record));
  const liveRecords = mappings.filter((record) => record.sourceScope === 'live');
  const nextIds = new Map();
  for (const record of liveRecords) {
    const current = nextIds.get(record.entityName) ?? 0n;
    const id = parseDecimalId(record.newId);
    if (id > current) nextIds.set(record.entityName, id);
  }
  const input = rows.map((row) => ({
    ...row,
    entityName: row.entityName ?? row.entity,
  })).sort((left, right) => compareOrdinal(left.entityName, right.entityName) || compareOrdinal(left.oldId, right.oldId));
  const planned = [];
  const seen = new Set();
  for (const row of input) {
    const key = `${row.entityName}\0${row.oldId}`;
    if (seen.has(key)) throw new Error('Duplicate source identity');
    seen.add(key);
    if (typeof row.createdAt !== 'string') throw new Error(`Missing source creation timestamp for ${row.entityName}`);
    const matches = liveRecords.filter((record) => record.entityName === row.entityName && record.oldId === row.oldId);
    if (matches.length > 1) throw new Error('Ambiguous live identity mapping');
    const seedCollision = mappings.some((record) => record.sourceScope === 'seed' && record.entityName === row.entityName && record.oldId === row.oldId);
    if (seedCollision) throw new Error('Seed mapping cannot authorize a live identity');
    if (matches.length === 1) {
      if (matches[0].createdAt !== row.createdAt) throw new Error(`Live identity timestamp changed for ${row.entityName}`);
      planned.push(matches[0]);
      continue;
    }
    const nextId = (nextIds.get(row.entityName) ?? 0n) + 1n;
    nextIds.set(row.entityName, nextId);
    const publicId = parsePublicId(createPublicId());
    if (!publicId) throw new Error('Live mapping generator returned an invalid UUIDv4');
    planned.push(validateLegacyMapping({
      entityName: row.entityName,
      sourceScope: 'live',
      sourceChecksum,
      targetRevision,
      oldId: row.oldId,
      createdAt: row.createdAt,
      newId: serializeDecimalId(nextId),
      newPublicId: publicId,
    }));
  }
  return planned;
}

export async function readLiveMappings(mappingPath) {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(mappingPath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw new Error('Live identity mapping file is unreadable or invalid');
  }
  if (!Array.isArray(parsed)) throw new Error('Live identity mapping file must contain an array');
  return parsed.map((record) => validateLegacyMapping(record));
}

export async function writeLiveMappings(mappingPath, records) {
  if (typeof mappingPath !== 'string' || mappingPath.length === 0) throw new Error('An explicit durable live mapping path is required');
  const valid = records.map((record) => validateLegacyMapping(record));
  const keys = new Set();
  const ids = new Map();
  const publicIds = new Set();
  for (const record of valid) {
    const key = `${record.entityName}\0${record.sourceScope}\0${record.oldId}`;
    if (keys.has(key)) throw new Error('Duplicate live identity mapping');
    keys.add(key);
    if (record.sourceScope !== 'live') throw new Error('Live mapping output cannot contain seed identities');
    const entityIds = ids.get(record.entityName) ?? new Set();
    if (entityIds.has(record.newId)) throw new Error('Duplicate numeric identity mapping');
    entityIds.add(record.newId);
    ids.set(record.entityName, entityIds);
    if (publicIds.has(record.newPublicId)) throw new Error('Duplicate public identity mapping');
    publicIds.add(record.newPublicId);
  }
  await mkdir(dirname(mappingPath), { recursive: true });
  const temporary = `${mappingPath}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(valid, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    await rename(temporary, mappingPath);
  } catch (error) {
    try { await (await import('node:fs/promises')).unlink(temporary); } catch {}
    throw error;
  }
  return valid;
}

export function preservationPlan(tableNames) {
  const present = PRESERVE_WITHOUT_TARGET.filter((name) => tableNames.includes(name));
  return {
    archiveBeforeUpgrade: present,
    reason: present.length === 0 ? 'No Comment or Notification rows require an archive' : 'Comment and Notification have no SQL target and must be archived before upgrade',
  };
}

export function verifyEquivalence(source, target) {
  const failures = [];
  const sourceRows = Array.isArray(source?.rows) ? source.rows : [];
  const targetRows = Array.isArray(target?.rows) ? target.rows : [];
  if (!Array.isArray(source?.rows) || !Array.isArray(target?.rows)) failures.push('row inventory');
  const sourceById = new Map();
  for (const row of sourceRows) {
    if (!row || typeof row.oldId !== 'string' || row.oldId.length === 0) {
      failures.push('invalid source identity');
      continue;
    }
    if (sourceById.has(row.oldId)) failures.push(`duplicate source identity ${row.oldId}`);
    else sourceById.set(row.oldId, row);
  }
  const seen = new Set();
  for (const row of targetRows) {
    if (!row || typeof row.oldId !== 'string' || row.oldId.length === 0) {
      failures.push('invalid target identity');
      continue;
    }
    if (!sourceById.has(row.oldId)) {
      failures.push(`unexpected target row ${row.oldId}`);
      continue;
    }
    if (seen.has(row.oldId)) {
      failures.push(`duplicate target identity ${row.oldId}`);
      continue;
    }
    seen.add(row.oldId);
    if (stableJson(logicalRow(sourceById.get(row.oldId))) !== stableJson(logicalRow(row))) {
      failures.push(`row data ${row.oldId}`);
    }
  }
  for (const oldId of sourceById.keys()) if (!seen.has(oldId)) failures.push(`missing target row ${oldId}`);
  if (sourceById.size !== sourceRows.length || sourceRows.length !== targetRows.length) failures.push('row coverage');
  if (source.hours !== target.hours) failures.push('hours');
  if (source.completed !== target.completed || source.cancelled !== target.cancelled || source.total !== target.total) failures.push('metrics');
  if (source.earliest !== target.earliest || source.latest !== target.latest) failures.push('timestamps');
  return { equal: failures.length === 0, failures: [...new Set(failures)] };
}

const STORAGE_ID_FIELDS = new Set(['id', 'internalId', 'newId', 'newPublicId', 'publicId', 'public_id', 'oldId', 'sourceIdentity']);

function logicalRow(row) {
  const value = row?.logical && typeof row.logical === 'object' ? row.logical : row;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !STORAGE_ID_FIELDS.has(key)));
}

function stableJson(value) {
  if (typeof value === 'bigint') return JSON.stringify(value.toString());
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function selectRestoreTool(receipt) {
  if (receipt?.format === 'plain-sql-gzip' && receipt.integrity === 'verified') return { tool: 'psql', command: 'gzip -dc archive.sql.gz | psql' };
  const verifiedCustom = receipt?.format === 'custom-dump' && receipt.integrity === 'verified';
  const verifiedRolloutArchive = receipt?.version === 1 && receipt.result === 'isolated-restore-passed'
    && /^[a-f0-9]{64}$/.test(receipt.sha256 ?? '') && typeof receipt.site === 'string';
  if (verifiedCustom || verifiedRolloutArchive) return { tool: 'pg_restore', command: 'pg_restore --dbname target archive.dump' };
  throw new Error('Backup receipt is not a verified plain SQL gzip or custom dump');
}

export function rollbackPlan(phase) {
  if (phase === 'before-writes') {
    return { action: 'retain-original-database', reconcile: false, dataLoss: 'none while the original database remains the writer' };
  }
  if (phase === 'after-writes') {
    return { action: 'reconcile-post-cutover-writes', reconcile: true, dataLoss: 'restoring the pre-cutover backup drops writes made after cutover unless they are exported first' };
  }
  throw new Error('Unknown rollback phase');
}

export function sequenceAlignmentStatements(tables = BUSINESS_TABLES) {
  return tables.map((table) => {
    if (!/^[a-z_]+$/.test(table)) throw new Error('Unsafe identity table');
    return `SELECT public.pms_align_identity('public."${table}"')`;
  });
}

export function writeFreezeChecklist() {
  return [
    'stop application writers',
    'export the delta after the verified baseline',
    'reconcile counts, hours, and public identities',
    'align identity sequences',
    'open the replacement database to the compatible application',
  ];
}

export function recoveryDecision(failure) {
  if (failure === 'migration-halfway' || failure === 'checksum-mismatch' || failure === 'wrong-target' || failure === 'health-failed' || failure === 'owner-mismatch') {
    return { retainOriginal: true, openTarget: false, reason: 'Original database stays the source of truth until a reviewed recovery completes' };
  }
  throw new Error('Unknown recovery failure');
}

function assertFreshSourceBackup(archivePath, site, now = Date.now()) {
  if (typeof archivePath !== 'string' || !archivePath.endsWith('.dump')) throw new Error('Source must be a reviewed PostgreSQL custom archive');
  const archive = readFile(archivePath);
  return archive.then(async (data) => {
    const manifest = JSON.parse(await readFile(`${archivePath}.json`, 'utf8'));
    const receipt = JSON.parse(await readFile(`${archivePath}.verified.json`, 'utf8'));
    const checksum = createHash('sha256').update(data).digest('hex');
    const verifiedAt = Date.parse(receipt.verifiedAt);
    const fresh = Number.isFinite(verifiedAt) && verifiedAt <= now && now - verifiedAt <= 24 * 60 * 60 * 1000;
    if (manifest.version !== 1 || manifest.site !== site || manifest.sha256 !== checksum || manifest.bytes !== data.length
      || !manifest.inventory || receipt.version !== 1 || receipt.site !== site || receipt.sha256 !== checksum
      || receipt.result !== 'isolated-restore-passed' || !fresh) {
      throw new Error('Source archive lacks a fresh verified isolated-restore receipt for this environment');
    }
    selectRestoreTool(receipt);
    return { checksum, manifest, receipt };
  }).catch((error) => {
    if (error instanceof Error && /Source archive lacks|reviewed PostgreSQL/.test(error.message)) throw error;
    throw new Error('Source backup archive or verification receipt is unreadable');
  });
}

function dockerCall(args, operation, spawn = spawnSync) {
  let result;
  try {
    result = spawn('docker', args, {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      timeout: 180000,
      windowsHide: true,
    });
  } catch {
    throw new Error(`${operation} failed`);
  }
  if (result.error || result.status !== 0) throw new Error(`${operation} failed`);
  return (result.stdout ?? '').trim();
}

function sourceRowsSql(table, whereSql = '') {
  if (!SOURCE_TABLES.includes(table) && !BUSINESS_TABLES.includes(table)) throw new Error('Unsupported source table');
  if (whereSql && !/^[\w\s.,:"'=<>!()\[\]\-:+]+$/.test(whereSql)) throw new Error('Unsafe snapshot filter');
  return `SELECT COALESCE(json_agg(row_value)::text, '[]') FROM (
  SELECT (SELECT jsonb_object_agg(key, CASE
    WHEN key IN ('metadata', 'approvedLabelMap', 'approved_label_map') AND jsonb_typeof(value) IN ('object', 'array') THEN to_jsonb(value::text)
    WHEN jsonb_typeof(value) = 'number' THEN to_jsonb(value #>> '{}')
    ELSE value END)
    FROM jsonb_each(to_jsonb(source_row)) AS fields(key, value)) AS row_value
  FROM public."${table}" AS source_row
  ${whereSql ? `WHERE ${whereSql}` : ''}
) AS converted_rows`;
}

export async function restoreSourceArchive(archivePath, { site, spawn = spawnSync, now = Date.now(), image = process.env.PMS_LIVE_UPGRADE_POSTGRES_IMAGE ?? 'postgres:16-alpine' } = {}) {
  const verified = await assertFreshSourceBackup(archivePath, site, now);
  const container = `pms-live-source-${randomUUID()}`;
  let started = false;
  try {
    dockerCall(['run', '--rm', '-d', '--name', container, '--network', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
      '-e', 'POSTGRES_USER=postgres', '-e', 'POSTGRES_DB=postgres', image, '-c', 'timezone=Asia/Bangkok'], 'Isolated PostgreSQL source restore', spawn);
    started = true;
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      try {
        dockerCall(['exec', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-c', 'SELECT 1'], 'Source database readiness check', spawn);
        ready = true;
        break;
      } catch {
        await new Promise((done) => setTimeout(done, 250));
      }
    }
    if (!ready) throw new Error('Isolated PostgreSQL source restore failed');
    dockerCall(['cp', archivePath, `${container}:/tmp/source.dump`], 'Source archive copy', spawn);
    dockerCall(['exec', container, 'pg_restore', '--exit-on-error', '--single-transaction', '--no-owner', '--no-privileges', '--username', 'postgres', '--dbname', 'postgres', '/tmp/source.dump'], 'Isolated PostgreSQL source restore', spawn);
    const listed = dockerCall(['exec', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', 'postgres', '-c',
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename"], 'Source inventory read', spawn);
    const tableNames = listed ? listed.split('\n') : [];
    const unsupported = tableNames.filter((name) => !SOURCE_TABLES.includes(name) && !INTERNAL_SOURCE_TABLES.has(name));
    if (unsupported.length > 0) throw new Error(`Unsupported source tables require a reviewed preservation rule: ${unsupported.join(', ')}`);
    const classification = classifySourceSchema(tableNames);
    if (classification.kind !== 'legacy') throw new Error('Source archive is not a supported legacy schema');
    const tables = {};
    for (const table of SOURCE_TABLES) {
      if (!tableNames.includes(table)) continue;
      const raw = dockerCall(['exec', container, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres', '-c', sourceRowsSql(table)], 'Source row export', spawn);
      try {
        tables[table] = JSON.parse(raw);
      } catch {
        throw new Error('Source row export could not be decoded');
      }
    }
    return { tables, tableNames, classification, sourceChecksum: verified.checksum, sourceSite: site };
  } finally {
    if (started) {
      try { dockerCall(['rm', '-f', container], 'Isolated source cleanup', spawn); } catch {}
    }
  }
}

function sourceIdentityRows(tables) {
  const rows = [];
  for (const spec of LIVE_SOURCE_ENTITIES) {
    for (const row of tables[spec.sourceTable] ?? []) {
      if (typeof row.id !== 'string' || row.id.length === 0) throw new Error(`Invalid source identity in ${spec.sourceTable}`);
      const timestamp = row[spec.createdAt] ?? (spec.fallbackCreatedAt ? row[spec.fallbackCreatedAt] : undefined);
      rows.push({ entityName: spec.entityName, oldId: row.id, createdAt: toIsoTimestamp(timestamp, `${spec.sourceTable}.createdAt`) });
    }
  }
  return rows;
}

function combineMappings(existing, planned) {
  const merged = new Map();
  for (const record of existing) {
    if (record.sourceScope !== 'live') throw new Error('Live upgrade mapping cannot reuse seed identities');
    merged.set(`${record.entityName}\0${record.oldId}`, record);
  }
  for (const record of planned) merged.set(`${record.entityName}\0${record.oldId}`, record);
  return [...merged.values()].sort((left, right) => compareOrdinal(left.entityName, right.entityName)
    || compareOrdinal(left.createdAt, right.createdAt) || compareOrdinal(left.oldId, right.oldId));
}

function makeLegacyMapper(records) {
  const lookup = new Map(records.map((record) => [`${record.entityName}\0${record.oldId}`, record]));
  const entityFor = (sourceEntity) => SOURCE_ENTITY_ALIASES[sourceEntity] ?? sourceEntity;
  return {
    getNumericId(sourceEntity, oldId) {
      return lookup.get(`${entityFor(sourceEntity)}\0${oldId}`)?.newId ?? null;
    },
    getPublicId(sourceEntity, oldId) {
      return lookup.get(`${entityFor(sourceEntity)}\0${oldId}`)?.newPublicId ?? null;
    },
  };
}

function resolveOwnerPublicId(ownerSelector, mappings) {
  if (typeof ownerSelector !== 'string' || ownerSelector.length === 0) throw new Error('OWNER_USER_ID must resolve through the live identity mapping');
  const users = mappings.filter((record) => record.entityName === 'users');
  let publicId = null;
  try { publicId = parsePublicId(ownerSelector); } catch {}
  if (publicId) {
    if (!users.some((record) => record.newPublicId === publicId)) throw new Error('Configured owner is not present in the converted users');
    return publicId;
  }
  if (/^[1-9][0-9]*$/.test(ownerSelector)) throw new Error('Numeric OWNER_USER_ID is rejected');
  const matches = users.filter((record) => record.oldId === ownerSelector);
  if (matches.length !== 1) throw new Error('Configured owner does not resolve to exactly one converted user');
  return matches[0].newPublicId;
}

function assertLiveUpgradeApproval(env, target, sourceChecksum) {
  if (!['local', 'dev', 'uat', 'prod'].includes(env.APP_ENV)) throw new Error('Live upgrade requires a selected APP_ENV');
  if (env.PMS_LIVE_UPGRADE_APPROVED !== 'true') throw new Error('Live upgrade is blocked until explicitly approved');
  if (env.PMS_LIVE_UPGRADE_SOURCE_FROZEN !== 'true' || env.PMS_LIVE_UPGRADE_DELTA_RECONCILED !== 'true') {
    throw new Error('Live upgrade requires a write freeze and reconciled final snapshot');
  }
  if (env.PMS_LIVE_UPGRADE_OWNER_MAPPING_VERIFIED !== 'true') throw new Error('Live upgrade requires an owner mapping review');
  let targetHash;
  try {
    targetHash = databaseTargetFingerprint(target, env.APP_ENV);
  } catch {
    throw new Error('Live upgrade target is invalid');
  }
  if (!/^[a-f0-9]{64}$/.test(sourceChecksum ?? '')) throw new Error('Live upgrade source archive checksum is invalid');
  return targetHash;
}

export function buildLiveLoadScript(transformed, targetLabel) {
  assertLabel(targetLabel);
  const quotedTables = BUSINESS_TABLES.map((table) => `public."${table}"`).join(', ');
  const statements = [
    'BEGIN',
    "SET LOCAL lock_timeout = '5000ms'",
    "SET LOCAL statement_timeout = '120000ms'",
    "SET LOCAL TIME ZONE 'Asia/Bangkok'",
    "SET LOCAL pms.preserve_source_timestamps = 'on'",
    "SELECT pg_advisory_xact_lock(hashtext('pms-live-upgrade'))",
    `LOCK TABLE ${quotedTables} IN ACCESS EXCLUSIVE MODE`,
    `DO $pms_live_guard$ BEGIN IF ${BUSINESS_TABLES.map((table) => `(SELECT count(*) FROM public."${table}") > 0`).join(' OR ')} THEN RAISE EXCEPTION 'replacement target is not empty'; END IF; END $pms_live_guard$`,
  ];
  for (const table of BUSINESS_TABLES) {
    const rendered = formatTableInsertSql(table, transformed[table] ?? []).trim();
    if (rendered) statements.push(rendered.replace(/;+\s*$/u, ''));
  }
  for (const table of BUSINESS_TABLES) {
    const columns = TABLE_COLUMNS[table];
    const expectedRows = transformed[table] ?? [];
    statements.push(`DO $pms_live_count$ BEGIN IF (SELECT count(*) FROM public."${table}") <> ${expectedRows.length} THEN RAISE EXCEPTION 'post-conversion row count mismatch'; END IF; END $pms_live_count$`);
    for (let offset = 0; offset < expectedRows.length; offset += 100) {
      const batch = expectedRows.slice(offset, offset + 100);
      const values = batch.map((row) => `(${columns.map(([name, type]) => typedExpectedLiteral(row[name], type)).join(', ')})`).join(',\n');
      const names = columns.map(([name]) => `"${name}"`).join(', ');
      for (const [column] of columns) {
        const check = `WITH expected (${names}) AS (VALUES ${values})
SELECT 1 FROM expected FULL OUTER JOIN public."${table}" AS actual USING ("id")
WHERE expected."id" IS NULL OR actual."id" IS NULL OR expected."${column}" IS DISTINCT FROM actual."${column}"`;
        statements.push(`DO $pms_live_rows$ BEGIN IF EXISTS (${check}) THEN RAISE EXCEPTION 'post-conversion row data mismatch in ${table}.${column}'; END IF; END $pms_live_rows$`);
      }
    }
  }
  statements.push(...sequenceAlignmentStatements());
  statements.push('COMMIT');
  return `${statements.join(';\n')};\n`;
}

function typedExpectedLiteral(value, type) {
  if (value == null) {
    const cast = type.startsWith('enum:') ? type.slice('enum:'.length) : ({
      bigint: 'BIGINT', integer: 'INTEGER', decimal: 'NUMERIC', uuid: 'UUID', text: 'TEXT', boolean: 'BOOLEAN',
      'text[]': 'TEXT[]', jsonb: 'JSONB', date: 'DATE', timestamp: 'TIMESTAMP(3) WITHOUT TIME ZONE',
    }[type]);
    return cast ? `NULL::${cast}` : formatSqlLiteral(value, type);
  }
  const literal = formatSqlLiteral(value, type);
  if (type === 'bigint') return `${literal}::BIGINT`;
  if (type === 'integer') return `${literal}::INTEGER`;
  if (type === 'decimal') return `${literal}::NUMERIC`;
  if (type === 'uuid') return `${literal}::UUID`;
  if (type === 'text') return `${literal}::TEXT`;
  if (type === 'boolean') return `${literal}::BOOLEAN`;
  return literal;
}

function assertReplacementTargetReady(query, root) {
  const artifacts = loadArtifacts(root);
  if (query(HISTORY_EXISTS_SQL) !== 't') throw new Error('Replacement target must already have the reviewed SQL schema');
  const state = readMigrationState(artifacts, query);
  if (state.pending.length > 0) throw new Error('Replacement target SQL migrations are incomplete');
  const latestRevision = query('SELECT "schema_revision" FROM "schema_migrations" ORDER BY "version" DESC LIMIT 1');
  if (latestRevision !== artifacts.revision) throw new Error('Replacement target schema revision does not match the reviewed SQL contract');
  for (const table of BUSINESS_TABLES) {
    if (query(`SELECT count(*) FROM public."${table}"`) !== '0') throw new Error('Replacement target contains application data');
  }
  return artifacts;
}

export function planLiveSnapshot({
  tables,
  sourceChecksum,
  targetRevision,
  existingMappings = [],
  ownerSelector,
  projectCompanyMap = {},
  defaultProjectCompany,
  createPublicId,
}) {
  const tableNames = Object.keys(tables);
  const classification = classifySourceSchema(tableNames);
  if (classification.kind !== 'legacy') throw new Error('Source snapshot is not a supported legacy schema');
  for (const name of tableNames) {
    if (!SOURCE_TABLES.includes(name) && !INTERNAL_SOURCE_TABLES.has(name)) {
      throw new Error(`Unsupported source table requires a reviewed preservation rule: ${name}`);
    }
  }
  for (const required of ['User', 'Company', 'Project', 'work_items', 'TimeEntry']) {
    if (!Array.isArray(tables[required])) throw new Error(`Source inventory is missing ${required}`);
  }
  const planned = planConversion(sourceIdentityRows(tables), existingMappings, {
    sourceChecksum,
    targetRevision,
    ...(createPublicId ? { createPublicId } : {}),
  });
  const allMappings = combineMappings(existingMappings, planned);
  const ownerPublicId = resolveOwnerPublicId(ownerSelector, allMappings);
  const converted = transformSourceRows({
    tables,
    legacyMapper: makeLegacyMapper(planned),
    live: true,
    companyPolicy: { projectCompanyMap, defaultProjectCompany, userDefaults: { theme: 'light', locale: 'th', status: 'Active', role: 'member' } },
  });
  const rowsToPreserve = Object.fromEntries(PRESERVE_WITHOUT_TARGET
    .filter((table) => (tables[table] ?? []).length > 0)
    .map((table) => [table, tables[table]]));
  return { classification, plannedMappings: planned, mappings: allMappings, ownerPublicId, converted, rowsToPreserve };
}

export async function applyLiveSnapshot({
  tables,
  sourceChecksum,
  target,
  targetLabel,
  mappingPath,
  preservePath,
  ownerSelector,
  projectCompanyMap = {},
  defaultProjectCompany,
  env,
  query,
  root = repoRoot,
  createPublicId,
}) {
  assertLiveUpgradeApproval(env, target, sourceChecksum);
  assertTargetAllowed(target, env);
  assertLabel(targetLabel);
  if (typeof query !== 'function') throw new Error('A guarded PostgreSQL target connection is required');
  if (typeof mappingPath !== 'string' || mappingPath.length === 0) throw new Error('An explicit durable live mapping path is required');
  if (targetLabel !== env.APP_ENV) throw new Error('Replacement target label must match APP_ENV');
  const artifacts = assertReplacementTargetReady(query, root);
  const existing = await readLiveMappings(mappingPath);
  const plan = planLiveSnapshot({
    tables,
    sourceChecksum,
    targetRevision: artifacts.revision,
    existingMappings: existing,
    ownerSelector,
    projectCompanyMap,
    defaultProjectCompany,
    createPublicId,
  });
  const { allMappings, ownerPublicId, converted, rowsToPreserve, classification } = {
    allMappings: plan.mappings, ownerPublicId: plan.ownerPublicId, converted: plan.converted,
    rowsToPreserve: plan.rowsToPreserve, classification: plan.classification,
  };
  if (Object.keys(rowsToPreserve).length > 0 && !preservePath) {
    throw new Error('Comment and Notification rows require an explicit preservation archive before conversion');
  }
  if (preservePath && Object.keys(rowsToPreserve).length > 0) await writePreservationArchive(preservePath, sourceChecksum, rowsToPreserve);
  await writeLiveMappings(mappingPath, allMappings);
  query(buildLiveLoadScript(converted.transformed, targetLabel));
  const tableCounts = {};
  for (const table of BUSINESS_TABLES) {
    const actual = query(`SELECT count(*) FROM public."${table}"`);
    const expected = (converted.transformed[table] ?? []).length;
    if (actual !== String(expected)) throw new Error(`Post-conversion validation failed for ${table}`);
    tableCounts[table] = expected;
  }
  return {
    sourceKind: classification.newer ? 'newer-legacy' : 'legacy',
    targetRevision: artifacts.revision,
    targetLabel,
    tableCounts,
    mappingCount: allMappings.length,
    preservedRows: Object.fromEntries(Object.entries(rowsToPreserve).map(([table, rows]) => [table, rows.length])),
    ownerMappingVerified: Boolean(ownerPublicId),
    anomalies: {
      unresolvedActivityReferences: converted.anomalies.activityLogUnresolvedReferences.length,
      workItemsUpdatedBeforeCreated: converted.anomalies.workItemsUpdatedBeforeCreated.length,
      dates: converted.histograms,
    },
  };
}

async function writePreservationArchive(path, sourceChecksum, tables) {
  const destination = resolve(path);
  const fromRepo = relative(repoRoot, destination);
  const outsideRepo = isAbsolute(fromRepo) || fromRepo === '..' || fromRepo.startsWith(`..${sep}`);
  if (!outsideRepo) {
    throw new Error('Preservation archive must be stored outside the repository');
  }
  const bytes = `${JSON.stringify({ version: 1, sourceChecksum, tables }, null, 2)}\n`;
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  try {
    const current = await readFile(destination, 'utf8');
    if (current !== bytes) throw new Error('Existing preservation archive differs from the source snapshot');
    return;
  } catch (error) {
    if (error && error.code !== 'ENOENT') throw error;
  }
  const temporary = `${destination}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
    await rename(temporary, destination);
  } catch (error) {
    try { await (await import('node:fs/promises')).unlink(temporary); } catch {}
    throw error;
  }
}

export async function exportPostCutoverWrites({ query, mappings, cutoverAt, outputPath, sourceChecksum = '' }) {
  if (typeof query !== 'function') throw new Error('A guarded PostgreSQL target connection is required');
  if (typeof cutoverAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/.test(cutoverAt)) {
    throw new Error('Cutover timestamp must be a Bangkok local timestamp with millisecond precision');
  }
  if (typeof outputPath !== 'string' || outputPath.length === 0) throw new Error('An explicit reconciliation archive path is required');
  if (sourceChecksum && !/^[a-f0-9]{64}$/.test(sourceChecksum)) throw new Error('Invalid source checksum for reconciliation archive');
  const validMappings = mappings.map((record) => validateLegacyMapping(record));
  if (validMappings.some((record) => record.sourceScope !== 'live')) throw new Error('Reconciliation archive cannot mix seed identities');
  const baselineIdsByTable = new Map(BUSINESS_TABLES.map((table) => [table, new Set(validMappings
    .filter((record) => record.entityName === table).map((record) => record.newPublicId))]));
  const changed = {};
  const deleted = {};
  const cutoverSql = cutoverAt.replace('T', ' ');
  for (const table of BUSINESS_TABLES) {
    const baselineIds = [...(baselineIdsByTable.get(table) ?? [])];
    const arraySql = baselineIds.length === 0 ? 'ARRAY[]::TEXT[]' : `ARRAY[${baselineIds.map((id) => `'${parsePublicId(id)}'`).join(', ')}]::TEXT[]`;
    const timestampColumn = MUTABLE_TIMESTAMP_TABLES.includes(table) ? 'updated_at' : 'created_at';
    const whereSql = `NOT (source_row."public_id"::text = ANY(${arraySql})) OR source_row."${timestampColumn}" > '${cutoverSql}'::TIMESTAMP(3) WITHOUT TIME ZONE`;
    const rows = JSON.parse(query(sourceRowsSql(table, whereSql)) || '[]');
    if (!Array.isArray(rows)) throw new Error(`Unable to read post-cutover rows for ${table}`);
    if (rows.length > 0) changed[table] = rows;
    const currentIdsRaw = query(`SELECT COALESCE(string_agg("public_id"::text, E'\\n' ORDER BY "public_id"::text), '') FROM public."${table}"`);
    const currentIds = new Set(currentIdsRaw ? currentIdsRaw.split('\n') : []);
    const missing = baselineIds.filter((id) => !currentIds.has(id));
    if (missing.length > 0) deleted[table] = missing;
  }
  const archive = { version: 1, sourceChecksum, cutoverAt, tables: changed, deleted };
  const destination = resolve(outputPath);
  const fromRepo = relative(repoRoot, destination);
  if (!(isAbsolute(fromRepo) || fromRepo === '..' || fromRepo.startsWith(`..${sep}`))) throw new Error('Reconciliation archive must be stored outside the repository');
  const content = `${JSON.stringify(archive, null, 2)}\n`;
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  try {
    const existing = await readFile(destination, 'utf8');
    if (existing !== content) throw new Error('Existing reconciliation archive differs from the current target state');
  } catch (error) {
    if (!error || error.code !== 'ENOENT') throw error;
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, content, { flag: 'wx', mode: 0o600 });
      await rename(temporary, destination);
    } catch (writeError) {
      try { await (await import('node:fs/promises')).unlink(temporary); } catch {}
      throw writeError;
    }
  }
  return {
    archivePath: destination,
    changedRows: Object.fromEntries(Object.entries(changed).map(([table, rows]) => [table, rows.length])),
    deletedRows: Object.fromEntries(Object.entries(deleted).map(([table, rows]) => [table, rows.length])),
  };
}

export async function runLiveUpgrade({ sourceArchivePath, target, mappingPath, preservePath, env = process.env, spawn = spawnSync, query, root = repoRoot, projectCompanyMap, defaultProjectCompany } = {}) {
  const backup = await assertFreshSourceBackup(sourceArchivePath, env.APP_ENV);
  assertLiveUpgradeApproval(env, target, backup.checksum);
  assertTargetAllowed(target, env);
  console.log(JSON.stringify({
    targetSha256: databaseTargetFingerprint(target, env.APP_ENV),
    sourceSha256: backup.checksum,
  }));
  const snapshot = await restoreSourceArchive(sourceArchivePath, { site: env.APP_ENV, spawn });
  const targetQuery = query ?? createQuery(target, spawn, env);
  return applyLiveSnapshot({
    tables: snapshot.tables,
    sourceChecksum: snapshot.sourceChecksum,
    target,
    targetLabel: env.APP_ENV,
    mappingPath,
    preservePath,
    ownerSelector: env.OWNER_USER_ID,
    projectCompanyMap,
    defaultProjectCompany,
    env,
    query: targetQuery,
    root,
  });
}

export function parseLiveUpgradeArgs(argv) {
  if (argv[0] !== 'apply') throw new Error('Usage: sql-live-upgrade.mjs apply --source <verified.dump> --target <replacement-url> --mapping <file> [--preserve <file>] [--company-policy <file>]');
  const allowed = new Set(['source', 'target', 'mapping', 'preserve', 'company-policy']);
  const flags = {};
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) throw new Error('Unexpected live upgrade argument');
    const name = token.slice(2);
    const value = argv[index + 1];
    if (!allowed.has(name) || !value || value.startsWith('--') || Object.hasOwn(flags, name)) {
      throw new Error('Invalid live upgrade arguments');
    }
    flags[name] = value;
    index += 1;
  }
  if (!flags.source || !flags.target || !flags.mapping) throw new Error('Source archive, explicit target, and durable mapping file are required');
  return flags;
}

async function runCli(argv, env = process.env, logger = console) {
  try {
    const flags = parseLiveUpgradeArgs(argv);
    let companyPolicy = { projectCompanyMap: {}, defaultProjectCompany: undefined };
    if (flags['company-policy']) {
      const parsed = JSON.parse(await readFile(resolve(flags['company-policy']), 'utf8'));
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Company mapping policy must be a JSON object');
      companyPolicy = {
        projectCompanyMap: parsed.projectCompanyMap ?? {},
        defaultProjectCompany: parsed.defaultProjectCompany,
      };
    }
    const result = await runLiveUpgrade({
      sourceArchivePath: resolve(flags.source),
      target: flags.target,
      mappingPath: resolve(flags.mapping),
      preservePath: flags.preserve ? resolve(flags.preserve) : undefined,
      projectCompanyMap: companyPolicy.projectCompanyMap,
      defaultProjectCompany: companyPolicy.defaultProjectCompany,
      env,
    });
    logger.log(JSON.stringify(result, null, 2));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Live SQL upgrade failed';
    logger.error(message.replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted-url]'));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli(process.argv.slice(2)).then((status) => { process.exitCode = status; });
}
