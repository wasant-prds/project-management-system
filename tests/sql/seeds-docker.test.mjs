import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { sha256 } from '../../scripts/sql-artifacts.mjs';
import { createQuery, emptyBootstrap } from '../../scripts/sql-migrate.mjs';
import {
  AUTHORITATIVE_BACKUP_PATH,
  EXPECTED_SOURCE_COUNTS,
  EXPECTED_TOTAL_SOURCE_ROWS,
  generateSqlMasterSeeds,
  manifestChecksumFor,
  parseDumpFile,
} from '../../scripts/sql-seed-convert.mjs';
import { executeSqlSeed, repairIdentityAfterFailedSeed } from '../../scripts/sql-seed-runner.mjs';

const enabled = process.env.PMS_RUN_SQL_SEED_DOCKER_TESTS === '1';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const archivePath = resolve(repoRoot, AUTHORITATIVE_BACKUP_PATH);
const anomalyOldId = 'cpu5h1vk8unjmgbklwsp2w58p';

function safeError(text) {
  return String(text)
    .replace(/postgres(?:ql)?:\/\/\S+/gi, '[redacted-url]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+/gi, '[redacted-email]')
    .replace(/\$2[aby]\$\S+/gi, '[redacted-hash]')
    .slice(0, 400);
}

function sleep(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function docker(args, input) {
  const result = spawnSync('docker', args, {
    input, encoding: 'utf8', windowsHide: true, timeout: 180000, maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(safeError(result.stderr || result.error?.message || 'Docker command failed'));
  return result.stdout ?? '';
}

function queryDatabase(container, database, sql) {
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database, '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], {
    input: sql, encoding: 'utf8', windowsHide: true, timeout: 180000, maxBuffer: 32 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(safeError(result.stderr || result.error?.message || 'SQL command failed'));
  return (result.stdout ?? '').trim();
}

function restoreDump(container, database) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1'], { windowsHide: true });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`Restore failed: ${safeError(stderr)}`));
    });
    const source = createReadStream(archivePath).pipe(createGunzip());
    source.on('error', (err) => {
      child.kill();
      reject(err);
    });
    source.pipe(child.stdin);
  });
}

function holdSeedLock(container) {
  const child = spawn('docker', ['exec', '-i', container, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'], { windowsHide: true });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const done = new Promise((resolvePromise, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`Lock holder failed: ${safeError(stderr)}`));
    });
  });
  child.stdin.end("BEGIN; SELECT pg_advisory_xact_lock(hashtext('pms_sql_seed')); SELECT pg_sleep(15); COMMIT;");
  return done;
}

async function startPostgres(name) {
  docker(['run', '--rm', '-d', '--name', name, '--network', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_USER=postgres', '-e', 'POSTGRES_DB=postgres', 'postgres:16-alpine', '-c', 'timezone=Asia/Bangkok']);
  const query = createQuery(`docker:${name}`, spawnSync, process.env);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      query('SELECT 1');
      return query;
    } catch {
      await sleep(250);
    }
  }
  throw new Error('PostgreSQL fixture did not become ready');
}

async function mutatedArtifacts() {
  const directory = await mkdtemp(join(tmpdir(), 'pms-sql-mutated-'));
  await mkdir(join(directory, 'database', 'migrations'), { recursive: true });
  const schema = Buffer.concat([await readFile(join(repoRoot, 'database', 'schema.sql')), Buffer.from('\n-- isolated checksum fixture\n')]);
  await writeFile(join(directory, 'database', 'schema.sql'), schema);
  const manifest = JSON.parse(await readFile(join(repoRoot, 'database', 'migrations', 'manifest.json'), 'utf8'));
  manifest.migrations[0].checksum = sha256(schema);
  await writeFile(join(directory, 'database', 'migrations', 'manifest.json'), JSON.stringify(manifest));
  return directory;
}

