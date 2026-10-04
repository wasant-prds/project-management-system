import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertExecutableSql, sha256 } from '../../scripts/sql-artifacts.mjs';
import {
  assertTargetAllowed,
  buildBootstrapScript,
  createQuery,
  emptyBootstrap,
  inspect,
  plan,
  psqlTarget,
  redact,
  runCli,
  upgrade,
} from '../../scripts/sql-migrate.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const label = 'unit';
const target = 'docker:pms-sql-unit';

function scripted(responses) {
  const calls = [];
  return {
    calls,
    query(sql) {
      calls.push(sql);
      const next = responses.shift();
      if (next instanceof Error) throw next;
      return next ?? '';
    },
  };
}

async function tempArtifacts(schemaSql, extra = []) {
  const directory = await mkdtemp(join(tmpdir(), 'pms-sql-'));
  await mkdir(join(directory, 'database', 'migrations'), { recursive: true });
  await writeFile(join(directory, 'database', 'schema.sql'), schemaSql);
  const migrations = [
    { version: '0001', name: 'initial_schema', kind: 'baseline_snapshot', script: 'database/schema.sql', checksum: sha256(schemaSql) },
    ...extra,
  ];
  const manifest = { revision: '31.0.0', lockTimeoutMs: 5000, statementTimeoutMs: 120000, migrations };
  await writeFile(join(directory, 'database', 'migrations', 'manifest.json'), JSON.stringify(manifest));
  return directory;
}

test('TC-31-11 inspect reports the baseline checksum and a rerun plan skips it before SQL writes', () => {
  const info = inspect({ root });
  assert.equal(info.revision, '31.0.0');
  assert.equal(info.migrations.length, 1);
  const state = scripted(['t', `0001 ${info.migrations[0].checksum}`]);
  const planned = plan({ root, target, targetLabel: label, query: state.query, env: {} });
  assert.deepEqual(planned.pending, []);
  assert.deepEqual(planned.skipped, ['0001']);
  assert.equal(state.calls.length, 2);
  assert.equal(state.calls.some((sql) => sql.includes('INSERT INTO')), false);
});

test('TC-31-11 changed applied checksum fails before another migration script runs', () => {
  const state = scripted(['t', `0001 ${'a'.repeat(64)}`]);
  assert.throws(() => upgrade({ root, target, targetLabel: label, query: state.query, env: {} }), /Applied checksum mismatch for migration 0001/);
  assert.equal(state.calls.length, 2);
});

test('TC-31-13 nontransactional SQL and caller-owned transactions are rejected before queries', async () => {
  const concurrent = await tempArtifacts('CREATE INDEX CONCURRENTLY "bad" ON "companies" ("name");\n');
  const transactional = await tempArtifacts('BEGIN;\nCREATE TABLE "bad" (id integer);\n');
  try {
    let calls = 0;
    const query = () => { calls += 1; return '0'; };
    assert.throws(() => emptyBootstrap({ root: concurrent, target, targetLabel: label, query, env: {} }), /Nontransactional SQL is rejected before execution/);
    assert.throws(() => emptyBootstrap({ root: transactional, target, targetLabel: label, query, env: {} }), /must not own the transaction/);
    assert.equal(calls, 0);
  } finally {
    await rm(concurrent, { recursive: true, force: true });
    await rm(transactional, { recursive: true, force: true });
  }
});

test('TC-31-14 unsafe paths, duplicate versions, nonempty targets and the application database are rejected', async () => {
  const duplicate = await tempArtifacts('CREATE TABLE "marker" (id integer);\n');
  const manifest = {
    revision: '31.0.0',
    lockTimeoutMs: 5000,
    statementTimeoutMs: 120000,
    migrations: [
      { version: '0001', name: 'initial_schema', kind: 'baseline_snapshot', script: 'database/schema.sql', checksum: sha256('CREATE TABLE "marker" (id integer);\n') },
      { version: '0001', name: 'again', kind: 'sql', script: 'database/migrations/again.sql', checksum: sha256('SELECT 1;\n') },
    ],
  };
  await writeFile(join(duplicate, 'database', 'migrations', 'again.sql'), 'SELECT 1;\n');
  await writeFile(join(duplicate, 'database', 'migrations', 'manifest.json'), JSON.stringify(manifest));
  const traversal = await tempArtifacts('SELECT 1;\n');
  const traversalManifest = JSON.parse(await readFile(join(traversal, 'database', 'migrations', 'manifest.json'), 'utf8'));
  traversalManifest.migrations[0].script = 'database/../../secret.sql';
  await writeFile(join(traversal, 'database', 'migrations', 'manifest.json'), JSON.stringify(traversalManifest));
  try {
    assert.throws(() => inspect({ root: duplicate }), /Duplicate migration version 0001/);
    assert.throws(() => inspect({ root: traversal }), /Unsafe SQL artifact path/);
    const nonempty = scripted(['2']);
    assert.throws(() => emptyBootstrap({ root, target, targetLabel: label, query: nonempty.query, env: {} }), /Bootstrap target is not empty/);
    assert.equal(nonempty.calls.length, 1);
    const populated = scripted(['f', '4']);
    assert.throws(() => plan({ root, target, targetLabel: label, query: populated.query, env: {} }), /Unsupported baseline/);
    const url = 'postgresql://owner:secret-token@db.internal/app';
    assert.throws(() => emptyBootstrap({
      root, target: url, targetLabel: label, env: { DATABASE_URL: url }, query: () => { throw new Error('query should not run'); },
    }), /active application database/);
  } finally {
    await rm(duplicate, { recursive: true, force: true });
    await rm(traversal, { recursive: true, force: true });
  }
});

