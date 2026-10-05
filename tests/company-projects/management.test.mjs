import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { resolveTestImport } from '../support/identity-modules.mjs'
import { DHAS_COMPANY, validateCompanyBackfill, applyDhasBackfill } from '../../scripts/company-project-backfill.mjs'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const decimal = (value) => ({ toString: () => String(value) })
function loadTs(path, mocks) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const testModule = { exports: {} }
  vm.runInNewContext(output, { module: testModule, exports: testModule.exports, require: (name) => {
    const resolved = resolveTestImport(name, mocks)
    if (resolved === undefined) throw new Error(`Unexpected import: ${name}`)
    return resolved
  }, Date, URL, Buffer, process, console }, { filename: path })
  return testModule.exports
}
const response = { json: (body, options = {}) => ({ status: options.status ?? 200, body }) }
const OWNER_PUBLIC = '11111111-1111-4111-8111-111111111111'
const PROJECT_PUBLIC = '33333333-3333-4333-8333-333333333333'
const COMPANY_PUBLIC = '55555555-5555-4555-8555-555555555555'
const OTHER_COMPANY_PUBLIC = '66666666-6666-4666-8666-666666666666'
process.env.PMS_CURSOR_SECRET ??= 'company-project-test-cursor-secret'
const helper = loadTs('../../lib/project-management.ts', {
  'next/server': { NextResponse: response },
  '@/lib/decimal-hours': loadTs('../../lib/decimal-hours.ts', {}),
})
const owner = { getOwner: async () => ({ id: OWNER_PUBLIC, internalId: 7n }), ownerErrorResponse: (error) => error.message === 'denied' ? { status: 401 } : null }
const companyBoundary = { getOrCreateDhasCompany: async () => ({ id: 'dhas' }), parseCompanyInput: () => ({ data: { name: 'Dhas' } }), CompanyConflictError: class CompanyConflictError extends Error {} }
const request = (body) => ({ json: async () => body })
const context = { params: Promise.resolve({ id: PROJECT_PUBLIC }) }

test('Dhas default preserves the supplied company identity and contact details', () => {
  assert.equal(DHAS_COMPANY.name, 'D.H.A. Siamwalla Ltd.')
  assert.equal(DHAS_COMPANY.displayName, 'Dhas')
  assert.equal(DHAS_COMPANY.location, "Dan's Happy Square")
  assert.equal(DHAS_COMPANY.phone, '02 668 0123')
  assert.match(DHAS_COMPANY.description, /เครื่องเขียนตราช้าง/)
})

test('empty installation creates Dhas alongside other Companies and rejects duplicate Dhas identities', async () => {
  let companies = []
  const writes = []
  const service = loadTs('../../lib/company.ts', {
    '@/lib/db': { prisma: { company: {
      findMany: async () => companies,
      update: async ({ data }) => ({ id: 'dhas', ...data }),
      upsert: async (query) => { writes.push(query); return { id: 'dhas', ...query.create } },
    } } },
    '@/lib/dhas-company.json': { default: DHAS_COMPANY },
    '@/lib/project-management': helper,
  })
  const created = await service.getOrCreateDhasCompany()
  assert.equal(created.displayName, 'Dhas')
  assert.equal(writes[0].where.code, 'dhas')
  companies = [{ id: 'dhas', code: 'dhas', name: DHAS_COMPANY.name }]
  assert.equal((await service.getOrCreateDhasCompany()).id, 'dhas')
  companies = [{ id: 'one', code: 'dhas', name: DHAS_COMPANY.name }, { id: 'two', code: null, name: DHAS_COMPANY.name }]
  await assert.rejects(service.getOrCreateDhasCompany(), /ซ้ำกัน/)
})

