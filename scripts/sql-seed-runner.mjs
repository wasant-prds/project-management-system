import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUSINESS_TABLES, loadArtifacts, sha256 } from './sql-artifacts.mjs';
import { assertLabel, assertTargetAllowed, createQuery, redact } from './sql-migrate.mjs';
import { SEED_TABLE_FILES, manifestChecksumFor } from './sql-seed-convert.mjs';

export { BUSINESS_TABLES };

export const SEED_LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtext('pms_sql_seed'))";
export const PRESERVE_TIMESTAMPS_SQL = "SET LOCAL pms.preserve_source_timestamps = 'on'";
const GUARD_DELIMITER = '$pms_seed_guard$';

export function assertSeedTargetAllowed(target, env = process.env) {
  assertTargetAllowed(target, env);
}

export function sanitizeSqlError(message) {
  const redacted = redact(String(message));
  const withoutContext = redacted.split(/\b(?:DETAIL|CONTEXT|LINE \d+)\s*:/i)[0];
  const errorMatch = withoutContext.match(/ERROR:\s*([\s\S]+)/i);
  const body = errorMatch ? errorMatch[1] : withoutContext;
  return body.replace(/'[^']*'/g, "'[redacted]'").replace(/\s+/g, ' ').trim().slice(0, 180) || 'SQL command failed';
}

export function resolveSeedFile(seedDir, fileName) {
  if (typeof fileName !== 'string' || !/^[0-9]{3}_[a-z0-9_]+\.sql$/.test(fileName)) {
    throw new Error('Unsafe seed file name');
  }
  const root = resolve(seedDir);
  const full = resolve(root, fileName);
  const fromRoot = relative(root, full);
  if (fromRoot.startsWith('..') || fromRoot.includes(`..${sep}`) || fromRoot.includes('/') || fromRoot.includes('\\')) {
    throw new Error('Unsafe seed file path');
  }
  return full;
}

