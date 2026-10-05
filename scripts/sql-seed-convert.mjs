import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import readline from 'node:readline';
import { BUSINESS_TABLES, loadArtifacts, sha256 } from './sql-artifacts.mjs';
import { parsePublicId, serializeDecimalId } from './sql-id.mjs';
import { compareLegacyMappings, compareOrdinal, validateLegacyMapping } from './sql-legacy-id.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const AUTHORITATIVE_BACKUP_PATH = 'database/backups/pms_prod_backup_20260926_183540.sql.gz';
export const EXPECTED_COMPRESSED_SHA256 = 'a1b855b32db2f65ece5cc75860870e3e3a2dff59c7dac66c7379e47b1f7e1657';
export const EXPECTED_DECOMPRESSED_SHA256 = 'f79574fdfd4d21f5491b6d490ac87cb53e58d57648c1d0f288b75899b07fe62a';
export const EXPECTED_COMPRESSED_BYTES = 196127;
export const EXPECTED_DECOMPRESSED_BYTES = 712957;
export const COMPANY_POLICY_PATH = resolve(repoRoot, 'database/seed-policy/issue-32.json');
export const EXPECTED_SOURCE_COUNTS = Object.freeze({
  ActivityLog: 4,
  Comment: 3,
  Company: 1,
  Document: 3,
  Milestone: 4,
  Notification: 4,
  Project: 27,
  ProjectMember: 19,
  TimeEntry: 363,
  User: 11,
  work_items: 286,
});
export const EXPECTED_TOTAL_SOURCE_ROWS = 725;
export const APPROVED_CALENDAR_TIMES = Object.freeze(['00:00:00', '09:00:00']);

export const SEED_TABLE_FILES = Object.freeze([
  { table: 'companies', file: '010_companies.sql', sourceTable: 'Company' },
  { table: 'users', file: '020_users.sql', sourceTable: 'User' },
  { table: 'projects', file: '030_projects.sql', sourceTable: 'Project' },
  { table: 'project_members', file: '040_project_members.sql', sourceTable: 'ProjectMember' },
  { table: 'work_items', file: '050_work_items.sql', sourceTable: 'work_items' },
  { table: 'external_project_mappings', file: '060_external_project_mappings.sql', sourceTable: null },
  { table: 'external_work_item_references', file: '070_external_work_item_references.sql', sourceTable: null },
  { table: 'project_milestones', file: '080_project_milestones.sql', sourceTable: 'Milestone' },
  { table: 'project_documents', file: '090_project_documents.sql', sourceTable: 'Document' },
  { table: 'work_logs', file: '100_work_logs.sql', sourceTable: 'TimeEntry' },
  { table: 'activity_logs', file: '110_activity_logs.sql', sourceTable: 'ActivityLog' },
]);

const ACTIVITY_TARGETS = Object.freeze({
  task: 'work_items',
  project: 'Project',
});
const DECIMAL_TEXT = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const INTEGER_TEXT = /^(?:0|[1-9][0-9]*)$/;
const WORK_KINDS = new Set(['Incident', 'Issue', 'Task']);
const WORK_PRIORITIES = new Set(['none', 'low', 'medium', 'high', 'urgent']);
const WORK_ROLES = new Set(['Developer', 'infra', 'SA']);
const WORK_STATUSES = new Set(['backlog', 'todo', 'in-progress', 'blocked', 'sa-testing', 'pm-testing', 'completed', 'cancelled']);
const USER_THEMES = new Set(['light', 'dark', 'special-dark']);
const USER_LOCALES = new Set(['th', 'en']);
const COPY_SIMPLE = Object.freeze({
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
  '\\': '\\',
});

export const TABLE_COLUMNS = Object.freeze({
  companies: [
    ['id', 'bigint'], ['public_id', 'uuid'], ['code', 'text'], ['display_name', 'text'], ['location', 'text'],
    ['name', 'text'], ['industry', 'text'], ['email', 'text'], ['phone', 'text'], ['address', 'text'],
    ['website_url', 'text'], ['logo_url', 'text'], ['description', 'text'], ['created_at', 'timestamp'], ['updated_at', 'timestamp'],
  ],
  users: [
    ['id', 'bigint'], ['public_id', 'uuid'], ['email', 'text'], ['name', 'text'], ['password_hash', 'text'],
    ['role', 'text'], ['avatar_url', 'text'], ['phone', 'text'], ['theme', 'enum:user_theme'], ['locale', 'enum:user_locale'],
    ['status', 'text'], ['joined_at', 'timestamp'], ['created_at', 'timestamp'], ['updated_at', 'timestamp'],
  ],
  projects: [
    ['id', 'bigint'], ['public_id', 'uuid'], ['name', 'text'], ['description', 'text'], ['status', 'text'],
    ['priority', 'text'], ['start_date', 'date'], ['due_date', 'date'], ['budget_amount', 'decimal'], ['spent_amount', 'decimal'],
    ['progress_percent', 'integer'], ['color', 'text'], ['created_at', 'timestamp'], ['updated_at', 'timestamp'],
    ['creator_id', 'bigint'], ['company_id', 'bigint'],
  ],
  project_members: [
    ['id', 'bigint'], ['public_id', 'uuid'], ['role', 'text'], ['joined_at', 'timestamp'], ['project_id', 'bigint'],
    ['user_id', 'bigint'], ['created_at', 'timestamp'], ['updated_at', 'timestamp'],
  ],
  work_items: [
    ['id', 'bigint'], ['public_id', 'uuid'], ['title', 'text'], ['description', 'text'], ['kind', 'enum:work_item_kind'],
    ['priority', 'enum:work_item_priority'], ['functional_role', 'enum:work_item_role'], ['status', 'enum:work_item_status'],
    ['type_labels', 'text[]'], ['work_date', 'date'], ['due_date', 'date'], ['submitted_at', 'timestamp'],
    ['created_at', 'timestamp'], ['updated_at', 'timestamp'], ['project_id', 'bigint'], ['assignee_id', 'bigint'],
  ],
  external_project_mappings: [
    ['id', 'bigint'], ['public_id', 'uuid'], ['provider', 'text'], ['instance_url', 'text'],
    ['external_project_id', 'text'], ['project_id', 'bigint'], ['approved_label_map', 'jsonb'],
    ['first_sync_approved_at', 'timestamp'], ['created_at', 'timestamp'], ['updated_at', 'timestamp'],
  ],
  external_work_item_references: [
    ['id', 'bigint'], ['public_id', 'uuid'], ['provider', 'text'], ['instance_url', 'text'],
    ['external_project_id', 'text'], ['external_issue_id', 'text'], ['external_issue_number', 'text'],
    ['external_url', 'text'], ['project_id', 'bigint'], ['remote_created_at', 'timestamp'],
    ['remote_updated_at', 'timestamp'], ['last_synced_at', 'timestamp'], ['work_item_id', 'bigint'],
    ['created_at', 'timestamp'], ['updated_at', 'timestamp'],
  ],
  project_milestones: [
    ['id', 'bigint'], ['public_id', 'uuid'], ['name', 'text'], ['description', 'text'], ['due_date', 'timestamp'],
    ['status', 'text'], ['created_at', 'timestamp'], ['updated_at', 'timestamp'], ['project_id', 'bigint'],
  ],
  project_documents: [
    ['id', 'bigint'], ['public_id', 'uuid'], ['name', 'text'], ['description', 'text'], ['file_url', 'text'],
    ['file_size_bytes', 'integer'], ['file_type', 'text'], ['created_at', 'timestamp'], ['updated_at', 'timestamp'],
    ['project_id', 'bigint'], ['uploader_id', 'bigint'],
  ],
  work_logs: [
    ['id', 'bigint'], ['public_id', 'uuid'], ['description', 'text'], ['remarks', 'text'], ['hours', 'decimal'],
    ['work_date', 'date'], ['status', 'text'], ['created_at', 'timestamp'], ['updated_at', 'timestamp'],
    ['user_id', 'bigint'], ['project_id', 'bigint'], ['work_item_id', 'bigint'],
  ],
  activity_logs: [
    ['id', 'bigint'], ['public_id', 'uuid'], ['action', 'text'], ['entity', 'text'], ['entity_id', 'text'],
    ['description', 'text'], ['metadata', 'jsonb'], ['created_at', 'timestamp'], ['user_id', 'bigint'], ['project_id', 'bigint'],
  ],
});