test('Project validation uses Bangkok calendar dates and requires a selected Company', () => {
  assert.equal(helper.parseProjectInput({ name: 'A', companyId: 'dhas', startDate: '2026-02-30', dueDate: '2026-10-01' }).field, 'startDate')
  assert.equal(helper.parseProjectInput({ name: 'A', companyId: 'dhas', startDate: '2026-10-02', dueDate: '2026-10-01' }).field, 'dueDate')
  assert.equal(helper.parseProjectInput({ name: 'A', startDate: '2026-09-29', dueDate: '2026-10-01' }).field, 'body')
  const parsed = helper.parseProjectInput({ name: ' A ', companyId: 'dhas', startDate: '2026-09-29', dueDate: '2026-10-01' })
  assert.equal(parsed.data.name, 'A')
  assert.equal(parsed.data.startDate.toISOString(), '2026-09-29T00:00:00.000Z')
  assert.equal(helper.parseCalendarDate('2026-09-29T00:00:00+07:00'), null)
  assert.equal(helper.bangkokTimestamp(new Date('2026-09-29T09:30:00Z')), '2026-09-29T09:30:00.000+07:00')
})

test('only Company foreign-key failures become Company conflicts', () => {
  assert.equal(helper.companyRelationConflict({ code: 'P2003', meta: { field_name: 'Project_companyId_fkey' } }).status, 409)
  assert.equal(helper.companyRelationConflict({ code: 'P2003', meta: { field_name: 'WorkItem_projectId_fkey' } }), null)
  assert.equal(helper.companyRelationConflict({ code: 'P2003' }), null)
  assert.equal(helper.companyRelationConflict({ code: 'P2025' }), null)
})

test('Project summary excludes cancelled from progress and sums role/hour source rows', () => {
  const summary = helper.projectSummary([
    { status: 'completed', role: 'Developer' }, { status: 'cancelled', role: 'SA' },
    { status: 'in_progress', role: 'infra' },
  ], [{ hours: decimal('1.25') }, { hours: decimal('2.5') }])
  assert.equal(summary.progress, 50)
  assert.equal(summary.open, 1)
  assert.equal(summary.statusCounts['in-progress'], 1)
  assert.equal(summary.roles.infra, 1)
  assert.equal(summary.hours, '3.75')
  assert.equal(helper.projectSummary([{ status: 'cancelled', role: null }], []).progress, 0)
})

test('Project and Company summaries preserve the exact TimeEntry decimal totals', () => {
  const entries = [
    { hours: { toString: () => '0.12345678901234567890123456789' } },
    { hours: { toString: () => '0.00000000000000000000000000001' } },
  ]
  const expected = '0.1234567890123456789012345679'
  assert.equal(helper.projectSummary([], entries).hours, expected)
  assert.equal(helper.companySummary([
    { summary: { total: 0, hours: '0.12345678901234567890123456789' } },
    { summary: { total: 0, hours: '0.00000000000000000000000000001' } },
  ]).hours, expected)
})

test('Project create checks selected Company and attaches server owner', async () => {
  const writes = []
  let relationConflict = false
  const route = loadTs('../../app/api/projects/route.ts', {
    'next/server': { NextResponse: response }, '@/lib/db': { prisma: { company: { findUnique: async ({ where }) => where.publicId === COMPANY_PUBLIC ? { id: 11n } : null }, project: { create: async ({ data }) => { if (relationConflict) throw Object.assign(new Error('foreign key'), { code: 'P2003', meta: { field_name: 'Project_companyId_fkey' } }); writes.push(data); return data } } } },
    '@/lib/owner': owner, '@/lib/project-management': helper, '@/lib/project-query': { projectListInclude: {}, serializeProject: (value) => value },
  })
  const body = { name: 'P', companyId: COMPANY_PUBLIC, startDate: '2026-09-29', dueDate: '2026-10-01' }
  assert.equal((await route.POST(request({ ...body, companyId: 'other' }))).status, 400)
  assert.equal((await route.POST(request(body))).status, 201)
  assert.equal(writes[0].companyId, 11n)
  assert.equal(writes[0].creatorId, 7n)
  relationConflict = true
  const conflict = await route.POST(request(body))
  assert.equal(conflict.status, 409)
  assert.equal(conflict.body.error.code, 'COMPANY_CONFLICT')
})

