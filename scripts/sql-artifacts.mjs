import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

export const BUSINESS_TABLES = Object.freeze([
  'users',
  'companies',
  'projects',
  'project_members',
  'work_items',
  'external_project_mappings',
  'external_work_item_references',
  'project_milestones',
  'project_documents',
  'work_logs',
  'activity_logs',
]);
export const TECHNICAL_TABLES = Object.freeze(['schema_migrations']);
export const MUTABLE_TIMESTAMP_TABLES = Object.freeze(
  BUSINESS_TABLES.filter((name) => name !== 'activity_logs'),
);

const VERSION = /^(?:[0-9]{4})$/;
const CHECKSUM = /^(?:[0-9a-f]{64})$/;
const REVISION = /^(?:[0-9]+\.[0-9]+\.[0-9]+)$/;
const SCRIPT_PATH = /^database(?:\/[A-Za-z0-9._-]+)+$/;
const MIGRATION_NAME = /^(?:[a-z0-9_]+)$/;
const NONTRANSACTIONAL = [
  /\bconcurrently\b/i,
  /\bvacuum\b/i,
  /\bcopy\b[\s\S]{0,80}\bprogram\b/i,
  /^\s*\\/m,
  /\bcreate\s+database\b/i,
  /\bdrop\s+database\b/i,
  /\balter\s+system\b/i,
  /\bcreate\s+role\b/i,
  /\bgrant\b/i,
  /\brevoke\b/i,
  /\bdrop\s+schema\b/i,
];

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function assertSafeRelativePath(script) {
  if (typeof script !== 'string' || !SCRIPT_PATH.test(script) || script.includes('..')) {
    throw new Error('Unsafe SQL artifact path');
  }
}

function consumeQuoted(sql, start, quote) {
  let index = start + 1;
  while (index < sql.length) {
    if (sql[index] === quote && sql[index + 1] === quote) {
      index += 2;
      continue;
    }
    if (sql[index] === quote) return index + 1;
    index += 1;
  }
  return sql.length;
}

export function sqlOutsideQuotes(sql) {
  let outside = '';
  let index = 0;
  while (index < sql.length) {
    if (sql.startsWith('--', index)) {
      const newline = sql.indexOf('\n', index);
      index = newline === -1 ? sql.length : newline;
      outside += ' ';
      continue;
    }
    if (sql.startsWith('/*', index)) {
      const end = sql.indexOf('*/', index + 2);
      index = end === -1 ? sql.length : end + 2;
      outside += ' ';
      continue;
    }
    if (sql[index] === "'" || sql[index] === '"') {
      index = consumeQuoted(sql, index, sql[index]);
      outside += ' ';
      continue;
    }
    const dollar = /^\$([A-Za-z0-9_]*)\$/.exec(sql.slice(index));
    if (dollar) {
      const close = `$${dollar[1]}$`;
      const end = sql.indexOf(close, index + dollar[0].length);
      if (end !== -1) {
        index = end + close.length;
        outside += ' ';
        continue;
      }
    }
    outside += sql[index];
    index += 1;
  }
  return outside;
}

export function assertExecutableSql(sql, baseline) {
  const outside = sqlOutsideQuotes(sql);
  if (NONTRANSACTIONAL.some((pattern) => pattern.test(outside))) {
    throw new Error('Nontransactional SQL is rejected before execution. No partial history is written.');
  }
  if (/\b(?:begin|commit|rollback)\b/i.test(outside)) throw new Error('SQL artifact must not own the transaction');
  if (!baseline) return;
  const changesData = /\binsert\s+into\b/i.test(outside)
    || /\bdelete\s+from\b/i.test(outside)
    || /\btruncate\b/i.test(outside)
    || /\bupdate\b[^;]*\bset\b/i.test(outside);
  if (changesData) throw new Error('Baseline snapshot must not contain data changes');
}

function assertIntegerRange(value, minimum, maximum, message) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(message);
}

function readCheckedFile(root, script) {
  assertSafeRelativePath(script);
  const full = resolve(root, ...script.split('/'));
  const rootPath = resolve(root);
  if (full !== rootPath && !full.startsWith(`${rootPath}${sep}`)) throw new Error('Unsafe SQL artifact path');
  return readFileSync(full);
}

function migrationRecord(entry, index, bytes) {
  if (!entry || typeof entry !== 'object') throw new Error('Invalid migration manifest entry');
  if (!VERSION.test(entry.version ?? '')) throw new Error('Invalid migration version');
  if (!MIGRATION_NAME.test(entry.name ?? '')) throw new Error('Invalid migration name');
  if (!CHECKSUM.test(entry.checksum ?? '')) throw new Error('Invalid migration checksum');
  assertSafeRelativePath(entry.script);
  const baseline = index === 0;
  if (baseline && (entry.version !== '0001' || entry.kind !== 'baseline_snapshot' || entry.script !== 'database/schema.sql')) {
    throw new Error('Version 0001 must be the schema snapshot baseline');
  }
  if (!baseline && (entry.kind !== 'sql' || !entry.script.startsWith('database/migrations/'))) {
    throw new Error('Later migrations must be SQL files');
  }
  const checksum = sha256(bytes);
  if (checksum !== entry.checksum) throw new Error(`Artifact checksum mismatch for migration ${entry.version}`);
  const sql = bytes.toString('utf8');
  assertExecutableSql(sql, baseline);
  return {
    version: entry.version,
    name: entry.name,
    kind: entry.kind,
    script: entry.script,
    checksum,
    sql,
  };
}

export function loadArtifacts(root) {
  const manifestBytes = readCheckedFile(root, 'database/migrations/manifest.json');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (!REVISION.test(manifest.revision ?? '')) throw new Error('Invalid schema revision');
  assertIntegerRange(manifest.lockTimeoutMs, 1000, 60000, 'Invalid lock timeout');
  assertIntegerRange(manifest.statementTimeoutMs, 1000, 300000, 'Invalid statement timeout');
  if (!Array.isArray(manifest.migrations) || manifest.migrations.length === 0) throw new Error('Migration manifest is empty');
  const migrations = manifest.migrations.map((entry, index) => migrationRecord(entry, index, readCheckedFile(root, entry.script)));
  const versions = new Set();
  for (let index = 0; index < migrations.length; index += 1) {
    const version = migrations[index].version;
    if (versions.has(version)) throw new Error(`Duplicate migration version ${version}`);
    versions.add(version);
    if (index > 0 && Number(version) <= Number(migrations[index - 1].version)) throw new Error('Migration versions are not ordered');
  }
  return {
    revision: manifest.revision,
    lockTimeoutMs: manifest.lockTimeoutMs,
    statementTimeoutMs: manifest.statementTimeoutMs,
    migrations,
  };
}
