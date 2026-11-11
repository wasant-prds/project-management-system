// Runs only inside a disposable PostgreSQL network; no real provider requests or private seed files.
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { Client } from 'pg'
import { randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, copyFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { moduleLoader } from '../support/module-loader.mjs'
import { initializeDatabase } from '../../scripts/database/initialize.mjs'
import { seedDatabase } from '../../scripts/database/seed.mjs'

const admin = new Client({ connectionString: process.env.DATABASE_URL })
let authenticated = true
const owner = { internalId: 1n, id: randomUUID(), name: 'Owner', email: 'owner@example.test', avatar: null }
process.env.PMS_INTERNAL_OWNER_PROOF = 'synthetic-owner-proof'
process.env.OWNER_USER_ID = owner.id
process.env.GITLAB_WORK_TOKEN = 'synthetic-gitlab-token'
process.env.GITHUB_WORK_TOKEN = 'synthetic-github-token'
const load = moduleLoader(
  {
    'next/headers': {
      headers: async () =>
        new Headers(
          authenticated
            ? { 'x-pms-owner-authenticated': '1', 'x-pms-owner-proof': 'synthetic-owner-proof' }
            : {},
        ),
    },
  },
  { console },
)
const { database, closeDatabase } = load('lib/database/client.ts')
const { sql } = load('lib/database/sql.ts')
const { companies } = load('lib/database/repositories/companies.ts')
const { projects } = load('lib/database/repositories/projects.ts')
const { workItems } = load('lib/database/repositories/work-items.ts')
const { workLogs } = load('lib/database/repositories/work-logs.ts')
const { mappings, syncConfigs } = load('lib/database/repositories/issue-sync.ts')
const { getDashboardSummary } = load('lib/dashboard.ts')
const { getAnalysisSummary } = load('lib/analysis.ts')
const { startIssueSync, executeIssueSync } = load('lib/issue-sync.ts')
const { IssueSourceClient } = load('lib/issue-sync-provider.ts')
let company, secondCompany, project, secondProject, item, foreignItem
const context = (id, extra = {}) => ({ params: Promise.resolve({ id, ...extra }) })
const request = (body, query = '') =>
  new Request(
    `http://pms.test/api/test${query}`,
    body === undefined
      ? {}
      : { method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } },
  )
async function call(path, method = 'GET', body, id, query = '') {
  const response = await load(`app/api/${path}/route.ts`)[method](request(body, query), context(id))
  const value = await response.json()
  return { status: response.status, body: value }
}
function publicOnly(value) {
  const text = JSON.stringify(value)
  assert.doesNotMatch(
    text,
    /"(?:internalId|publicId|assigneeId|userId|creatorId|mappingId|configId|password_hash|leaseToken)"/,
  )
  assert.doesNotMatch(text, /synthetic-(?:gitlab|github)-token/)
}
before(async () => {
  await admin.connect()
  await initializeDatabase(admin, { approved: true })
  await admin.query(
    "INSERT INTO users(id,public_id,email,name,password_hash) VALUES($1,$2,$3,$4,'unused-hash')",
    ['1', owner.id, owner.email, owner.name],
  )
  await admin.query("INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,'unused-hash')", [
    '9007199254740993',
    'other@example.test',
    'Other',
  ])
  company = await companies.create({ name: 'Acme 100%_literal', displayName: 'Acme' })
  secondCompany = await companies.create({ name: 'Beta' })
  project = await projects.create({
    name: 'Project A',
    companyId: company.id,
    startDate: new Date('2026-01-01Z'),
    dueDate: new Date('2026-12-31Z'),
  })
  secondProject = await projects.create({
    name: 'Project B',
    companyId: secondCompany.id,
    startDate: new Date('2026-01-01Z'),
    dueDate: new Date('2026-12-31Z'),
  })
  item = await workItems.create({
    title: 'Owner task',
    kind: 'Task',
    status: 'in-progress',
    role: 'Developer',
    types: ['bug'],
    projectId: project.id,
    assigneeId: owner.internalId,
    workDate: new Date('2026-11-04Z'),
    dueDate: new Date('2026-11-05Z'),
  })
  foreignItem = await workItems.create({
    title: 'Other private work',
    kind: 'Issue',
    projectId: project.id,
    assigneeId: 9007199254740993n,
  })
})
after(async () => {
  await closeDatabase()
  await admin.end()
})

