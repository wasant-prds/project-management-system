import { currentBangkokCalendarDate, parseBangkokCalendarDate, serializeBangkokCalendarDate } from '@/lib/bangkok-datetime'

export const DATE_PICKER_PLACEHOLDER = 'วว/ดด/ปปปป'

export const THAI_WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] as const

export const THAI_MONTHS = [
  'มกราคม',
  'กุมภาพันธ์',
  'มีนาคม',
  'เมษายน',
  'พฤษภาคม',
  'มิถุนายน',
  'กรกฎาคม',
  'สิงหาคม',
  'กันยายน',
  'ตุลาคม',
  'พฤศจิกายน',
  'ธันวาคม',
] as const

const DAY_KEY_OFFSET: Readonly<Record<string, number>> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
}

export type CalendarDateParts = { year: number; month: number; day: number }

export type CalendarDayCell = {
  iso: string
  label: string
  inMonth: boolean
}

export function calendarDateParts(value: string): CalendarDateParts | null {
  const date = parseBangkokCalendarDate(value)
  if (!date) return null
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

export function submittedCalendarDate(value: string): string {
  return calendarDateParts(value) ? value : ''
}

export function formatDatePickerDisplay(value: string, placeholder = DATE_PICKER_PLACEHOLDER): string {
  const parts = calendarDateParts(value)
  if (!parts) return placeholder
  const day = String(parts.day).padStart(2, '0')
  const month = String(parts.month).padStart(2, '0')
  const year = String(parts.year).padStart(4, '0')
  return `${day}/${month}/${year}`
}

export function calendarMonthLabel(year: number, month: number): string {
  const name = THAI_MONTHS[month - 1]
  if (!name) return String(year)
  return `${name} ${year}`
}

export function calendarDayName(value: string): string {
  const parts = calendarDateParts(value)
  if (!parts) return value
  return `${parts.day} ${THAI_MONTHS[parts.month - 1]} ${parts.year}`
}

export function formatIsoDate(year: number, month: number, day: number): string {
  const yearText = String(year).padStart(4, '0')
  const monthText = String(month).padStart(2, '0')
  const dayText = String(day).padStart(2, '0')
  return `${yearText}-${monthText}-${dayText}`
}

export function daysInCalendarMonth(year: number, month: number): number {
  const date = parseBangkokCalendarDate(formatIsoDate(year, month, 1))
  if (!date) return 0
  date.setUTCMonth(date.getUTCMonth() + 1, 0)
  return date.getUTCDate()
}

export function adjacentMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const date = parseBangkokCalendarDate(formatIsoDate(year, month, 1))
  if (!date) return { year, month }
  date.setUTCMonth(date.getUTCMonth() + delta)
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 }
}

export function addCalendarDays(value: string, days: number): string | null {
  const date = parseBangkokCalendarDate(value)
  if (!date) return null
  date.setUTCDate(date.getUTCDate() + days)
  return serializeBangkokCalendarDate(date)
}

export function addCalendarMonths(value: string, months: number): string | null {
  const parts = calendarDateParts(value)
  if (!parts) return null
  const shifted = adjacentMonth(parts.year, parts.month, months)
  const day = Math.min(parts.day, daysInCalendarMonth(shifted.year, shifted.month))
  return formatIsoDate(shifted.year, shifted.month, day)
}

export function weekBoundary(value: string, end: boolean): string | null {
  const date = parseBangkokCalendarDate(value)
  if (!date) return null
  const offset = end ? 6 - date.getUTCDay() : -date.getUTCDay()
  return addCalendarDays(value, offset)
}

export function shiftCalendarFocus(value: string, key: string): string | null {
  if (key === 'Home') return weekBoundary(value, false)
  if (key === 'End') return weekBoundary(value, true)
  if (key === 'PageUp') return addCalendarMonths(value, -1)
  if (key === 'PageDown') return addCalendarMonths(value, 1)
  const offset = DAY_KEY_OFFSET[key]
  if (offset === undefined) return null
  return addCalendarDays(value, offset)
}

export function calendarMonthDays(year: number, month: number): CalendarDayCell[] {
  const first = parseBangkokCalendarDate(formatIsoDate(year, month, 1))
  if (!first) return []
  const start = new Date(first)
  start.setUTCDate(first.getUTCDate() - first.getUTCDay())
  return Array.from({ length: 42 }, (_, index) => {
    const cursor = new Date(start)
    cursor.setUTCDate(start.getUTCDate() + index)
    const iso = serializeBangkokCalendarDate(cursor)
    const parts = calendarDateParts(iso)
    return {
      iso,
      label: parts ? String(parts.day) : '',
      inMonth: Boolean(parts && parts.month === month && parts.year === year),
    }
  })
}

export function bangkokPickerToday(now = new Date()): string {
  return currentBangkokCalendarDate(now)
}

export function initialCalendarFocus(value: string, today: string): string {
  if (calendarDateParts(value)) return value
  if (calendarDateParts(today)) return today
  return bangkokPickerToday()
}

export function calendarViewOf(value: string, today: string): { year: number; month: number } {
  const parts = calendarDateParts(initialCalendarFocus(value, today))
  if (!parts) return { year: 1970, month: 1 }
  return { year: parts.year, month: parts.month }
}

export function focusCalendarDate(value: string | null): { iso: string; year: number; month: number } | null {
  if (!value) return null
  const parts = calendarDateParts(value)
  if (!parts) return null
  return { iso: value, year: parts.year, month: parts.month }
}