test('Project list rejects invalid status filters before querying', async () => {
  const queries = []
  const route = loadTs('../../app/api/projects/route.ts', {
    'next/server': { NextResponse: response }, '@/lib/db': { prisma: { project: {
      findMany: async (query) => { queries.push(query); return [] },
    } } }, '@/lib/owner': owner, '@/lib/project-management': helper,
    '@/lib/project-query': { projectListInclude: {}, serializeProject: (value) => value },
  })
  const invalid = await route.GET({ url: 'http://localhost/api/projects?status=not-a-status' })
  assert.equal(invalid.status, 400)
  assert.equal(invalid.body.error.code, 'VALIDATION_ERROR')
  assert.equal(invalid.body.error.field, 'status')
  assert.equal(queries.length, 0)
  const invalidWithOptions = await route.GET({ url: 'http://localhost/api/projects?options=work-items&status=not-a-status' })
  assert.equal(invalidWithOptions.status, 400)
  assert.equal(queries.length, 0)
  const valid = await route.GET({ url: 'http://localhost/api/projects?status=Planning' })
  assert.equal(valid.status, 200)
  assert.equal(queries[0].where.status, 'Planning')
})

test('Company list is paginated and returns bounded aggregate summaries', async () => {
  const companyQueries = []
  const sqlCalls = []
  const companies = [
    { id: 11n, publicId: COMPANY_PUBLIC, name: 'Alpha', createdAt: new Date(), updatedAt: new Date() },
    { id: 12n, publicId: OTHER_COMPANY_PUBLIC, name: 'Beta', createdAt: new Date(), updatedAt: new Date() },
  ]
  const route = loadTs('../../app/api/company/route.ts', {
    'next/server': { NextResponse: response },
    '@prisma/client': { Prisma: { join: (values) => values.join(',') } },
    '@/lib/db': { prisma: {
      company: { findMany: async (query) => { companyQueries.push(query); return companies } },
      $queryRaw: async (strings, ...values) => {
        sqlCalls.push({ text: strings.join('?'), values })
        return [{ companyId: 11n, projectCount: 2, workItemCount: 5, hours: '8.75' }]
      },
    } },
    '@/lib/owner': owner, '@/lib/project-management': helper, '@/lib/company': {
      ...companyBoundary,
      serializeCompany: (company) => ({ id: company.publicId, name: company.name }),
    },
  })
  const result = await route.GET({ url: 'http://localhost/api/company?limit=1' })
  assert.equal(result.status, 200)
  assert.equal(companyQueries[0].take, 2)
  assert.equal(JSON.stringify(companyQueries[0].orderBy), JSON.stringify([{ name: 'asc' }, { id: 'asc' }]))
  assert.equal(sqlCalls.length, 1)
  assert.match(sqlCalls[0].text, /LEFT JOIN "work_items" w ON w\."project_id" = p\.id/)
  assert.doesNotMatch(sqlCalls[0].text, /LEFT JOIN "WorkItem"/)
  assert.match(sqlCalls[0].text, /SUM\(te\.hours\)/)
  assert.match(sqlCalls[0].text, /COUNT\(w\.id\)/)
  assert.equal(JSON.stringify(result.body.companies[0].summary), JSON.stringify({ projects: 2, workItems: 5, hours: '8.75' }))
  assert.equal(result.body.page.limit, 1)
  assert.ok(result.body.page.nextCursor)
})

test('Dhas backfill rejects another Company or Project link', () => {
  assert.equal(validateCompanyBackfill([], [{ id: 'p1', companyId: null }]).length, 0)
  assert.equal(validateCompanyBackfill([{ id: 'other', name: 'ProjectHub Inc.', code: null }], []).length, 0)
  assert.match(validateCompanyBackfill([{ id: 'dhas', name: DHAS_COMPANY.name, code: 'dhas' }], [{ id: 'p1', companyId: 'other' }])[0], /conflict/)
})