test('driver preserves BIGINT beyond Number.MAX_SAFE_INTEGER, numeric precision, DATE and Bangkok timestamps', async () => {
  const row = await database.one(
    sql`SELECT 9223372036854775807::bigint AS id,123456789012345678901234567890.123456789012345678901234567890::numeric AS amount,'2026-11-01'::date AS date,'2026-11-01 00:30:00.123'::timestamp AS stamp,current_setting('TimeZone') AS zone`,
  )
  assert.equal(row.id, 9223372036854775807n)
  assert.equal(row.amount, '123456789012345678901234567890.123456789012345678901234567890')
  assert.equal(row.date.toISOString(), '2026-11-01T00:00:00.000Z')
  assert.equal(row.stamp.toISOString(), '2026-11-01T00:30:00.123Z')
  assert.equal(row.zone, 'Asia/Bangkok')
  assert.equal(
    (await database.one(sql`SELECT ${row.stamp}::timestamp AS stamp`)).stamp.toISOString(),
    row.stamp.toISOString(),
  )
})
test('transactions roll back all writes and retain the checked-out connection', async () => {
  await assert.rejects(
    database.transaction(async (tx) => {
      const a = await tx.one(sql`SELECT pg_backend_pid() AS pid`)
      assert.equal((await tx.one(sql`SELECT pg_backend_pid() AS pid`)).pid, a.pid)
      await companies.create({ name: 'Rolled back' }, tx)
      throw new Error('intentional rollback')
    }),
    /intentional/,
  )
  assert.equal(
    (await database.one(sql`SELECT count(*)::int AS total FROM companies WHERE name='Rolled back'`)).total,
    0,
  )
})
test('all table/column comments, BIGINT identity, immutable UUIDv4 and numeric foreign keys remain enforced', async () => {
  const missing = await admin.query(
    `SELECT c.relname,a.attname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid WHERE n.nspname='public' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped AND (obj_description(c.oid) IS NULL OR col_description(c.oid,a.attnum) IS NULL)`,
  )
  assert.deepEqual(missing.rows, [])
  const columns = await admin.query(
    "SELECT table_name,column_name,data_type,is_identity,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' AND column_name IN ('id','public_id')",
  )
  for (const column of columns.rows) {
    assert.equal(column.is_nullable, 'NO')
    assert.equal(column.data_type, column.column_name === 'id' ? 'bigint' : 'uuid')
    if (column.column_name === 'id') assert.equal(column.is_identity, 'YES')
    else assert.match(column.column_default, /gen_random_uuid/)
  }
  const badKeys = await admin.query(
    "SELECT conname FROM pg_constraint k JOIN pg_attribute a ON a.attrelid=k.conrelid AND a.attnum=ANY(k.conkey) JOIN pg_namespace n ON n.oid=k.connamespace WHERE n.nspname='public' AND k.contype='f' AND a.atttypid<>'bigint'::regtype",
  )
  assert.deepEqual(badKeys.rows, [])
  assert.match(item.publicId, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab]/)
  await assert.rejects(
    admin.query('UPDATE work_items SET public_id=$1 WHERE id=$2', [randomUUID(), item.id.toString()]),
    (error) => error.code === '55000',
  )
})
test('health uses the SQL schema without any migration history table', async () => {
  assert.equal((await call('health')).status, 200)
  assert.equal((await admin.query("SELECT to_regclass('schema_migrations') AS old")).rows[0].old, null)
})

for (const path of [
  'company',
  'projects',
  'work-items',
  'work-logs',
  'dashboard/summary',
  'analysis/summary',
  'settings/me',
]) {
  test(`${path}: rejects requests without owner proof before querying private records`, async () => {
    authenticated = false
    try {
      assert.equal((await call(path)).status, 401)
    } finally {
      authenticated = true
    }
  })
}
for (const path of ['company/[id]', 'projects/[id]', 'work-items/[id]', 'work-logs/[id]']) {
  for (const method of path === 'company/[id]' ? ['PATCH', 'DELETE'] : ['GET', 'PATCH', 'DELETE'])
    test(`${method} ${path}: rejects numeric public identifiers`, async () => {
      assert.equal(
        (await call(path, method, method === 'PATCH' ? { title: 'edit' } : undefined, '1')).status,
        400,
      )
    })
}
test('public WorkItem responses hide numeric keys and foreign-owner records', async () => {
  const result = await call('work-items/[id]', 'GET', undefined, item.publicId)
  assert.equal(result.status, 200)
  publicOnly(result.body)
  assert.equal(result.body.workItem.status, 'in-progress')
  assert.equal(result.body.workItem.workDate, '2026-11-04')
  assert.equal((await call('work-items/[id]', 'GET', undefined, foreignItem.publicId)).status, 404)
  assert.equal(
    (await call('work-items/[id]', 'PATCH', { title: 'intrusion' }, foreignItem.publicId)).status,
    404,
  )
  assert.equal((await call('work-items/[id]', 'DELETE', undefined, foreignItem.publicId)).status, 404)
})
for (const [query, expected] of [
  ['year=all', true],
  ['year=2026&month=11', true],
  ['startDate=2026-11-04&endDate=2026-11-04', true],
  ['status=in-progress&year=all', true],
  ['role=Developer&year=all', true],
  ['role=none&year=all', false],
  ['kind=Task&year=all', true],
  ['search=bug&year=all', true],
  ['search=100%25_literal&year=all', true],
  ['search=%27%20OR%201%3D1--&year=all', false],
  ['year=2025', false],
])
  test(`WorkItem list SQL filters: ${query}`, async () => {
    const response = await call('work-items', 'GET', undefined, undefined, `?${query}`)
    assert.equal(response.status, 200, JSON.stringify(response.body))
    publicOnly(response.body)
    assert.equal(
      response.body.workItems.some((row) => row.id === item.publicId),
      expected,
    )
    assert.ok(response.body.workItems.every((row) => row.id !== foreignItem.publicId))
  })
