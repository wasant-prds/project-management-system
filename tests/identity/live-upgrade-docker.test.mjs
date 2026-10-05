import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { backup, docker, sql } from '../../scripts/db-rollout.mjs'
import { databaseTargetFingerprint } from '../../scripts/db-schema-rollout-gate.mjs'
import { exportPostCutoverWrites, readLiveMappings, rollbackPlan, runLiveUpgrade } from '../../scripts/sql-live-upgrade.mjs'
import { createRuntimeQuery } from '../../scripts/sql-runtime.mjs'

const enabled = process.env.PMS_RUN_SQL_LIVE_UPGRADE_DOCKER_TESTS === '1'
const SOURCE_DDL = `
CREATE TABLE "User" (id text PRIMARY KEY, email text NOT NULL UNIQUE, name text NOT NULL, password text NOT NULL, role text NOT NULL, avatar text, phone text, theme text NOT NULL, locale text NOT NULL, status text NOT NULL, "joinDate" timestamp(3) NOT NULL, "createdAt" timestamp(3) NOT NULL, "updatedAt" timestamp(3) NOT NULL);
CREATE TABLE "Company" (id text PRIMARY KEY, code text, "displayName" text, location text, name text NOT NULL, industry text, email text, phone text, address text, website text, logo text, description text, "createdAt" timestamp(3) NOT NULL, "updatedAt" timestamp(3) NOT NULL);
CREATE TABLE "Project" (id text PRIMARY KEY, name text NOT NULL, description text, status text NOT NULL, priority text NOT NULL, "startDate" date NOT NULL, "dueDate" date NOT NULL, budget numeric, spent numeric, progress integer NOT NULL, "colorProject" text, "createdAt" timestamp(3) NOT NULL, "updatedAt" timestamp(3) NOT NULL, "creatorId" text REFERENCES "User"(id), "companyId" text NOT NULL REFERENCES "Company"(id));
CREATE TABLE "ProjectMember" (id text PRIMARY KEY, role text NOT NULL, "joinedAt" timestamp(3) NOT NULL, "projectId" text NOT NULL REFERENCES "Project"(id), "userId" text NOT NULL REFERENCES "User"(id), UNIQUE("projectId", "userId"));
CREATE TABLE work_items (id text PRIMARY KEY, title text NOT NULL, description text, kind text NOT NULL, priority text NOT NULL, role text, status text NOT NULL, labels_types text[] NOT NULL, "workDate" date, "dueDate" date, "submittedAt" timestamp(3), "createdAt" timestamp(3) NOT NULL, "updatedAt" timestamp(3) NOT NULL, "projectId" text NOT NULL REFERENCES "Project"(id), "assigneeId" text NOT NULL REFERENCES "User"(id));
CREATE TABLE "TimeEntry" (id text PRIMARY KEY, description text, remarks text, hours numeric(65,30) NOT NULL, date date NOT NULL, status text, "createdAt" timestamp(3) NOT NULL, "updatedAt" timestamp(3) NOT NULL, "userId" text NOT NULL REFERENCES "User"(id), "projectId" text REFERENCES "Project"(id), "workItemId" text REFERENCES work_items(id));
CREATE TABLE "Milestone" (id text PRIMARY KEY, name text NOT NULL, description text, "dueDate" timestamp(3) NOT NULL, status text NOT NULL, "createdAt" timestamp(3) NOT NULL, "updatedAt" timestamp(3) NOT NULL, "projectId" text NOT NULL REFERENCES "Project"(id));
CREATE TABLE "Document" (id text PRIMARY KEY, name text NOT NULL, description text, "fileUrl" text NOT NULL, "fileSize" integer, "fileType" text, "createdAt" timestamp(3) NOT NULL, "updatedAt" timestamp(3) NOT NULL, "projectId" text REFERENCES "Project"(id), "uploaderId" text REFERENCES "User"(id));
CREATE TABLE "ActivityLog" (id text PRIMARY KEY, action text NOT NULL, entity text NOT NULL, "entityId" text NOT NULL, description text, metadata jsonb, "createdAt" timestamp(3) NOT NULL, "userId" text REFERENCES "User"(id), "projectId" text REFERENCES "Project"(id));
CREATE TABLE "GitLabProjectMapping" (id text PRIMARY KEY, "canonicalGitLabInstanceUrl" text NOT NULL, "gitLabProjectId" text NOT NULL, "projectId" text NOT NULL REFERENCES "Project"(id), "approvedLabelMap" jsonb NOT NULL, "firstSyncApprovedAt" timestamp(3), "createdAt" timestamp(3) NOT NULL, "updatedAt" timestamp(3) NOT NULL);
CREATE TABLE "ExternalWorkItemReference" (id text PRIMARY KEY, provider text NOT NULL, "canonicalGitLabInstanceUrl" text NOT NULL, "gitLabProjectId" text NOT NULL, "gitLabGlobalIssueId" text NOT NULL, "gitLabIssueIid" text NOT NULL, "externalUrl" text NOT NULL, "projectId" text NOT NULL REFERENCES "Project"(id), "remoteCreatedAt" timestamp(3) NOT NULL, "remoteUpdatedAt" timestamp(3) NOT NULL, "lastSyncedAt" timestamp(3) NOT NULL, "workItemId" text NOT NULL UNIQUE REFERENCES work_items(id));
CREATE TABLE "Comment" (id text PRIMARY KEY, content text NOT NULL, "createdAt" timestamp NOT NULL, "updatedAt" timestamp NOT NULL, "authorId" text NOT NULL REFERENCES "User"(id));
CREATE TABLE "Notification" (id text PRIMARY KEY, title text NOT NULL, message text NOT NULL, type text NOT NULL, read boolean NOT NULL, link text, "createdAt" timestamp NOT NULL, "userId" text NOT NULL REFERENCES "User"(id));
`
const SOURCE_ROWS = `
INSERT INTO "User" VALUES ('owner-cuid','owner@fixture.invalid','Fixture owner','fixture-password-hash','owner',NULL,NULL,'dark','en','Active','2026-10-04 10:00:00.000','2026-10-04 10:00:00.000','2026-10-04 10:00:00.000');
INSERT INTO "Company" VALUES ('company-cuid',NULL,NULL,NULL,'Fixture company',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'2026-10-04 10:00:00.000','2026-10-04 10:00:00.000');
INSERT INTO "Project" VALUES ('project-cuid','Fixture project',NULL,'In Progress','High','2026-10-01','2026-10-31',100.00,4.25,40,NULL,'2026-10-04 10:00:00.000','2026-10-04 10:00:00.000','owner-cuid','company-cuid');
INSERT INTO "ProjectMember" VALUES ('member-cuid','owner','2026-10-04 10:00:00.000','project-cuid','owner-cuid');
INSERT INTO work_items VALUES ('work-cuid','Fixture work',NULL,'Task','medium','Developer','completed',ARRAY['reviewed'],'2026-10-02',NULL,NULL,'2026-10-04 10:00:00.000','2026-10-04 10:00:00.000','project-cuid','owner-cuid');
INSERT INTO "TimeEntry" VALUES ('entry-cuid','Fixture hours',NULL,1.250000000000000000000000000000,'2026-10-02','Completed','2026-10-04 10:00:00.000','2026-10-04 10:00:00.000','owner-cuid','project-cuid','work-cuid');
INSERT INTO "Milestone" VALUES ('milestone-cuid','Fixture milestone',NULL,'2026-10-10 10:30:00.000','In Progress','2026-10-04 10:00:00.000','2026-10-04 10:00:00.000','project-cuid');
INSERT INTO "Document" VALUES ('document-cuid','Fixture document',NULL,'https://files.example.invalid/fixture',123,'text/plain','2026-10-04 10:00:00.000','2026-10-04 10:00:00.000','project-cuid','owner-cuid');
INSERT INTO "ActivityLog" VALUES ('activity-cuid','updated','task','work-cuid',NULL,'{"memo":"kept","precise":123.456789012345678901234567890123456789}', '2026-10-04 10:00:00.000','owner-cuid','project-cuid');
INSERT INTO "GitLabProjectMapping" VALUES ('gitlab-map-cuid','https://gitlab.example.invalid','42','project-cuid','{"Bug":"Incident"}','2026-10-04 10:00:00.000','2026-10-04 10:00:00.000','2026-10-04 10:00:00.000');
INSERT INTO "ExternalWorkItemReference" VALUES ('gitlab-ref-cuid','gitlab','https://gitlab.example.invalid','42','9001','19','https://gitlab.example.invalid/group/project/issues/19','project-cuid','2026-10-04 10:00:00.000','2026-10-04 10:00:00.000','2026-10-04 10:00:00.000','work-cuid');
INSERT INTO "Comment" VALUES ('comment-cuid','private synthetic comment','2026-10-04 10:00:00.000','2026-10-04 10:00:00.000','owner-cuid');
INSERT INTO "Notification" VALUES ('notification-cuid','fixture title','private synthetic notification','info',false,NULL,'2026-10-04 10:00:00.000','owner-cuid');
`

