import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ROOT } from './support.mjs'
import { loadArtifacts } from '../../scripts/sql-artifacts.mjs'
import { buildBootstrapScript, emptyBootstrap, upgrade } from '../../scripts/sql-migrate.mjs'
import { FINGERPRINT_SQL } from '../../scripts/sql-catalog.mjs'

test('issue-sync additive migration preserves history and enforces identifiers on isolated PostgreSQL', { skip: process.env.PMS_RUN_ISSUE_SYNC_DOCKER_TESTS !== '1', timeout: 120_000 }, async () => {
  const name = `pms-issue-sync-test-${randomUUID()}`
  const docker = (args, input) => {
    const result = spawnSync('docker', args, { input, encoding: 'utf8', windowsHide: true, timeout: 60_000, maxBuffer: 8 * 1024 * 1024 })
    if (result.error || result.status !== 0) throw new Error((result.stderr || result.error?.message || 'Docker failed').slice(0, 500))
    return result.stdout.trim()
  }
  const sql = (statement) => docker(['exec', '-i', name, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres'], statement)
  try {
    docker(['run', '--rm', '-d', '--name', name, '--network', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16-alpine', '-c', 'timezone=Asia/Bangkok'])
    for (let attempt = 0; ; attempt++) {
      try { sql('SELECT 1'); break } catch (error) { if (attempt >= 60) throw error; await new Promise((resolve) => setTimeout(resolve, 200)) }
    }
    sql(readFileSync(resolve(ROOT, 'database/migrations/0001_initial_schema.sql'), 'utf8'))
    sql(`INSERT INTO users(email,name,password_hash) VALUES ('owner@example.invalid','Owner','synthetic');
      INSERT INTO companies(name) VALUES ('Synthetic');
      INSERT INTO projects(name,start_date,due_date,company_id) VALUES ('Synthetic','2026-11-01','2026-12-01',1);
      INSERT INTO work_items(title,kind,project_id,assignee_id) VALUES ('Existing history','Issue',1,1);
      INSERT INTO external_project_mappings(instance_url,external_project_id,project_id) VALUES ('https://lab.test','42',1);
      INSERT INTO external_work_item_references(instance_url,external_project_id,external_issue_id,external_issue_number,external_url,project_id,remote_created_at,remote_updated_at,last_synced_at,work_item_id)
        VALUES ('https://lab.test','42','701','17','https://lab.test/group/project/-/issues/17',1,pms_bangkok_now(),pms_bangkok_now(),pms_bangkok_now(),1);`)
    const before = sql('SELECT public_id FROM work_items WHERE id=1')
    sql(readFileSync(resolve(ROOT, 'database/migrations/0002_issue_sync.sql'), 'utf8'))
    assert.equal(sql('SELECT public_id FROM work_items WHERE id=1'), before)
    assert.equal(sql('SELECT in_scope FROM external_work_item_references WHERE id=1'), 't')
    assert.equal(sql('SELECT count(*) FROM issue_sync_configs'), '0')
    const configId = sql(`INSERT INTO issue_sync_configs(mapping_id,source_project_path,assignees,credential_ref) VALUES (1,'group/project',ARRAY['alice','bob'],'work') RETURNING public_id`)
    assert.match(configId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    assert.throws(() => sql('UPDATE issue_sync_configs SET public_id=gen_random_uuid()'), /cannot be changed/)
    assert.throws(() => sql(`INSERT INTO issue_sync_configs(mapping_id,source_project_path,assignees,credential_ref) VALUES (1,'group/project',ARRAY[]::text[],'work')`), /check constraint/)
    assert.throws(() => sql(`INSERT INTO issue_sync_configs(mapping_id,source_project_path,assignees,credential_ref) VALUES (999,'group/project',ARRAY['alice'],'work')`), /foreign key/)
    assert.throws(() => sql(`INSERT INTO issue_sync_configs(mapping_id,source_project_path,assignees,credential_ref) VALUES (1,'group/project',ARRAY['alice'],'work')`), /unique constraint/)
    const runId = sql(`INSERT INTO issue_sync_runs(config_id,config_snapshot) VALUES (1,'{"assignees":["alice"]}') RETURNING public_id`)
    assert.match(runId, /^[0-9a-f-]{14}4/)
    assert.throws(() => sql('UPDATE issue_sync_runs SET public_id=gen_random_uuid()'), /cannot be changed/)
    assert.throws(() => sql('DELETE FROM issue_sync_configs'), /foreign key/)
    assert.equal(sql(`SELECT count(*) FROM information_schema.columns WHERE table_name IN ('issue_sync_configs','issue_sync_runs') AND column_name='id' AND data_type='bigint' AND is_identity='YES'`), '2')
    assert.equal(sql(`SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relname IN ('issue_sync_configs','issue_sync_runs') AND a.attnum>0 AND NOT a.attisdropped AND col_description(c.oid,a.attnum) IS NULL`), '0')
    assert.equal(sql(`SELECT count(*) FROM pg_class WHERE relname IN ('issue_sync_configs','issue_sync_runs') AND obj_description(oid,'pg_class') IS NULL`), '0')
    assert.equal(sql(`SELECT count(*) FROM information_schema.columns WHERE table_name IN ('issue_sync_configs','issue_sync_runs') AND column_name ~ '(password|^token$|api_key)'`), '0')
    sql('CREATE DATABASE fresh_sync_test')
    const freshQuery = (statement) => docker(['exec', '-i', name, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'fresh_sync_test'], statement)
    const artifacts = loadArtifacts(ROOT)
    const broken = { ...artifacts, migrations: [...artifacts.migrations, { version: '0003', script: 'database/migrations/synthetic_failure.sql', checksum: '0'.repeat(64), sql: 'SELECT 1 / 0;' }] }
    assert.throws(() => freshQuery(buildBootstrapScript(broken, 'issue-sync-test')), /division by zero/)
    assert.equal(freshQuery("SELECT to_regclass('public.schema_migrations') IS NULL"), 't')
    const bootstrapped = emptyBootstrap({ root: ROOT, target: `docker:${name}`, targetLabel: 'issue-sync-test', env: {}, query: freshQuery })
    assert.deepEqual(bootstrapped.applied, ['0001', '0002'])
    assert.equal(freshQuery("SELECT to_regclass('public.issue_sync_configs') IS NOT NULL AND to_regclass('public.issue_sync_runs') IS NOT NULL"), 't')
    assert.equal(freshQuery("SELECT string_agg(version, ',' ORDER BY version) FROM schema_migrations"), '0001,0002')
    assert.deepEqual(upgrade({ root: ROOT, target: `docker:${name}`, targetLabel: 'issue-sync-test', env: {}, query: freshQuery }).applied, [])
    assert.equal(sql(FINGERPRINT_SQL), freshQuery(FINGERPRINT_SQL), 'authoritative schema.sql must exactly match the upgraded baseline catalog')
  } finally {
    // Only the random, uniquely named fixture created above is removed. No volumes or host ports are used.
    spawnSync('docker', ['rm', '-f', name], { windowsHide: true, stdio: 'ignore' })
  }
})