for (const query of [
  'year=bad',
  'month=13',
  'limit=0',
  'limit=201',
  'projectId=1',
  'companyId=2',
  'status=no',
  'role=no',
  'kind=no',
  'priority=no',
  'openOnly=no',
  'overdue=no',
  'cursor=bad',
  'groupBy=unknown',
  'groupBy=project&sort=unknown',
  'groupBy=project&limit=0',
  'groupBy=project&limit=201',
  'startDate=2026-11-04',
  'startDate=2026-11-04&endDate=2026-11-03',
])
  test(`WorkItem query rejects ${query}`, async () => {
    assert.equal((await call('work-items', 'GET', undefined, undefined, `?${query}`)).status, 400)
  })
test('opaque pagination binds owner and filters, with complete counts before the cursor', async () => {
  await workItems.create({
    title: 'Second task',
    kind: 'Task',
    projectId: project.id,
    assigneeId: owner.internalId,
    workDate: new Date('2026-11-04Z'),
  })
  const first = await call('work-items', 'GET', undefined, undefined, '?year=all&limit=1')
  assert.equal(first.body.workItems.length, 1)
  assert.ok(first.body.page.nextCursor)
  const second = await call(
    'work-items',
    'GET',
    undefined,
    undefined,
    `?year=all&limit=1&cursor=${encodeURIComponent(first.body.page.nextCursor)}`,
  )
  assert.equal(second.status, 200)
  assert.notEqual(second.body.workItems[0].id, first.body.workItems[0].id)
  assert.equal(second.body.summary.total, first.body.summary.total)
  assert.equal(
    (
      await call(
        'work-items',
        'GET',
        undefined,
        undefined,
        `?year=all&role=none&cursor=${encodeURIComponent(first.body.page.nextCursor)}`,
      )
    ).status,
    400,
  )
  publicOnly(first.body)
  publicOnly(second.body)
})
test('project pages return complete matching projects in batches of 2 then 5 with scoped opaque cursors', async () => {
  const pagingCompany = await companies.create({ name: 'Disposable pagination fixture' })
  const pagingProjects = []
  try {
    await admin.query("SELECT set_config('pms.preserve_source_timestamps','on',false)")
    for (const number of [1, 2, 3, 4, 5, 6, 7, 8, 10]) {
      const pagingProject = await projects.create({
        name: `Paging Project ${number}`,
        companyId: pagingCompany.id,
        startDate: new Date('2026-01-01Z'),
        dueDate: new Date('2026-12-31Z'),
      })
      pagingProjects.push(pagingProject)
      await admin.query(`
        INSERT INTO work_items(title,kind,status,project_id,assignee_id,work_date,due_date,updated_at)
        SELECT 'Paging item ' || n,'Task',(CASE WHEN n=1 THEN 'completed' ELSE 'todo' END)::work_item_status,
          $1,$2,'2026-11-04'::date,'2026-12-01'::date + $3::int,
          '2026-11-20'::timestamp - $3::int * INTERVAL '1 day'
        FROM generate_series(1,$4::int) n`,
      [pagingProject.id.toString(), owner.internalId.toString(), number, number === 1 ? 225 : 2])
      // A foreign owner's newer, earlier-due Issue must not affect either membership or ordering.
      await admin.query(`
        INSERT INTO work_items(title,kind,project_id,assignee_id,work_date,due_date,updated_at)
        VALUES('Foreign paging item','Issue',$1,'9007199254740993','2026-11-04','2026-01-01','2027-01-01')`,
      [pagingProject.id.toString()])
    }
    const base = `year=all&groupBy=project&companyId=${pagingCompany.publicId}`
    const first = await call('work-items', 'GET', undefined, undefined, `?${base}`)
    assert.equal(first.status, 200, JSON.stringify(first.body))
    assert.equal(first.body.page.limit, 2)
    assert.equal(first.body.workItems.length, 227)
    assert.equal(first.body.summary.total, 241)
    assert.ok(first.body.page.nextCursor)
    assert.equal(first.body.workItems.filter((row) => row.project.id === pagingProjects[0].publicId).length, 225)
    publicOnly(first.body)

    const second = await call('work-items', 'GET', undefined, undefined,
      `?${base}&limit=5&cursor=${encodeURIComponent(first.body.page.nextCursor)}`)
    assert.equal(second.status, 200, JSON.stringify(second.body))
    assert.equal(new Set(second.body.workItems.map((row) => row.project.id)).size, 5)
    assert.equal(second.body.summary.total, 241)
    assert.ok(second.body.page.nextCursor)
    const third = await call('work-items', 'GET', undefined, undefined,
      `?${base}&limit=5&cursor=${encodeURIComponent(second.body.page.nextCursor)}`)
    assert.equal(third.status, 200, JSON.stringify(third.body))
    assert.equal(new Set(third.body.workItems.map((row) => row.project.id)).size, 2)
    assert.equal(third.body.page.nextCursor, null)
    const all = [...first.body.workItems, ...second.body.workItems, ...third.body.workItems]
    assert.equal(all.length, 241)
    assert.equal(new Set(all.map((row) => row.id)).size, 241)
    assert.ok(all.every((row) => row.title.startsWith('Paging item ')))
    assert.deepEqual([...new Set(first.body.workItems.map((row) => row.project.id))].sort(),
      pagingProjects.slice(0, 2).map((row) => row.publicId).sort())

    for (const sort of ['recent-activity', 'due-asc', 'due-desc', 'project-title-asc', 'project-title-desc']) {
      const result = await call('work-items', 'GET', undefined, undefined, `?${base}&sort=${sort}`)
      assert.equal(result.status, 200, JSON.stringify(result.body))
      const expected = sort === 'due-desc' || sort === 'project-title-desc'
        ? pagingProjects.slice(-2) : pagingProjects.slice(0, 2)
      assert.deepEqual([...new Set(result.body.workItems.map((row) => row.project.id))].sort(),
        expected.map((row) => row.publicId).sort(), sort)
    }
    for (const [key, value] of [['sort', 'due-asc'], ['kind', 'Issue'], ['status', 'todo'], ['year', '2025'], ['companyId', company.publicId]]) {
      const params = new URLSearchParams(base)
      params.set(key, value)
      params.set('cursor', first.body.page.nextCursor)
      const result = await call('work-items', 'GET', undefined, undefined, `?${params}`)
      assert.equal(result.status, 400)
    }
    const crossMode = await call('work-items', 'GET', undefined, undefined,
      `?year=all&companyId=${pagingCompany.publicId}&cursor=${encodeURIComponent(first.body.page.nextCursor)}`)
    assert.equal(crossMode.status, 400)
    const filtered = await call('work-items', 'GET', undefined, undefined,
      `?${base}&projectId=${pagingProjects[0].publicId}&status=todo`)
    assert.equal(filtered.status, 200, JSON.stringify(filtered.body))
    assert.equal(filtered.body.workItems.length, 224)
    assert.equal(filtered.body.summary.total, 224)
    assert.equal(filtered.body.page.nextCursor, null)
    const empty = await call('work-items', 'GET', undefined, undefined, `?${base}&kind=Issue`)
    assert.equal(empty.status, 200)
    assert.equal(empty.body.workItems.length, 0)
    assert.equal(empty.body.summary.total, 0)
    assert.equal(empty.body.page.nextCursor, null)
  } finally {
    await admin.query("SELECT set_config('pms.preserve_source_timestamps','off',false)")
    await admin.query('DELETE FROM work_items WHERE project_id IN (SELECT id FROM projects WHERE company_id=$1)', [pagingCompany.id.toString()])
    await admin.query('DELETE FROM projects WHERE company_id=$1', [pagingCompany.id.toString()])
    await admin.query('DELETE FROM companies WHERE id=$1', [pagingCompany.id.toString()])
  }
})

