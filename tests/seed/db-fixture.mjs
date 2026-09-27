import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { seedDatabase } from '../../scripts/seed-database.mjs';
const prisma = new PrismaClient({ log: [] });
const folder = await mkdtemp(join(tmpdir(), 'seed-db-fixture-'));
try {
  execFileSync('sh', ['scripts/db-push-safe.sh'], { stdio: 'pipe' });
  const company = await prisma.company.create({ data: { id: 'existing-company', name: 'Keep existing company' } });
  const owner = await prisma.user.create({ data: { id: 'existing-owner', name: 'Owner', email: 'owner@fixture.invalid', password: 'synthetic' } });
  const tables = ['Company', 'User', 'Project', 'WorkItem'];
  await writeFile(join(folder, 'config.json'), JSON.stringify({ tables: tables.map(table => ({ table, file: `${table}.json` })) }));
  // Company/User files deliberately absent: populated tables must skip them.
  await writeFile(join(folder, 'Project.json'), JSON.stringify([{ id: 'fixture-project', name: 'Fixture', creatorId: owner.id, startDate: '2026-09-28T08:00:00Z', dueDate: '2026-09-29T08:00:00Z' }]));
  await writeFile(join(folder, 'WorkItem.json'), JSON.stringify([{ id: 'fixture-work', title: 'Fixture', kind: 'Task', projectId: 'fixture-project', assigneeId: owner.id }]));
  assert.deepEqual((await seedDatabase(prisma, folder)).map(r => r.status), ['skipped-existing', 'skipped-existing', 'inserted', 'inserted']);
  assert.deepEqual(await prisma.company.findUnique({ where: { id: company.id } }), company);
  assert.deepEqual(await prisma.user.findUnique({ where: { id: owner.id } }), owner);
  assert.ok((await seedDatabase(prisma, folder)).every(r => r.status === 'skipped-existing'));
  assert.equal(await prisma.workItem.count(), 1);
  await writeFile(join(folder, 'config.json'), JSON.stringify({ tables: [{ table: 'Milestone', file: 'Milestone.json' }, { table: 'Notification', file: 'Notification.json' }] }));
  await writeFile(join(folder, 'Milestone.json'), JSON.stringify([{ id: 'rollback-milestone', name: 'Rollback', dueDate: '2026-09-29T08:00:00Z', projectId: 'fixture-project' }]));
  await writeFile(join(folder, 'Notification.json'), JSON.stringify([{ id: 'invalid-reference', title: 'Rollback', message: 'Fixture', userId: 'absent-user' }]));
  await assert.rejects(seedDatabase(prisma, folder), error => error.code === 'P2003' && error.table === 'Notification');
  assert.equal(await prisma.milestone.count(), 0);
  console.log('Prisma per-table seed, repeat-run, existing references and rollback verified');
} catch { console.error('Isolated seed verification failed; diagnostics withheld'); process.exitCode = 1; }
finally { await prisma.$disconnect(); await rm(folder, { recursive: true, force: true }); }
