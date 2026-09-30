import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { verifyCompose } from '../../scripts/runtime-verify.mjs';

const docker = (args) => {
  try { return execFileSync('docker', args, { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { throw new Error('Isolated Docker test command failed (diagnostics withheld)'); }
};
const enabled = process.env.PMS_RUN_DOCKER_TESTS === '1';

test('scheduled backup fails safely and publishes only successful dumps without leaking diagnostics', { skip: !enabled }, async () => {
  const folder=await mkdtemp(join(tmpdir(),'pms-daily-backup-'));
  try {
    await mkdir(join(folder,'bin')); await mkdir(join(folder,'backups'));
    await writeFile(join(folder,'bin','pg_dump'),'#!/bin/sh\necho synthetic-dump\necho synthetic-private-password >&2\nexit "${DUMP_EXIT:-0}"\n');
    await writeFile(join(folder,'bin','sleep'),'#!/bin/sh\nexit 77\n');
    for (const fail of ['1','0']) {
      const args=['run','--rm','--network','none','--mount',`type=bind,source=${folder},target=/fixture`,
        '--mount',`type=bind,source=${join(folder,'backups')},target=/backups`,
        '--mount',`type=bind,source=${join(process.cwd(),'scripts')},target=/scripts,readonly`,
        '-e','PATH=/fixture/bin:/usr/bin:/bin','-e','APP_ENV=prod','-e','BACKUP_DIR=/backups',
        '-e','BACKUP_KEEP_DAYS=','-e','POSTGRES_PASSWORD=synthetic-private-password','-e','POSTGRES_USER=synthetic',
        '-e','POSTGRES_DB=synthetic','-e',`DUMP_EXIT=${fail}`,'--entrypoint','sh','postgres:16-alpine',
        '-c','chmod +x /fixture/bin/* && sh /scripts/db-backup-scheduled.sh'];
      const result=spawnSync('docker',args,{ encoding:'utf8',timeout:30000 });
      assert.equal(result.status,fail==='1'?1:77);
      assert.doesNotMatch(`${result.stdout}${result.stderr}`,/synthetic-private-password/);
      const { readdir }=await import('node:fs/promises'); const files=await readdir(join(folder,'backups'));
      assert.equal(files.length,fail==='1'?0:1);
      if (fail==='0') assert.match(files[0],/^pms_prod_daily_.*\.dump$/);
    }
  } finally { await rm(folder,{ recursive:true,force:true }); }
});

test('effective Dev/UAT/Production Compose has loopback ports, secrets and timezone', { skip: !enabled }, async () => {
  docker(['run', '--rm', '--network', 'none', '--mount', `type=bind,source=${join(process.cwd(), 'scripts')},target=/scripts,readonly`, '--entrypoint', 'sh', 'postgres:16-alpine', '-c',
    'for script in /scripts/docker-entrypoint-app.sh /scripts/docker-entrypoint-dev.sh /scripts/docker-entrypoint-migrate.sh /scripts/db-push-safe.sh /scripts/init-postgres.sh; do sh -n "$script" || exit 1; done']);
  const folder = await mkdtemp(join(tmpdir(), 'pms-compose-test-'));
  try {
    const envPath = join(folder, '.env');
    for (const [site, file, port] of [['dev', 'docker-compose.yml', 3777], ['uat', 'docker-compose.uat.yml', 3001], ['prod', 'docker-compose.prod.yml', 3002]]) {
      await writeFile(envPath, `APP_ENV=${site}\nAPP_PORT=${port}\nAPP_ORIGIN=http://localhost:${port}\nPOSTGRES_USER=synthetic\nPOSTGRES_PASSWORD=synthetic\nPOSTGRES_DB=synthetic\nRUN_SEED=false\nOWNER_GATE_USERNAME=owner\nOWNER_GATE_PASSWORD=synthetic-owner-password-at-least-32\nGITLAB_TOKEN=synthetic-gitlab-token\nPOSTGRES_DATA_DIR=${folder.replaceAll('\\', '/')}\n`);
      await writeFile(envPath, `BACKUP_DIR=${folder.replaceAll('\\', '/')}\nBACKUP_KEEP_DAYS=3\n`, { flag: 'a' });
      const config = JSON.parse(docker(['compose', '--env-file', envPath, '-f', file, 'config', '--format', 'json']));
      assert.equal(verifyCompose(config), true);
      assert.equal(config.services.app.environment.APP_ENV, site);
      assert.equal(config.services.migrations.environment.TZ, 'Asia/Bangkok');
      assert.equal(config.services.migrations.environment.RUN_SEED, 'false');
      assert.equal(config.services.migrations.environment.APP_ENV, site);
      assert.equal(config.services.migrations.environment.DB_SCHEMA_BACKUP_RESTORE_VERIFIED, 'false');
      assert.equal(config.services.migrations.environment.DB_SCHEMA_EMPTY_DATABASE_VERIFIED, 'false');
      assert.equal(config.services.migrations.environment.DB_SCHEMA_SYNC_APPROVED, 'false');
      assert.equal(config.services.app.environment.GITLAB_TOKEN, 'synthetic-gitlab-token');
      assert.equal(config.secrets, undefined);
      assert.equal(config.services.app.secrets, undefined);
    }
    // Blank/unset BACKUP_DIR must mount the same default used by the operations CLI.
    await writeFile(envPath, 'APP_ENV=prod\nAPP_ORIGIN=http://localhost:3002\nPOSTGRES_USER=synthetic\nPOSTGRES_PASSWORD=synthetic\nPOSTGRES_DB=synthetic\nOWNER_GATE_USERNAME=owner\nOWNER_GATE_PASSWORD=synthetic-owner-password-at-least-32\nBACKUP_KEEP_DAYS=\nBACKUP_DIR=\n');
    const defaults = JSON.parse(docker(['compose','--env-file',envPath,'-f','docker-compose.prod.yml','--profile','backup','config','--format','json']));
    assert.equal(defaults.services.backup.environment.BACKUP_DIR, './database/backups/postgres_data');
    assert.equal(defaults.services.backup.environment.BACKUP_KEEP_DAYS,'30');
    assert.equal(defaults.volumes.postgres_data.labels['com.dhas.retention.days'],'30');
    const defaultDir = join(process.cwd(),'database','backups','postgres_data').replaceAll('\\','/');
    for (const service of ['postgres','backup']) assert.equal(defaults.services[service].volumes.find(v => v.target === '/backups').source.replaceAll('\\','/'), defaultDir);
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('migration entrypoint skips absent seed by default and explains explicit seed failure safely', { skip: !enabled }, async () => {
  const folder = await mkdtemp(join(tmpdir(), 'pms-seed-preflight-'));
  try {
    await mkdir(join(folder, 'bin'));
    await mkdir(join(folder, 'node_modules', '.bin'), { recursive: true });
    await writeFile(join(folder, 'bin', 'node'), '#!/bin/sh\ncase "$1" in\n  /app/scripts/database-url.mjs) printf synthetic-database-url ;;\n  scripts/db-schema-rollout-gate.mjs)\n    [ "${DB_SCHEMA_BACKUP_RESTORE_VERIFIED:-false}" = true ] && [ "${DB_SCHEMA_SYNC_APPROVED:-false}" = true ] && [ "${DB_SCHEMA_SYNC_APPROVED_ENV:-}" = "${APP_ENV:-}" ] && [ -n "${DB_SCHEMA_SYNC_APPROVED_SCHEMA_SHA256:-}" ] || { echo \'Schema rollout gate fixture rejected approval.\' >&2; exit 1; }\n    ;;\n  *) exit 1 ;;\nesac\n', { mode: 0o755 });
    await writeFile(join(folder, 'node_modules', '.bin', 'prisma'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
    await writeFile(join(folder, 'bin', 'pnpm'), '#!/bin/sh\nif [ "$*" = "prisma db seed" ]; then echo "Seed config not found; synthetic-private-password" >&2; exit 1; fi\nexit 0\n', { mode: 0o755 });
    for (const setting of [undefined, 'false', 'true']) {
      const args = ['run', '--rm', '--network', 'none', '--mount', `type=bind,source=${folder},target=/fixture`, '--mount', `type=bind,source=${join(process.cwd(), 'scripts')},target=/fixture/scripts,readonly`, '-w', '/fixture', '-e', 'PATH=/fixture/bin:/usr/bin:/bin', '-e', 'SEEDS_ROOT=/fixture', '--entrypoint', 'sh'];
      args.push('-e', 'APP_ENV=dev', '-e', 'DB_SCHEMA_BACKUP_RESTORE_VERIFIED=true', '-e', 'DB_SCHEMA_SYNC_APPROVED=true', '-e', 'DB_SCHEMA_SYNC_APPROVED_ENV=dev', '-e', `DB_SCHEMA_SYNC_APPROVED_SCHEMA_SHA256=${'a'.repeat(64)}`);
      if (setting !== undefined) args.push('-e', `RUN_SEED=${setting}`);
      args.push('postgres:16-alpine', '-c', 'chmod +x /fixture/bin/* /fixture/node_modules/.bin/prisma && sh /fixture/scripts/docker-entrypoint-migrate.sh');
      const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 30000 });
      const output = `${result.stdout || ''}${result.stderr || ''}`;
      assert.doesNotMatch(output, /synthetic-private-password|synthetic-database-url/);
      assert.equal(result.status, setting === 'true' ? 1 : 0, 'entrypoint exit status');
      if (setting === 'true') assert.match(output, /Seed config is missing\. Set RUN_SEED=false/);
      else assert.match(output, /RUN_SEED=false.*skipping seed/);
    }
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('migration entrypoint blocks Prisma schema sync before any database command without an approval gate', { skip: !enabled }, async () => {
  const folder = await mkdtemp(join(tmpdir(), 'pms-schema-gate-'));
  try {
    await mkdir(join(folder, 'bin'));
    await mkdir(join(folder, 'node_modules', '.bin'), { recursive: true });
    await writeFile(join(folder, 'bin', 'node'), '#!/bin/sh\nif [ "$1" = "/app/scripts/database-url.mjs" ]; then printf synthetic-database-url; exit 0; fi\nif [ "$1" = "scripts/db-schema-rollout-gate.mjs" ]; then echo \'Schema sync is blocked until approval.\' >&2; exit 1; fi\nexit 1\n', { mode: 0o755 });
    await writeFile(join(folder, 'bin', 'pnpm'), '#!/bin/sh\nprintf "%s\\n" "$*" >> /fixture/commands.log\nexit 0\n', { mode: 0o755 });
    const args = ['run', '--rm', '--network', 'none', '--mount', `type=bind,source=${folder},target=/fixture`, '--mount', `type=bind,source=${join(process.cwd(), 'scripts')},target=/fixture/scripts,readonly`, '-w', '/fixture', '-e', 'PATH=/fixture/bin:/usr/bin:/bin', '-e', 'SEEDS_ROOT=/fixture', '-e', 'APP_ENV=dev', '--entrypoint', 'sh', 'postgres:16-alpine', '-c', 'chmod +x /fixture/bin/* && sh /fixture/scripts/docker-entrypoint-migrate.sh'];
    const result = spawnSync('docker', args, { encoding: 'utf8', timeout: 30000 });
    assert.equal(result.status, 1);
    assert.match(`${result.stdout || ''}${result.stderr || ''}`, /Schema sync is blocked until approval/);
    await assert.rejects(readFile(join(folder, 'commands.log')));
  } finally { await rm(folder, { recursive: true, force: true }); }
});

test('isolated PostgreSQL server and real Prisma sessions use Bangkok; wall-clock defaults match', { skip: !enabled, timeout: 60000 }, async () => {
  const name = `pms-issue15-test-${process.pid}-${Date.now()}`;
  try {
    docker(['run', '--rm', '-d', '--name', name, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', '-e', 'TZ=Asia/Bangkok', '-e', 'PGTZ=Asia/Bangkok', 'postgres:16-alpine', '-c', 'timezone=Asia/Bangkok']);
    let result = '';
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        result = docker(['exec', name, 'psql', '-U', 'postgres', '-Atc', "SELECT current_setting('TimeZone'), extract(timezone FROM now()), localtimestamp::date = (now() AT TIME ZONE 'Asia/Bangkok')::date"]).trim();
        if (result === 'Asia/Bangkok|25200|t') break;
      }
      catch { await new Promise((resolve) => setTimeout(resolve, 500)); }
      if (result !== 'Asia/Bangkok|25200|t') await new Promise((resolve) => setTimeout(resolve, 500));
    }
    assert.equal(result, 'Asia/Bangkok|25200|t');
    const image = process.env.PMS_PRISMA_TEST_IMAGE || 'project-management-system-production-migrations:latest';
    const code = "const {PrismaClient}=require('@prisma/client'); const p=new PrismaClient({log:[]}); p.$queryRawUnsafe(\"SELECT current_setting('TimeZone') AS timezone\").then(r=>{if(r[0].timezone!=='Asia/Bangkok')process.exitCode=1;else console.log('Prisma timezone verified')}).catch(()=>{process.exitCode=1}).finally(()=>p.$disconnect())";
    const output = docker(['run', '--rm', '--network', `container:${name}`, '--entrypoint', 'node', '-e', 'DATABASE_URL=postgresql://postgres@127.0.0.1:5432/postgres?options=--timezone%3DAsia%2FBangkok', image, '-e', code]);
    assert.match(output, /Prisma timezone verified/);
  } finally { try { docker(['rm', '-f', name]); } catch { /* already removed */ } }
});