test('backfill changes only Project.companyId and preserves legacy timestamps', async () => {
  const queries = []
  const tx = {
    company: { findMany: async () => [{ id: 'legacy', name: 'ProjectHub Inc.', code: null }], upsert: async ({ create }) => ({ ...create, id: 'dhas' }) },
    project: { findMany: async () => [{ id: 'p1', companyId: null }], count: async () => 0 },
    $executeRaw: async (strings, ...values) => { queries.push([strings.join('?'), values]); return 1 },
  }
  const result = await applyDhasBackfill(tx)
  assert.equal(result.projects, 1)
  assert.match(queries[0][0], /^UPDATE "Project" SET "companyId" = \? WHERE/)
  assert.doesNotMatch(queries[0][0], /updatedAt|startDate|dueDate/)
  assert.equal(queries[0][1][0], 'dhas')
})

test('Project delete blocks history and unauthenticated access', async () => {
  let counts = { workItems: 1, timeEntries: 0, documents: 0, milestones: 0, activityLogs: 0, members: 0 }
  let deletes = 0
  const mocks = { 'next/server': { NextResponse: response }, '@/lib/db': { prisma: { project: {
    findUnique: async () => ({ _count: counts }), delete: async () => { deletes++; return {} },
  } } }, '@/lib/owner': owner, '@/lib/work-items': { serializeWorkItemStatus: (value) => value },
  '@/lib/project-management': helper, '@/lib/project-query': { projectListInclude: {}, serializeProject: (value) => value } }
  const route = loadTs('../../app/api/projects/[id]/route.ts', mocks)
  assert.equal((await route.DELETE({}, context)).status, 409)
  counts = { ...counts, workItems: 0, timeEntries: 1 }
  assert.equal((await route.DELETE({}, context)).status, 409)
  counts = { ...counts, timeEntries: 0 }
  assert.equal((await route.DELETE({}, context)).status, 200)
  assert.equal(deletes, 1)
  const denied = loadTs('../../app/api/projects/[id]/route.ts', { ...mocks, '@/lib/owner': { getOwner: async () => { throw new Error('denied') }, ownerErrorResponse: owner.ownerErrorResponse } })
  assert.equal((await denied.DELETE({}, context)).status, 401)
})

test('Project update blocks unlinked legacy rows and invalid dates', async () => {
  const updates = []
  let relationConflict = false
  let existing = { id: 1n, companyId: null, startDate: new Date('2026-09-01'), dueDate: new Date('2026-10-01') }
  const route = loadTs('../../app/api/projects/[id]/route.ts', {
    'next/server': { NextResponse: response }, '@/lib/db': { prisma: {
      company: { findUnique: async ({ where }) => where.publicId ? { id: 11n } : null },
      project: { findUnique: async () => existing, update: async ({ data }) => { if (relationConflict) throw Object.assign(new Error('foreign key'), { code: 'P2003', meta: { field_name: 'Project_companyId_fkey' } }); updates.push(data); return data } },
    } }, '@/lib/owner': owner, '@/lib/work-items': { serializeWorkItemStatus: (value) => value },
    '@/lib/project-management': helper, '@/lib/project-query': { projectListInclude: {}, serializeProject: (value) => value },
  })
  assert.equal((await route.PATCH(request({ name: 'Rename' }), context)).status, 409)
  existing = { ...existing, companyId: 11n }
  assert.equal((await route.PATCH(request({ dueDate: '2026-08-31' }), context)).status, 400)
  assert.equal((await route.PATCH(request({ name: 'Rename' }), context)).status, 200)
  assert.equal(updates[0].name, 'Rename')
  relationConflict = true
  const conflict = await route.PATCH(request({ companyId: OTHER_COMPANY_PUBLIC }), context)
  assert.equal(conflict.status, 409)
  assert.equal(conflict.body.error.code, 'COMPANY_CONFLICT')
})

