import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadArtifacts } from './sql-artifacts.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const COMMANDS = new Set(['inspect', 'status', 'plan', 'empty-bootstrap', 'upgrade']);
const FLAGS = new Set(['target', 'target-label', 'artifacts']);
const LABEL = /^(?:[a-z][a-z0-9-]{0,40})$/;
export const DOCKER_SHELL = 'export PGTZ=Asia/Bangkok PGOPTIONS="-c timezone=Asia/Bangkok" PGCLIENTENCODING=UTF8; exec "$@" -U "$POSTGRES_USER" -d "$POSTGRES_DB"';
const PSQL_FLAGS = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'];
const PSQL_ARGS = ['psql', ...PSQL_FLAGS];
const APP_ENVS = ['local', 'dev', 'uat', 'prod'];

export const EMPTY_TABLE_SQL = "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r'";
export const HISTORY_EXISTS_SQL = "SELECT to_regclass('public.schema_migrations') IS NOT NULL";
export const APPLIED_SQL = `SELECT "version" || ' ' || "checksum" FROM "schema_migrations" ORDER BY "version", "id"`;

export function redact(text) {
  return String(text)
    .replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted-url]')
    .replace(/\b[\w.+-]+:[^@\s/]+@/g, '[redacted-secret]@');
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  if (!COMMANDS.has(command)) throw new Error('Unknown SQL migration command');
  const flags = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) throw new Error('Unexpected SQL migration argument');
    const name = token.slice(2);
    if (!FLAGS.has(name)) throw new Error('Unexpected SQL migration argument');
    const value = rest[index + 1];
    if (!value || value.startsWith('--')) throw new Error('Missing SQL migration flag value');
    if (Object.hasOwn(flags, name)) throw new Error('Duplicate SQL migration flag');
    flags[name] = value;
    index += 1;
  }
  if (command !== 'inspect' && (!flags.target || !flags['target-label'])) throw new Error('Explicit SQL target is required');
  return { command, flags };
}

export function databaseIdentity(target) {
  let url;
  try {
    url = new URL(target);
  } catch {
    return null;
  }
  const protocol = url.protocol.replace(/:$/, '');
  if (protocol !== 'postgresql' && protocol !== 'postgres') return null;
  const pathDatabase = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/g, '');
  const database = pathDatabase || decodeURIComponent(url.searchParams.get('dbname') ?? '');
  if (!database || database.includes('/')) return null;
  return { host: url.hostname.toLowerCase(), port: url.port || '5432', database };
}

function sameDatabase(left, right) {
  return left.host === right.host && left.port === right.port && left.database === right.database;
}

function applicationPostgresContainers(env) {
  const names = new Set(APP_ENVS.map((name) => `pms-postgres-${name}`));
  if (typeof env.APP_ENV === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(env.APP_ENV)) {
    names.add(`pms-postgres-${env.APP_ENV}`);
  }
  return names;
}

export function assertTargetAllowed(target, env) {
  if (typeof target !== 'string' || target.length === 0 || /\s/.test(target)) throw new Error('Explicit SQL target is required');
  if (target.startsWith('docker:')) {
    const name = target.slice('docker:'.length);
    if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(name)) throw new Error('Invalid Docker SQL target');
    if (applicationPostgresContainers(env).has(name)) throw new Error('Refusing the active application database target');
    return;
  }
  if (target.startsWith('postgresql://') || target.startsWith('postgres://')) {
    const identity = databaseIdentity(target);
    const active = env.DATABASE_URL ? databaseIdentity(env.DATABASE_URL) : null;
    if (!identity) throw new Error('Unsupported SQL target');
    if (active && sameDatabase(identity, active)) throw new Error('Refusing the active application database target');
    return;
  }
  throw new Error('Unsupported SQL target');
}