test('WorkItem create owns server-generated UUIDs and PATCH stamps submittedAt once', async () => {
  const data = { title: 'Created via API', kind: 'Issue', projectId: project.publicId, status: 'sa-testing' }
  assert.equal((await call('work-items', 'POST', { ...data, id: randomUUID() })).status, 400)
  const result = await call('work-items', 'POST', data)
  assert.equal(result.status, 201, JSON.stringify(result.body))
  publicOnly(result.body)
  const id = result.body.workItem.id,
    stamp = result.body.workItem.submittedAt
  assert.ok(stamp?.endsWith('+07:00'))
  const updated = await call(
    'work-items/[id]',
    'PATCH',
    { status: 'completed', title: 'Updated via API' },
    id,
  )
  assert.equal(updated.status, 200)
  assert.equal(updated.body.workItem.submittedAt, stamp)
  assert.equal((await call('work-items/[id]', 'DELETE', undefined, id)).status, 200)
})
test('reviewed UUID imports preserve identities, skip retries and reject numeric references', async () => {
  const id = randomUUID()
  const data = { id, title: 'Imported work', kind: 'Task', projectId: project.publicId }
  const first = await call('work-items/import', 'POST', [data])
  assert.equal(first.status, 200)
  assert.equal(first.body.imported, 1)
  assert.equal(first.body.rows[0].workItemId, id)
  assert.equal((await call('work-items/import', 'POST', [data])).body.imported, 0)
  const bad = await call('work-items/import', 'POST', [
    { ...data, id: '123' },
    { ...data, id: randomUUID(), projectId: '1' },
  ])
  assert.equal(bad.body.imported, 0)
  assert.ok(bad.body.rows.every((row) => row.outcome === 'failed'))
})
let log
test('Daily Work create stores exact hours, numeric relations and Bangkok dates', async () => {
  const response = await call('work-logs', 'POST', {
    workItemId: item.publicId,
    hours: '1.234567890123456789012345678901',
    date: '2026-11-04',
    remarks: 'Exact hours',
  })
  assert.equal(response.status, 201, JSON.stringify(response.body))
  publicOnly(response.body)
  log = response.body.workLog
  assert.equal(log.hours, '1.234567890123456789012345678901')
  assert.equal(log.date, '2026-11-04')
  const row = await workLogs.byPublicId(log.id, owner.internalId)
  assert.equal(row.projectId, project.id)
  assert.equal(row.workItemId, item.id)
  assert.equal(row.userId, owner.internalId)
})
for (const bad of [
  { hours: '0' },
  { hours: 'NaN' },
  { hours: '-1' },
  { date: '2026-02-30' },
  { userId: randomUUID() },
  { workItemId: '1' },
  { projectId: randomUUID() },
])
  test(`Daily Work rejects invalid ${JSON.stringify(bad)}`, async () => {
    const response = await call('work-logs', 'POST', {
      workItemId: item.publicId,
      hours: '1',
      date: '2026-11-04',
      ...bad,
    })
    assert.ok([400, 404].includes(response.status), JSON.stringify(response))
  })