test('Company mutation rejects unauthenticated requests before parsing', async () => {
  const route = loadTs('../../app/api/company/route.ts', {
    'next/server': { NextResponse: response }, '@/lib/db': { prisma: {} },
    '@prisma/client': { Prisma: { join: (values) => values.join(',') } },
    '@/lib/owner': { getOwner: async () => { throw new Error('denied') }, ownerErrorResponse: owner.ownerErrorResponse },
    '@/lib/project-management': helper, '@/lib/company': companyBoundary,
  })
  assert.equal((await route.POST({ json: async () => { throw new Error('body should not be read') } })).status, 401)
})

test('Company registry validates creation and blocks deletion with linked Projects', async () => {
  const service = loadTs('../../lib/company.ts', {
    '@/lib/db': { prisma: {} }, '@/lib/dhas-company.json': { default: DHAS_COMPANY }, '@/lib/project-management': helper,
  })
  let created = null
  const list = loadTs('../../app/api/company/route.ts', {
    'next/server': { NextResponse: response },
    '@prisma/client': { Prisma: { join: (values) => values.join(',') } },
    '@/lib/db': { prisma: { company: { create: async ({ data }) => { created = data; return { ...data, publicId: OTHER_COMPANY_PUBLIC, code: null, displayName: null, location: null, industry: null, email: null, phone: null, address: null, website: null, logo: null, description: null, createdAt: new Date(), updatedAt: new Date() } } } } },
    '@/lib/owner': owner, '@/lib/project-management': helper, '@/lib/company': service,
  })
  assert.equal((await list.POST(request({ name: '' }))).status, 400)
  assert.equal((await list.POST(request({ name: ' Other Company ' }))).status, 201)
  assert.equal(created.name, 'Other Company')
  let record = { code: null, _count: { projects: 1 } }
  let deleted = 0
  const detail = loadTs('../../app/api/company/[id]/route.ts', {
    'next/server': { NextResponse: response },
    '@/lib/db': { prisma: { company: {
      findUnique: async () => record,
      delete: async () => { deleted++; return {} },
    } } }, '@/lib/owner': owner, '@/lib/project-management': helper, '@/lib/company': service,
  })
  assert.equal((await detail.DELETE({}, { params: Promise.resolve({ id: OTHER_COMPANY_PUBLIC }) })).status, 409)
  record = { code: 'dhas', _count: { projects: 0 } }
  assert.equal((await detail.DELETE({}, { params: Promise.resolve({ id: COMPANY_PUBLIC }) })).status, 409)
  record = { code: null, _count: { projects: 0 } }
  assert.equal((await detail.DELETE({}, { params: Promise.resolve({ id: OTHER_COMPANY_PUBLIC }) })).status, 200)
  assert.equal(deleted, 1)
})

test('Company list requires owner access before provisioning Dhas or reading Companies', async () => {
  const denied = new Error('denied')
  let provisioningCalls = 0
  let databaseCalls = 0
  const route = loadTs('../../app/api/company/route.ts', {
    'next/server': { NextResponse: response },
    '@prisma/client': { Prisma: { join: (values) => values.join(',') } },
    '@/lib/db': { prisma: { company: { findMany: async () => { databaseCalls++; return [] } }, $queryRaw: async () => { databaseCalls++; return [] } } },
    '@/lib/owner': { getOwner: async () => { throw denied }, ownerErrorResponse: (error) => error === denied ? { status: 401 } : null },
    '@/lib/project-management': helper,
    '@/lib/company': { ...companyBoundary, getOrCreateDhasCompany: async () => { provisioningCalls++; return { id: 'dhas' } } },
  })

  const result = await route.GET({ url: 'http://localhost/api/company' })
  assert.equal(result.status, 401)
  assert.equal(provisioningCalls, 0)
  assert.equal(databaseCalls, 0)
})

