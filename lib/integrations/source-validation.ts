import { WORK_ITEM_TYPES } from '@/lib/work-items'

export function canonicalSourceBaseUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim() === '') return null
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return null
    url.pathname = url.pathname.replace(/\/+$/, '')
    return url.href.replace(/\/$/, '')
  } catch {
    return null
  }
}

export function parseSourceTimestamp(value: unknown): Date | null {
  if (typeof value !== 'string' || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) return null
  const instant = new Date(value)
  if (Number.isNaN(instant.getTime())) return null
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
  }).formatToParts(instant)
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]))
  const wallClock = new Date(0)
  wallClock.setUTCFullYear(Number(values.year), Number(values.month) - 1, Number(values.day))
  wallClock.setUTCHours(
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
    Number(values.fractionalSecond),
  )
  return wallClock
}

export function validateApprovedLabelMap(value: unknown): Record<string, string> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const entries = Object.entries(value)
  if (
    entries.length > 100 ||
    entries.some(
      ([label, type]) =>
        label.trim() === '' ||
        label.length > 255 ||
        typeof type !== 'string' ||
        !WORK_ITEM_TYPES.includes(type as (typeof WORK_ITEM_TYPES)[number]),
    )
  )
    return null
  return Object.fromEntries(entries) as Record<string, string>
}