export function manifestChecksumFor(manifest) {
  const copy = { ...manifest };
  delete copy.manifestChecksum;
  return sha256(Buffer.from(`${JSON.stringify(copy, null, 2)}\n`, 'utf8'));
}

export async function loadCompanyPolicy(policyPath = COMPANY_POLICY_PATH) {
  const policy = JSON.parse(await readFile(policyPath, 'utf8'));
  if (!policy || policy.policyVersion !== '1.0.0') throw new Error('Company policy version is not supported');
  if (!Array.isArray(policy.calendarTimes) || policy.calendarTimes.join(',') !== APPROVED_CALENDAR_TIMES.join(',')) {
    throw new Error('Company policy calendar times are not approved');
  }
  const evidencePath = resolve(repoRoot, policy.evidence);
  const configurationPath = resolve(repoRoot, policy.dhasConfiguration);
  for (const candidate of [evidencePath, configurationPath]) {
    const fromRoot = relative(repoRoot, candidate);
    if (fromRoot.startsWith('..') || fromRoot.includes(`..${sep}`)) throw new Error('Company policy path is unsafe');
  }
  await readFile(evidencePath);
  const dhas = JSON.parse(await readFile(configurationPath, 'utf8'));
  return {
    policyVersion: policy.policyVersion,
    evidence: policy.evidence,
    dhasCompany: {
      id: policy.dhasLegacyId,
      code: policy.dhasCode,
      name: dhas.name,
      displayName: dhas.displayName,
      location: dhas.location,
      address: dhas.address,
      phone: dhas.phone,
      description: dhas.description,
    },
    derivedTimestamp: policy.derivedTimestamp,
    derivedTimestampReason: policy.derivedTimestampReason,
    defaultProjectCompany: policy.defaultProjectCompany,
    projectCompanyMap: policy.projectCompanyMap ?? {},
    userDefaults: policy.userDefaults,
    projectMemberTimestamps: policy.projectMemberTimestamps,
  };
}

export async function verifyArchive(archivePath) {
  const compressedHash = createHash('sha256');
  let compressedBytes = 0;
  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream(archivePath);
    stream.on('data', (chunk) => {
      compressedBytes += chunk.length;
      compressedHash.update(chunk);
    });
    stream.on('end', resolvePromise);
    stream.on('error', reject);
  });
  const compressedSha256 = compressedHash.digest('hex');
  const decompressedHash = createHash('sha256');
  let decompressedBytes = 0;
  await new Promise((resolvePromise, reject) => {
    const stream = createReadStream(archivePath).pipe(createGunzip());
    stream.on('data', (chunk) => {
      decompressedBytes += chunk.length;
      decompressedHash.update(chunk);
    });
    stream.on('end', resolvePromise);
    stream.on('error', reject);
  });
  const decompressedSha256 = decompressedHash.digest('hex');
  return {
    compressedSha256,
    compressedBytes,
    decompressedSha256,
    decompressedBytes,
    isAuthoritative:
      compressedSha256 === EXPECTED_COMPRESSED_SHA256
      && compressedBytes === EXPECTED_COMPRESSED_BYTES
      && decompressedSha256 === EXPECTED_DECOMPRESSED_SHA256
      && decompressedBytes === EXPECTED_DECOMPRESSED_BYTES,
  };
}

export function assertAuthoritativeArchive(info, counts) {
  if (info.compressedSha256 !== EXPECTED_COMPRESSED_SHA256 || info.compressedBytes !== EXPECTED_COMPRESSED_BYTES) {
    throw new Error('Archive checksum or size does not match the authoritative backup');
  }
  if (info.decompressedSha256 !== EXPECTED_DECOMPRESSED_SHA256 || info.decompressedBytes !== EXPECTED_DECOMPRESSED_BYTES) {
    throw new Error('Decompressed archive does not match the authoritative backup');
  }
  const names = Object.keys(counts).sort();
  const expectedNames = Object.keys(EXPECTED_SOURCE_COUNTS).sort();
  if (names.join(',') !== expectedNames.join(',')) throw new Error('Source table inventory does not match the authoritative backup');
  for (const [table, expected] of Object.entries(EXPECTED_SOURCE_COUNTS)) {
    if (counts[table] !== expected) throw new Error(`Source row count mismatch for ${table}`);
  }
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  if (total !== EXPECTED_TOTAL_SOURCE_ROWS) throw new Error('Source row total does not match the authoritative backup');
}