test('TC-33-LIVE-PG: verified legacy snapshot converts to isolated PostgreSQL 16 with mapping reuse and preservation', {
  skip: !enabled,
  timeout: 240000,
}, async () => {
  const source = `pms-live-source-fixture-${randomUUID()}`
  const target = `pms-live-target-fixture-${randomUUID()}`
  const folder = await mkdtemp(join(tmpdir(), 'pms-live-upgrade-pg-'))
  try {
    for (const name of [source, target]) {
      docker(['run', '--rm', '-d', '--name', name, '--network', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust',
        '-e', 'POSTGRES_USER=postgres', '-e', 'POSTGRES_DB=postgres', 'postgres:16-alpine', '-c', 'timezone=Asia/Bangkok'])
      let ready = false
      for (let attempt = 0; attempt < 80; attempt += 1) {
        try { sql(name, 'SELECT 1;'); ready = true; break } catch { await new Promise((done) => setTimeout(done, 250)) }
      }
      assert.ok(ready, `PostgreSQL container ${name} did not become ready`)
    }
    const runtimeUrl = 'postgresql://postgres:synthetic@127.0.0.1:5432/postgres?schema=public&connection_limit=5&pool_timeout=20&options=-c%20timezone%3DAsia%2FBangkok'
    const runtimeQuery = createRuntimeQuery(runtimeUrl, { PMS_SQL_RUNTIME_APPLY: '1' }, (command, args, options) => {
      assert.equal(command, 'psql')
      const output = docker(['exec', '-i', '-e', `PGPASSWORD=${options.env.PGPASSWORD}`, target, 'psql', ...args], options.input)
      return { status: 0, stdout: output.toString(), stderr: '' }
    })
    assert.equal(runtimeQuery("SELECT current_setting('TimeZone')"), 'Asia/Bangkok')
    sql(source, SOURCE_DDL)
    sql(source, SOURCE_ROWS)
    const archivePath = await backup({ site: 'uat', directory: folder, container: source, days: 1 })
    const archiveManifest = JSON.parse(await readFile(`${archivePath}.json`, 'utf8'))
    assert.equal(JSON.parse(await readFile(`${archivePath}.verified.json`, 'utf8')).result, 'isolated-restore-passed')

    sql(target, await readFile(resolve('database/schema.sql'), 'utf8'))
    const sqlManifest = JSON.parse(await readFile(resolve('database/migrations/manifest.json'), 'utf8'))
    sql(target, `INSERT INTO "schema_migrations" ("version","checksum","schema_revision","status","script_name","target_label") VALUES ('0001','${sqlManifest.migrations[0].checksum}','${sqlManifest.revision}','applied','database/schema.sql','uat');`)
    const targetUrl = 'postgresql://reviewer:synthetic@replacement.invalid:5432/pms_uat?schema=public'
    const env = {
      APP_ENV: 'uat',
      DATABASE_URL: 'postgresql://reviewer:synthetic@source.invalid:5432/legacy',
      OWNER_USER_ID: 'owner-cuid',
      PMS_LIVE_UPGRADE_APPROVED: 'true',
      PMS_LIVE_UPGRADE_APPROVED_SOURCE_SHA256: archiveManifest.sha256,
      PMS_LIVE_UPGRADE_APPROVED_TARGET_SHA256: databaseTargetFingerprint(targetUrl, 'uat'),
      PMS_LIVE_UPGRADE_SOURCE_FROZEN: 'true',
      PMS_LIVE_UPGRADE_DELTA_RECONCILED: 'true',
      PMS_LIVE_UPGRADE_OWNER_MAPPING_VERIFIED: 'true',
    }
    const query = (statement) => {
      const result = spawnSync('docker', [
        'exec', '-i', target, 'sh', '-c',
        'export PGTZ=Asia/Bangkok PGOPTIONS="-c timezone=Asia/Bangkok"; exec "$@" -U "$POSTGRES_USER" -d "$POSTGRES_DB"',
        'db-operation', 'psql', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1',
      ], { input: statement, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 180000, windowsHide: true })
      if (result.error || result.status !== 0) throw new Error(`Synthetic isolated PostgreSQL command failed: ${result.stderr}`)
      return (result.stdout ?? '').trim()
    }
    const mappingPath = join(folder, 'live-identity-mappings.json')
    const preservePath = join(folder, 'legacy-history-preservation.json')
    const result = await runLiveUpgrade({ sourceArchivePath: archivePath, target: targetUrl, mappingPath, preservePath, env, query })
    assert.equal(result.sourceKind, 'newer-legacy')
    assert.equal(result.tableCounts.users, 1)
    assert.equal(result.tableCounts.project_members, 1)
    assert.equal(result.tableCounts.external_project_mappings, 1)
    assert.equal(result.tableCounts.external_work_item_references, 1)
    assert.deepEqual(result.preservedRows, { Comment: 1, Notification: 1 })
    assert.equal(sql(target, 'SELECT hours::text FROM "work_logs"'), '1.250000000000000000000000000000')
    assert.equal(sql(target, 'SELECT "w"."project_id" = "p"."id" AND "l"."work_item_id" = "w"."id" FROM "work_logs" l JOIN "work_items" w ON w.id=l.work_item_id JOIN "projects" p ON p.id=w.project_id'), 't')
    assert.equal(sql(target, 'SELECT metadata::text FROM "activity_logs"'), '{"memo": "kept", "precise": 123.456789012345678901234567890123456789}')
    const mappings = await readLiveMappings(mappingPath)
    assert.equal(mappings.find((row) => row.entityName === 'users' && row.oldId === 'owner-cuid').newPublicId.length, 36)
    const preserved = JSON.parse(await readFile(preservePath, 'utf8'))
    assert.equal(preserved.tables.Comment[0].content, 'private synthetic comment')
    assert.equal(preserved.tables.Notification[0].message, 'private synthetic notification')
    assert.equal(sql(source, 'SELECT count(*) FROM "Project"'), '1', 'source backup rehearsal must not mutate the original')
    await assert.rejects(runLiveUpgrade({ sourceArchivePath: archivePath, target: targetUrl, mappingPath, preservePath, env, query }), /Replacement target contains application data/)

    const ownerId = sql(target, 'SELECT id::text FROM "users"')
    const projectId = sql(target, 'SELECT id::text FROM "projects"')
    const cutoverAt = sql(target, `SELECT to_char(public.pms_bangkok_now() - interval '1 second', 'YYYY-MM-DD"T"HH24:MI:SS.MS')`)
    const baselineWorkId = mappings.find((row) => row.entityName === 'work_items' && row.oldId === 'work-cuid').newId
    const postCutoverWorkId = sql(target, `INSERT INTO "work_items" ("title","kind","priority","status","project_id","assignee_id") VALUES ('post-cutover fixture','Task','low','todo','${projectId}','${ownerId}') RETURNING id::text;`)
    assert.ok(BigInt(postCutoverWorkId) > BigInt(baselineWorkId), 'aligned identity sequence allocates beyond imported numeric keys')
    sql(target, `UPDATE "work_items" SET "title"='edited after cutover', "updated_at"='2026-10-05 10:00:00.000' WHERE "id"='${baselineWorkId}';`)
    const deltaPath = join(folder, 'post-cutover-reconciliation.json')
    const delta = await exportPostCutoverWrites({
      query,
      mappings,
      cutoverAt,
      outputPath: deltaPath,
      sourceChecksum: archiveManifest.sha256,
    })
    assert.deepEqual(delta.changedRows, { work_items: 2 })
    assert.deepEqual(rollbackPlan('after-writes'), {
      action: 'reconcile-post-cutover-writes',
      reconcile: true,
      dataLoss: 'restoring the pre-cutover backup drops writes made after cutover unless they are exported first',
    })
    const reconciliation = JSON.parse(await readFile(deltaPath, 'utf8'))
    assert.equal(reconciliation.tables.work_items.length, 2)
    assert.equal(reconciliation.tables.work_items.some((row) => row.title === 'edited after cutover'), true)
    assert.equal(sql(source, 'SELECT count(*) FROM "work_items"'), '1', 'rollback rehearsal keeps the original source intact')
  } finally {
    for (const name of [source, target]) { try { docker(['rm', '-f', name]) } catch {} }
    await rm(folder, { recursive: true, force: true })
  }
})