function decodeUserinfo(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function psqlTarget(target) {
  const url = new URL(target);
  const password = url.password === '' ? undefined : decodeUserinfo(url.password);
  url.password = '';
  const connection = url.toString().replace(/^(postgres(?:ql)?:\/\/[^@/]*):@/i, '$1@');
  const at = connection.indexOf('@');
  const credentials = at === -1 ? connection : connection.slice(connection.indexOf('://') + 3, at);
  if (password !== undefined && (at === -1 || credentials.includes(':'))) {
    throw new Error('SQL target password remained in the connection arguments');
  }
  return { connection, password };
}

export function assertLabel(targetLabel) {
  if (!LABEL.test(targetLabel ?? '')) throw new Error('Invalid SQL target label');
}

function runSpawn(spawn, command, args, sqlText, env, secret) {
  const options = {
    input: sqlText,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 180000,
    windowsHide: true,
  };
  if (env) options.env = env;
  const result = spawn(command, args, options);
  if (result.error || result.status !== 0) {
    let detail = redact(result.stderr ?? '');
    if (secret) detail = detail.split(secret).join('[redacted-secret]');
    detail = detail.replace(/\s+/g, ' ').trim().slice(0, 400);
    throw new Error(detail ? `SQL command failed: ${detail}` : 'SQL command failed');
  }
  return (result.stdout ?? '').trim();
}

export function createQuery(target, spawn = spawnSync, env = process.env) {
  assertTargetAllowed(target, env);
  if (target.startsWith('docker:')) {
    const name = target.slice('docker:'.length);
    return (sqlText) => runSpawn(spawn, 'docker', ['exec', '-i', name, 'sh', '-c', DOCKER_SHELL, 'sql-migrate', ...PSQL_ARGS], sqlText);
  }
  const { connection, password } = psqlTarget(target);
  const childEnv = { ...env };
  if (password !== undefined) childEnv.PGPASSWORD = password;
  return (sqlText) => runSpawn(spawn, 'psql', [...PSQL_FLAGS, connection], sqlText, childEnv, password);
}

function timeoutLiteral(value) {
  if (!Number.isInteger(value)) throw new Error('Invalid migration timeout');
  return String(value);
}

function assertToken(value, pattern, message) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(message);
}

function historyInsert(migration, revision, targetLabel) {
  assertToken(migration.version, /^(?:[0-9]{4})$/, 'Invalid migration version');
  assertToken(migration.checksum, /^(?:[0-9a-f]{64})$/, 'Invalid migration checksum');
  assertToken(revision, /^(?:[0-9]+\.[0-9]+\.[0-9]+)$/, 'Invalid schema revision');
  assertToken(migration.script, /^database(?:\/[A-Za-z0-9._-]+)+$/, 'Unsafe SQL artifact path');
  assertLabel(targetLabel);
  return `INSERT INTO "schema_migrations" ("version", "checksum", "schema_revision", "status", "script_name", "target_label") VALUES ('${migration.version}', '${migration.checksum}', '${revision}', 'applied', '${migration.script}', '${targetLabel}')`;
}

function trimStatement(sql) {
  return sql.trim().replace(/;+\s*$/u, '');
}

function sessionPrefix(loaded) {
  const lock = timeoutLiteral(loaded.lockTimeoutMs);
  const statement = timeoutLiteral(loaded.statementTimeoutMs);
  return [
    'BEGIN',
    `SET LOCAL lock_timeout = '${lock}ms'`,
    `SET LOCAL statement_timeout = '${statement}ms'`,
    "SET LOCAL TIME ZONE 'Asia/Bangkok'",
    "SELECT pg_advisory_xact_lock(hashtext('pms-sql-migrate'))",
  ];
}

export function buildBootstrapScript(loaded, targetLabel) {
  const baseline = loaded.migrations[0];
  assertLabel(targetLabel);
  const guard = `DO $pms_migrate_guard$
BEGIN
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r') > 0 THEN
    RAISE EXCEPTION 'bootstrap target is not empty';
  END IF;
END
$pms_migrate_guard$`;
  return [...sessionPrefix(loaded), guard, trimStatement(baseline.sql), historyInsert(baseline, loaded.revision, targetLabel), 'COMMIT', ''].join(';\n');
}