test('TC-31-12 bootstrap script takes the migration lock and records history without a connection string', () => {
  const info = inspect({ root });
  const script = buildBootstrapScript({
    revision: info.revision,
    lockTimeoutMs: info.lockTimeoutMs,
    statementTimeoutMs: info.statementTimeoutMs,
    migrations: [{ version: '0001', checksum: info.migrations[0].checksum, script: info.migrations[0].script, sql: 'SELECT 1' }],
  }, label);
  assert.match(script, /pg_advisory_xact_lock\(hashtext\('pms-sql-migrate'\)\)/);
  assert.match(script, /lock_timeout = '5000ms'/);
  assert.match(script, /bootstrap target is not empty/);
  assert.match(script, /INSERT INTO "schema_migrations"/);
  assert.doesNotMatch(script, /postgres(?:ql)?:\/\//i);
  assert.match(script, /COMMIT/);
});

test('TC-31-16 runner errors redact connection strings', () => {
  const url = 'postgresql://owner:secret-token@db.internal/app';
  const query = createQuery(url, () => ({ status: 1, stderr: `connection failed ${url}`, stdout: '' }), {});
  assert.throws(() => query('SELECT 1'), (error) => {
    assert.equal(error.message.includes('secret-token'), false);
    assert.match(error.message, /\[redacted-url\]/);
    return true;
  });
  assert.equal(redact(`failed ${url}`).includes('secret-token'), false);
  const errors = [];
  const code = runCli(['empty-bootstrap', '--target', url, '--target-label', label], { DATABASE_URL: url }, {
    log() {},
    error(message) { errors.push(message); },
  });
  assert.equal(code, 1);
  assert.equal(errors.join('\n').includes('secret-token'), false);
});

test('TC-31-13 a failed migration script does not continue into another write', () => {
  const state = scripted(['0', new Error('SQL command failed: division by zero')]);
  assert.throws(() => emptyBootstrap({ root, target, targetLabel: label, query: state.query, env: {} }), /division by zero/);
  assert.equal(state.calls.length, 2);
  assert.match(state.calls[1], /BEGIN/);
  assert.match(state.calls[1], /COMMIT/);
});

test('TC-31-13 mismatched dollar quotes and literals do not hide guarded SQL', () => {
  assert.throws(() => assertExecutableSql('$tag$ BEGIN; $other$;\n', false), /must not own the transaction/);
  assert.throws(
    () => assertExecutableSql("SELECT '--'; CREATE INDEX CONCURRENTLY bad ON \"companies\" (name);\n", false),
    /Nontransactional SQL is rejected before execution/,
  );
  assertExecutableSql("SELECT 'BEGIN';\nSELECT 'CREATE INDEX CONCURRENTLY';\n", false);
  assertExecutableSql('CREATE FUNCTION f() RETURNS void LANGUAGE plpgsql AS $fn$\nBEGIN\n  RETURN;\nEND;\n$fn$;\n', false);
});

test('TC-31-14 equivalent application targets are refused before a query', () => {
  const active = 'postgres://owner:secret-token@db.internal/app';
  const equivalent = [
    'postgresql://other:other-secret@DB.internal:5432/app?sslmode=require',
    'postgresql://owner:secret-token@db.internal/app/',
    'postgresql://db.internal/app?dbname=ignored',
  ];
  for (const candidate of equivalent) {
    assert.throws(() => emptyBootstrap({
      root,
      target: candidate,
      targetLabel: label,
      env: { DATABASE_URL: active },
      query: () => { throw new Error('query should not run'); },
    }), /active application database/);
  }
  assert.doesNotThrow(() => assertTargetAllowed('postgresql://owner:secret@db.internal/other', { DATABASE_URL: active }));
  assert.throws(() => assertTargetAllowed('docker:pms-postgres-dev', {}), /active application database/);
  assert.throws(() => assertTargetAllowed('docker:pms-postgres-lab', { APP_ENV: 'lab' }), /active application database/);
  assert.doesNotThrow(() => assertTargetAllowed('docker:pms-sql31-lab', { APP_ENV: 'dev', DATABASE_URL: active }));
});

test('TC-31-16 URL target keeps the password out of process arguments', () => {
  const url = 'postgresql://owner:secret-token@db.internal:5432/app?sslmode=require';
  const encoded = 'postgresql://owner:p%40ss%3Aword@db.internal/app';
  let seen;
  const query = createQuery(url, (command, args, options) => {
    seen = { command, args, env: options.env };
    return { status: 1, stdout: '', stderr: 'failed secret-token postgresql://owner:secret-token@db.internal/app' };
  }, { PATH: 'kept' });
  assert.throws(() => query('SELECT 1'), (error) => {
    assert.equal(error.message.includes('secret-token'), false);
    assert.match(error.message, /\[redacted-secret\]/);
    assert.match(error.message, /\[redacted-url\]/);
    return true;
  });
  assert.equal(seen.command, 'psql');
  assert.equal(seen.args.join('\n').includes('secret-token'), false);
  assert.equal(seen.args.at(-1), 'postgresql://owner@db.internal:5432/app?sslmode=require');
  assert.equal(seen.env.PGPASSWORD, 'secret-token');
  assert.equal(seen.env.PATH, 'kept');
  const special = psqlTarget(encoded);
  assert.equal(special.password, 'p@ss:word');
  assert.equal(special.connection.includes('p@ss'), false);
  assert.equal(special.connection.includes('p%40ss'), false);
  assert.equal(psqlTarget('postgresql://owner@db.internal/app').password, undefined);
});
