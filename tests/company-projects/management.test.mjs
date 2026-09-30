import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { DHAS_COMPANY, validateCompanyBackfill, applyDhasBackfill } from '../../scripts/company-project-backfill.mjs'

const require = createRequire(import.meta.url)
const ts = require('typescript')
function loadTs(path, mocks) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText
  const module = { exports: {} }
  vm.runInNewContext(output, { module, exports: module.exports, require: (name) => {
    if (!(name in mocks)) throw new Error(`Unexpected import: ${name}`)
    return mocks[name]
  }, Date, URL, Buffer, console }, { filename: path })
  return module.exports
}
class Decimal {
  constructor(value) { this.value = Number(value) }
  plus(other) { return new Decimal(this.value + Number(other)) }
  toString() { return String(this.value) }
}
const response = { json: (body, options = {}) => ({ status: options.status ?? 200, body }) }
const helper = loadTs('../../lib/project-management.ts', {
  'next/server': { NextResponse: response }, '@prisma/client': { Prisma: { Decimal } },
})
const owner = { getOwner: async () => ({ id: 'owner-1' }), ownerErrorResponse: (error) => error.message === 'denied' ? { status: 401 } : null }
const companyBoundary = { getOrCreateDhasCompany: async () => ({ id: 'dhas' }), parseCompanyInput: () => ({ data: { name: 'Dhas' } }), CompanyConflictError: class CompanyConflictError extends Error {} }
const request = (body) => ({ json: async () => body })
const context = { params: Promise.resolve({ id: 'project-1' }) }

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

test('Project summary excludes cancelled from progress and sums role/hour source rows', () => {
  const summary = helper.projectSummary([
    { status: 'completed', role: 'Developer' }, { status: 'cancelled', role: 'SA' },
    { status: 'in_progress', role: 'infra' },
  ], [{ hours: new Decimal('1.25') }, { hours: new Decimal('2.5') }])
  assert.equal(summary.progress, 50)
  assert.equal(summary.open, 1)
  assert.equal(summary.statusCounts['in-progress'], 1)
  assert.equal(summary.roles.infra, 1)
  assert.equal(summary.hours, '3.75')
  assert.equal(helper.projectSummary([{ status: 'cancelled', role: null }], []).progress, 0)
})

test('Project create checks selected Company and attaches server owner', async () => {
  const writes = []
  let relationConflict = false
  const route = loadTs('../../app/api/projects/route.ts', {
    'next/server': { NextResponse: response }, '@/lib/db': { prisma: { company: { findUnique: async ({ where }) => where.id === 'dhas' ? { id: 'dhas' } : null }, project: { create: async ({ data }) => { if (relationConflict) throw Object.assign(new Error('foreign key'), { code: 'P2003' }); writes.push(data); return data } } } },
    '@/lib/owner': owner, '@/lib/project-management': helper, '@/lib/project-query': { projectListInclude: {}, serializeProject: (value) => value },
  })
  const body = { name: 'P', companyId: 'dhas', startDate: '2026-09-29', dueDate: '2026-10-01' }
  assert.equal((await route.POST(request({ ...body, companyId: 'other' }))).status, 400)
  assert.equal((await route.POST(request(body))).status, 201)
  assert.equal(writes[0].companyId, 'dhas')
  assert.equal(writes[0].creatorId, 'owner-1')
  relationConflict = true
  const conflict = await route.POST(request(body))
  assert.equal(conflict.status, 409)
  assert.equal(conflict.body.error.code, 'COMPANY_CONFLICT')
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
  let existing = { id: 'project-1', companyId: null, startDate: new Date('2026-09-01'), dueDate: new Date('2026-10-01') }
  const route = loadTs('../../app/api/projects/[id]/route.ts', {
    'next/server': { NextResponse: response }, '@/lib/db': { prisma: {
      company: { findUnique: async ({ where }) => ({ id: where.id }) },
      project: { findUnique: async () => existing, update: async ({ data }) => { if (relationConflict) throw Object.assign(new Error('foreign key'), { code: 'P2003' }); updates.push(data); return data } },
    } }, '@/lib/owner': owner, '@/lib/work-items': { serializeWorkItemStatus: (value) => value },
    '@/lib/project-management': helper, '@/lib/project-query': { projectListInclude: {}, serializeProject: (value) => value },
  })
  assert.equal((await route.PATCH(request({ name: 'Rename' }), context)).status, 409)
  existing = { ...existing, companyId: 'dhas' }
  assert.equal((await route.PATCH(request({ dueDate: '2026-08-31' }), context)).status, 400)
  assert.equal((await route.PATCH(request({ name: 'Rename' }), context)).status, 200)
  assert.equal(updates[0].name, 'Rename')
  relationConflict = true
  const conflict = await route.PATCH(request({ companyId: 'deleted-company' }), context)
  assert.equal(conflict.status, 409)
  assert.equal(conflict.body.error.code, 'COMPANY_CONFLICT')
})

test('Company mutation rejects unauthenticated requests before parsing', async () => {
  const route = loadTs('../../app/api/company/route.ts', {
    'next/server': { NextResponse: response }, '@/lib/db': { prisma: {} },
    '@/lib/owner': { getOwner: async () => { throw new Error('denied') }, ownerErrorResponse: owner.ownerErrorResponse },
    '@/lib/project-management': helper, '@/lib/company': companyBoundary,
  })
  assert.equal((await route.POST({ json: async () => { throw new Error('body should not be read') } })).status, 401)
})

test('Company registry validates creation and blocks deletion with linked Projects', async () => {
  const service = loadTs('../../lib/company.ts', {
    '@/lib/db': { prisma: {} }, '@/lib/dhas-company.json': { default: DHAS_COMPANY },
  })
  let created = null
  const list = loadTs('../../app/api/company/route.ts', {
    'next/server': { NextResponse: response },
    '@/lib/db': { prisma: { company: { create: async ({ data }) => { created = data; return { ...data, createdAt: new Date(), updatedAt: new Date() } } } } },
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
  assert.equal((await detail.DELETE({}, { params: Promise.resolve({ id: 'other' }) })).status, 409)
  record = { code: 'dhas', _count: { projects: 0 } }
  assert.equal((await detail.DELETE({}, { params: Promise.resolve({ id: 'dhas' }) })).status, 409)
  record = { code: null, _count: { projects: 0 } }
  assert.equal((await detail.DELETE({}, { params: Promise.resolve({ id: 'other' }) })).status, 200)
  assert.equal(deleted, 1)
})
