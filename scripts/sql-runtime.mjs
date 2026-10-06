import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  buildSchemaApproval,
  loadSqlContract,
  recordSchemaApproval,
  resolveAutoBaseline,
  upgradeReceiptError,
  schemaApprovalPath,
  schemaSha256,
  seedRolloutGateError,
  verifySchemaRolloutApproval,
} from './db-schema-rollout-gate.mjs';
import { loadArtifacts } from './sql-artifacts.mjs';
import {
  EMPTY_TABLE_SQL,
  HISTORY_EXISTS_SQL,
  assertLabel,
  buildBootstrapScript,
  buildUpgradeScript,
  psqlTarget,
  readMigrationState,
  redact,
} from './sql-migrate.mjs';
import { executeSqlSeed } from './sql-seed-runner.mjs';

const DESTRUCTIVE = new Set(['force-seed', 'reset', 'force', 'accept-data-loss']);
const PSQL_FLAGS = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'];

export function assertRuntimeApplyEnabled(env) {
  if (env.PMS_SQL_RUNTIME_APPLY !== '1') throw new Error('SQL runtime apply is disabled');
  if (DESTRUCTIVE.has(env.DB_MANAGE_MODE ?? '') || env.ACCEPT_DATA_LOSS === 'true' || env.PRISMA_ACCEPT_DATA_LOSS === 'true') {
    throw new Error('Destructive database mode is refused');
  }
}

export function classifyDatabaseState({ historyExists, tableCount }) {
  const count = Number(tableCount);
  if (!Number.isInteger(count) || count < 0) throw new Error('Unreadable table count');
  if (!historyExists && count === 0) return 'empty-bootstrap';
  if (!historyExists) return 'refuse-populated';
  return 'upgrade';
}

function runPsql(spawn, connection, sqlText, env, secret) {
  const result = spawn('psql', [...PSQL_FLAGS, connection], {
    input: sqlText,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    timeout: 180000,
    windowsHide: true,
    env,
  });
  if (result.error || result.status !== 0) {
    let detail = redact(result.stderr ?? '');
    if (secret) detail = detail.split(secret).join('[redacted-secret]');
    detail = detail.replace(/\s+/g, ' ').trim().slice(0, 180);
    throw new Error(detail ? `SQL command failed: ${detail}` : 'SQL command failed');
  }
  return (result.stdout ?? '').trim();
}

export function createRuntimeQuery(databaseUrl, env, spawn = spawnSync) {
  assertRuntimeApplyEnabled(env);
  if (typeof databaseUrl !== 'string' || databaseUrl.length === 0 || /\s/.test(databaseUrl)) {
    throw new Error('DATABASE_URL is required');
  }
  const { connection, password } = psqlTarget(databaseUrl);
  const childEnv = { ...env };
  if (password !== undefined) childEnv.PGPASSWORD = password;
  return (sqlText) => runPsql(spawn, connection, sqlText, childEnv, password);
}

function rememberBaseline(env, root, baseline, approvalPath) {
  try {
    const schemaHash = schemaSha256(resolve(root, 'prisma/schema.prisma'));
    const contract = loadSqlContract(root);
    const record = buildSchemaApproval(env, schemaHash, contract, baseline);
    recordSchemaApproval(record, approvalPath ?? schemaApprovalPath(root));
  } catch {
    console.error('Schema approval record was not written; schema sync will continue.');
  }
}

