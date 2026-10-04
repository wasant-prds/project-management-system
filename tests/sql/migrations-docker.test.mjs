import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import test from 'node:test';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../../scripts/sql-artifacts.mjs';
import { diffFingerprints, FINGERPRINT_SQL } from '../../scripts/sql-catalog.mjs';
import { createQuery, DOCKER_SHELL, emptyBootstrap, upgrade } from '../../scripts/sql-migrate.mjs';

const enabled = process.env.PMS_RUN_SQL_MIGRATION_DOCKER_TESTS === '1';
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const businessTables = [
  'activity_logs', 'companies', 'external_project_mappings', 'external_work_item_references',
  'project_documents', 'project_members', 'project_milestones', 'projects',
  'schema_migrations', 'users', 'work_items', 'work_logs',
];

function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', windowsHide: true, timeout: 180000, maxBuffer: 32 * 1024 * 1024 });
  if (result.error || result.status !== 0) throw new Error(`Docker failed: ${(result.stderr || result.error?.message || 'unknown').slice(0, 500)}`);
  return result.stdout ?? '';
}

function sleep(ms) { return new Promise((resolvePromise) => setTimeout(resolvePromise, ms)); }

async function startPostgres(name) {
  docker(['run', '--rm', '-d', '--name', name, '--network', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'POSTGRES_USER=postgres', '-e', 'POSTGRES_DB=postgres', 'postgres:16-alpine', '-c', 'timezone=Asia/Bangkok']);
  const query = createQuery(`docker:${name}`, spawnSync, {});
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try { query('SELECT 1'); return query; } catch { await sleep(250); }
  }
  throw new Error('PostgreSQL fixture did not become ready');
}

function removeContainer(name) {
  spawnSync('docker', ['rm', '-f', name], { windowsHide: true });
}

function spawnSql(container, sqlText) {
  const child = spawn('docker', ['exec', '-i', container, 'sh', '-c', DOCKER_SHELL, 'sql-migrate', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1'], { windowsHide: true });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const done = new Promise((resolvePromise, reject) => {
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolvePromise(stdout.trim());
      else reject(new Error(stderr.trim().slice(0, 500) || 'SQL command failed'));
    });
  });
  child.stdin.end(sqlText);
  return { child, done };
}

async function artifactCopy(mutate) {
  const directory = await mkdtemp(join(tmpdir(), 'pms-sql-docker-'));
  await mkdir(join(directory, 'database', 'migrations'), { recursive: true });
  const schema = await readFile(join(repoRoot, 'database', 'schema.sql'));
  const nextSchema = mutate ? mutate(schema) : schema;
  await writeFile(join(directory, 'database', 'schema.sql'), nextSchema);
  const migrations = [{
    version: '0001', name: 'initial_schema', kind: 'baseline_snapshot', script: 'database/schema.sql', checksum: sha256(nextSchema),
  }];
  await writeFile(join(directory, 'database', 'migrations', 'manifest.json'), JSON.stringify({
    revision: '31.0.0', lockTimeoutMs: 5000, statementTimeoutMs: 120000, migrations,
  }));
  return { directory, migrations, schema: nextSchema };
}