export function unescapeCopyField(field) {
  if (field === '\\N') return null;
  let result = '';
  let index = 0;
  while (index < field.length) {
    if (field[index] !== '\\' || index + 1 >= field.length) {
      result += field[index];
      index += 1;
      continue;
    }
    const next = field[index + 1];
    if (Object.hasOwn(COPY_SIMPLE, next)) {
      result += COPY_SIMPLE[next];
      index += 2;
      continue;
    }
    if (next === 'x') {
      const hex = field.slice(index + 2, index + 4);
      if (!/^[0-9a-fA-F]{2}$/.test(hex)) throw new Error('Invalid COPY hex escape');
      result += String.fromCharCode(Number.parseInt(hex, 16));
      index += 4;
      continue;
    }
    const octal = /^[0-7]{1,3}/.exec(field.slice(index + 1));
    if (octal) {
      result += String.fromCharCode(Number.parseInt(octal[0], 8));
      index += 1 + octal[0].length;
      continue;
    }
    result += next;
    index += 2;
  }
  return result;
}

export function parsePgArray(value) {
  if (value == null) return null;
  if (typeof value !== 'string' || !value.startsWith('{') || !value.endsWith('}')) {
    throw new Error('Invalid PostgreSQL array literal');
  }
  const body = value.slice(1, -1);
  if (body === '') return [];
  const items = [];
  let index = 0;
  while (index < body.length) {
    if (body[index] === '"') {
      let item = '';
      index += 1;
      let closed = false;
      while (index < body.length) {
        if (body[index] === '\\') {
          item += body[index + 1] ?? '';
          index += 2;
          continue;
        }
        if (body[index] === '"') {
          if (body[index + 1] === '"') {
            item += '"';
            index += 2;
            continue;
          }
          index += 1;
          closed = true;
          break;
        }
        item += body[index];
        index += 1;
      }
      if (!closed) throw new Error('Invalid PostgreSQL array literal');
      items.push(item);
    } else {
      const end = body.indexOf(',', index);
      const stop = end === -1 ? body.length : end;
      const token = body.slice(index, stop).trim();
      items.push(token === 'NULL' ? null : token);
      index = stop;
    }
    if (index < body.length) {
      if (body[index] !== ',') throw new Error('Invalid PostgreSQL array literal');
      index += 1;
      if (index === body.length) throw new Error('Invalid PostgreSQL array literal');
    }
  }
  return items;
}

export async function parseDumpStream(readableStream) {
  const rl = readline.createInterface({ input: readableStream, crlfDelay: Infinity });
  let currentCopyTable = null;
  const tables = {};
  const copyCols = {};
  const counts = {};
  for await (const line of rl) {
    if (line.startsWith('COPY public.')) {
      const match = line.match(/^COPY public\.("?\w+"?)\s*\((.*)\)\s*FROM stdin;$/);
      if (!match) throw new Error('Unrecognized COPY header');
      currentCopyTable = match[1].replaceAll('"', '');
      tables[currentCopyTable] = [];
      copyCols[currentCopyTable] = match[2].split(',').map((column) => column.trim().replaceAll('"', ''));
      counts[currentCopyTable] = 0;
    } else if (line === '\\.') {
      currentCopyTable = null;
    } else if (currentCopyTable) {
      const cols = line.split('\t');
      const names = copyCols[currentCopyTable];
      if (cols.length !== names.length) {
        throw new Error(`COPY row for ${currentCopyTable} has ${cols.length} fields, expected ${names.length}`);
      }
      const row = {};
      for (let index = 0; index < names.length; index += 1) row[names[index]] = unescapeCopyField(cols[index]);
      tables[currentCopyTable].push(row);
      counts[currentCopyTable] += 1;
    }
  }
  const totalRows = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return { tables, counts, copyCols, totalRows };
}

export async function parseDumpFile(archivePath) {
  return parseDumpStream(createReadStream(archivePath).pipe(createGunzip()));
}

export function toIsoTimestamp(rawTimestamp, label = 'timestamp') {
  if (typeof rawTimestamp !== 'string') throw new Error(`Missing or unrecognized timestamp for ${label}`);
  const match = rawTimestamp.trim().match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?$/);
  if (!match) throw new Error(`Missing or unrecognized timestamp for ${label}`);
  const fraction = (match[3] ?? '000').slice(0, 3).padEnd(3, '0');
  return `${match[1]}T${match[2]}.${fraction}`;
}

export function toSqlTimestamp(rawTimestamp, label) {
  return toIsoTimestamp(rawTimestamp, label).replace('T', ' ');
}

export function toBangkokCalendarDate(rawDate, label = 'calendar date') {
  if (rawDate == null || rawDate === '') return null;
  if (typeof rawDate !== 'string') throw new Error(`Unrecognized calendar value for ${label}`);
  const match = rawDate.trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2})(?:\.\d{1,6})?)?$/);
  if (!match) throw new Error(`Unrecognized calendar value for ${label}`);
  const time = match[2] ?? '00:00:00';
  if (!APPROVED_CALENDAR_TIMES.includes(time)) {
    throw new Error(`Calendar time for ${label} is outside the approved 00:00:00 or 09:00:00 policy`);
  }
  return match[1];
}

function calendarValue(rawDate, label, histogram, allowNull) {
  if (rawDate == null || rawDate === '') {
    if (!allowNull) throw new Error(`Missing calendar date for ${label}`);
    histogram.null += 1;
    return null;
  }
  const match = String(rawDate).trim().match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}:\d{2})(?:\.\d{1,6})?)?$/);
  if (!match) throw new Error(`Unrecognized calendar value for ${label}`);
  const time = match[2] ?? '00:00:00';
  if (!APPROVED_CALENDAR_TIMES.includes(time)) {
    throw new Error(`Calendar time for ${label} is outside the approved 00:00:00 or 09:00:00 policy`);
  }
  histogram[time] += 1;
  return match[1];
}

function emptyHistogram() {
  return { '00:00:00': 0, '09:00:00': 0, null: 0 };
}

export function escapeSqlString(text) {
  if (text === null || text === undefined) return 'NULL';
  return `'${String(text).replaceAll("'", "''")}'`;
}