test('Company list returns a safe error when its database read fails', async () => {
  const route = loadTs('../../app/api/company/route.ts', {
    'next/server': { NextResponse: response },
    '@prisma/client': { Prisma: { join: (values) => values.join(',') } },
    '@/lib/db': { prisma: { company: { findMany: async () => { throw new Error('password=secret database unavailable') } } } },
    '@/lib/owner': owner,
    '@/lib/project-management': helper,
    '@/lib/company': companyBoundary,
  })

  const result = await route.GET({ url: 'http://localhost/api/company' })
  assert.equal(result.status, 500)
  assert.equal(result.body.error.code, 'INTERNAL_ERROR')
  assert.doesNotMatch(JSON.stringify(result.body), /password|secret|database unavailable/)
})

test('Company PATCH cannot rename the reserved Dhas Company', async () => {
  let updates = 0
  const service = loadTs('../../lib/company.ts', {
    '@/lib/db': { prisma: {} }, '@/lib/dhas-company.json': { default: DHAS_COMPANY }, '@/lib/project-management': helper,
  })
  const route = loadTs('../../app/api/company/[id]/route.ts', {
    'next/server': { NextResponse: response },
    '@/lib/db': { prisma: { company: {
      findUnique: async () => ({ id: 'dhas', code: 'dhas' }),
      update: async () => { updates++; return {} },
    } } },
    '@/lib/owner': owner,
    '@/lib/project-management': helper,
    '@/lib/company': { ...service, DHAS_COMPANY },
  })

  const result = await route.PATCH(request({ name: 'Renamed Dhas' }), { params: Promise.resolve({ id: COMPANY_PUBLIC }) })
  assert.equal(result.status, 409)
  assert.equal(result.body.error.code, 'CONFLICT')
  assert.equal(updates, 0)
})

test('Company PATCH trims supported fields and serializes returned timestamps', async () => {
  const writes = []
  const service = loadTs('../../lib/company.ts', {
    '@/lib/db': { prisma: {} }, '@/lib/dhas-company.json': { default: DHAS_COMPANY }, '@/lib/project-management': helper,
  })
  const route = loadTs('../../app/api/company/[id]/route.ts', {
    'next/server': { NextResponse: response },
    '@/lib/db': { prisma: { company: {
      findUnique: async () => ({ id: 11n, publicId: COMPANY_PUBLIC, code: null }),
      update: async ({ data }) => {
        writes.push(data)
        return {
          id: 11n, publicId: COMPANY_PUBLIC, name: data.name, phone: data.phone, code: null,
          displayName: null, location: null, industry: null, email: null, address: null, website: null, logo: null, description: null,
          createdAt: new Date('2026-09-29T01:02:03.000Z'), updatedAt: new Date('2026-09-29T04:05:06.000Z'),
        }
      },
    } } },
    '@/lib/owner': owner,
    '@/lib/project-management': helper,
    '@/lib/company': { ...service, DHAS_COMPANY },
  })

  const result = await route.PATCH(request({ name: '  Updated Company  ', phone: '  02 123 4567  ' }), { params: Promise.resolve({ id: COMPANY_PUBLIC }) })
  assert.equal(result.status, 200)
  assert.equal(JSON.stringify(writes), JSON.stringify([{ name: 'Updated Company', phone: '02 123 4567' }]))
  assert.equal(result.body.company.createdAt, '2026-09-29T01:02:03.000+07:00')
  assert.equal(result.body.company.updatedAt, '2026-09-29T04:05:06.000+07:00')
})