test('Daily Work never links foreign-owner items and project mismatch is rejected', async () => {
  assert.equal(
    (await call('work-logs', 'POST', { workItemId: foreignItem.publicId, hours: '1', date: '2026-11-04' }))
      .status,
    404,
  )
  assert.equal(
    (
      await call('work-logs', 'POST', {
        workItemId: item.publicId,
        projectId: secondProject.publicId,
        hours: '1',
        date: '2026-11-04',
      })
    ).status,
    400,
  )
  assert.equal(
    (await call('work-logs/[id]', 'PATCH', { hours: '2.1', remarks: 'Updated' }, log.id)).status,
    200,
  )
  assert.equal(
    (await call('work-logs/[id]', 'GET', undefined, log.id)).body.workLog.hours,
    '2.100000000000000000000000000000',
  )
})
test('linked history blocks WorkItem moves/deletion, Project and Company deletion', async () => {
  assert.equal(
    (await call('work-items/[id]', 'PATCH', { projectId: secondProject.publicId }, item.publicId)).status,
    409,
  )
  assert.equal((await call('work-items/[id]', 'DELETE', undefined, item.publicId)).status, 409)
  assert.equal((await call('projects/[id]', 'DELETE', undefined, project.publicId)).status, 409)
  assert.equal((await call('company/[id]', 'DELETE', undefined, company.publicId)).status, 409)
})
test('Dashboard, Analysis and Daily Work summary agree on exact decimal hours and owner filtering', async () => {
  await workLogs.create({
    userId: owner.internalId,
    workItemId: item.id,
    projectId: project.id,
    date: new Date('2026-11-04Z'),
    hours: '0.2',
  })
  await workLogs.create({
    userId: 9007199254740993n,
    workItemId: foreignItem.id,
    projectId: project.id,
    date: new Date('2026-11-04Z'),
    hours: '99',
  })
  const params = new URLSearchParams('startDate=2026-11-04&endDate=2026-11-04')
  const dashboard = await getDashboardSummary(
    owner.internalId,
    params,
    database,
    new Date('2026-11-08T01:00:00Z'),
  )
  const analysis = await getAnalysisSummary(
    owner.internalId,
    params,
    database,
    new Date('2026-11-08T01:00:00Z'),
  )
  const summary = await call('work-logs/summary', 'GET', undefined, undefined, `?${params}`)
  assert.equal(dashboard.summary.total, analysis.summary.total)
  assert.equal(Number(dashboard.summary.loggedHours), 2.3)
  assert.equal(analysis.summary.loggedHours, '2.3')
  assert.equal(Number(summary.body.summary.hours), 2.3)
  publicOnly(dashboard)
  publicOnly(analysis)
  const selected = await getAnalysisSummary(
    owner.internalId,
    new URLSearchParams(`${params}&projectId=${secondProject.publicId}`),
    database,
  )
  assert.equal(selected.summary.total, 0)
  assert.equal(selected.summary.loggedHours, '0')
})
test('Company and Project list/detail queries preserve summaries, options, literal search and DTOs', async () => {
  for (const path of ['company', 'projects']) {
    const response = await call(path)
    assert.equal(response.status, 200, JSON.stringify(response.body))
    publicOnly(response.body)
  }
  for (const [path, id] of [['projects/[id]', project.publicId]]) {
    const response = await call(path, 'GET', undefined, id)
    assert.equal(response.status, 200, JSON.stringify(response.body))
    publicOnly(response.body)
  }
  assert.equal((await call('projects', 'GET', undefined, undefined, '?options=true')).status, 200)
  const listed = await call('company', 'GET', undefined, undefined, '?search=100%25_literal')
  assert.equal(listed.status, 200)
  assert.ok(listed.body.companies.some((row) => row.id === company.publicId))
})
test('Company and Project CRUD resolves UUID relations and supports empty-history deletion', async () => {
  const created = await call('company', 'POST', { name: 'Delete me' })
  assert.equal(created.status, 201, JSON.stringify(created.body))
  const companyId = created.body.company.id
  assert.equal((await call('company/[id]', 'PATCH', { name: 'Renamed' }, companyId)).status, 200)
  const added = await call('projects', 'POST', {
    name: 'Temporary',
    companyId,
    startDate: '2026-01-01',
    dueDate: '2026-12-31',
  })
  assert.equal(added.status, 201, JSON.stringify(added.body))
  assert.equal(
    (await call('projects/[id]', 'PATCH', { status: 'On Hold' }, added.body.project.id)).status,
    200,
  )
  assert.equal((await call('projects/[id]', 'DELETE', undefined, added.body.project.id)).status, 200)
  assert.equal((await call('company/[id]', 'DELETE', undefined, companyId)).status, 200)
})
test('Settings uses SQL enum values, updates only the owner and returns safe profile DTOs', async () => {
  const response = await call('settings/me', 'PATCH', {
    preferences: { theme: 'special-dark', locale: 'en' },
    profile: { name: 'Updated owner', avatar: 'https://images.example.test/avatar.png' },
  })
  assert.equal(response.status, 200, JSON.stringify(response.body))
  publicOnly(response.body)
  const reloaded = await call('settings/me')
  assert.equal(reloaded.status, 200)
  assert.equal(reloaded.body.profile.avatar, 'https://images.example.test/avatar.png')
  assert.equal(
    (await database.one(sql`SELECT avatar_url AS avatar FROM users WHERE id=${owner.internalId}`)).avatar,
    reloaded.body.profile.avatar,
  )
  assert.equal((await call('settings/me', 'PATCH', { preferences: { theme: 'invalid' } })).status, 400)
})
for (const provider of ['gitlab', 'github'])
  test(`${provider} SQL sync: idempotence, assignee scope, public identity, immutable source history`, async () => {
    const mapping = await mappings.create({
      provider,
      instanceUrl: provider === 'github' ? 'https://github.com' : 'https://gitlab.example.test',
      externalProjectId: '42',
      projectId: project.id,
      approvedLabelMap: { bug: 'bug' },
      firstSyncApprovedAt: new Date('2026-11-01Z'),
    })
    const config = await syncConfigs.create({
      mappingId: mapping.id,
      sourceProjectPath: provider === 'github' ? 'acme/repo' : '42',
      tokenEnvVar: provider === 'github' ? 'GITHUB_WORK_TOKEN' : 'GITLAB_WORK_TOKEN',
      assignees: ['alice'],
    })
    const client = new IssueSourceClient({
      provider,
      baseUrl: mapping.instanceUrl,
      tokenEnvVar: config.tokenEnvVar,
      token: 'synthetic-secret',
    })
    const payload = {
      id: 701,
      title: 'Synced',
      state: provider === 'github' ? 'open' : 'opened',
      created_at: '2026-11-01T01:00:00Z',
      updated_at: '2026-11-02T01:00:00Z',
      assignees: [provider === 'github' ? { login: 'alice' } : { username: 'alice' }],
      labels: provider === 'github' ? [{ name: 'bug' }] : ['bug'],
      ...(provider === 'github'
        ? { number: 17, html_url: 'https://github.com/acme/repo/issues/17' }
        : { iid: 17, project_id: 42, web_url: 'https://gitlab.example.test/group/project/-/work_items/17' }),
    }
    client.resolveProject = async () => ({
      id: '42',
      path: provider === 'github' ? 'acme/repo' : 'group/project',
    })
    client.issues = async function* () {
      yield payload
    }
    const run = await startIssueSync(database, config, false)
    const result = await executeIssueSync(database, config, run, owner.internalId, client)
    assert.equal(result.status, 'success', JSON.stringify(result.runError))
    assert.equal(result.createdCount, 1)
    const publicId = result.results[0].workItemId
    const fresh = await syncConfigs.byId(config.id)
    const repeated = await executeIssueSync(
      database,
      fresh,
      await startIssueSync(database, fresh, false),
      owner.internalId,
      client,
    )
    assert.equal(repeated.skippedCount, 1)
    assert.equal(repeated.results[0].workItemId, publicId)
    const replay = async () => {
      const latest = await syncConfigs.byId(config.id)
      return executeIssueSync(
        database,
        latest,
        await startIssueSync(database, latest, false),
        owner.internalId,
        client,
      )
    }
    const stored = await workItems.byPublicId(publicId, owner.internalId)
    await workItems.update(stored.id, { title: 'Synced', description: null, types: null })
    const labels = [
      'type::task',
      'type::documentation',
      'priority::high',
      'role::SA',
      'status::completed',
      'team::sales',
    ]
    payload.labels = provider === 'github' ? labels.map((name) => ({ name })) : labels
    if (provider === 'github') payload.body = 'Full source description'
    else payload.description = 'Full source description'
    assert.equal((await replay()).updatedCount, 1)
    const detail = (await call('work-items/[id]', 'GET', undefined, publicId)).body.workItem
    assert.equal(detail.title, '[#17] [SA] Synced')
    assert.equal(detail.kind, 'Task')
    assert.equal(detail.role, 'SA')
    assert.equal(detail.priority, 'high')
    assert.equal(detail.status, 'completed')
    assert.deepEqual(detail.types, ['documentation', 'team::sales'])
    assert.ok(detail.submittedAt)
    assert.equal((await call('work-items/[id]', 'PATCH', { types: detail.types }, publicId)).status, 200)
    assert.equal(
      (await call('work-items/[id]', 'PATCH', { types: ['team::injected'] }, publicId)).status,
      400,
    )
    assert.equal((await replay()).skippedCount, 1)

    const baselineTitle = payload.title,
      baselineLabels = payload.labels
    payload.title = '[Developer / Infra] Synced'
    const combined = ['role::Developer', 'role::Infra', 'type::feature']
    payload.labels = provider === 'github' ? combined.map((name) => ({ name })) : combined
    assert.equal((await replay()).updatedCount, 1)
    const multi = (await call('work-items/[id]', 'GET', undefined, publicId)).body.workItem
    assert.equal(multi.id, publicId)
    assert.equal(multi.title, '[#17] [Developer / Infra] Synced')
    assert.equal(multi.role, 'Developer')
    assert.deepEqual(multi.types, ['feature', 'role::infra'])
    assert.equal((await call('work-items/[id]', 'PATCH', { types: multi.types }, publicId)).status, 200)
    assert.equal((await replay()).skippedCount, 1)
    payload.title = baselineTitle
    payload.labels = baselineLabels
    assert.equal((await replay()).updatedCount, 1)
    assert.deepEqual((await workItems.byPublicId(publicId)).types, ['documentation', 'team::sales'])

    // An old import without a reference is completed in place, including literal SQL wildcard characters.
    const stem = `Legacy ${provider} งาน 100%_literal cafe\u0301`
    const legacy = await workItems.create({
      title: `[SA] ${stem}`,
      kind: 'Task',
      priority: 'high',
      role: 'SA',
      status: 'todo',
      projectId: project.id,
      assigneeId: owner.internalId,
    })
    const remote = {
      ...payload,
      id: 702,
      title: `[SA] ${stem.normalize('NFC')}`,
      ...(provider === 'github'
        ? { number: 18, html_url: 'https://github.com/acme/repo/issues/18' }
        : { iid: 18, web_url: 'https://gitlab.example.test/group/project/-/issues/18' }),
    }
    client.issues = async function* () {
      yield payload
      yield remote
    }
    const adopted = await replay()
    assert.equal(adopted.createdCount, 0)
    assert.equal(adopted.results[1].outcome, 'pending')
    const confirm = (runId, decisions) =>
      load('app/api/projects/[id]/issue-sync/[configId]/confirm/route.ts').POST(
        request({ runId, decisions }),
        context(project.publicId, { configId: config.publicId }),
      )
    const response = await confirm(adopted.publicId, [{ issueId: '702', workItemId: legacy.publicId }])
    const confirmed = (await response.json()).run
    assert.equal(response.status, 200)
    assert.equal(confirmed.counts.updated, 1)
    assert.equal(confirmed.results[1].workItemId, legacy.publicId)
    assert.equal(confirmed.results[1].reason, 'linked_existing_work_item')
    assert.doesNotMatch(JSON.stringify(confirmed), /reviewSnapshot|versions/)
    remote.title = 'Renamed source issue'
    remote.updated_at = '2026-11-03T01:00:00Z'
    assert.equal((await replay()).results[1].workItemId, legacy.publicId)
    assert.equal((await workItems.byPublicId(legacy.publicId)).title, '[#18] [SA] Renamed source issue')
    const ambiguousTitle = `Ambiguous ${provider}`
    for (let index = 0; index < 2; index++)
      await workItems.create({
        title: ambiguousTitle,
        kind: 'Issue',
        status: 'todo',
        projectId: project.id,
        assigneeId: owner.internalId,
      })
    const ambiguous = {
      ...remote,
      id: 703,
      title: ambiguousTitle,
      ...(provider === 'github'
        ? { number: 19, html_url: 'https://github.com/acme/repo/issues/19' }
        : { iid: 19, web_url: 'https://gitlab.example.test/group/project/-/issues/19' }),
    }
    client.issues = async function* () {
      yield payload
      yield remote
      yield ambiguous
    }
    const conflicted = await replay()
    assert.equal(conflicted.results[2].reason, 'confirmation_required')
    assert.equal(conflicted.createdCount, 0)
    const candidate = await workItems.byPublicId(conflicted.results[2].candidates[0].id)
    await workItems.update(candidate.id, { description: 'Changed after preview' })
    assert.equal((await confirm(conflicted.publicId, [{ issueId: '703', workItemId: null }])).status, 409)
    const refreshed = await replay()
    const concurrent = await Promise.all([
      confirm(refreshed.publicId, [{ issueId: '703', workItemId: null }]),
      confirm(refreshed.publicId, [{ issueId: '703', workItemId: null }]),
    ])
    assert.ok(concurrent.some((result) => result.status === 200))
    assert.ok(concurrent.every((result) => [200, 409].includes(result.status)))
    assert.equal((await replay()).results[2].outcome, 'skipped')
    assert.equal(
      (
        await database.one(
          sql`SELECT count(*)::int AS count FROM external_work_item_references WHERE provider=${provider} AND external_project_id='42' AND external_issue_id='703'`,
        )
      ).count,
      1,
    )
    client.issue = async (_source, number) => (number === '19' ? ambiguous : remote)
    client.issues = async function* () {
      yield payload
      yield remote
    }
    assert.equal((await call('work-items/[id]', 'DELETE', undefined, publicId)).status, 409)
    assert.equal(
      (await call('work-items/[id]', 'PATCH', { projectId: secondProject.publicId }, publicId)).status,
      409,
    )
    payload.assignees = []
    payload.updated_at = '2026-11-03T01:00:00Z'
    const current = await syncConfigs.byId(config.id)
    const reassigned = await executeIssueSync(
      database,
      current,
      await startIssueSync(database, current, false),
      owner.internalId,
      client,
    )
    assert.equal(reassigned.results[0].reason, 'out_of_scope')
    assert.equal(
      (await call('work-items/[id]', 'GET', undefined, publicId)).body.workItem.source.inScope,
      false,
    )
  })
