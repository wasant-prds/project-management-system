import assert from 'node:assert/strict'
import test from 'node:test'
import { moduleLoader } from '../support/module-loader.mjs'

const load = moduleLoader()
const { formatUiDate, formatUiDateTime } = load('lib/display-date.ts')
const { formatDatePickerDisplay, submittedCalendarDate } = load('lib/date-picker.ts')
const { formatBangkokDateLabel } = load('lib/bangkok-datetime.ts')
const { formatDisplayDate } = load('components/page/work-items/work-item-presentation.ts')

test('UI date agrees with the shared calendar at Bangkok midnight in different host timezones', () => {
  const previous = process.env.TZ
  try {
    for (const timezone of ['America/Los_Angeles', 'Asia/Tokyo', 'Asia/Bangkok']) {
      process.env.TZ = timezone
      const expected = formatDatePickerDisplay('2026-10-03')
      for (const value of ['2026-10-03', '2026-10-03T00:00:00+07:00', '2026-10-02T17:00:00Z', '2026-10-03T23:59:59+07:00']) assert.equal(formatUiDate(value), expected)
      assert.equal(formatUiDate('2026-10-03T17:00:00Z'), '04/10/2026')
    }
  } finally {
    if (previous === undefined) delete process.env.TZ
    else process.env.TZ = previous
  }
})

test('UI datetime uses Gregorian dates and Bangkok 24-hour time', () => {
  assert.equal(formatUiDateTime('2026-10-02T17:05:00Z'), '03/10/2026, 00:05')
  assert.equal(formatUiDateTime('2026-10-03T23:59:00+07:00'), '03/10/2026, 23:59')
  for (const value of [undefined, null, '']) {
    assert.equal(formatUiDate(value), '—')
    assert.equal(formatUiDateTime(value), '—')
  }
})

test('display changes preserve form date values and historical export formatters', () => {
  const value = '2026-10-03'
  assert.equal(submittedCalendarDate(value), value)
  assert.equal(formatDisplayDate(value), value)
  assert.equal(formatBangkokDateLabel(value), 'Oct 3, 2026')
  assert.equal(formatUiDate(value), '03/10/2026')
})