if (!enabled) {
  test('PostgreSQL SQL migration integration is opt-in', { skip: 'set by pnpm test:sql-migrations-docker' }, () => {});
} else {
  const name = `pms-sql31-${randomUUID()}`;
  let query;
  test.before(async () => {
    query = await startPostgres(name);
    emptyBootstrap({ root: repoRoot, target: `docker:${name}`, targetLabel: 'issue-31', query, env: {} });
  });
  test.after(() => { removeContainer(name); });

  test('TC-31-01 empty bootstrap creates the business and technical tables', () => {
    const tables = query(`SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY c.relname COLLATE "C"`);
    assert.equal(tables, businessTables.join('\n'));
    assert.equal(query(`SELECT count(DISTINCT trigger_name) FROM information_schema.triggers WHERE trigger_schema = 'public'`), '13');
    assert.equal(query(`SELECT string_agg(proname, ',' ORDER BY proname) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'`), 'pms_align_identity,pms_bangkok_now,pms_bangkok_today,pms_reject_immutable_row,pms_stamp_created_at,pms_stamp_timestamps');
  });

  test('TC-31-02 catalog types, identity, enums, decimals and foreign-key actions match the contract', () => {
    assert.equal(query(`SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND udt_name = 'timestamptz'`), '0');
    assert.equal(query(`SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND column_name IN ('createdAt', 'updatedAt')`), '0');
    assert.equal(query(`SELECT count(*) FROM information_schema.columns WHERE table_name = 'activity_logs' AND column_name = 'updated_at'`), '0');
    assert.equal(query(`SELECT data_type FROM information_schema.columns WHERE table_name = 'activity_logs' AND column_name = 'entity_id'`), 'text');
    assert.equal(query(`SELECT data_type FROM information_schema.columns WHERE table_name = 'external_work_item_references' AND column_name = 'project_id'`), 'bigint');
    assert.equal(query(`SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND conrelid = '"external_work_item_references"'::regclass AND pg_get_constraintdef(oid) LIKE '%project_id%'`), '1');
    assert.equal(query(`SELECT numeric_precision::text || ' ' || numeric_scale::text FROM information_schema.columns WHERE table_name = 'work_logs' AND column_name = 'hours'`), '65 30');
    assert.equal(query(`SELECT string_agg(numeric_precision::text || ' ' || numeric_scale::text, ',') FROM information_schema.columns WHERE table_name = 'projects' AND column_name IN ('budget_amount', 'spent_amount')`), '65 30,65 30');
    assert.equal(query(`SELECT string_agg(table_name || '.' || column_name, ',' ORDER BY table_name COLLATE "C", column_name COLLATE "C") FROM information_schema.columns WHERE table_schema = 'public' AND data_type = 'date'`), 'projects.due_date,projects.start_date,work_items.due_date,work_items.work_date,work_logs.work_date');
    assert.equal(query(`SELECT data_type FROM information_schema.columns WHERE table_name = 'project_milestones' AND column_name = 'due_date'`), 'timestamp without time zone');
    const identity = query(`WITH public_tables AS MATERIALIZED (SELECT c.oid, n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r') SELECT t.relname || ' d 1 1 false' FROM public_tables t JOIN pg_attribute a ON a.attrelid = t.oid AND a.attname = 'id' AND a.attidentity = 'd' JOIN pg_sequence s ON s.seqrelid = pg_get_serial_sequence(format('%I.%I', t.nspname, t.relname), 'id')::regclass WHERE s.seqstart = 1 AND s.seqincrement = 1 AND s.seqcycle = false ORDER BY t.relname COLLATE "C"`);
    assert.equal(identity, businessTables.map((table) => `${table} d 1 1 false`).join('\n'));
    assert.equal(query(`SELECT t.typname || ' ' || string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) FROM pg_type t JOIN pg_enum e ON e.enumtypid = t.oid JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = 'public' GROUP BY t.typname ORDER BY t.typname COLLATE "C"`), [
      'user_locale th,en',
      'user_theme light,dark,special-dark',
      'work_item_kind Incident,Issue,Task',
      'work_item_priority none,low,medium,high,urgent',
      'work_item_role Developer,infra,SA',
      'work_item_status backlog,todo,in-progress,blocked,sa-testing,pm-testing,completed,cancelled',
    ].join('\n'));
    assert.equal(query(`SELECT conname || ' ' || confdeltype::text FROM pg_constraint WHERE contype = 'f' AND connamespace = 'public'::regnamespace ORDER BY conname COLLATE "C"`), [
      'activity_logs_project_id_fkey r', 'activity_logs_user_id_fkey r',
      'external_project_mappings_project_id_fkey r', 'external_work_item_references_project_id_fkey r',
      'external_work_item_references_work_item_id_fkey r', 'project_documents_project_id_fkey r', 'project_documents_uploader_id_fkey n',
      'project_members_project_id_fkey r', 'project_members_user_id_fkey c', 'project_milestones_project_id_fkey r',
      'projects_company_id_fkey r', 'projects_creator_id_fkey n', 'work_items_assignee_id_fkey r', 'work_items_project_id_fkey r',
      'work_logs_project_id_fkey r', 'work_logs_user_id_fkey c', 'work_logs_work_item_id_fkey r',
    ].join('\n'));
    assert.equal(query(`SELECT conname || ' ' || confdeltype::text || ' ' || confupdtype::text FROM pg_constraint WHERE conname IN ('activity_logs_project_id_fkey', 'activity_logs_user_id_fkey') ORDER BY conname COLLATE "C"`), [
      'activity_logs_project_id_fkey r r',
      'activity_logs_user_id_fkey r r',
    ].join('\n'));
  });

  test('all live catalog tables and columns have nonempty comments and snake_case names', () => {
    assert.equal(query(`SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND nullif(btrim(obj_description(c.oid, 'pg_class')), '') IS NULL`), '0');
    assert.equal(query(`SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped AND nullif(btrim(col_description(c.oid, a.attnum)), '') IS NULL`), '0');
    assert.equal(query(`SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND (table_name !~ '^[a-z][a-z0-9_]*$' OR column_name !~ '^[a-z][a-z0-9_]*$')`), '0');
  });

  test('TC-31-03 generated IDs start at 1 and sequences are independent', () => {
    assert.equal(query(`INSERT INTO "users" (email, name, password_hash) VALUES ('owner-31-03@example.invalid', 'Owner', 'synthetic-hash') RETURNING id`), '1');
    assert.equal(query(`INSERT INTO "companies" (name) VALUES ('First company') RETURNING id`), '1');
    assert.equal(query(`INSERT INTO "companies" (name) VALUES ('Second company') RETURNING id`), '2');
    assert.equal(query(`INSERT INTO "projects" (name, "start_date", "due_date", "company_id") VALUES ('First project', DATE '2026-10-04', DATE '2026-10-05', 1) RETURNING id`), '1');
    assert.equal(query(`SELECT pg_get_serial_sequence('"users"', 'id') <> pg_get_serial_sequence('"companies"', 'id') AND pg_get_serial_sequence('"companies"', 'id') <> pg_get_serial_sequence('"projects"', 'id')`), 't');
  });

  test('TC-31-04 explicit import IDs align the sequence and an empty table still starts at 1', () => {
    assert.equal(query(`SELECT public.pms_align_identity('"project_documents"'::regclass)`), '1');
    assert.equal(query(`INSERT INTO "project_documents" (name, "file_url") VALUES ('Empty start', 'synthetic://document') RETURNING id`), '1');
    query(`INSERT INTO "project_milestones" (id, name, "due_date", "project_id") VALUES (40, 'Explicit', TIMESTAMP '2026-10-04 09:00:00', 1)`);
    assert.equal(query(`SELECT public.pms_align_identity('"project_milestones"'::regclass)`), '41');
    assert.equal(query(`INSERT INTO "project_milestones" (name, "due_date", "project_id") VALUES ('After explicit', TIMESTAMP '2026-10-04 10:00:00', 1) RETURNING id`), '41');
  });

  test('every table has public UUID metadata and generated UUIDs are unique and immutable', () => {
    assert.equal(query(`SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND column_name = 'public_id' AND data_type = 'uuid' AND is_nullable = 'NO' AND column_default LIKE '%gen_random_uuid()%'`), '12');
    assert.equal(query(`SELECT count(*) FROM pg_constraint WHERE connamespace = 'public'::regnamespace AND contype = 'u' AND conname LIKE '%_public_id_key' AND pg_get_constraintdef(oid) = 'UNIQUE (public_id)'`), '12');
    const publicId = query(`SELECT public_id FROM companies WHERE id = 1`);
    assert.match(publicId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    assert.equal(query(`SELECT count(DISTINCT public_id) FROM companies`), query(`SELECT count(*) FROM companies`));
    assert.throws(() => query(`INSERT INTO companies (name, public_id) VALUES ('UUID duplicate', '${publicId}')`), /duplicate key.*companies_public_id_key/);
    assert.throws(() => query(`INSERT INTO companies (name, public_id) VALUES ('UUID null', NULL)`), /null value.*public_id/);
    assert.throws(() => query(`UPDATE companies SET public_id = gen_random_uuid() WHERE id = 1`), /public_id cannot be changed/);
    assert.throws(() => query(`BEGIN; SET LOCAL pms.preserve_source_timestamps = 'on'; UPDATE companies SET public_id = gen_random_uuid() WHERE id = 1; COMMIT;`), /public_id cannot be changed/);
    query(`UPDATE companies SET public_id = public_id WHERE id = 1`);
    assert.equal(query(`SELECT public_id FROM companies WHERE id = 1`), publicId);
    const supplied = '0b0bbf65-7229-4f4d-a2a1-82f0e6058e83';
    assert.equal(query(`INSERT INTO companies (name, public_id) VALUES ('UUID controlled import', '${supplied}') RETURNING public_id`), supplied);
    assert.throws(() => query(`UPDATE schema_migrations SET public_id = gen_random_uuid()`), /cannot be updated or deleted/);
  });

  test('TC-31-05 concurrent inserts stay unique and a rolled-back insert leaves a gap', async () => {
    const leftName = `concurrent-${randomUUID()}`;
    const rightName = `concurrent-${randomUUID()}`;
    const [left, right] = await Promise.all([
      spawnSql(name, `INSERT INTO "companies" (name) VALUES ('${leftName}') RETURNING id;`).done,
      spawnSql(name, `INSERT INTO "companies" (name) VALUES ('${rightName}') RETURNING id;`).done,
    ]);
    assert.notEqual(left, right);
    assert.equal(query(`SELECT count(DISTINCT id) FROM "companies" WHERE name IN ('${leftName}', '${rightName}')`), '2');
    const gap = query(`SELECT setval('"companies_id_seq"', 500, true); BEGIN; INSERT INTO "companies" (name) VALUES ('gap-row'); ROLLBACK; INSERT INTO "companies" (name) VALUES ('kept-row'); SELECT id::text || ' ' || (SELECT count(*) FROM "companies" WHERE name = 'gap-row')::text || ' ' || (SELECT count(*) FROM "companies" WHERE id = 501)::text FROM "companies" WHERE name = 'kept-row';`);
    assert.equal(gap.split('\n').at(-1), '502 0 0');
  });

  test('TC-31-06 ordinary writes own timestamps and ignore client no-op values', () => {
    const inserted = query(`INSERT INTO "companies" (name, created_at, updated_at) VALUES ('stamp', TIMESTAMP '2010-01-01 00:00:00', TIMESTAMP '2010-01-01 00:00:00') RETURNING to_char(created_at, 'YYYY-MM-DD HH24:MI:SS.MS') || '|' || to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS.MS')`);
    const [createdAt, updatedAt] = inserted.split('|');
    assert.equal(createdAt, updatedAt);
    assert.equal(createdAt.startsWith('2010-'), false);
    assert.equal(query(`UPDATE "companies" SET name = name, updated_at = TIMESTAMP '2001-01-01 00:00:00' WHERE name = 'stamp'; SELECT to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS.MS') FROM "companies" WHERE name = 'stamp';`).split('\n').at(-1), updatedAt);
    query('SELECT pg_sleep(0.2)');
    query(`UPDATE "companies" SET name = 'stamp-changed', created_at = TIMESTAMP '1999-01-01 00:00:00', updated_at = TIMESTAMP '2001-01-01 00:00:00' WHERE name = 'stamp'`);
    const changed = query(`SELECT to_char(created_at, 'YYYY-MM-DD HH24:MI:SS.MS') || '|' || to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS.MS') FROM "companies" WHERE name = 'stamp-changed'`);
    assert.equal(changed.split('|')[0], createdAt);
    assert.notEqual(changed.split('|')[1], updatedAt);
    assert.equal(changed.includes('2001-01-01'), false);
    query(`INSERT INTO "users" (email, name, password_hash) VALUES ('member-31-06@example.invalid', 'Member', 'synthetic-hash')`);
    query(`INSERT INTO "project_members" ("project_id", "user_id", "joined_at") SELECT 1, id, TIMESTAMP '2018-01-01 00:00:00' FROM "users" WHERE email = 'member-31-06@example.invalid'`);
    const joined = query(`SELECT to_char(pm."joined_at", 'YYYY-MM-DD HH24:MI:SS') FROM "project_members" pm JOIN "users" u ON u.id = pm."user_id" WHERE u.email = 'member-31-06@example.invalid'`);
    query(`SELECT pg_sleep(0.2); UPDATE "project_members" pm SET role = 'lead' FROM "users" u WHERE u.id = pm."user_id" AND u.email = 'member-31-06@example.invalid'`);
    assert.equal(query(`SELECT to_char(pm."joined_at", 'YYYY-MM-DD HH24:MI:SS') || '|' || (pm.updated_at > pm.created_at) FROM "project_members" pm JOIN "users" u ON u.id = pm."user_id" WHERE u.email = 'member-31-06@example.invalid'`), `${joined}|true`);
  });

  test('TC-31-07 Bangkok defaults do not follow a UTC session and DATE values do not shift', () => {
    assert.equal(query(`SET TIME ZONE 'UTC'; SELECT current_setting('TimeZone')`), 'UTC');
    assert.equal(query(`SET TIME ZONE 'UTC'; SELECT abs(extract(epoch FROM (public.pms_bangkok_now() - pg_catalog.timezone('Asia/Bangkok', clock_timestamp())::timestamp(3)))) < 2`), 't');
    assert.equal(query(`SET TIME ZONE 'Pacific/Kiritimati'; SELECT public.pms_bangkok_today() = (pg_catalog.timezone('Asia/Bangkok', clock_timestamp()))::date`), 't');
    query(`INSERT INTO "companies" (name) VALUES ('date-company')`);
    assert.equal(query(`SET TIME ZONE 'UTC'; INSERT INTO "projects" (name, "start_date", "due_date", "company_id") SELECT 'date-project', DATE '2026-10-04', DATE '2026-10-05', id FROM "companies" WHERE name = 'date-company'; SELECT "start_date"::text || ' ' || "due_date"::text FROM "projects" WHERE name = 'date-project';`).split('\n').at(-1), '2026-10-04 2026-10-05');
    assert.equal(query(`SET TIME ZONE 'Pacific/Kiritimati'; INSERT INTO "work_logs" (hours, "user_id") SELECT 1.5, id FROM "users" WHERE email = 'owner-31-03@example.invalid'; SELECT work_date = public.pms_bangkok_today() FROM "work_logs" WHERE hours = 1.5 ORDER BY id DESC LIMIT 1`).split('\n').at(-1), 't');
  });

  test('TC-31-08 controlled import keeps source timestamps and does not copy remote time into local history', () => {
    assert.equal(query(`BEGIN; SELECT set_config('pms.preserve_source_timestamps', 'on', true); INSERT INTO "companies" (name, created_at, updated_at) VALUES ('historical', TIMESTAMP '2019-05-01 08:00:00', TIMESTAMP '2019-05-02 09:30:00'); COMMIT; SELECT to_char(created_at, 'YYYY-MM-DD HH24:MI:SS') || '|' || to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS') FROM "companies" WHERE name = 'historical';`).split('\n').at(-1), '2019-05-01 08:00:00|2019-05-02 09:30:00');
    query(`INSERT INTO work_items (title, kind, "project_id", "assignee_id") SELECT 'Import parent', 'Task', 1, id FROM "users" WHERE email = 'owner-31-03@example.invalid'`);
    assert.equal(query(`BEGIN; SELECT set_config('pms.preserve_source_timestamps', 'on', true); INSERT INTO "external_work_item_references" ("instance_url", "external_project_id", "external_issue_id", "external_issue_number", "external_url", "project_id", "remote_created_at", "remote_updated_at", "last_synced_at", "work_item_id") SELECT 'https://gitlab.example.invalid', 'remote-project', 'remote-issue', '1', 'https://gitlab.example.invalid/issue/1', 1, TIMESTAMP '2018-01-01 00:00:00', TIMESTAMP '2018-01-02 00:00:00', TIMESTAMP '2018-01-03 00:00:00', id FROM work_items WHERE title = 'Import parent'; COMMIT; SELECT created_at > TIMESTAMP '2024-01-01' AND created_at <> "remote_created_at" FROM "external_work_item_references" WHERE "external_issue_id" = 'remote-issue';`).split('\n').at(-1), 't');
    assert.equal(query(`SELECT project_id = 1 AND external_project_id = 'remote-project' FROM external_work_item_references WHERE external_issue_id = 'remote-issue'`), 't');
    assert.throws(() => query(`UPDATE external_work_item_references SET project_id = 9223372036854775807 WHERE external_issue_id = 'remote-issue'`), /foreign key constraint/);
    query(`INSERT INTO "activity_logs" (action, entity, "entity_id", created_at) VALUES ('created-proof', 'task', 'not-a-work-item', TIMESTAMP '2011-01-01 00:00:00')`);
    assert.equal(query(`SELECT created_at > TIMESTAMP '2024-01-01' FROM "activity_logs" WHERE action = 'created-proof'`), 't');
    assert.equal(query(`SELECT "entity_id" FROM "activity_logs" WHERE action = 'created-proof'`), 'not-a-work-item');
    assert.throws(() => query(`UPDATE "activity_logs" SET action = 'edited' WHERE action = 'created-proof'`), /cannot be updated or deleted/);
    assert.throws(() => query(`DELETE FROM "activity_logs" WHERE action = 'created-proof'`), /cannot be updated or deleted/);
    assert.equal(query(`SELECT count(*) FROM "activity_logs" WHERE "entity_id" = 'not-a-work-item'`), '1');
  });

  test('TC-31-09 decimal, JSON, arrays, Thai text and enum literals round-trip', () => {
    query(`INSERT INTO work_items (title, kind, priority, status, type_labels, "project_id", "assignee_id") SELECT 'งานทดสอบ', 'Task', 'high', 'in-progress', ARRAY['ไทย','Task'], 1, id FROM "users" WHERE email = 'owner-31-03@example.invalid'`);
    assert.equal(query(`SELECT title || '|' || status::text || '|' || type_labels[1] FROM work_items WHERE title = 'งานทดสอบ'`), 'งานทดสอบ|in-progress|ไทย');
    query(`INSERT INTO "work_logs" (hours, work_date, "user_id", "project_id", "work_item_id") SELECT 1.250000000000000000000000000000, DATE '2026-10-04', u.id, 1, w.id FROM "users" u JOIN work_items w ON w.title = 'งานทดสอบ' WHERE u.email = 'owner-31-03@example.invalid'`);
    assert.equal(query(`SELECT hours = 1.25::numeric(65,30) AND scale(hours) = 30 FROM "work_logs" te JOIN work_items w ON w.id = te."work_item_id" WHERE w.title = 'งานทดสอบ'`), 't');
    query(`INSERT INTO "external_project_mappings" ("instance_url", "external_project_id", "project_id", "approved_label_map") VALUES ('https://gitlab.example.invalid', 'mapped-project', 1, '{"note":"ค่า"}'::jsonb)`);
    assert.equal(query(`SELECT "approved_label_map" = '{"note":"ค่า"}'::jsonb FROM "external_project_mappings" WHERE "external_project_id" = 'mapped-project'`), 't');
    const before = query(`SELECT to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS.MS') FROM "external_project_mappings" WHERE "external_project_id" = 'mapped-project'`);
    assert.equal(query(`UPDATE "external_project_mappings" SET "approved_label_map" = "approved_label_map" WHERE "external_project_id" = 'mapped-project'; SELECT to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS.MS') FROM "external_project_mappings" WHERE "external_project_id" = 'mapped-project';`).split('\n').at(-1), before);
    query('SELECT pg_sleep(0.2)');
    query(`UPDATE work_items SET type_labels = ARRAY['ไทย','Changed'] WHERE title = 'งานทดสอบ'`);
    assert.equal(query(`SELECT type_labels[2] FROM work_items WHERE title = 'งานทดสอบ'`), 'Changed');
  });

  test('GitLab and GitHub mappings and references coexist without source identity collisions', () => {
    assert.equal(query(`SELECT provider FROM external_project_mappings WHERE external_project_id = 'mapped-project'`), 'gitlab');
    query(`INSERT INTO external_project_mappings (provider, instance_url, external_project_id, project_id) VALUES ('gitlab', 'https://code.example.invalid', 'shared-project', 1), ('github', 'https://code.example.invalid', 'shared-project', 1), ('gitlab', 'https://other.example.invalid', 'shared-project', 1)`);
    assert.equal(query(`SELECT count(*) FROM external_project_mappings WHERE external_project_id = 'shared-project'`), '3');
    assert.throws(() => query(`INSERT INTO external_project_mappings (provider, instance_url, external_project_id, project_id) VALUES ('gitlab', 'https://code.example.invalid', 'shared-project', 1)`), /duplicate key.*external_project_mappings_source_key/);
    query(`INSERT INTO work_items (title, kind, project_id, assignee_id) VALUES ('Provider GitLab issue', 'Issue', 1, 1), ('Provider GitHub issue', 'Issue', 1, 1), ('Provider duplicate issue', 'Issue', 1, 1)`);
    query(`INSERT INTO external_work_item_references (provider, instance_url, external_project_id, external_issue_id, external_issue_number, external_url, project_id, remote_created_at, remote_updated_at, last_synced_at, work_item_id) SELECT CASE title WHEN 'Provider GitLab issue' THEN 'gitlab' ELSE 'github' END, 'https://code.example.invalid', 'shared-project', 'shared-issue', '7', 'https://code.example.invalid/issues/7', 1, TIMESTAMP '2026-10-04 08:00:00', TIMESTAMP '2026-10-04 09:00:00', TIMESTAMP '2026-10-04 10:00:00', id FROM work_items WHERE title IN ('Provider GitLab issue', 'Provider GitHub issue')`);
    assert.equal(query(`SELECT string_agg(provider, ',' ORDER BY provider) FROM external_work_item_references WHERE external_issue_id = 'shared-issue'`), 'github,gitlab');
    assert.throws(() => query(`INSERT INTO external_work_item_references (provider, instance_url, external_project_id, external_issue_id, external_issue_number, external_url, project_id, remote_created_at, remote_updated_at, last_synced_at, work_item_id) SELECT 'gitlab', 'https://code.example.invalid', 'shared-project', 'shared-issue', '7', 'https://code.example.invalid/issues/7', 1, TIMESTAMP '2026-10-04 08:00:00', TIMESTAMP '2026-10-04 09:00:00', TIMESTAMP '2026-10-04 10:00:00', id FROM work_items WHERE title = 'Provider duplicate issue'`), /duplicate key.*external_work_item_references_source_key/);
    assert.throws(() => query(`INSERT INTO external_work_item_references (provider, instance_url, external_project_id, external_issue_id, external_issue_number, external_url, project_id, remote_created_at, remote_updated_at, last_synced_at, work_item_id) SELECT 'github', 'https://code.example.invalid', 'shared-project', 'another-issue', '8', 'https://code.example.invalid/issues/8', 1, TIMESTAMP '2026-10-04 08:00:00', TIMESTAMP '2026-10-04 09:00:00', TIMESTAMP '2026-10-04 10:00:00', id FROM work_items WHERE title = 'Provider GitLab issue'`), /duplicate key.*external_work_item_references_work_item_id_key/);
    query(`DELETE FROM external_project_mappings WHERE external_project_id = 'shared-project'`);
    assert.equal(query(`SELECT count(*) FROM external_work_item_references WHERE external_issue_id = 'shared-issue'`), '2');
    assert.equal(query(`SELECT count(*) FROM work_items WHERE title IN ('Provider GitLab issue', 'Provider GitHub issue')`), '2');
  });

  test('TC-31-10 foreign-key delete actions and unique keys follow the current schema', () => {
    query(`INSERT INTO "users" (email, name, password_hash) VALUES ('cascade-31-10@example.invalid', 'Cascade', 'synthetic-hash'), ('creator-31-10@example.invalid', 'Creator', 'synthetic-hash')`);
    query(`INSERT INTO "companies" (name) VALUES ('restrict-company')`);
    query(`INSERT INTO "projects" (name, "start_date", "due_date", "company_id", "creator_id") SELECT 'restrict-project', DATE '2026-10-04', DATE '2026-10-05', c.id, u.id FROM "companies" c JOIN "users" u ON u.email = 'creator-31-10@example.invalid' WHERE c.name = 'restrict-company'`);
    query(`INSERT INTO "project_members" ("project_id", "user_id") SELECT p.id, u.id FROM "projects" p JOIN "users" u ON u.email = 'cascade-31-10@example.invalid' WHERE p.name = 'restrict-project'`);
    query(`INSERT INTO work_items (title, kind, "project_id", "assignee_id") SELECT 'restrict-work', 'Issue', p.id, u.id FROM "projects" p JOIN "users" u ON u.email = 'owner-31-03@example.invalid' WHERE p.name = 'restrict-project'`);
    query(`INSERT INTO "work_logs" (hours, "user_id", "project_id", "work_item_id") SELECT 2, u.id, p.id, w.id FROM "users" u JOIN "projects" p ON p.name = 'restrict-project' JOIN work_items w ON w.title = 'restrict-work' WHERE u.email = 'owner-31-03@example.invalid'`);
    assert.throws(() => query(`DELETE FROM "companies" WHERE name = 'restrict-company'`), /foreign key constraint/);
    assert.throws(() => query(`DELETE FROM "projects" WHERE name = 'restrict-project'`), /foreign key constraint/);
    assert.throws(() => query(`DELETE FROM work_items WHERE title = 'restrict-work'`), /foreign key constraint/);
    assert.throws(() => query(`INSERT INTO "users" (email, name, password_hash) VALUES ('owner-31-03@example.invalid', 'Duplicate', 'synthetic-hash')`), /duplicate key/);
    assert.throws(() => query(`INSERT INTO "project_members" ("project_id", "user_id") SELECT p.id, u.id FROM "projects" p JOIN "users" u ON u.email = 'cascade-31-10@example.invalid' WHERE p.name = 'restrict-project'`), /duplicate key/);
    query(`DELETE FROM "users" WHERE email = 'cascade-31-10@example.invalid'`);
    assert.equal(query(`SELECT count(*) FROM "project_members" pm JOIN "projects" p ON p.id = pm."project_id" WHERE p.name = 'restrict-project'`), '0');
    query(`DELETE FROM "users" WHERE email = 'creator-31-10@example.invalid'`);
    assert.equal(query(`SELECT "creator_id" IS NULL FROM "projects" WHERE name = 'restrict-project'`), 't');
    query(`INSERT INTO "users" (email, name, password_hash) VALUES ('activity-31-10@example.invalid', 'Activity', 'synthetic-hash')`);
    query(`INSERT INTO "activity_logs" (action, entity, "entity_id", "user_id") SELECT 'delete-proof', 'user', 'legacy-user', id FROM "users" WHERE email = 'activity-31-10@example.invalid'`);
    assert.throws(() => query(`DELETE FROM "users" WHERE email = 'activity-31-10@example.invalid'`), (error) => {
      assert.match(error.message, /foreign key constraint/);
      assert.equal(/cannot be updated or deleted/.test(error.message), false);
      return true;
    });
    assert.throws(() => query(`UPDATE "users" SET id = 900 WHERE email = 'activity-31-10@example.invalid'`), /foreign key constraint/);
    assert.equal(query(`SELECT count(*)::text FROM "activity_logs" WHERE action = 'delete-proof' AND "user_id" IS NOT NULL`), '1');
    assert.notEqual(query(`SELECT id::text FROM "users" WHERE email = 'activity-31-10@example.invalid'`), '900');
  });

  test('TC-31-11 rerun skips the baseline and a changed checksum does not write', async () => {
    const before = query(`SELECT count(*)::text || ' ' || checksum FROM "schema_migrations" GROUP BY checksum`);
    const skipped = upgrade({ root: repoRoot, target: `docker:${name}`, targetLabel: 'issue-31', query, env: {} });
    assert.deepEqual(skipped.applied, []);
    assert.deepEqual(skipped.skipped, ['0001']);
    assert.throws(() => emptyBootstrap({ root: repoRoot, target: `docker:${name}`, targetLabel: 'issue-31', query, env: {} }), /not empty/);
    assert.equal(query(`SELECT count(*)::text || ' ' || checksum FROM "schema_migrations" GROUP BY checksum`), before);
    const copy = await artifactCopy((schema) => Buffer.concat([schema, Buffer.from('\n-- checksum drift\n')]));
    try {
      assert.throws(() => upgrade({ root: copy.directory, target: `docker:${name}`, targetLabel: 'issue-31', query, env: {} }), /Applied checksum mismatch for migration 0001/);
      assert.equal(query(`SELECT count(*)::text || ' ' || checksum FROM "schema_migrations" GROUP BY checksum`), before);
    } finally {
      await rm(copy.directory, { recursive: true, force: true });
    }
  });

  test('TC-31-12 a second runner fails on the migration lock without writing history', async () => {
    const copy = await artifactCopy();
    const extra = 'CREATE TABLE "upgrade_marker" (id integer);\n';
    await writeFile(join(copy.directory, 'database', 'migrations', '0002_marker.sql'), extra);
    copy.migrations.push({ version: '0002', name: 'marker', kind: 'sql', script: 'database/migrations/0002_marker.sql', checksum: sha256(extra) });
    await writeFile(join(copy.directory, 'database', 'migrations', 'manifest.json'), JSON.stringify({
      revision: '31.0.0', lockTimeoutMs: 5000, statementTimeoutMs: 120000, migrations: copy.migrations,
    }));
    const holder = spawnSql(name, `SELECT pg_advisory_lock(hashtext('pms-sql-migrate')); SELECT pg_sleep(30);`);
    try {
      let locked = false;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        if (query(`SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND granted`) !== '0') { locked = true; break; }
        await sleep(250);
      }
      assert.equal(locked, true);
      assert.throws(() => upgrade({ root: copy.directory, target: `docker:${name}`, targetLabel: 'issue-31', query, env: {} }), /lock timeout/i);
      assert.equal(query(`SELECT to_regclass('public.upgrade_marker') IS NULL`), 't');
      assert.equal(query(`SELECT count(*) FROM "schema_migrations"`), '1');
    } finally {
      if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(holder.child.pid), '/T', '/F'], { windowsHide: true });
      else holder.child.kill('SIGKILL');
      await holder.done.catch(() => {});
      await rm(copy.directory, { recursive: true, force: true });
    }
  });

  test('TC-31-13 failed SQL rolls back and a terminated backend leaves no history', async () => {
    const failureName = `pms-sql31-fail-${randomUUID()}`;
    const failureQuery = await startPostgres(failureName);
    const rollbackRoot = await artifactCopy(() => Buffer.from('CREATE TABLE "rollback_marker" (id integer);\nSELECT 1/0;\n'));
    const terminateRoot = await artifactCopy(() => Buffer.from('CREATE TABLE "process_failure_marker" (id integer);\nSELECT pg_terminate_backend(pg_backend_pid());\n'));
    try {
      failureQuery('CREATE TABLE "legacy_marker" (id integer)');
      assert.throws(() => emptyBootstrap({ root: repoRoot, target: `docker:${failureName}`, targetLabel: 'issue-31', query: failureQuery, env: {} }), /not empty/);
      assert.equal(failureQuery(`SELECT to_regclass('public.legacy_marker') IS NOT NULL`), 't');
      assert.equal(failureQuery(`SELECT to_regclass('public.schema_migrations') IS NULL`), 't');
      failureQuery('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
      assert.throws(() => emptyBootstrap({ root: rollbackRoot.directory, target: `docker:${failureName}`, targetLabel: 'issue-31', query: failureQuery, env: {} }), /division by zero/);
      assert.equal(failureQuery(`SELECT to_regclass('public.rollback_marker') IS NULL`), 't');
      assert.equal(failureQuery(`SELECT to_regclass('public.schema_migrations') IS NULL`), 't');
      assert.throws(() => emptyBootstrap({ root: terminateRoot.directory, target: `docker:${failureName}`, targetLabel: 'issue-31', query: failureQuery, env: {} }));
      assert.equal(failureQuery(`SELECT to_regclass('public.process_failure_marker') IS NULL`), 't');
      assert.equal(failureQuery(`SELECT to_regclass('public.schema_migrations') IS NULL`), 't');
    } finally {
      removeContainer(failureName);
      await rm(rollbackRoot.directory, { recursive: true, force: true });
      await rm(terminateRoot.directory, { recursive: true, force: true });
    }
  });

  test('TC-31-15 snapshot bootstrap and migration replay have the same catalog until an intentional drift', async () => {
    const replayName = `pms-sql31-replay-${randomUUID()}`;
    const replayQuery = await startPostgres(replayName);
    try {
      emptyBootstrap({ root: repoRoot, target: `docker:${replayName}`, targetLabel: 'issue-31-replay', query: replayQuery, env: {} });
      const left = query(FINGERPRINT_SQL);
      const right = replayQuery(FINGERPRINT_SQL);
      assert.equal(diffFingerprints(left, right).equal, true);
      replayQuery(`COMMENT ON COLUMN companies.name IS 'Intentional documentation drift'`);
      const commentDrift = diffFingerprints(left, replayQuery(FINGERPRINT_SQL));
      assert.equal(commentDrift.equal, false);
      assert.equal(commentDrift.onlyRight.some((line) => line === 'column_comment companies.name Intentional documentation drift'), true);
      replayQuery('ALTER TABLE "companies" ADD COLUMN drift_marker text');
      const drifted = diffFingerprints(left, replayQuery(FINGERPRINT_SQL));
      assert.equal(drifted.equal, false);
      assert.equal(drifted.onlyRight.some((line) => line.includes('drift_marker')), true);
    } finally {
      removeContainer(replayName);
    }
  });

  test('TC-31-15 replaying a later migration matches a snapshot that includes it', async () => {
    const addition = 'CREATE INDEX "company_name_review_idx" ON "companies" ("name");\n';
    const snapshotRoot = await artifactCopy((schema) => Buffer.concat([schema, Buffer.from(`\n${addition}`)]));
    const replayRoot = await artifactCopy();
    const snapshotName = `pms-sql31-snap-${randomUUID()}`;
    const replayName = `pms-sql31-step-${randomUUID()}`;
    try {
      await writeFile(join(replayRoot.directory, 'database', 'migrations', '0002_company_name_idx.sql'), addition);
      replayRoot.migrations.push({
        version: '0002', name: 'company_name_idx', kind: 'sql', script: 'database/migrations/0002_company_name_idx.sql', checksum: sha256(addition),
      });
      await writeFile(join(replayRoot.directory, 'database', 'migrations', 'manifest.json'), JSON.stringify({
        revision: '31.0.0', lockTimeoutMs: 5000, statementTimeoutMs: 120000, migrations: replayRoot.migrations,
      }));
      const snapshotQuery = await startPostgres(snapshotName);
      const replayQuery = await startPostgres(replayName);
      emptyBootstrap({ root: snapshotRoot.directory, target: `docker:${snapshotName}`, targetLabel: 'issue-31-snapshot', query: snapshotQuery, env: {} });
      emptyBootstrap({ root: replayRoot.directory, target: `docker:${replayName}`, targetLabel: 'issue-31-replay', query: replayQuery, env: {} });
      assert.equal(diffFingerprints(snapshotQuery(FINGERPRINT_SQL), replayQuery(FINGERPRINT_SQL)).equal, false);
      upgrade({ root: replayRoot.directory, target: `docker:${replayName}`, targetLabel: 'issue-31-replay', query: replayQuery, env: {} });
      assert.equal(diffFingerprints(snapshotQuery(FINGERPRINT_SQL), replayQuery(FINGERPRINT_SQL)).equal, true);
      assert.equal(replayQuery(`SELECT indexname FROM pg_indexes WHERE indexname = 'company_name_review_idx'`), 'company_name_review_idx');
    } finally {
      removeContainer(snapshotName);
      removeContainer(replayName);
      await rm(snapshotRoot.directory, { recursive: true, force: true });
      await rm(replayRoot.directory, { recursive: true, force: true });
    }
  });
}
