import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { moduleLoader } from '../support/module-loader.mjs'
const loadTs = (path, mocks = {}, globals = {}) => moduleLoader(mocks, globals)(path.replace(/^\.\.\/\.\.\//, ''))
const decimalHours = loadTs('../../lib/decimal-hours.ts')
const bangkok = loadTs('../../lib/bangkok-datetime.ts')
// API persistence and authorization run against PostgreSQL in tests/database.

test('positive decimal hour parser preserves exact decimal input and rejects non-numeric values', () => {
  assert.equal(decimalHours.parsePositiveDecimalHours('9007199254740993.125'), '9007199254740993.125')
  assert.equal(decimalHours.parsePositiveDecimalHours('1.2500'), '1.25')
  assert.equal(decimalHours.parsePositiveDecimalHours(0.125), '0.125')
  for (const value of [0, -1, '0', '-0.25', '2 hours', '', 'Infinity', Number.NaN, Number.POSITIVE_INFINITY, {}, null]) {
    assert.equal(decimalHours.parsePositiveDecimalHours(value), null, `value: ${String(value)}`)
  }
})

test('positive hours fit the persisted Decimal(65,30) integer and fractional bounds', () => {
  const { parsePositiveDecimalHours } = decimalHours
  assert.equal(parsePositiveDecimalHours('1e-30'), '0.000000000000000000000000000001')
  assert.equal(parsePositiveDecimalHours('1e34'), '10000000000000000000000000000000000')
  assert.equal(parsePositiveDecimalHours('1e-31'), null)
  assert.equal(parsePositiveDecimalHours('1e35'), null)
})

test('decimal hour summation is exact and does not round each entry', () => {
  const { sumDecimalHours } = decimalHours
  assert.equal(sumDecimalHours(['0.1', '0.2', '1.005']), '1.305')
  assert.equal(sumDecimalHours(['9007199254740993.125', '0.875']), '9007199254740994')
  assert.equal(sumDecimalHours([]), '0')
})

test('hours display always uses two decimals without losing decimal-string precision', () => {
  const { formatHours } = decimalHours
  for (const [value, expected] of [
    ['4.000000000000000000000000000000', '4.00'],
    ['0', '0.00'], ['1.2', '1.20'], ['1.005', '1.01'], ['1.0049', '1.00'],
    ['9.999', '10.00'], ['0.005', '0.01'], ['0.0049', '0.00'],
    ['-0.0049', '0.00'], ['-1.005', '-1.01'],
    ['9007199254740993.125', '9007199254740993.13'],
    ['12345678901234567890123456789012345.123456789012345678901234567890', '12345678901234567890123456789012345.12'],
    ['1.005e1', '10.05'], ['1e-30', '0.00'], [' 4.5000 ', '4.50'],
    [0.1 + 0.2, '0.30'], [1.005, '1.01'],
  ]) assert.equal(formatHours(value), expected, String(value))

  for (const value of ['', 'invalid', 'Infinity', '1e1001', Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(formatHours(value), '—')
  }
})

test('hour totals round after the exact sum rather than rounding individual entries', () => {
  const { formatHours, sumDecimalHours } = decimalHours
  assert.equal(formatHours(sumDecimalHours(['0.004', '0.004'])), '0.01')
  assert.equal(formatHours(sumDecimalHours(['1.005', '1.005'])), '2.01')
  assert.equal(sumDecimalHours(['1.005', '1.005']), '2.01')
})

test('Bangkok rolling ranges use Bangkok today independent of the host timezone', () => {
  const previousTimezone = process.env.TZ
  process.env.TZ = 'America/Los_Angeles'
  try {
    const { bangkokRollingDateRange } = bangkok
    assert.deepEqual(
      JSON.parse(JSON.stringify(bangkokRollingDateRange(7, new Date('2026-09-30T17:30:00.000Z')))),
      { startDate: '2026-09-25', endDate: '2026-10-01' },
    )
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ
    else process.env.TZ = previousTimezone
  }
})

test('date-only values remain the selected calendar day in a non-Bangkok browser timezone', () => {
  const previousTimezone = process.env.TZ
  process.env.TZ = 'America/Los_Angeles'
  try {
    const utilities = loadTs('../../lib/utils.ts', {
      clsx: { clsx: () => '' },
      'tailwind-merge': { twMerge: () => '' },
    })
    const picked = utilities.dateOnlyToPickerDate('2026-10-01')
    assert.equal(utilities.formatDate(picked), '2026-10-01')
    assert.equal(utilities.dateOnlyToPickerDate('2026-02-30'), null)
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ
    else process.env.TZ = previousTimezone
  }
})

test('Daily Work calendar ranges stay within selected weeks, months, and years', () => {
  const { bangkokCalendarPeriodRange } = bangkok
  assert.deepEqual(JSON.parse(JSON.stringify(bangkokCalendarPeriodRange('2026-10-01', 'week'))), {
    startDate: '2026-09-27', endDate: '2026-10-03',
  })
  assert.deepEqual(JSON.parse(JSON.stringify(bangkokCalendarPeriodRange('2027-01-01', 'week'))), {
    startDate: '2026-12-27', endDate: '2027-01-02',
  })
  assert.deepEqual(JSON.parse(JSON.stringify(bangkokCalendarPeriodRange('2026-01-31', 'month'))), {
    startDate: '2026-01-01', endDate: '2026-01-31',
  })
  assert.deepEqual(JSON.parse(JSON.stringify(bangkokCalendarPeriodRange('2024-02-29', 'month'))), {
    startDate: '2024-02-01', endDate: '2024-02-29',
  })
  assert.deepEqual(JSON.parse(JSON.stringify(bangkokCalendarPeriodRange('2026-10-01', 'year'))), {
    startDate: '2026-01-01', endDate: '2026-12-31',
  })
  assert.equal(bangkokCalendarPeriodRange('2026-02-30', 'month'), null)
})

test('Daily Work calendar ranges do not change with the browser timezone', () => {
  const previousTimezone = process.env.TZ
  const utilities = loadTs('../../lib/utils.ts', {
    clsx: { clsx: () => '' },
    'tailwind-merge': { twMerge: () => '' },
  })
  const { bangkokCalendarPeriodRange } = bangkok
  const ranges = []
  try {
    for (const timezone of ['America/Los_Angeles', 'Asia/Bangkok']) {
      process.env.TZ = timezone
      const selectedDate = utilities.dateOnlyToPickerDate('2026-10-01')
      ranges.push(bangkokCalendarPeriodRange(utilities.formatDate(selectedDate), 'week'))
    }
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ
    else process.env.TZ = previousTimezone
  }
  assert.deepEqual(JSON.parse(JSON.stringify(ranges[0])), JSON.parse(JSON.stringify(ranges[1])))
})

test('Work Item option fetch follows every cursor and retains Project and year filters', async () => {
  const requests = []
  const firstPage = Array.from({ length: 200 }, (_, index) => `item-${index}`)
  const pages = [
    { workItems: firstPage, page: { nextCursor: 'next-page' } },
    { workItems: ['historical-item'], page: { nextCursor: null } },
  ]
  const { fetchCollection } = loadTs('../../lib/fetch-collection.ts', {}, {
    window: { location: { origin: 'http://localhost' } },
    fetch: async (url) => {
      requests.push(new URL(url))
      return { ok: true, json: async () => pages.shift() }
    },
  })

  const workItems = await fetchCollection('/api/work-items?projectId=project-1&year=all', 'workItems')
  assert.equal(workItems.length, 201)
  assert.equal(workItems.at(-1), 'historical-item')
  assert.equal(requests.length, 2)
  assert.equal(requests[0].searchParams.get('projectId'), 'project-1')
  assert.equal(requests[0].searchParams.get('year'), 'all')
  assert.equal(requests[0].searchParams.get('limit'), '200')
  assert.equal(requests[1].searchParams.get('cursor'), 'next-page')
})

test('Dashboard and Analysis request live hours and Work Item details display an exact total', () => {
  const dashboard = readFileSync(new URL('../../app/page.tsx', import.meta.url), 'utf8')
  const analysis = readFileSync(new URL('../../app/analysis/page.tsx', import.meta.url), 'utf8')
  const stat = readFileSync(new URL('../../components/layout/logged-hours-stat.tsx', import.meta.url), 'utf8')
  const workItemDialog = readFileSync(new URL('../../components/page/work-items/work-item-view-dialog.tsx', import.meta.url), 'utf8')
  const workLogDialog = readFileSync(new URL('../../components/page/daily-work/work-log-dialog.tsx', import.meta.url), 'utf8')
  const dailyWorkPage = readFileSync(new URL('../../app/daily-work/page.tsx', import.meta.url), 'utf8')
  assert.match(dashboard, /getDashboardSummary\(owner\.internalId, params\)/)
  assert.doesNotMatch(dashboard, /LoggedHoursStat/)
  assert.match(analysis, /fetch\(`\/api\/analysis\/summary\?\$\{requestQuery\}`/)
  assert.match(analysis, /report\.summary\.loggedHours/)
  assert.match(analysis, /<AnalysisChartsDeferred report={report}/)
  assert.match(readFileSync(new URL('../../components/page/analysis/analysis-charts-deferred.tsx', import.meta.url), 'utf8'), /<HoursPeriodTable report={report}/)
  assert.match(readFileSync(new URL('../../components/page/analysis/report-tables.tsx', import.meta.url), 'utf8'), /report\.loggedHoursByPeriod/)
  assert.match(stat, /\/api\/work-logs\/summary/)
  assert.match(workItemDialog, /sumDecimalHours\(entries\.map\(\(entry\) => entry\.hours\)\)/)
  assert.match(workLogDialog, /fetchCollection<WorkLogWorkItem>[\s\S]*?projectId=\$\{encodeURIComponent\(projectId\)\}&year=all/)
  assert.match(dailyWorkPage, /fetchCollection<Project>\("\/api\/projects", "projects"\)/)
  assert.match(dailyWorkPage, /bangkokCalendarPeriodRange\(formatDate\(date\), period\)/)
})