test('Project list and detail reject unauthenticated reads before database access', async () => {
  const denied = new Error('denied')
  let reads = 0
  const database = { project: {
    findMany: async () => { reads++; return [] },
    findUnique: async () => { reads++; return null },
  } }
  const routeMocks = {
    'next/server': { NextResponse: response },
    '@/lib/db': { prisma: database },
    '@/lib/owner': { getOwner: async () => { throw denied }, ownerErrorResponse: (error) => error === denied ? { status: 401 } : null },
    '@/lib/project-management': helper,
    '@/lib/project-query': { projectListInclude: {}, serializeProject: (value) => value },
    '@/lib/work-items': { serializeWorkItemStatus: (value) => value },
  }
  const list = loadTs('../../app/api/projects/route.ts', routeMocks)
  const detail = loadTs('../../app/api/projects/[id]/route.ts', routeMocks)

  assert.equal((await list.GET({ url: 'http://localhost/api/projects' })).status, 401)
  assert.equal((await detail.GET({}, context)).status, 401)
  assert.equal(reads, 0)
})

test('Project detail serializes Company, WorkItems, Bangkok dates, and derived hours', async () => {
  const route = loadTs('../../app/api/projects/[id]/route.ts', {
    'next/server': { NextResponse: response },
    '@/lib/db': { prisma: { project: { findUnique: async () => ({
      id: 1n, publicId: PROJECT_PUBLIC, name: 'Project Alpha', companyId: 11n,
      company: { id: 11n, publicId: COMPANY_PUBLIC, name: DHAS_COMPANY.name, displayName: 'Dhas' },
      startDate: new Date('2026-09-29T00:00:00.000Z'), dueDate: new Date('2026-10-01T00:00:00.000Z'),
      createdAt: new Date('2026-09-28T01:02:03.000Z'), updatedAt: new Date('2026-09-29T04:05:06.000Z'),
      workItems: [
        { id: 1n, publicId: '77777777-7777-4777-8777-777777777771', status: 'completed', role: 'Developer', assignee: { publicId: OWNER_PUBLIC, name: 'Owner', avatar: null }, workDate: new Date('2026-09-29T00:00:00.000Z'), dueDate: null, submittedAt: null, createdAt: new Date('2026-09-29T01:00:00.000Z'), updatedAt: new Date('2026-09-29T02:00:00.000Z') },
        { id: 2n, publicId: '77777777-7777-4777-8777-777777777772', status: 'cancelled', role: 'SA', assignee: { publicId: OWNER_PUBLIC, name: 'Owner', avatar: null }, workDate: null, dueDate: null, submittedAt: null, createdAt: new Date('2026-09-29T03:00:00.000Z'), updatedAt: new Date('2026-09-29T03:00:00.000Z') },
        { id: 3n, publicId: '77777777-7777-4777-8777-777777777773', status: 'in_progress', role: 'infra', assignee: { publicId: OWNER_PUBLIC, name: 'Owner', avatar: null }, workDate: new Date('2026-09-30T00:00:00.000Z'), dueDate: null, submittedAt: null, createdAt: new Date('2026-09-30T01:00:00.000Z'), updatedAt: new Date('2026-09-30T02:00:00.000Z') },
      ],
      timeEntries: [{ id: 4n, publicId: '99999999-9999-4999-8999-000000000001', hours: decimal('1.25'), date: new Date('2026-09-29T00:00:00.000Z'), workItem: { publicId: '77777777-7777-4777-8777-777777777771' } }],
    }) } } },
    '@/lib/owner': owner,
    '@/lib/work-items': { serializeWorkItemStatus: (status) => status.replaceAll('_', '-') },
    '@/lib/project-management': helper,
    '@/lib/project-query': { projectListInclude: {}, serializeProject: (value) => value },
  })

  const result = await route.GET({}, context)
  assert.equal(result.status, 200)
  assert.equal(result.body.project.company.displayName, 'Dhas')
  assert.equal(result.body.project.startDate, '2026-09-29')
  assert.equal(result.body.project.createdAt, '2026-09-28T01:02:03.000+07:00')
  assert.equal(result.body.project.workItems[0].status, 'completed')
  assert.equal(result.body.project.workItems[0].workDate, '2026-09-29')
  assert.equal(result.body.project.workItems[2].status, 'in-progress')
  assert.equal(result.body.project.summary.progress, 50)
  assert.equal(result.body.project.summary.cancelled, 1)
  assert.equal(result.body.project.summary.statusCounts['in-progress'], 1)
  assert.equal(result.body.project.timeEntries[0].date, '2026-09-29')
  assert.equal(result.body.project.timeEntries[0].hours, '1.25')
})