test('two concurrent SQL sync starts cannot acquire the same config lease', async () => {
  const config = (await syncConfigs.list(project.id))[0]
  const results = await Promise.allSettled([
    startIssueSync(database, config, false),
    startIssueSync(database, config, false),
  ])
  assert.equal(results.filter((row) => row.status === 'fulfilled').length, 1)
  assert.equal(results.filter((row) => row.status === 'rejected').length, 1)
})

async function isolated(operation) {
  const name = `fixture_${randomUUID().replaceAll('-', '')}`
  await admin.query(`CREATE DATABASE ${name}`)
  const url = new URL(process.env.DATABASE_URL)
  url.pathname = `/${name}`
  const client = new Client({ connectionString: url.href })
  try {
    await client.connect()
    await operation(client)
  } finally {
    await client.end()
    await admin.query(`DROP DATABASE ${name}`)
  }
}
test('initializer requires explicit approval, is repeatable, and refuses an unrelated used schema', async () => {
  await isolated(async (client) => {
    await assert.rejects(initializeDatabase(client), /approval|APPROVED/)
    assert.equal((await initializeDatabase(client, { approved: true })).status, 'initialized')
    assert.equal((await initializeDatabase(client)).status, 'already-initialized')
    await client.query("COMMENT ON SCHEMA public IS 'different'")
    await assert.rejects(initializeDatabase(client, { approved: true }), /Existing schema differs/)
    assert.equal(
      (await client.query("SELECT count(*)::int AS count FROM pg_tables WHERE schemaname='public'")).rows[0]
        .count,
      13,
    )
  })
  await isolated(async (client) => {
    await client.query('CREATE TABLE legacy_data(id text)')
    await assert.rejects(initializeDatabase(client, { approved: true }), /Existing schema differs/)
    assert.equal(
      (await client.query("SELECT to_regclass('legacy_data') AS retained")).rows[0].retained,
      'legacy_data',
    )
  })
})
test('SQL seed uses only sql-master, preserves reviewed UUIDs, aligns identities and rolls back on failure', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pms-sql-seed-'))
  const directory = join(root, 'database/seeds/sql-master')
  await mkdir(directory, { recursive: true })
  await copyFile('database/schema.sql', join(root, 'database/schema.sql'))
  const publicId = randomUUID()
  const data = `INSERT INTO "users"("id","public_id","email","name","password_hash") VALUES(42,'${publicId}','seed@example.test','Seed','unused-hash');`
  try {
    await writeFile(join(directory, '020_users.sql'), data)
    await isolated(async (client) => {
      await initializeDatabase(client, { approved: true })
      await assert.rejects(seedDatabase(client, { root, seedPath: 'database/seeds/master' }), /SEED_PATH/)
      await seedDatabase(client, { root })
      assert.equal(
        (await client.query('SELECT public_id FROM users WHERE id=42')).rows[0].public_id,
        publicId,
      )
      const added = (
        await client.query(
          "INSERT INTO users(email,name,password_hash) VALUES('next@example.test','Next','unused-hash') RETURNING id",
        )
      ).rows[0]
      assert.equal(added.id, '43')
      await assert.rejects(seedDatabase(client, { root }), /empty database/)
    })
    await writeFile(join(directory, '020_users.sql'), data + data)
    await isolated(async (client) => {
      await initializeDatabase(client, { approved: true })
      await assert.rejects(seedDatabase(client, { root }))
      assert.equal((await client.query('SELECT count(*)::int AS count FROM users')).rows[0].count, 0)
    })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