export function buildUpgradeScript(loaded, migration, targetLabel) {
  assertLabel(targetLabel);
  const guard = `DO $pms_migrate_guard$
BEGIN
  IF EXISTS (SELECT 1 FROM "schema_migrations" WHERE "version" = '${migration.version}') THEN
    RAISE EXCEPTION 'migration version already applied';
  END IF;
END
$pms_migrate_guard$`;
  return [...sessionPrefix(loaded), guard, trimStatement(migration.sql), historyInsert(migration, loaded.revision, targetLabel), 'COMMIT', ''].join(';\n');
}

function executorFor(options) {
  assertTargetAllowed(options.target, options.env);
  assertLabel(options.targetLabel);
  return options.query ?? createQuery(options.target, options.spawn, options.env);
}

export function inspect({ root = defaultRoot } = {}) {
  const loaded = loadArtifacts(root);
  return {
    command: 'inspect',
    revision: loaded.revision,
    lockTimeoutMs: loaded.lockTimeoutMs,
    statementTimeoutMs: loaded.statementTimeoutMs,
    migrations: loaded.migrations.map(({ version, name, kind, script, checksum }) => ({ version, name, kind, script, checksum })),
  };
}

function parseApplied(text) {
  const applied = new Map();
  if (!text) return applied;
  for (const line of text.split('\n')) {
    const match = /^([0-9]{4}) ([0-9a-f]{64})$/.exec(line);
    if (!match) throw new Error('Unreadable migration history');
    if (applied.has(match[1])) throw new Error(`Duplicate applied migration version ${match[1]}`);
    applied.set(match[1], match[2]);
  }
  return applied;
}

export function readMigrationState(loaded, query) {
  const exists = query(HISTORY_EXISTS_SQL);
  if (exists !== 't') {
    const count = query(EMPTY_TABLE_SQL);
    if (count !== '0') throw new Error('Unsupported baseline on a populated database');
    throw new Error('Empty database requires empty-bootstrap');
  }
  const applied = parseApplied(query(APPLIED_SQL));
  for (const [version, checksum] of applied) {
    const migration = loaded.migrations.find((item) => item.version === version);
    if (!migration) throw new Error(`Applied migration is missing from artifacts: ${version}`);
    if (migration.checksum !== checksum) throw new Error(`Applied checksum mismatch for migration ${version}`);
  }
  const pending = loaded.migrations.filter((item) => !applied.has(item.version));
  return { applied, pending };
}

export function emptyBootstrap(options) {
  const loaded = loadArtifacts(options.root ?? defaultRoot);
  const query = executorFor(options);
  const count = query(EMPTY_TABLE_SQL);
  if (count !== '0') throw new Error('Bootstrap target is not empty');
  query(buildBootstrapScript(loaded, options.targetLabel));
  return { command: 'empty-bootstrap', applied: [loaded.migrations[0].version], skipped: [], revision: loaded.revision };
}

export function plan(options) {
  const loaded = loadArtifacts(options.root ?? defaultRoot);
  const state = readMigrationState(loaded, executorFor(options));
  return {
    command: 'plan',
    applied: [],
    skipped: [...state.applied.keys()],
    pending: state.pending.map((item) => item.version),
    revision: loaded.revision,
  };
}

export function status(options) {
  return { ...plan(options), command: 'status' };
}

export function upgrade(options) {
  const loaded = loadArtifacts(options.root ?? defaultRoot);
  const query = executorFor(options);
  const state = readMigrationState(loaded, query);
  for (const migration of state.pending) query(buildUpgradeScript(loaded, migration, options.targetLabel));
  return {
    command: 'upgrade',
    applied: state.pending.map((item) => item.version),
    skipped: [...state.applied.keys()],
    revision: loaded.revision,
  };
}

export function runCli(argv, env = process.env, logger = console) {
  try {
    const parsed = parseArgs(argv);
    const root = parsed.flags.artifacts ?? defaultRoot;
    if (parsed.command === 'inspect') {
      logger.log(JSON.stringify(inspect({ root }), null, 2));
      return 0;
    }
    const options = { root, target: parsed.flags.target, targetLabel: parsed.flags['target-label'], env };
    const handlers = { status, plan, 'empty-bootstrap': emptyBootstrap, upgrade };
    logger.log(JSON.stringify(handlers[parsed.command](options), null, 2));
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'SQL migration failed';
    logger.error(redact(message));
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runCli(process.argv.slice(2));
}