function tupleIdentities(sql) {
  const matches = sql.matchAll(/^\s+\((\d+), '([0-9a-f-]{36})'/gm);
  return [...matches].map((match) => ({ id: match[1], publicId: match[2] })).sort((left, right) => Number(left.id) - Number(right.id));
}

if (!enabled) {
  test('PostgreSQL SQL seed integration is opt-in', { skip: 'set by pnpm test:sql-seeds-docker' }, () => {});
} else {
  test('authoritative restore, guards, sequence repair, and seed replay', { timeout: 300000 }, async () => {
    await access(archivePath);
    const name = `pms-sql32-${randomUUID()}`;
    const seedDir = await mkdtemp(join(tmpdir(), 'pms-sql-dataset-'));
    let mutated = null;
    let tampered = null;
    let canonicalMap = null;
    try {
      canonicalMap = join(repoRoot, 'database/seeds/sql-master/legacy-id-map.json');
      await access(canonicalMap);
    } catch {
      canonicalMap = null;
    }
    try {
      const query = await startPostgres(name);
      const parsed = await parseDumpFile(archivePath);
      await generateSqlMasterSeeds({
        outputDir: seedDir,
        existingMappingsPath: canonicalMap,
      });
      query('CREATE ROLE "pms-root" SUPERUSER LOGIN');
      query('CREATE DATABASE source_restore');
      await restoreDump(name, 'source_restore');
      let restoredRows = 0;
      for (const [table, expected] of Object.entries(EXPECTED_SOURCE_COUNTS)) {
        const actual = Number(queryDatabase(name, 'source_restore', `SELECT count(*) FROM public."${table}"`));
        assert.equal(actual, expected, `${table} restore count`);
        assert.equal(parsed.counts[table], expected, `${table} parser count`);
        restoredRows += actual;
      }
      assert.equal(restoredRows, EXPECTED_TOTAL_SOURCE_ROWS);

      const mutatedRoot = await mutatedArtifacts();
      mutated = mutatedRoot;
      emptyBootstrap({ target: `docker:${name}`, targetLabel: 'sql-seed-test', env: process.env, root: mutatedRoot, spawn: spawnSync });
      await assert.rejects(executeSqlSeed({
        seedDir, target: `docker:${name}`, targetLabel: 'sql-seed-test', env: process.env,
      }), /schema contract mismatch/);
      assert.equal(query('SELECT count(*) FROM companies'), '0');

      query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      emptyBootstrap({ target: `docker:${name}`, targetLabel: 'sql-seed-test', env: process.env, spawn: spawnSync });

      const holder = holdSeedLock(name);
      for (let attempt = 0; attempt < 50; attempt += 1) {
        const held = query("SELECT count(*) FROM pg_stat_activity WHERE query LIKE '%pg_sleep%' AND state = 'active'");
        if (held === '1') break;
        if (attempt === 49) throw new Error('Advisory lock holder did not start');
        await sleep(100);
      }
      await assert.rejects(executeSqlSeed({
        seedDir, target: `docker:${name}`, targetLabel: 'sql-seed-test', env: process.env,
      }), /lock timeout/);
      assert.equal(query('SELECT count(*) FROM companies'), '0');
      await holder;

      let divisionFailed = false;
      try {
        query("BEGIN; INSERT INTO companies (name) VALUES ('probe'); SELECT public.pms_align_identity('public.companies'); SELECT 1/0; COMMIT;");
      } catch (err) {
        divisionFailed = /division by zero/i.test(err.message);
        if (!divisionFailed) throw err;
      }
      assert.equal(divisionFailed, true);
      assert.equal(query("SELECT last_value::text || ':' || is_called::text FROM companies_id_seq"), '1:true');
      assert.equal(query('SELECT count(*) FROM companies'), '0');
      repairIdentityAfterFailedSeed(query);
      assert.equal(query("SELECT last_value::text || ':' || is_called::text FROM companies_id_seq"), '1:false');

      const tamperedDir = await mkdtemp(join(tmpdir(), 'pms-sql-tamper-'));
      tampered = tamperedDir;
      await cp(seedDir, tamperedDir, { recursive: true });
      const tamperSql = 'INSERT INTO "companies" ("name") VALUES (\'probe\');\nSELECT 1/0\n';
      await writeFile(join(tamperedDir, '010_companies.sql'), tamperSql);
      const tamperManifest = JSON.parse(await readFile(join(tamperedDir, 'manifest.json'), 'utf8'));
      const companies = tamperManifest.tables.find((entry) => entry.file === '010_companies.sql');
      companies.checksum = sha256(Buffer.from(tamperSql, 'utf8'));
      delete tamperManifest.manifestChecksum;
      tamperManifest.manifestChecksum = manifestChecksumFor(tamperManifest);
      await writeFile(join(tamperedDir, 'manifest.json'), `${JSON.stringify(tamperManifest, null, 2)}\n`);
      await assert.rejects(executeSqlSeed({
        seedDir: tamperedDir, target: `docker:${name}`, targetLabel: 'sql-seed-test', env: process.env,
      }), /Seed transaction failed/);
      assert.equal(query('SELECT count(*) FROM companies'), '0');
      assert.equal(query("SELECT last_value::text || ':' || is_called::text FROM companies_id_seq"), '1:false');

      const seeded = await executeSqlSeed({
        seedDir, target: `docker:${name}`, targetLabel: 'sql-seed-test', env: process.env,
      });
      assert.equal(seeded.success, true);
      await assert.rejects(executeSqlSeed({
        seedDir, target: `docker:${name}`, targetLabel: 'sql-seed-test', env: process.env,
      }), /nonempty target table/);
      assert.equal(query('SELECT count(*) FROM companies'), '2');

      const sourceHours = queryDatabase(name, 'source_restore', 'SELECT sum(hours)::text FROM public."TimeEntry"');
      const targetHours = query('SELECT sum(hours)::text FROM work_logs');
      assert.equal(targetHours, sourceHours);
      assert.equal(Number(targetHours), 1828);
      assert.equal(query("SELECT count(*) FROM project_documents WHERE file_url LIKE '/documents/%'"), '3');
      assert.equal(query('SELECT count(*) FROM external_project_mappings'), '0');
      assert.equal(query("SELECT entity || ':' || count(*)::text FROM activity_logs GROUP BY entity ORDER BY 1"), 'project:1\ntask:3');
      assert.equal(query("SELECT last_value::text || ':' || is_called::text FROM companies_id_seq"), '2:true');
      assert.equal(query("SELECT last_value::text || ':' || is_called::text FROM work_items_id_seq"), '286:true');
      assert.equal(query("SELECT last_value::text || ':' || is_called::text FROM external_project_mappings_id_seq"), '1:false');

      const map = JSON.parse(await readFile(join(seedDir, 'legacy-id-map.json'), 'utf8'));
      const anomaly = map.find((row) => row.entityName === 'work_items' && row.oldId === anomalyOldId);
      assert.ok(anomaly);
      assert.match(anomaly.newPublicId, /^[0-9a-f-]{36}$/);
      const stamps = query(`SELECT created_at::text || '|' || updated_at::text FROM work_items WHERE public_id = '${anomaly.newPublicId}'`);
      const [createdAt, updatedAt] = stamps.split('|');
      assert.equal(createdAt.startsWith('2026-08-21'), true);
      assert.equal(updatedAt.startsWith('2026-08-17'), true);
      assert.equal(updatedAt < createdAt, true);

      const changed = query(`WITH old AS (SELECT id, updated_at FROM projects ORDER BY id LIMIT 1), changed AS (UPDATE projects SET color = COALESCE(color, '') || 'x' WHERE id = (SELECT id FROM old) RETURNING id, updated_at) SELECT old.updated_at::text || '|' || changed.updated_at::text FROM old JOIN changed ON changed.id = old.id`);
      const [before, after] = changed.split('|');
      assert.notEqual(before, after);

      for (const fileName of ['010_companies.sql', '020_users.sql', '030_projects.sql', '050_work_items.sql']) {
        const table = fileName.slice(4, -4);
        const identities = tupleIdentities(await readFile(join(seedDir, fileName), 'utf8'));
        const stored = query(`SELECT id::text || ' ' || public_id FROM "${table}" ORDER BY id`).split('\n');
        assert.equal(stored.length, identities.length, table);
        stored.forEach((line, index) => {
          assert.equal(line, `${identities[index].id} ${identities[index].publicId}`, table);
        });
      }
      await rm(mutated, { recursive: true, force: true });
      await rm(tampered, { recursive: true, force: true });
    } finally {
      spawnSync('docker', ['rm', '-f', name], { windowsHide: true });
      await rm(seedDir, { recursive: true, force: true });
      if (mutated) await rm(mutated, { recursive: true, force: true });
      if (tampered) await rm(tampered, { recursive: true, force: true });
    }
  });

  test('migrate image context excludes staged SQL master seeds', { timeout: 180000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pms-sql-context-'));
    const dockerfile = join(directory, 'Dockerfile');
    const image = `pms-sql32-context-${randomUUID()}`;
    await writeFile(dockerfile, [
      'FROM postgres:16-alpine',
      'COPY database/seeds /seeds',
      'COPY database/seed-policy/issue-32.json /policy.json',
      'RUN test ! -e /seeds/sql-master',
      'RUN test -d /seeds/master',
      'RUN test -s /policy.json',
      '',
    ].join('\n'));
    try {
      docker(['build', '-f', dockerfile, '-t', image, repoRoot]);
    } finally {
      spawnSync('docker', ['rmi', '-f', image], { windowsHide: true });
      await rm(directory, { recursive: true, force: true });
    }
  });
}
