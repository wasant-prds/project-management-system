import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { docker, sql, inventory, backup, verifyRollout, rehearse, health, config } from '../../scripts/db-rollout.mjs';

test('real PostgreSQL backup/restore and staged Customer/external identity gates preserve exact history',
  { skip: process.env.PMS_RUN_ROLLOUT_DOCKER_TESTS !== '1', timeout:180000 }, async () => {
    const name=`pms-issue16-${randomUUID()}`, folder=await mkdtemp(join(tmpdir(),'pms-issue16-'));
    const site=`issue16-${randomUUID()}`, app=`pms-app-${site}`, migration=`pms-migrations-${site}`;
    try {
      docker(['run','--rm','-d','--name',name,'--network','none','-e','POSTGRES_HOST_AUTH_METHOD=trust',
        '-e','POSTGRES_USER=postgres','-e','POSTGRES_DB=postgres','postgres:16-alpine','-c','timezone=Asia/Bangkok']);
      let ready=false;
      for (let i=0;i<60;i++) { try { sql(name,'SELECT 1;');ready=true;break; } catch {} await new Promise(r => setTimeout(r,250)); }
      assert.ok(ready);
      const schema=execFileSync(process.execPath,['node_modules/prisma/build/index.js','migrate','diff','--from-empty','--to-schema-datamodel','prisma/schema.prisma','--script'],{ env:{ ...process.env,DATABASE_URL:'postgresql://synthetic@localhost/synthetic' },stdio:['ignore','pipe','pipe'] });
      sql(name,schema);
      sql(name,`INSERT INTO "User" (id,email,name,password,"updatedAt") VALUES ('owner','owner@fixture.invalid','Fixture','synthetic',localtimestamp);
        INSERT INTO "Project" (id,name,"startDate","dueDate","updatedAt") VALUES ('p','Fixture','2026-09-28 00:00:00','2026-10-01 00:00:00',localtimestamp);
        INSERT INTO work_items (id,title,kind,"projectId","assigneeId","workDate","dueDate","updatedAt") VALUES ('w','Fixture','Task','p','owner',NULL,'2026-10-01 00:00:00',localtimestamp);
        INSERT INTO "TimeEntry" (id,hours,date,"userId","projectId","workItemId","updatedAt") VALUES ('t',1.23456789,'2026-09-28 00:00:00','owner','p','w',localtimestamp);`);
      assert.equal(sql(name,`CREATE TEMP TABLE clock_check(t timestamp(3) without time zone DEFAULT now()); INSERT INTO clock_check DEFAULT VALUES; SELECT abs(extract(epoch FROM (t - (now() AT TIME ZONE 'Asia/Bangkok')))) < 1 FROM clock_check;`),'t');
      const settings={ ...config({ APP_ENV:'dev',BACKUP_DIR:folder }),container:name };
      sql(name,`ALTER DATABASE postgres SET timezone TO 'UTC';`);
      await assert.rejects(backup(settings),/timezone/);
      sql(name,`ALTER DATABASE postgres SET timezone TO 'Asia/Bangkok';`);
      const file=await backup(settings);
      assert.equal(JSON.parse(await readFile(`${file}.json`)).keepDays,30);
      assert.equal(JSON.parse(await readFile(`${file}.verified.json`)).result,'isolated-restore-passed');
      assert.equal((await verifyRollout(settings,file,'baseline')).result,'passed');
      sql(name,`CREATE TABLE "Customer" (id text PRIMARY KEY, name text NOT NULL);
        ALTER TABLE "Project" ADD COLUMN "customerId" text REFERENCES "Customer"(id) ON DELETE RESTRICT;
        CREATE TABLE "GitLabProjectMapping" (id text PRIMARY KEY,"canonicalGitLabInstanceUrl" text NOT NULL,"gitLabProjectId" bigint NOT NULL,"projectId" text NOT NULL REFERENCES "Project"(id) ON DELETE RESTRICT, UNIQUE("canonicalGitLabInstanceUrl","gitLabProjectId"));
        CREATE TABLE "ExternalWorkItemReference" (id text PRIMARY KEY,provider text NOT NULL,"canonicalGitLabInstanceUrl" text NOT NULL,"gitLabProjectId" bigint NOT NULL,"gitLabGlobalIssueId" bigint NOT NULL,"workItemId" text NOT NULL UNIQUE REFERENCES work_items(id) ON DELETE RESTRICT, UNIQUE(provider,"canonicalGitLabInstanceUrl","gitLabProjectId","gitLabGlobalIssueId"));`);
      assert.equal((await verifyRollout(settings,file,'additive')).result,'passed');
      await assert.rejects(verifyRollout(settings,file,'backfilled'),/Unmapped/);
      sql(name,`INSERT INTO "Customer" VALUES ('c','Approved fixture'); UPDATE "Project" SET "customerId"='c' WHERE id='p';`);
      assert.equal((await verifyRollout(settings,file,'backfilled')).result,'passed');
      sql(name,`ALTER TABLE "Project" ALTER COLUMN "customerId" SET NOT NULL;`);
      assert.equal((await verifyRollout(settings,file,'required')).result,'passed');
      const envPath=join(folder,'.env');
      await writeFile(envPath,'APP_ENV=dev\nAPP_ORIGIN=http://localhost:3000\nRUNTIME_DOCKER=true\nPOSTGRES_HOST=127.0.0.1\nPOSTGRES_USER=postgres\nPOSTGRES_DB=postgres\nPOSTGRES_PASSWORD=synthetic\nOWNER_GATE_USERNAME=owner\nOWNER_GATE_PASSWORD=synthetic-owner-password-at-least-32\n');
      docker(['run','-d','--name',migration,'--network','none','postgres:16-alpine','true']);
      docker(['run','--rm','-d','--name',app,'--network',`container:${name}`,'--env-file',envPath,
        process.env.PMS_ROLLOUT_TEST_IMAGE || 'project-management-system-production-app:latest']);
      const fetcher=async () => {
        const result=JSON.parse(docker(['exec',app,'node','-e',`fetch('http://127.0.0.1:3000/api/health').then(async r=>console.log(JSON.stringify({status:r.status,body:await r.json()}))).catch(()=>process.exit(1))`]).toString());
        return { status:result.status,json:async () => result.body };
      };
      let appReady=false;
      for (let i=0;i<60;i++) { try { if ((await fetcher()).status===200) { appReady=true;break; } } catch {} await new Promise(r=>setTimeout(r,250)); }
      assert.ok(appReady);
      assert.equal((await health({ ...settings,site },{ APP_ORIGIN:'http://localhost:3000' },docker,fetcher)).app,'healthy');
      sql(name,`UPDATE "TimeEntry" SET hours=2 WHERE id='t';`);
      await assert.rejects(verifyRollout(settings,file,'required'),/History verification failed/);
      sql(name,`UPDATE "TimeEntry" SET hours=1.23456789 WHERE id='t';`);
      sql(name,`INSERT INTO "Project" (id,name,"startDate","dueDate","updatedAt","customerId") SELECT 'p2',name,"startDate","dueDate","updatedAt","customerId" FROM "Project" WHERE id='p'; UPDATE "TimeEntry" SET "projectId"='p2';`);
      const mismatch=await backup(settings); // Backup preserves legacy defects; promotion must reject them.
      await assert.rejects(verifyRollout(settings,mismatch,'required'),/relation mismatch/);
      const data=await readFile(file); await writeFile(file,data.subarray(0,30));
      await assert.rejects(rehearse(file,'dev'),/checksum/);
      const corrupted=data.subarray(0,30), manifest=JSON.parse(await readFile(`${file}.json`));
      manifest.sha256=createHash('sha256').update(corrupted).digest('hex'); manifest.bytes=corrupted.length;
      await writeFile(`${file}.json`,JSON.stringify(manifest));
      await assert.rejects(rehearse(file,'dev'),/diagnostics withheld/);
      const live=inventory(name); assert.equal(live.tables.TimeEntry.rows,1);
    } finally {
      for (const target of [app,migration]) { try { docker(['rm','-f',target]); } catch {} }
      docker(['rm','-f',name]); await rm(folder,{ recursive:true,force:true });
    }
  });
