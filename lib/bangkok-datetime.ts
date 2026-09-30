const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?\+07:00$/
const DEFAULT_DATE_FORMAT_OPTIONS: Intl.DateTimeFormatOptions = {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
}

function wallClockDate(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0,
): Date | null {
  // Store Bangkok wall-clock components in a Date's UTC fields for timestamp-without-time-zone columns.
  const value = new Date(0)
  value.setUTCFullYear(year, month - 1, day)
  value.setUTCHours(hour, minute, second, millisecond)

  if (
    value.getUTCFullYear() !== year ||
    value.getUTCMonth() !== month - 1 ||
    value.getUTCDate() !== day ||
    value.getUTCHours() !== hour ||
    value.getUTCMinutes() !== minute ||
    value.getUTCSeconds() !== second ||
    value.getUTCMilliseconds() !== millisecond
  ) return null

  return value
}

export function parseBangkokDateTime(value: unknown): Date | null {
  if (typeof value !== 'string') return null

  const dateOnly = DATE_ONLY_PATTERN.exec(value)
  if (dateOnly) {
    return wallClockDate(Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]))
  }

  const timestamp = TIMESTAMP_PATTERN.exec(value)
  if (!timestamp) return null

  const fraction = timestamp[7] ?? ''
  return wallClockDate(
    Number(timestamp[1]),
    Number(timestamp[2]),
    Number(timestamp[3]),
    Number(timestamp[4]),
    Number(timestamp[5]),
    Number(timestamp[6] ?? '0'),
    Number(fraction.padEnd(3, '0')),
  )
}

export function parseBangkokCalendarDate(value: unknown): Date | null {
  if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) return null

  const match = DATE_ONLY_PATTERN.exec(value)
  if (!match) return null
  return wallClockDate(Number(match[1]), Number(match[2]), Number(match[3]))
}

export function serializeBangkokCalendarDate(value: Date): string {
  const year = String(value.getUTCFullYear()).padStart(4, '0')
  const month = String(value.getUTCMonth() + 1).padStart(2, '0')
  const day = String(value.getUTCDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function currentBangkokCalendarDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

export function currentBangkokWallClockDate(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hourCycle: 'h23',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return wallClockDate(
    Number(values.year),
    Number(values.month),
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
    Number(values.fractionalSecond),
  ) ?? new Date(Number.NaN)
}

export function bangkokDateRange(value: unknown): { start: Date; end: Date } | null {
  if (typeof value !== 'string' || !DATE_ONLY_PATTERN.test(value)) return null
  const start = parseBangkokDateTime(value)
  if (!start) return null
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) }
}

export function serializeBangkokTimestamp(value: Date): string {
  return `${value.toISOString().slice(0, -1)}+07:00`
}

export function formatBangkokDateLabel(
  value: Date | string,
  options?: Intl.DateTimeFormatOptions,
): string {
  return new Intl.DateTimeFormat('en-US', {
    ...(options ?? DEFAULT_DATE_FORMAT_OPTIONS),
    timeZone: 'Asia/Bangkok',
  }).format(new Date(bangkokTimestampInput(value)))
}

function bangkokTimestampInput(value: Date | string) {
  if (typeof value === 'string' && DATE_ONLY_PATTERN.test(value)) return `${value}T00:00:00.000+07:00`
  return typeof value === 'string' ? value : serializeBangkokTimestamp(value)
}