export function formatSqlLiteral(value, typeHint = null) {
  if (value === null || value === undefined) return 'NULL';
  if (typeHint === 'text[]') {
    if (!Array.isArray(value)) throw new Error('Text array value must be parsed before SQL formatting');
    if (value.length === 0) return 'ARRAY[]::TEXT[]';
    return `ARRAY[${value.map((item) => (item == null ? 'NULL' : escapeSqlString(item))).join(', ')}]::TEXT[]`;
  }
  if (typeHint === 'jsonb') {
    const jsonText = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return `${escapeSqlString(jsonText)}::JSONB`;
  }
  if (typeHint === 'date') return `${escapeSqlString(value)}::DATE`;
  if (typeHint === 'timestamp') return `${escapeSqlString(value)}::TIMESTAMP(3) WITHOUT TIME ZONE`;
  if (typeHint === 'decimal') {
    if (typeof value !== 'string' || !DECIMAL_TEXT.test(value)) throw new Error('Invalid decimal literal');
    return value;
  }
  if (typeHint === 'bigint') {
    if (typeof value !== 'string' || !/^[1-9][0-9]*$/.test(value)) throw new Error('Invalid numeric identifier');
    return value;
  }
  if (typeHint === 'integer') {
    if (typeof value !== 'string' || !INTEGER_TEXT.test(value)) throw new Error('Invalid integer literal');
    return value;
  }
  if (typeHint === 'boolean') return value === true ? 'TRUE' : 'FALSE';
  if (typeHint === 'uuid') return escapeSqlString(parsePublicId(value));
  if (typeof typeHint === 'string' && typeHint.startsWith('enum:')) {
    return `${escapeSqlString(value)}::${typeHint.slice('enum:'.length)}`;
  }
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return escapeSqlString(value);
}

export async function readLegacyMappings(mapPath, explicit) {
  let raw;
  try {
    raw = await readFile(mapPath, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT' && !explicit) return [];
    if (err && err.code === 'ENOENT') throw new Error('Legacy mapping file does not exist');
    throw new Error('Legacy mapping file is unreadable');
  }
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error('Legacy mapping file must be an array');
    return parsed.map((record) => validateLegacyMapping(record));
  } catch (err) {
    if (err instanceof Error && err.message.startsWith('Invalid legacy mapping')) throw err;
    if (err instanceof Error && err.message.startsWith('Legacy mapping')) throw err;
    throw new Error('Legacy mapping file is invalid');
  }
}

function reserveMappings(existingMappings, sourceChecksum, targetRevision) {
  const lookup = new Map();
  const ids = new Map();
  const publicIds = new Set();
  for (const record of existingMappings) {
    if (record.sourceScope !== 'seed') throw new Error('Seed conversion cannot reuse a live mapping');
    if (record.sourceChecksum !== sourceChecksum) throw new Error('Legacy mapping source checksum does not match the archive');
    if (record.targetRevision !== targetRevision) throw new Error('Legacy mapping target revision does not match');
    const key = `${record.entityName}\u0000${record.oldId}`;
    if (lookup.has(key)) throw new Error(`Legacy mapping old id is duplicated for ${record.entityName}`);
    const used = ids.get(record.entityName) ?? new Set();
    if (used.has(record.newId)) throw new Error(`Legacy mapping numeric id is duplicated for ${record.entityName}`);
    if (publicIds.has(record.newPublicId)) throw new Error('Legacy mapping public id is duplicated');
    used.add(record.newId);
    ids.set(record.entityName, used);
    publicIds.add(record.newPublicId);
    lookup.set(key, record);
  }
  return { lookup, ids };
}

export function buildLegacyMappings({
  tables,
  sourceChecksum,
  targetRevision = '31.0.0',
  existingMappings = [],
  companyPolicy,
}) {
  const { lookup, ids } = reserveMappings(existingMappings, sourceChecksum, targetRevision);
  const allMappings = [];
  const seen = new Set();

  function mapEntityList(entityName, rawItems, getOldId, getCreatedAt) {
    const items = rawItems.map((item) => ({
      oldId: getOldId(item),
      createdAt: toIsoTimestamp(getCreatedAt(item), entityName),
    }));
    items.sort((left, right) => compareLegacyMappings(left, right));
    const reserved = ids.get(entityName) ?? new Set();
    let nextId = 1n;
    for (const item of items) {
      const key = `${entityName}\u0000${item.oldId}`;
      seen.add(key);
      const existing = lookup.get(key);
      let newId;
      let newPublicId;
      if (existing) {
        if (existing.createdAt !== item.createdAt) throw new Error(`Legacy mapping timestamp does not match the source for ${entityName}`);
        newId = existing.newId;
        newPublicId = existing.newPublicId;
      } else if (existingMappings.length > 0) {
        throw new Error(`Legacy mapping does not cover every ${entityName} row`);
      } else {
        while (reserved.has(serializeDecimalId(nextId))) nextId += 1n;
        newId = serializeDecimalId(nextId);
        reserved.add(newId);
        nextId += 1n;
        newPublicId = parsePublicId(randomUUID());
      }
      allMappings.push(validateLegacyMapping({
        entityName,
        sourceScope: 'seed',
        sourceChecksum,
        targetRevision,
        oldId: item.oldId,
        createdAt: item.createdAt,
        newId,
        newPublicId,
      }));
    }
  }

  const companyList = [...(tables.Company ?? [])];
  if (companyPolicy?.dhasCompany) {
    companyList.push({
      id: companyPolicy.dhasCompany.id,
      createdAt: companyPolicy.derivedTimestamp,
    });
  }
  mapEntityList('Company', companyList, (row) => row.id, (row) => row.createdAt);
  mapEntityList('User', tables.User ?? [], (row) => row.id, (row) => row.createdAt);
  mapEntityList('Project', tables.Project ?? [], (row) => row.id, (row) => row.createdAt);
  mapEntityList('ProjectMember', tables.ProjectMember ?? [], (row) => row.id, (row) => row.joinedAt);
  mapEntityList('work_items', tables.work_items ?? [], (row) => row.id, (row) => row.createdAt);
  mapEntityList('Milestone', tables.Milestone ?? [], (row) => row.id, (row) => row.createdAt);
  mapEntityList('Document', tables.Document ?? [], (row) => row.id, (row) => row.createdAt);
  mapEntityList('TimeEntry', tables.TimeEntry ?? [], (row) => row.id, (row) => row.createdAt);
  mapEntityList('ActivityLog', tables.ActivityLog ?? [], (row) => row.id, (row) => row.createdAt);

  for (const record of existingMappings) {
    if (!seen.has(`${record.entityName}\u0000${record.oldId}`)) {
      throw new Error(`Legacy mapping contains ${record.entityName} rows that are not in the source`);
    }
  }
  const sorted = allMappings.sort(compareLegacyMappings);
  const byKey = new Map(sorted.map((record) => [`${record.entityName}\u0000${record.oldId}`, record]));
  return {
    mappings: sorted,
    getNumericId(entityName, oldId) {
      return byKey.get(`${entityName}\u0000${oldId}`)?.newId ?? null;
    },
    getPublicId(entityName, oldId) {
      return byKey.get(`${entityName}\u0000${oldId}`)?.newPublicId ?? null;
    },
  };
}

