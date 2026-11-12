import { formatBangkokDateLabel } from './bangkok-datetime'

const DISPLAY_DATE_OPTIONS: Intl.DateTimeFormatOptions = { day: '2-digit', month: '2-digit', year: 'numeric', calendar: 'gregory' }

/** Presentation only: leave date-only form values, exports and persisted timestamps unchanged. */
export function formatUiDate(value: string | null | undefined): string {
  return value ? formatBangkokDateLabel(value, DISPLAY_DATE_OPTIONS, 'en-GB') : '—'
}

/** Bangkok local time, Gregorian year and 24-hour clock; never use for API serialization. */
export function formatUiDateTime(value: string | null | undefined): string {
  return value ? formatBangkokDateLabel(value, { ...DISPLAY_DATE_OPTIONS, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, 'en-GB') : '—'
}
