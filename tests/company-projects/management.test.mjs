import test from 'node:test'
import assert from 'node:assert/strict'
import { moduleLoader } from '../support/module-loader.mjs'
const loadTs = (path, mocks = {}, globals = {}) => moduleLoader(mocks, globals)(path.replace(/^\.\.\/\.\.\//, ''))
const helper = loadTs('../../lib/project-management.ts')
const decimal = (value) => ({ toString: () => String(value) })

test('concurrent Dhas creation resolves the existing unique code without creating a duplicate', async () => {
  let reads = 0
  const name = 'D.H.A. Siamwalla Ltd.'
  const existing = { id: 1n, code: 'dhas', name }
  const service = moduleLoader({
    '@/lib/database/repositories/companies': { companies: {
      dhasCandidates: async () => ++reads === 1 ? [] : [existing],
      create: async () => { throw { code: '23505', constraint: 'companies_code_key' } },
    } },
  })('lib/company.ts')
  assert.equal(await service.getOrCreateDhasCompany(), existing)
  assert.equal(reads, 2)
})

test('an unrelated identity conflict fails once instead of retrying forever', async () => {
  let reads = 0
  const failure = { code: '23505', constraint: 'companies_pkey' }
  const service = moduleLoader({
    '@/lib/database/repositories/companies': { companies: {
      dhasCandidates: async () => { reads++; return [] },
      create: async () => { throw failure },
    } },
  })('lib/company.ts')
  await assert.rejects(service.getOrCreateDhasCompany(), (error) => error === failure)
  assert.equal(reads, 1)
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
  assert.equal(helper.companyRelationConflict({ code: '23503', constraint: 'projects_company_id_fkey' }).status, 409)
  assert.equal(helper.companyRelationConflict({ code: '23503', constraint: 'work_items_project_id_fkey' }), null)
  assert.equal(helper.companyRelationConflict({ code: '23503' }), null)
  assert.equal(helper.companyRelationConflict({ code: 'P0002' }), null)
})

test('Project summary excludes cancelled from progress and sums role/hour source rows', () => {
  const summary = helper.projectSummary([
    { status: 'completed', role: 'Developer' }, { status: 'cancelled', role: 'SA' },
    { status: 'in-progress', role: 'infra' },
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
