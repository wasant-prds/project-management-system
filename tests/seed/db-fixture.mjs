import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { PrismaClient } from '@prisma/client'

// This process is launched only inside a disposable PostgreSQL test network.
const prisma = new PrismaClient({ log: [] })
let stage = 'SQL schema sync'
try {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
  execFileSync('/bin/sh', ['scripts/db-push-safe.sh'], { stdio: 'pipe', env: {
    PATH: '/usr/local/bin:/usr/bin:/bin', DATABASE_URL: process.env.DATABASE_URL,
    APP_ENV: 'local', DB_SCHEMA_SYNC_APPROVED: 'true', TZ: 'Asia/Bangkok', PGTZ: 'Asia/Bangkok',
  } })
  stage = 'fixture setup'
  const company = await prisma.company.create({ data: { name: 'Synthetic company' } })
  const owner = await prisma.user.create({ data: { name: 'Synthetic owner', email: 'owner@fixture.invalid', password: 'synthetic' } })
  const project = await prisma.project.create({ data: {
    name: 'Synthetic project', companyId: company.id, creatorId: owner.id,
    startDate: new Date('2026-09-28T00:00:00Z'), dueDate: new Date('2026-09-29T00:00:00Z'),
  } })
  const item = await prisma.workItem.create({ data: {
    title: 'Synthetic item', kind: 'Task', projectId: project.id, assigneeId: owner.id,
    workDate: new Date('2026-09-28T00:00:00Z'), dueDate: new Date('2026-09-29T00:00:00Z'),
  } })
  assert.equal(typeof item.id, 'bigint')
  assert.match(item.publicId, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  const columns = await prisma.$queryRawUnsafe("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='work_items' AND column_name IN ('work_date','due_date') ORDER BY column_name")
  assert.deepEqual(columns.map(row => [row.column_name,row.data_type]), [['due_date','date'],['work_date','date']])
  await prisma.timeEntry.create({ data: { userId: owner.id, projectId: project.id, workItemId: item.id, hours: '1.25', date: new Date('2026-09-30T00:00:00Z') } })
  const rules = await prisma.$queryRawUnsafe("SELECT rc.delete_rule FROM information_schema.referential_constraints rc JOIN information_schema.key_column_usage kcu USING (constraint_catalog,constraint_schema,constraint_name) WHERE kcu.table_name='work_logs' AND kcu.column_name='work_item_id'")
  assert.deepEqual(rules.map(row => row.delete_rule), ['RESTRICT'])
  await assert.rejects(prisma.workItem.delete({ where: { id: item.id } }), error => error.code === 'P2003')
  stage = 'idempotent schema apply'
  execFileSync('/bin/sh', ['scripts/db-push-safe.sh'], { stdio: 'pipe', env: {
    PATH: '/usr/local/bin:/usr/bin:/bin', DATABASE_URL: process.env.DATABASE_URL,
    APP_ENV: 'local', DB_SCHEMA_SYNC_APPROVED: 'true', TZ: 'Asia/Bangkok', PGTZ: 'Asia/Bangkok',
  } })
  assert.deepEqual(await prisma.workItem.findUnique({ where: { id: item.id } }), item)
  assert.equal(await prisma.workItem.count(), 1)
  stage = 'transaction rollback'
  await assert.rejects(prisma.$transaction(async tx => {
    await tx.milestone.create({ data: { name: 'Must roll back', dueDate: new Date('2026-10-01T00:00:00Z'), projectId: project.id } })
    await tx.timeEntry.create({ data: { userId: owner.id, projectId: project.id, workItemId: 999999n, hours: '1', date: new Date('2026-10-01T00:00:00Z') } })
  }), error => error.code === 'P2003')
  assert.equal(await prisma.milestone.count(), 0)
  console.log('WorkItem PostgreSQL DATE columns and Restrict FK verified')
} catch { console.error(`Isolated SQL verification failed during ${stage}; diagnostics withheld`); process.exitCode = 1 }
finally { await prisma.$disconnect() }