function sqlOutsideStringLiterals(sql) {
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
    if (sql[index] === "'") {
      const consumed = consumeSingleQuoted(sql, index);
      outside += ' ';
      index = consumed;
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

function consumeSingleQuoted(sql, start) {
  let index = start + 1;
  while (index < sql.length) {
    if (sql[index] === "'" && sql[index + 1] === "'") {
      index += 2;
      continue;
    }
    if (sql[index] === "'") return index + 1;
    index += 1;
  }
  return sql.length;
}

export function assertSeedSql(sql, table) {
  if (sql.includes(GUARD_DELIMITER)) throw new Error(`Seed file for ${table} contains a reserved delimiter`);
  const outside = sqlOutsideStringLiterals(sql);
  if (/\\/.test(outside) || /\b(?:begin|commit|rollback|drop|truncate|grant|revoke|create|alter|delete|update|copy)\b/i.test(outside)) {
    throw new Error(`Seed file for ${table} contains SQL outside the insert contract`);
  }
  const inserts = outside.match(/INSERT\s+INTO\s+"([a-z0-9_]+)"/gi) ?? [];
  if (inserts.length > 1) throw new Error(`Seed file for ${table} contains more than one insert`);
  const insert = /INSERT\s+INTO\s+"([a-z0-9_]+)"/i.exec(outside);
  if (insert && insert[1] !== table) throw new Error(`Seed file insert target does not match ${table}`);
  if (!insert && /INSERT\s+INTO/i.test(outside)) throw new Error(`Seed file for ${table} has an invalid insert target`);
}

export async function loadSeedManifest(seedDir) {
  const manifestPath = resolve(seedDir, 'manifest.json');
  let raw;
  try {
    raw = await readFile(manifestPath, 'utf8');
  } catch (err) {
    throw new Error(`Failed to read seed manifest: ${err && err.code === 'ENOENT' ? 'file not found' : 'unreadable'}`);
  }
  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch {
    throw new Error('Invalid seed manifest');
  }
  if (!manifest || typeof manifest !== 'object' || !Array.isArray(manifest.tables) || manifest.tables.length === 0) {
    throw new Error('Invalid seed manifest');
  }
  if (manifestChecksumFor(manifest) !== manifest.manifestChecksum) throw new Error('Seed manifest checksum mismatch');
  const expected = SEED_TABLE_FILES.map((entry) => `${entry.table}:${entry.file}`).join(',');
  const actual = manifest.tables.map((entry) => `${entry.table}:${entry.file}`).join(',');
  if (actual !== expected) throw new Error('Seed manifest tables do not match the dataset contract');
  return manifest;
}

export async function verifySeedFilesChecksums(seedDir, manifest) {
  for (const entry of manifest.tables) {
    const filePath = resolveSeedFile(seedDir, entry.file);
    let content;
    try {
      content = await readFile(filePath);
    } catch {
      throw new Error(`Seed file is missing: ${entry.file}`);
    }
    const sql = content.toString('utf8');
    assertSeedSql(sql, entry.table);
    const hasInsert = /INSERT\s+INTO/i.test(sqlOutsideStringLiterals(sql));
    if ((entry.targetRows > 0) !== hasInsert) throw new Error(`Seed file row contract does not match ${entry.file}`);
    const actualChecksum = sha256(content);
    if (actualChecksum !== entry.checksum) throw new Error(`Checksum mismatch for seed file ${entry.file}`);
  }
}

function assertSchemaContract(manifest, root) {
  const artifacts = loadArtifacts(root);
  if (manifest.schema?.targetRevision !== artifacts.revision || manifest.schema?.contractChecksum !== artifacts.migrations[0].checksum) {
    throw new Error('Seed manifest schema contract does not match the SQL artifacts');
  }
  return { revision: artifacts.revision, checksum: artifacts.migrations[0].checksum };
}

export function buildSeedTransaction({ schemaRevision, schemaChecksum, seedSql }) {
  if (!/^\d+\.\d+\.\d+$/.test(schemaRevision) || !/^[0-9a-f]{64}$/.test(schemaChecksum)) {
    throw new Error('Invalid schema contract for seed execution');
  }
  const checks = BUSINESS_TABLES.map((table) => `IF (SELECT count(*) FROM "${table}") <> 0 THEN RAISE EXCEPTION 'nonempty target table ${table}'; END IF;`);
  const align = BUSINESS_TABLES.map((table) => `SELECT public.pms_align_identity('public."${table}"')`);
  return [
    'BEGIN',
    "SET LOCAL lock_timeout = '5000ms'",
    "SET LOCAL statement_timeout = '120000ms'",
    "SET LOCAL TIME ZONE 'Asia/Bangkok'",
    SEED_LOCK_SQL,
    PRESERVE_TIMESTAMPS_SQL,
    `DO ${GUARD_DELIMITER}
BEGIN
  IF (SELECT count(*) FROM "schema_migrations" WHERE "version" = '0001' AND "schema_revision" = '${schemaRevision}' AND "checksum" = '${schemaChecksum}' AND "status" = 'applied') <> 1 THEN
    RAISE EXCEPTION 'schema contract mismatch';
  END IF;
  ${checks.join('\n  ')}
END
${GUARD_DELIMITER}`,
    seedSql,
    ...align,
    'COMMIT',
  ].join(';\n') + ';\n';
}

export function repairIdentityAfterFailedSeed(query) {
  const ready = query("SELECT to_regclass('public.companies') IS NOT NULL") === 't';
  if (!ready) return { repaired: [] };
  const repaired = [];
  for (const table of BUSINESS_TABLES) {
    const count = Number.parseInt(query(`SELECT count(*) FROM "${table}"`), 10);
    if (count === 0) {
      query(`SELECT public.pms_align_identity('public."${table}"')`);
      repaired.push(table);
    }
  }
  return { repaired };
}

export async function executeSqlSeed({
  seedDir = 'database/seeds/sql-master',
  target,
  targetLabel,
  query: customQuery = null,
  env = process.env,
  root = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
  runtimeApply = false,
}) {
  if (runtimeApply) {
    if (env.PMS_SQL_RUNTIME_APPLY !== '1') throw new Error('SQL runtime apply is disabled');
  } else {
    assertSeedTargetAllowed(target, env);
  }
  assertLabel(targetLabel);
  const manifest = await loadSeedManifest(seedDir);
  await verifySeedFilesChecksums(seedDir, manifest);
  const schema = assertSchemaContract(manifest, root);
  const chunks = [];
  for (const entry of manifest.tables) {
    const sql = await readFile(resolveSeedFile(seedDir, entry.file), 'utf8');
    if (sql.trim().length > 0) chunks.push(sql.trim().replace(/;+\s*$/u, ''));
  }
  const transactionSql = buildSeedTransaction({
    schemaRevision: schema.revision,
    schemaChecksum: schema.checksum,
    seedSql: chunks.join(';\n'),
  });
  const query = customQuery ?? createQuery(target, spawnSync, env);
  try {
    query(transactionSql);
  } catch (err) {
    let repairNote = '';
    try {
      repairIdentityAfterFailedSeed(query);
    } catch {
      repairNote = ' Sequence repair failed.';
    }
    throw new Error(`Seed transaction failed and was rolled back: ${sanitizeSqlError(err.message)}.${repairNote}`);
  }
  const verification = [];
  for (const entry of manifest.tables) {
    const actualCount = Number.parseInt(query(`SELECT count(*) FROM "${entry.table}"`), 10);
    if (actualCount !== entry.targetRows) {
      throw new Error(`Verification count mismatch for "${entry.table}": expected ${entry.targetRows}, got ${actualCount}`);
    }
    verification.push({ table: entry.table, rows: actualCount });
  }
  return {
    success: true,
    target,
    targetLabel,
    manifestVersion: manifest.datasetVersion,
    fingerprint: manifest.datasetFingerprint,
    seededTables: verification,
  };
}