function requireMapped(entityName, oldId, value, label) {
  if (!oldId) throw new Error(`Missing source reference for ${label}`);
  if (!value) throw new Error(`${label} references a missing ${entityName} row`);
  return value;
}

function companyCodeFor(projectId, companyPolicy) {
  if (companyPolicy.projectCompanyMap && Object.hasOwn(companyPolicy.projectCompanyMap, projectId)) {
    return companyPolicy.projectCompanyMap[projectId];
  }
  if (typeof companyPolicy.defaultProjectCompany === 'string' && companyPolicy.defaultProjectCompany.length > 0) {
    return companyPolicy.defaultProjectCompany;
  }
  throw new Error(`Missing company assignment for Project ${projectId}`);
}

function enumValue(value, allowed, label, allowNull = false) {
  if (value == null || value === '') {
    if (allowNull) return null;
    throw new Error(`Missing enum value for ${label}`);
  }
  if (!allowed.has(value)) throw new Error(`Invalid enum value for ${label}`);
  return value;
}

function decimalOrNull(value, label) {
  if (value == null || value === '') return null;
  if (!DECIMAL_TEXT.test(value)) throw new Error(`Invalid decimal value for ${label}`);
  return value;
}

function integerOrNull(value, label) {
  if (value == null || value === '') return null;
  if (!INTEGER_TEXT.test(value)) throw new Error(`Invalid integer value for ${label}`);
  return value;
}

function requireInteger(value, label) {
  const integer = integerOrNull(value, label);
  if (integer == null) throw new Error(`Missing integer value for ${label}`);
  return integer;
}

