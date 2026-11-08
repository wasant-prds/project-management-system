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

test('issue-sync additive migration preserves history and enforces identifiers on isolated PostgreSQL', { skip: process.env.PMS_RUN_ISSUE_SYNC_DOCKER_TESTS !== '1', timeout: 180_000 }, async () => {
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
      try { docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres']); break } catch (error) { if (attempt >= 60) throw error; await new Promise((resolve) => setTimeout(resolve, 200)) }
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
    const configId = sql(`INSERT INTO issue_sync_configs(mapping_id,source_project_path,assignees,credential_ref) VALUES (1,'group/project',ARRAY['alice','bob'],'old-registry-ref') RETURNING public_id`)
    assert.match(configId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    assert.throws(() => sql('UPDATE issue_sync_configs SET public_id=gen_random_uuid()'), /cannot be changed/)
    const runId = sql(`INSERT INTO issue_sync_runs(config_id,config_snapshot) VALUES (1,'{"assignees":["alice"]}') RETURNING public_id`)
    assert.match(runId, /^[0-9a-f-]{14}4/)
    const runSnapshot = sql('SELECT config_snapshot FROM issue_sync_runs WHERE id=1')
    sql(readFileSync(resolve(ROOT, 'database/migrations/0003_issue_sync_token_env.sql'), 'utf8'))
    assert.equal(sql('SELECT public_id FROM issue_sync_configs WHERE id=1'), configId)
    assert.equal(sql('SELECT public_id FROM work_items WHERE id=1'), before)
    assert.equal(sql('SELECT enabled::text || chr(58) || (token_env_var IS NULL)::text FROM issue_sync_configs WHERE id=1'), 'false:true')
    assert.equal(sql('SELECT status FROM issue_sync_runs WHERE id=1'), 'failed')
    assert.equal(sql('SELECT config_snapshot FROM issue_sync_runs WHERE id=1'), runSnapshot)
    assert.throws(() => sql('UPDATE issue_sync_configs SET enabled=true'), /check constraint/)
    for (const name of ['OWNER_GATE_PASSWORD', 'DATABASE_URL', 'NEXT_PUBLIC_GITLAB_TOKEN', 'lowercase_token', 'GITLAB_TOKEN;X']) {
      assert.throws(() => sql(`UPDATE issue_sync_configs SET token_env_var='${name}'`), /check constraint/)
    }
    sql("UPDATE issue_sync_configs SET token_env_var='GITLAB_WORK_TOKEN',enabled=true")

    assert.throws(() => sql(`INSERT INTO issue_sync_configs(mapping_id,source_project_path,assignees,token_env_var) VALUES (1,'group/project',ARRAY[]::text[],'GITLAB_WORK_TOKEN')`), /check constraint/)
    assert.throws(() => sql(`INSERT INTO issue_sync_configs(mapping_id,source_project_path,assignees,token_env_var) VALUES (999,'group/project',ARRAY['alice'],'GITLAB_WORK_TOKEN')`), /foreign key/)
    assert.throws(() => sql(`INSERT INTO issue_sync_configs(mapping_id,source_project_path,assignees,token_env_var) VALUES (1,'group/project',ARRAY['alice'],'GITLAB_WORK_TOKEN')`), /unique constraint/)
    assert.throws(() => sql('UPDATE issue_sync_runs SET public_id=gen_random_uuid()'), /cannot be changed/)
    assert.throws(() => sql('DELETE FROM issue_sync_configs'), /foreign key/)
    assert.equal(sql(`SELECT count(*) FROM information_schema.columns WHERE table_name IN ('issue_sync_configs','issue_sync_runs') AND column_name='id' AND data_type='bigint' AND is_identity='YES'`), '2')
    assert.equal(sql(`SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid WHERE c.relname IN ('issue_sync_configs','issue_sync_runs') AND a.attnum>0 AND NOT a.attisdropped AND col_description(c.oid,a.attnum) IS NULL`), '0')
    assert.equal(sql(`SELECT count(*) FROM pg_class WHERE relname IN ('issue_sync_configs','issue_sync_runs') AND obj_description(oid,'pg_class') IS NULL`), '0')
    assert.equal(sql(`SELECT count(*) FROM information_schema.columns WHERE table_name IN ('issue_sync_configs','issue_sync_runs') AND column_name ~ '(password|^token$|api_key)'`), '0')
    sql('CREATE DATABASE fresh_sync_test')
    const freshQuery = (statement) => docker(['exec', '-i', name, 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'fresh_sync_test'], statement)
    const artifacts = loadArtifacts(ROOT)
    const nextVersion = String(Number(artifacts.migrations.at(-1).version) + 1).padStart(4, '0')
    const broken = { ...artifacts, migrations: [...artifacts.migrations, { version: nextVersion, script: 'database/migrations/synthetic_failure.sql', checksum: '0'.repeat(64), sql: 'SELECT 1 / 0;' }] }
    assert.throws(() => freshQuery(buildBootstrapScript(broken, 'issue-sync-test')), /division by zero/)
    assert.equal(freshQuery("SELECT to_regclass('public.schema_migrations') IS NULL"), 't')
    const bootstrapped = emptyBootstrap({ root: ROOT, target: `docker:${name}`, targetLabel: 'issue-sync-test', env: {}, query: freshQuery })
    assert.deepEqual(bootstrapped.applied, ['0001', '0002', '0003'])
    assert.equal(freshQuery("SELECT to_regclass('public.issue_sync_configs') IS NOT NULL AND to_regclass('public.issue_sync_runs') IS NOT NULL"), 't')
    assert.equal(freshQuery("SELECT string_agg(version, ',' ORDER BY version) FROM schema_migrations"), '0001,0002,0003')
    assert.deepEqual(upgrade({ root: ROOT, target: `docker:${name}`, targetLabel: 'issue-sync-test', env: {}, query: freshQuery }).applied, [])
    assert.equal(sql(FINGERPRINT_SQL), freshQuery(FINGERPRINT_SQL), 'authoritative schema.sql must exactly match the upgraded baseline catalog')
    freshQuery(`INSERT INTO companies(name) VALUES ('Synthetic seed company');
      INSERT INTO projects(name,start_date,due_date,company_id) VALUES ('Synthetic seed project','2026-11-01','2026-12-01',1);
      INSERT INTO external_project_mappings(provider,instance_url,external_project_id,project_id)
      VALUES ('gitlab','https://lab.test','42',1),('github','https://github.com','43',1);`)
    const mappings = JSON.parse(freshQuery('SELECT json_object_agg(provider,public_id) FROM external_project_mappings'))
    // Keep CI independent of operator-owned, gitignored seed datasets.
    const seed = `INSERT INTO issue_sync_configs(mapping_id,source_project_path,assignees,token_env_var,enabled) VALUES
      ((SELECT id FROM external_project_mappings WHERE public_id='${mappings.gitlab}'::uuid),'group/project',ARRAY['alice'],'GITLAB_PROJECT_A_TOKEN',false),
      ((SELECT id FROM external_project_mappings WHERE public_id='${mappings.github}'::uuid),'acme/repo',ARRAY['bob'],'GITHUB_PROJECT_B_TOKEN',false)
      ON CONFLICT (mapping_id) DO NOTHING;`
    freshQuery(seed)
    const seeded = freshQuery("SELECT json_agg(json_build_array(public_id,token_env_var,enabled) ORDER BY token_env_var) FROM issue_sync_configs")
    const rows = JSON.parse(seeded)
    assert.deepEqual(rows.map((row) => row.slice(1)), [['GITHUB_PROJECT_B_TOKEN', false], ['GITLAB_PROJECT_A_TOKEN', false]])
    freshQuery(seed)
    assert.equal(freshQuery("SELECT json_agg(json_build_array(public_id,token_env_var,enabled) ORDER BY token_env_var) FROM issue_sync_configs"), seeded)
  } finally {
    // Only the random, uniquely named fixture created above is removed. No volumes or host ports are used.
    spawnSync('docker', ['rm', '-f', name], { windowsHide: true, stdio: 'ignore' })
  }
})
