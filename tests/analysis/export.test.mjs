import test from 'node:test'
import assert from 'node:assert/strict'
import { moduleLoader } from '../support/module-loader.mjs'

const { generateAnalysisCsv } = moduleLoader()('lib/analysis-export.ts')
function report(titles = ['Review, phase "one"']) {
  const project = { name: 'Project', company: { name: 'Acme', displayName: 'บริษัท' } }
  return {
    meta: { period: { startDate: '2026-11-01', endDate: '2026-11-30' } },
    summary: { total: titles.length, open: titles.length, completed: 0, overdue: 0, completionRate: 0, loggedHours: '0.000000000000000000000000000001' },
    breakdowns: { status: [{ value: 'todo', count: titles.length }] },
    loggedHoursByPeriod: [{ startDate: '2026-11-04', endDate: '2026-11-04', hours: '0.000000000000000000000000000001' }],
    workItems: titles.map((title) => ({ id: '11111111-1111-4111-8111-111111111111', title, workDate: '2026-11-04', project, kind: 'Task', role: null, status: 'todo', priority: 'none' })),
    timeEntries: [{ id: '22222222-2222-4222-8222-222222222222', date: '2026-11-04', hours: '0.000000000000000000000000000001', workItem: { title: titles[0], project }, description: 'line one\nline two', remarks: 'note' }],
  }
}

test('Analysis export formats hours to two decimals and retains public UUIDs and quoted Unicode/multiline text', () => {
  const csv = generateAnalysisCsv(report())
  assert.ok(csv.startsWith('\uFEFF"recordType","date","id"'))
  assert.ok(csv.includes('Review, phase ""one""'))
  assert.ok(csv.includes('line one\nline two · note'))
  assert.equal((csv.match(/"0\.00"/g) ?? []).length, 3)
  assert.ok(!csv.includes('0.000000000000000000000000000001'))
  assert.ok(csv.includes('"บริษัท"'))
  assert.ok(csv.includes('"11111111-1111-4111-8111-111111111111"'))
})

test('Analysis export neutralizes spreadsheet formulas after whitespace and BOM characters', () => {
  const data = report(['=1+1', '  +SUM(1,2)', '@HYPERLINK("https://example.test")', '\uFEFF=1+1'])
  data.timeEntries[0].description = '\t=1+1'
  const csv = generateAnalysisCsv(data)
  for (const value of ["\"'=1+1\"", "\"'  +SUM(1,2)\"", "\"'@HYPERLINK(\"\"https://example.test\"\")\"", "\"'\uFEFF=1+1\"", "\"'\t=1+1"]) assert.ok(csv.includes(value))
})