test('Project detail scopes nested work and time records to the authenticated owner', async () => {
  let query
  const project = {
    publicId: PROJECT_PUBLIC,
    name: 'Project Alpha',
    company: { publicId: COMPANY_PUBLIC, name: 'Dhas', displayName: 'Dhas' },
    startDate: new Date('2026-09-29T00:00:00.000Z'),
    dueDate: new Date('2026-10-01T00:00:00.000Z'),
    createdAt: new Date('2026-09-28T01:02:03.000Z'),
    updatedAt: new Date('2026-09-29T04:05:06.000Z'),
    workItems: [
      { id: 1n, publicId: '77777777-7777-4777-8777-777777777771', assigneeId: 7n, title: 'Owner item', status: 'completed', types: [], createdAt: new Date('2026-09-29T01:00:00.000Z'), updatedAt: new Date('2026-09-29T02:00:00.000Z'), assignee: { publicId: OWNER_PUBLIC, name: 'Owner', avatar: null } },
      { id: 2n, publicId: '77777777-7777-4777-8777-777777777772', assigneeId: 8n, title: 'Foreign item', status: 'cancelled', types: [], createdAt: new Date('2026-09-29T03:00:00.000Z'), updatedAt: new Date('2026-09-29T03:00:00.000Z'), assignee: { publicId: '88888888-8888-4888-8888-888888888888', name: 'Foreign', avatar: null } },
    ],
    timeEntries: [
      { id: 3n, publicId: '99999999-9999-4999-8999-000000000001', userId: 7n, hours: decimal('1.25'), date: new Date('2026-09-29T00:00:00.000Z'), workItem: null },
      { id: 4n, publicId: '99999999-9999-4999-8999-000000000002', userId: 8n, hours: decimal('8.5'), date: new Date('2026-09-29T00:00:00.000Z'), workItem: null },
    ],
  }
  const route = loadTs('../../app/api/projects/[id]/route.ts', {
    'next/server': { NextResponse: response },
    '@/lib/db': { prisma: { project: { findUnique: async (args) => {
      query = args
      return {
        ...project,
        workItems: project.workItems.filter((item) => args.include.workItems.where.assigneeId === item.assigneeId),
        timeEntries: project.timeEntries.filter((entry) => args.include.timeEntries.where.userId === entry.userId),
      }
    } } } },
    '@/lib/owner': owner,
    '@/lib/work-items': { serializeWorkItemStatus: (value) => value },
    '@/lib/project-management': helper,
    '@/lib/project-query': { projectListInclude: {}, serializeProject: (value) => value },
  })

  const result = await route.GET({}, context)
  assert.equal(query.include.workItems.where.assigneeId, 7n)
  assert.equal(query.include.timeEntries.where.userId, 7n)
  assert.deepEqual(result.body.project.workItems.map((item) => item.title), ['Owner item'])
  assert.deepEqual(result.body.project.timeEntries.map((entry) => entry.hours), ['1.25'])
  assert.equal(result.body.project.summary.total, 1)
  assert.equal(result.body.project.summary.hours, '1.25')
})

test('Project detail returns NOT_FOUND for an unknown Project', async () => {
  const route = loadTs('../../app/api/projects/[id]/route.ts', {
    'next/server': { NextResponse: response },
    '@/lib/db': { prisma: { project: { findUnique: async () => null } } },
    '@/lib/owner': owner,
    '@/lib/work-items': { serializeWorkItemStatus: (value) => value },
    '@/lib/project-management': helper,
    '@/lib/project-query': { projectListInclude: {}, serializeProject: (value) => value },
  })

  const result = await route.GET({}, context)
  assert.equal(result.status, 404)
  assert.equal(result.body.error.code, 'NOT_FOUND')
})
