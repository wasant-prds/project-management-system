import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { seedDatabase } from '../../scripts/seed-database.mjs';
const FIXED_CONTAINER_PATH = '/usr/local/bin:/usr/bin:/bin';
const prisma = new PrismaClient({ log: [] });
const folder = await mkdtemp(join(tmpdir(), 'seed-db-fixture-'));
let stage = 'schema sync';
try {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for the isolated seed fixture');
  const fixtureEnvironment = {
    PATH: FIXED_CONTAINER_PATH,
    DATABASE_URL: databaseUrl,
    APP_ENV: 'local',
    DB_SCHEMA_SYNC_APPROVED: 'true',
    TZ: 'Asia/Bangkok',
    PGTZ: 'Asia/Bangkok',
  };
  execFileSync('/bin/sh', ['scripts/db-push-safe.sh'], { stdio: 'pipe', env: fixtureEnvironment });
  stage = 'fixture setup';
  const company = await prisma.company.create({ data: { id: 'existing-company', name: 'Keep existing company' } });
  const owner = await prisma.user.create({ data: { id: 'existing-owner', name: 'Owner', email: 'owner@fixture.invalid', password: 'synthetic' } });
  const tables = ['Company', 'User', 'Project', 'WorkItem'];
  await writeFile(join(folder, 'config.json'), JSON.stringify({ tables: tables.map(table => ({ table, file: `${table}.json` })) }));
  // Company/User files deliberately absent: populated tables must skip them.
  await writeFile(join(folder, 'Project.json'), JSON.stringify([{ id: 'fixture-project', name: 'Fixture', creatorId: owner.id, companyId: company.id, startDate: '2026-09-28T08:00:00Z', dueDate: '2026-09-29T08:00:00Z' }]));
  await writeFile(join(folder, 'WorkItem.json'), JSON.stringify([{ id: 'fixture-work', title: 'Fixture', kind: 'Task', projectId: 'fixture-project', assigneeId: owner.id, workDate: '2026-09-28T00:00:00Z', dueDate: '2026-09-29T00:00:00Z' }]));
  stage = 'initial seed';
  assert.deepEqual((await seedDatabase(prisma, folder)).map(r => r.status), ['skipped-existing', 'skipped-existing', 'inserted', 'inserted']);
  assert.deepEqual(await prisma.company.findUnique({ where: { id: company.id } }), company);
  assert.deepEqual(await prisma.user.findUnique({ where: { id: owner.id } }), owner);
  const dateColumns = await prisma.$queryRaw`SELECT "column_name", "data_type" FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'work_items' AND column_name IN ('workDate', 'dueDate') ORDER BY column_name`;
  assert.deepEqual(dateColumns.map(({ column_name, data_type }) => [column_name, data_type]), [['dueDate', 'date'], ['workDate', 'date']]);
  const workDate = await prisma.workItem.findUnique({ where: { id: 'fixture-work' }, select: { workDate: true, dueDate: true } });
  assert.equal(workDate.workDate.toISOString().slice(0, 10), '2026-09-28');
  assert.equal(workDate.dueDate.toISOString().slice(0, 10), '2026-09-29');
  await prisma.timeEntry.create({ data: { userId: owner.id, projectId: 'fixture-project', workItemId: 'fixture-work', hours: 1, date: new Date('2026-09-30T00:00:00.000Z') } });
  const workItemDeleteRule = await prisma.$queryRaw`SELECT rc.delete_rule FROM information_schema.referential_constraints AS rc INNER JOIN information_schema.key_column_usage AS kcu USING (constraint_catalog, constraint_schema, constraint_name) WHERE kcu.table_name = 'TimeEntry' AND kcu.column_name = 'workItemId'`;
  assert.deepEqual(workItemDeleteRule.map(({ delete_rule }) => delete_rule), ['RESTRICT']);
  await assert.rejects(prisma.workItem.delete({ where: { id: 'fixture-work' } }), error => error.code === 'P2003');
  stage = 'repeat seed';
  assert.ok((await seedDatabase(prisma, folder)).every(r => r.status === 'skipped-existing'));
  assert.equal(await prisma.workItem.count(), 1);
  stage = 'rollback check';
  await writeFile(join(folder, 'config.json'), JSON.stringify({ tables: [{ table: 'Milestone', file: 'Milestone.json' }, { table: 'Notification', file: 'Notification.json' }] }));
  await writeFile(join(folder, 'Milestone.json'), JSON.stringify([{ id: 'rollback-milestone', name: 'Rollback', dueDate: '2026-09-29T08:00:00Z', projectId: 'fixture-project' }]));
  await writeFile(join(folder, 'Notification.json'), JSON.stringify([{ id: 'invalid-reference', title: 'Rollback', message: 'Fixture', userId: 'absent-user' }]));
  await assert.rejects(seedDatabase(prisma, folder), error => error.code === 'P2003' && error.table === 'Notification');
  assert.equal(await prisma.milestone.count(), 0);
  console.log('WorkItem PostgreSQL DATE columns and Restrict FK verified');
} catch { console.error(`Isolated seed verification failed during ${stage}; diagnostics withheld`); process.exitCode = 1; }
finally { await prisma.$disconnect(); await rm(folder, { recursive: true, force: true }); }