export function applyApprovedSchema({ env, query, root = resolve('.'), targetLabel, approvalPath }) {
  assertRuntimeApplyEnabled(env);
  const gateError = verifySchemaRolloutApproval(resolve(root, 'prisma/schema.prisma'), env, root);
  if (gateError) throw new Error(gateError);
  assertLabel(targetLabel);
  const loaded = loadArtifacts(root);
  const historyExists = query(HISTORY_EXISTS_SQL) === 't';
  const tableCount = historyExists ? 1 : Number(query(EMPTY_TABLE_SQL));
  const action = classifyDatabaseState({ historyExists, tableCount });
  if (action === 'refuse-populated') throw new Error('Populated database has no SQL migration history');
  if (action === 'empty-bootstrap') {
    const count = query(EMPTY_TABLE_SQL);
    if (count !== '0') throw new Error('Bootstrap target is not empty');
    query(buildBootstrapScript(loaded, targetLabel));
    rememberBaseline(env, root, { baseline: 'empty-database', receiptPath: null }, approvalPath);
    return { action, applied: [loaded.migrations[0].version], skipped: [] };
  }
  const state = readMigrationState(loaded, query);
  const verified = state.pending.length > 0 ? resolveAutoBaseline(env) : { baseline: 'unverified', receiptPath: null };
  if (state.pending.length > 0) {
    const receiptError = upgradeReceiptError(verified);
    if (receiptError) throw new Error(receiptError);
  }
  rememberBaseline(env, root, verified, approvalPath);
  for (const migration of state.pending) query(buildUpgradeScript(loaded, migration, targetLabel));
  return { action, applied: state.pending.map((item) => item.version), skipped: [...state.applied.keys()] };
}

export function readSeedFingerprint(seedDir) {
  const manifest = JSON.parse(readFileSync(resolve(seedDir, 'manifest.json'), 'utf8'));
  if (!/^[a-f0-9]{64}$/.test(manifest.datasetFingerprint ?? '')) throw new Error('Seed fingerprint is missing');
  return manifest.datasetFingerprint;
}

export async function applyApprovedSeed({ env, query, seedDir, targetLabel, root, databaseUrl }) {
  assertRuntimeApplyEnabled(env);
  if (env.RUN_SEED !== 'true') return { seeded: false };
  readSeedFingerprint(seedDir);
  const seedError = seedRolloutGateError(env);
  if (seedError) throw new Error(seedError);
  const result = await executeSqlSeed({
    seedDir,
    target: databaseUrl,
    targetLabel,
    query,
    env,
    root,
    runtimeApply: true,
  });
  return { seeded: true, fingerprint: result.fingerprint, tables: result.seededTables.map((item) => item.table) };
}

function targetLabelFrom(env) {
  const label = env.APP_ENV ?? '';
  assertLabel(label);
  return label;
}

export async function runRuntime(command, env = process.env, options = {}) {
  assertRuntimeApplyEnabled(env);
  if (command !== 'apply' && command !== 'seed') throw new Error('Unknown SQL runtime command');
  const databaseUrl = env.DATABASE_URL;
  const root = options.root ?? resolve('.');
  const query = options.query ?? createRuntimeQuery(databaseUrl, env, options.spawn);
  const targetLabel = targetLabelFrom(env);
  if (command === 'apply') {
    const schema = applyApprovedSchema({ env, query, root, targetLabel });
    const seedDir = resolve(root, env.SEED_PATH ?? 'database/seeds/sql-master');
    const seed = await applyApprovedSeed({ env, query, seedDir, targetLabel, root, databaseUrl });
    return { schema, seed };
  }
  const seedDir = resolve(root, env.SEED_PATH ?? 'database/seeds/sql-master');
  return applyApprovedSeed({ ...options, env: { ...env, RUN_SEED: 'true' }, query, seedDir, targetLabel, root, databaseUrl });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runRuntime(process.argv[2], process.env).then((result) => {
    const seeded = result.seed?.seeded === true || result.seeded === true;
    if (!seeded) console.log(`RUN_SEED=${process.env.RUN_SEED ?? 'false'} — skipping seed`);
    else console.log('SQL seed completed.');
    console.log('Database step completed.');
  }).catch((error) => {
    const message = error instanceof Error ? error.message : 'SQL runtime failed';
    console.error(redact(message));
    process.exitCode = 1;
  });
}