function requireText(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Missing text value for ${label}`);
  return value;
}

function requireDecimal(value, label) {
  const decimal = decimalOrNull(value, label);
  if (decimal == null) throw new Error(`Missing decimal value for ${label}`);
  return decimal;
}

export function transformSourceRows({ tables, legacyMapper, companyPolicy, live = false }) {
  if (!companyPolicy) throw new Error('Company policy is required for conversion');
  const { getNumericId, getPublicId } = legacyMapper;
  const histograms = {
    projectStart: emptyHistogram(),
    projectDue: emptyHistogram(),
    workDate: emptyHistogram(),
    dueDate: emptyHistogram(),
    timeDate: emptyHistogram(),
  };
  const provenance = {
    syntheticUserTheme: 0,
    syntheticUserLocale: 0,
    syntheticUserStatus: 0,
    syntheticUserRole: 0,
    projectMemberTimestampsCopiedFromJoinedAt: 0,
    derivedCompanyTimestamp: companyPolicy.derivedTimestampReason ?? null,
  };
  const anomalies = {
    workItemsUpdatedBeforeCreated: [],
    activityLogUnresolvedReferences: [],
    companyCountDelta: 0,
  };

  const companies = (tables.Company ?? []).map((row) => ({
    id: getNumericId('Company', row.id),
    public_id: getPublicId('Company', row.id),
    code: row.code ?? null,
    display_name: row.displayName ?? null,
    location: row.location ?? null,
    name: requireText(row.name, 'Company.name'),
    industry: row.industry ?? null,
    email: row.email ?? null,
    phone: row.phone ?? null,
    address: row.address ?? null,
    website_url: row.website ?? null,
    logo_url: row.logo ?? null,
    description: row.description ?? null,
    created_at: toSqlTimestamp(row.createdAt, 'Company.createdAt'),
    updated_at: toSqlTimestamp(row.updatedAt, 'Company.updatedAt'),
  }));
  const companyIdByLegacyId = new Map((tables.Company ?? []).map((row) => [row.id, getNumericId('Company', row.id)]));
  let dhasCompanyId = null;
  if (companyPolicy.dhasCompany) {
    const dhas = companyPolicy.dhasCompany;
    dhasCompanyId = getNumericId('Company', dhas.id);
    companies.push({
      id: dhasCompanyId,
      public_id: getPublicId('Company', dhas.id),
      code: dhas.code,
      display_name: dhas.displayName,
      location: dhas.location,
      name: requireText(dhas.name, 'Dhas.name'),
      industry: dhas.industry ?? null,
      email: dhas.email ?? null,
      phone: dhas.phone ?? null,
      address: dhas.address ?? null,
      website_url: dhas.website_url ?? null,
      logo_url: dhas.logo_url ?? null,
      description: dhas.description ?? null,
      created_at: toSqlTimestamp(companyPolicy.derivedTimestamp, 'Dhas.createdAt'),
      updated_at: toSqlTimestamp(companyPolicy.derivedTimestamp, 'Dhas.updatedAt'),
    });
    anomalies.companyCountDelta = 1;
  }
  const companyIdByCode = new Map(companies.filter((row) => row.code).map((row) => [row.code, row.id]));

  const users = (tables.User ?? []).map((row) => {
    const defaults = companyPolicy.userDefaults ?? { theme: 'light', locale: 'th', status: 'Active', role: 'member' };
    if (!live || row.theme == null || row.theme === '') provenance.syntheticUserTheme += 1;
    if (!live || row.locale == null || row.locale === '') provenance.syntheticUserLocale += 1;
    let status = row.status;
    if (status == null || status === '') {
      if (live) throw new Error('Live User row is missing status');
      status = defaults.status;
      provenance.syntheticUserStatus += 1;
    }
    let role = row.role;
    if (role == null || role === '') {
      if (live) throw new Error('Live User row is missing role');
      role = defaults.role;
      provenance.syntheticUserRole += 1;
    }
    if (row.password == null || row.password === '') throw new Error('User row is missing password_hash');
    const theme = live ? requireText(row.theme, 'User.theme') : defaults.theme;
    const locale = live ? requireText(row.locale, 'User.locale') : defaults.locale;
    enumValue(theme, USER_THEMES, 'users.theme');
    enumValue(locale, USER_LOCALES, 'users.locale');
    return {
      id: getNumericId('User', row.id),
      public_id: getPublicId('User', row.id),
      email: requireText(row.email, 'User.email'),
      name: requireText(row.name, 'User.name'),
      password_hash: row.password,
      role: requireText(role, 'User.role'),
      avatar_url: row.avatar ?? null,
      phone: row.phone ?? null,
      theme,
      locale,
      status: requireText(status, 'User.status'),
      joined_at: toSqlTimestamp(row.joinDate, 'User.joinDate'),
      created_at: toSqlTimestamp(row.createdAt, 'User.createdAt'),
      updated_at: toSqlTimestamp(row.updatedAt, 'User.updatedAt'),
    };
  });

  const projects = (tables.Project ?? []).map((row) => {
    let companyId;
    if (live) {
      const sourceCompanyId = row.companyId
        ?? companyPolicy.projectCompanyMap?.[row.id]
        ?? companyPolicy.defaultProjectCompany;
      companyId = requireMapped('Company', sourceCompanyId, companyIdByLegacyId.get(sourceCompanyId), `Project ${row.id} company`);
    } else {
      const code = companyCodeFor(row.id, companyPolicy);
      companyId = code === companyPolicy.dhasCompany?.code ? dhasCompanyId : companyIdByCode.get(code);
      if (!companyId) throw new Error(`Project ${row.id} mapped to unknown company code: ${code}`);
    }
    return {
      id: getNumericId('Project', row.id),
      public_id: getPublicId('Project', row.id),
      name: requireText(row.name, 'Project.name'),
      description: row.description ?? null,
      status: requireText(row.status, 'Project.status'),
      priority: requireText(row.priority, 'Project.priority'),
      start_date: calendarValue(row.startDate, 'Project.startDate', histograms.projectStart, false),
      due_date: calendarValue(row.dueDate, 'Project.dueDate', histograms.projectDue, false),
      budget_amount: decimalOrNull(row.budget, 'Project.budget'),
      spent_amount: decimalOrNull(row.spent, 'Project.spent'),
      progress_percent: requireInteger(row.progress, 'Project.progress'),
      color: row.colorProject ?? null,
      created_at: toSqlTimestamp(row.createdAt, 'Project.createdAt'),
      updated_at: toSqlTimestamp(row.updatedAt, 'Project.updatedAt'),
      creator_id: row.creatorId ? requireMapped('User', row.creatorId, getNumericId('User', row.creatorId), `Project ${row.id} creator`) : null,
      company_id: companyId,
    };
  });

  const projectMembers = (tables.ProjectMember ?? []).map((row) => {
    const joinedAt = toSqlTimestamp(row.joinedAt, 'ProjectMember.joinedAt');
    provenance.projectMemberTimestampsCopiedFromJoinedAt += 1;
    return {
      id: getNumericId('ProjectMember', row.id),
      public_id: getPublicId('ProjectMember', row.id),
      role: requireText(row.role, 'ProjectMember.role'),
      joined_at: joinedAt,
      project_id: requireMapped('Project', row.projectId, getNumericId('Project', row.projectId), `ProjectMember ${row.id}`),
      user_id: requireMapped('User', row.userId, getNumericId('User', row.userId), `ProjectMember ${row.id}`),
      created_at: joinedAt,
      updated_at: joinedAt,
    };
  });

  const workItems = (tables.work_items ?? []).map((row) => {
    const createdAt = toSqlTimestamp(row.createdAt, 'work_items.createdAt');
    const updatedAt = toSqlTimestamp(row.updatedAt, 'work_items.updatedAt');
    if (compareOrdinal(updatedAt, createdAt) < 0) {
      anomalies.workItemsUpdatedBeforeCreated.push({ oldId: row.id, createdAt, updatedAt });
    }
    return {
      id: getNumericId('work_items', row.id),
      public_id: getPublicId('work_items', row.id),
      title: requireText(row.title, 'work_items.title'),
      description: row.description ?? null,
      kind: enumValue(row.kind, WORK_KINDS, 'work_items.kind'),
      priority: enumValue(row.priority, WORK_PRIORITIES, 'work_items.priority'),
      functional_role: enumValue(row.role, WORK_ROLES, 'work_items.functional_role', true),
      status: enumValue(row.status, WORK_STATUSES, 'work_items.status'),
      type_labels: Array.isArray(row.labels_types) ? row.labels_types : parsePgArray(row.labels_types),
      work_date: calendarValue(row.workDate, 'work_items.workDate', histograms.workDate, true),
      due_date: calendarValue(row.dueDate, 'work_items.dueDate', histograms.dueDate, true),
      submitted_at: row.submittedAt ? toSqlTimestamp(row.submittedAt, 'work_items.submittedAt') : null,
      created_at: createdAt,
      updated_at: updatedAt,
      project_id: requireMapped('Project', row.projectId, getNumericId('Project', row.projectId), `WorkItem ${row.id}`),
      assignee_id: requireMapped('User', row.assigneeId, getNumericId('User', row.assigneeId), `WorkItem ${row.id}`),
    };
  });

  const milestones = (tables.Milestone ?? []).map((row) => ({
    id: getNumericId('Milestone', row.id),
    public_id: getPublicId('Milestone', row.id),
    name: requireText(row.name, 'Milestone.name'),
    description: row.description ?? null,
    due_date: toSqlTimestamp(row.dueDate, 'Milestone.dueDate'),
    status: requireText(row.status, 'Milestone.status'),
    created_at: toSqlTimestamp(row.createdAt, 'Milestone.createdAt'),
    updated_at: toSqlTimestamp(row.updatedAt, 'Milestone.updatedAt'),
    project_id: requireMapped('Project', row.projectId, getNumericId('Project', row.projectId), `Milestone ${row.id}`),
  }));

  const documents = (tables.Document ?? []).map((row) => ({
    id: getNumericId('Document', row.id),
    public_id: getPublicId('Document', row.id),
    name: requireText(row.name, 'Document.name'),
    description: row.description ?? null,
    file_url: requireText(row.fileUrl, 'Document.fileUrl'),
    file_size_bytes: integerOrNull(row.fileSize, 'Document.fileSize'),
    file_type: row.fileType ?? null,
    created_at: toSqlTimestamp(row.createdAt, 'Document.createdAt'),
    updated_at: toSqlTimestamp(row.updatedAt, 'Document.updatedAt'),
    project_id: row.projectId ? requireMapped('Project', row.projectId, getNumericId('Project', row.projectId), `Document ${row.id}`) : null,
    uploader_id: row.uploaderId ? requireMapped('User', row.uploaderId, getNumericId('User', row.uploaderId), `Document ${row.id}`) : null,
  }));

  const workLogs = (tables.TimeEntry ?? []).map((row) => ({
    id: getNumericId('TimeEntry', row.id),
    public_id: getPublicId('TimeEntry', row.id),
    description: row.description ?? null,
    remarks: row.remarks ?? null,
    hours: requireDecimal(row.hours, 'TimeEntry.hours'),
    work_date: calendarValue(row.date, 'TimeEntry.date', histograms.timeDate, false),
    status: row.status ?? null,
    created_at: toSqlTimestamp(row.createdAt, 'TimeEntry.createdAt'),
    updated_at: toSqlTimestamp(row.updatedAt, 'TimeEntry.updatedAt'),
    user_id: requireMapped('User', row.userId, getNumericId('User', row.userId), `TimeEntry ${row.id}`),
    project_id: row.projectId ? requireMapped('Project', row.projectId, getNumericId('Project', row.projectId), `TimeEntry ${row.id}`) : null,
    work_item_id: row.workItemId ? requireMapped('work_items', row.workItemId, getNumericId('work_items', row.workItemId), `TimeEntry ${row.id}`) : null,
  }));

  const activityLogs = (tables.ActivityLog ?? []).map((row) => {
    const target = ACTIVITY_TARGETS[row.entity];
    const resolved = target ? getNumericId(target, row.entityId) : null;
    if (!target || !resolved) {
      anomalies.activityLogUnresolvedReferences.push({
        oldId: row.id,
        entity: row.entity,
        entityId: row.entityId,
      });
    }
    return {
      id: getNumericId('ActivityLog', row.id),
      public_id: getPublicId('ActivityLog', row.id),
      action: requireText(row.action, 'ActivityLog.action'),
      entity: requireText(row.entity, 'ActivityLog.entity'),
      entity_id: requireText(row.entityId, 'ActivityLog.entityId'),
      description: row.description ?? null,
      metadata: row.metadata ?? null,
      created_at: toSqlTimestamp(row.createdAt, 'ActivityLog.createdAt'),
      user_id: row.userId ? requireMapped('User', row.userId, getNumericId('User', row.userId), `ActivityLog ${row.id}`) : null,
      project_id: row.projectId ? requireMapped('Project', row.projectId, getNumericId('Project', row.projectId), `ActivityLog ${row.id}`) : null,
    };
  });

  const externalProjectMappings = live ? (tables.GitLabProjectMapping ?? []).map((row) => ({
    id: getNumericId('GitLabProjectMapping', row.id),
    public_id: getPublicId('GitLabProjectMapping', row.id),
    provider: 'gitlab',
    instance_url: requireText(row.canonicalGitLabInstanceUrl, 'GitLabProjectMapping.canonicalGitLabInstanceUrl'),
    external_project_id: requireText(row.gitLabProjectId, 'GitLabProjectMapping.gitLabProjectId'),
    project_id: requireMapped('Project', row.projectId, getNumericId('Project', row.projectId), `GitLabProjectMapping ${row.id}`),
    approved_label_map: row.approvedLabelMap ?? {},
    first_sync_approved_at: row.firstSyncApprovedAt ? toSqlTimestamp(row.firstSyncApprovedAt, 'GitLabProjectMapping.firstSyncApprovedAt') : null,
    created_at: toSqlTimestamp(row.createdAt, 'GitLabProjectMapping.createdAt'),
    updated_at: toSqlTimestamp(row.updatedAt, 'GitLabProjectMapping.updatedAt'),
  })) : [];

  const externalWorkItemReferences = live ? (tables.ExternalWorkItemReference ?? []).map((row) => {
    const syncedAt = toSqlTimestamp(row.lastSyncedAt, 'ExternalWorkItemReference.lastSyncedAt');
    return {
      id: getNumericId('ExternalWorkItemReference', row.id),
      public_id: getPublicId('ExternalWorkItemReference', row.id),
      provider: row.provider ?? 'gitlab',
      instance_url: requireText(row.canonicalGitLabInstanceUrl, 'ExternalWorkItemReference.canonicalGitLabInstanceUrl'),
      external_project_id: requireText(row.gitLabProjectId, 'ExternalWorkItemReference.gitLabProjectId'),
      external_issue_id: requireText(row.gitLabGlobalIssueId, 'ExternalWorkItemReference.gitLabGlobalIssueId'),
      external_issue_number: requireText(row.gitLabIssueIid, 'ExternalWorkItemReference.gitLabIssueIid'),
      external_url: requireText(row.externalUrl, 'ExternalWorkItemReference.externalUrl'),
      project_id: requireMapped('Project', row.projectId, getNumericId('Project', row.projectId), `ExternalWorkItemReference ${row.id}`),
      remote_created_at: toSqlTimestamp(row.remoteCreatedAt, 'ExternalWorkItemReference.remoteCreatedAt'),
      remote_updated_at: toSqlTimestamp(row.remoteUpdatedAt, 'ExternalWorkItemReference.remoteUpdatedAt'),
      last_synced_at: syncedAt,
      work_item_id: requireMapped('work_items', row.workItemId, getNumericId('work_items', row.workItemId), `ExternalWorkItemReference ${row.id}`),
      // The legacy model has no local creation/update timestamps for this join row.
      created_at: toSqlTimestamp(row.remoteCreatedAt, 'ExternalWorkItemReference.remoteCreatedAt'),
      updated_at: syncedAt,
    };
  }) : [];

  const transformed = {
    companies,
    users,
    projects,
    project_members: projectMembers,
    work_items: workItems,
    external_project_mappings: externalProjectMappings,
    external_work_item_references: externalWorkItemReferences,
    project_milestones: milestones,
    project_documents: documents,
    work_logs: workLogs,
    activity_logs: activityLogs,
  };
  const unresolvedByEntity = {};
  for (const item of anomalies.activityLogUnresolvedReferences) {
    unresolvedByEntity[item.entity] = (unresolvedByEntity[item.entity] ?? 0) + 1;
  }
  return {
    transformed,
    excluded: [
      { sourceTable: 'Comment', sourceRows: (tables.Comment ?? []).length, policy: 'archived/no-target-table' },
      { sourceTable: 'Notification', sourceRows: (tables.Notification ?? []).length, policy: 'archived/no-target-table' },
    ],
    anomalies,
    histograms,
    provenance,
    unresolvedByEntity,
    documents: {
      retainedUrls: documents.length,
      physicalFilesVerified: false,
    },
  };
}

export function formatTableInsertSql(tableName, rows) {
  const columns = TABLE_COLUMNS[tableName];
  if (!columns) throw new Error(`Unknown seed table ${tableName}`);
  if (!rows || rows.length === 0) return `-- Table "${tableName}" (0 rows)\n`;
  const header = [
    `-- Seeds for public."${tableName}" (${rows.length} rows)`,
    `INSERT INTO "${tableName}" (${columns.map(([name]) => `"${name}"`).join(', ')})`,
    'VALUES',
  ];
  const values = rows.map((row, index) => {
    const rendered = columns.map(([name, type]) => formatSqlLiteral(row[name], type));
    const suffix = index === rows.length - 1 ? ';' : ',';
    return `  (${rendered.join(', ')})${suffix}`;
  });
  return `${header.join('\n')}\n${values.join('\n')}\n`;
}

function datasetFingerprint(files, policyVersion, legacyMapChecksum, contractChecksum) {
  const lines = [
    ...files.map((file) => `${file.file}:${file.checksum}`),
    `policy:${policyVersion}`,
    `mapping:${legacyMapChecksum}`,
    `schema:${contractChecksum}`,
  ];
  return sha256(Buffer.from(lines.join('\n'), 'utf8'));
}

export async function generateSqlMasterSeeds({
  archivePath = AUTHORITATIVE_BACKUP_PATH,
  outputDir = resolve(repoRoot, 'database/seeds/sql-master'),
  companyPolicy,
  existingMappingsPath = null,
  targetRevision = '31.0.0',
} = {}) {
  const policy = companyPolicy === undefined ? await loadCompanyPolicy() : companyPolicy;
  if (!policy) throw new Error('Company policy is required for conversion');
  const mapPath = existingMappingsPath ?? resolve(outputDir, 'legacy-id-map.json');
  const existingMappings = await readLegacyMappings(mapPath, existingMappingsPath != null);
  const archiveInfo = await verifyArchive(archivePath);
  const parsed = await parseDumpFile(archivePath);
  assertAuthoritativeArchive(archiveInfo, parsed.counts);
  const artifacts = loadArtifacts(repoRoot);
  if (artifacts.revision !== targetRevision) throw new Error('Target revision does not match the SQL contract');
  const legacyMapper = buildLegacyMappings({
    tables: parsed.tables,
    sourceChecksum: archiveInfo.compressedSha256,
    targetRevision,
    existingMappings,
    companyPolicy: policy,
  });
  const result = transformSourceRows({ tables: parsed.tables, legacyMapper, companyPolicy: policy });
  const pendingFiles = [];
  const filesManifest = [];
  let totalTargetRows = 0;
  for (const entry of SEED_TABLE_FILES) {
    const rows = result.transformed[entry.table] ?? [];
    totalTargetRows += rows.length;
    const sqlContent = formatTableInsertSql(entry.table, rows);
    pendingFiles.push({ file: entry.file, sqlContent });
    filesManifest.push({
      table: entry.table,
      file: entry.file,
      sourceTable: entry.sourceTable,
      sourceRows: entry.sourceTable ? (parsed.counts[entry.sourceTable] ?? 0) : 0,
      targetRows: rows.length,
      checksum: sha256(Buffer.from(sqlContent, 'utf8')),
      emptySequencePolicy: rows.length === 0 ? 'start-with-1' : 'align-to-max-id',
    });
  }
  const legacyMapContent = `${JSON.stringify(legacyMapper.mappings, null, 2)}\n`;
  const legacyMapChecksum = sha256(Buffer.from(legacyMapContent, 'utf8'));
  const evidence = {
    calendarTimeHistogram: result.histograms,
    activityUnresolvedByEntity: result.unresolvedByEntity,
    activityUnresolvedCount: result.anomalies.activityLogUnresolvedReferences.length,
    updatedBeforeCreatedCount: result.anomalies.workItemsUpdatedBeforeCreated.length,
    documents: result.documents,
    provenance: result.provenance,
    companyEvidence: policy.evidence,
  };
  const evidenceContent = `${JSON.stringify(evidence, null, 2)}\n`;
  const contractChecksum = artifacts.migrations[0].checksum;
  const manifestBody = {
    datasetVersion: '1.0.0',
    datasetFingerprint: datasetFingerprint(filesManifest, policy.policyVersion, legacyMapChecksum, contractChecksum),
    source: {
      archivePath: archivePath.replaceAll('\\', '/'),
      compressedSha256: archiveInfo.compressedSha256,
      compressedBytes: archiveInfo.compressedBytes,
      decompressedSha256: archiveInfo.decompressedSha256,
      decompressedBytes: archiveInfo.decompressedBytes,
      totalSourceRows: parsed.totalRows,
      sourceCounts: parsed.counts,
    },
    schema: {
      targetRevision,
      contractChecksum,
      tableCount: BUSINESS_TABLES.length,
    },
    generator: {
      version: '1.1.0',
      policyVersion: policy.policyVersion,
      policyEvidence: policy.evidence,
      legacyMapChecksum,
      legacyMapCount: legacyMapper.mappings.length,
      evidenceChecksum: sha256(Buffer.from(evidenceContent, 'utf8')),
    },
    tables: filesManifest,
    excludedTables: result.excluded,
    anomalies: {
      workItemsUpdatedBeforeCreated: result.anomalies.workItemsUpdatedBeforeCreated.length,
      calendarDatesWith09Time: {
        workDate: result.histograms.workDate['09:00:00'],
        dueDate: result.histograms.dueDate['09:00:00'],
      },
      calendarTimeHistogram: result.histograms,
      activityLogUnresolvedReferences: result.anomalies.activityLogUnresolvedReferences.length,
      activityLogUnresolvedByEntity: result.unresolvedByEntity,
      companyCountDelta: result.anomalies.companyCountDelta,
    },
    documents: result.documents,
    provenance: result.provenance,
    summary: {
      totalSourceRows: parsed.totalRows,
      totalTargetRows,
      excludedSourceRows: result.excluded.reduce((sum, entry) => sum + entry.sourceRows, 0),
      derivedTargetRows: result.anomalies.companyCountDelta,
    },
  };
  const manifest = { ...manifestBody, manifestChecksum: manifestChecksumFor(manifestBody) };
  await mkdir(outputDir, { recursive: true });
  for (const pending of pendingFiles) {
    await writeFile(resolve(outputDir, pending.file), pending.sqlContent, 'utf8');
  }
  await writeFile(resolve(outputDir, 'legacy-id-map.json'), legacyMapContent, 'utf8');
  await writeFile(resolve(outputDir, 'transformation-evidence.json'), evidenceContent, 'utf8');
  await writeFile(resolve(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return {
    manifest,
    files: filesManifest,
    archiveInfo,
    legacyMappingsCount: legacyMapper.mappings.length,
    totalTargetRows,
    anomalies: result.anomalies,
  };
}
