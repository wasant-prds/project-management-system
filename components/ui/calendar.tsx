'use client'

import * as React from 'react'
import dayjs from 'dayjs'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { DateCalendar } from '@mui/x-date-pickers/DateCalendar'
import { cn } from '@/lib/utils'
import { CALENDAR_HEIGHT_CLASS } from './calendar-layout'

interface CalendarProps {
  readonly className?: string
  readonly selectedDate?: Date
  readonly onDateChange?: (date: Date | null) => void
}

const selectedStyle = {
  backgroundColor: 'var(--primary)', color: 'var(--primary-foreground)',
  boxShadow: 'var(--surface-shadow-soft)',
  '&:hover': { backgroundColor: 'var(--primary-hover)', color: 'var(--primary-foreground)' },
  '&:active': { backgroundColor: 'var(--primary-active)' },
}

function Calendar({ className, selectedDate, onDateChange }: CalendarProps) {
  const [isMounted, setIsMounted] = React.useState(false)
  React.useEffect(() => { setIsMounted(true) }, [])
  if (!isMounted) return <div role="status" className={cn('grid place-items-center text-sm text-muted-foreground', CALENDAR_HEIGHT_CLASS, className)}>กำลังโหลดปฏิทิน…</div>
  return (
    <LocalizationProvider dateAdapter={AdapterDayjs}>
      <div data-slot="calendar" className={cn('min-w-0 w-full', CALENDAR_HEIGHT_CLASS, className)}>
        <DateCalendar
          value={selectedDate ? dayjs(selectedDate) : null}
          onChange={(value) => onDateChange?.(value ? value.toDate() : null)}
          views={['year', 'month', 'day']}
          openTo="day"
          sx={{
            width: '100%', maxWidth: '320px', color: 'var(--foreground)', fontFamily: 'inherit',
            '& .MuiPickersCalendarHeader-root': { padding: '0 16px', marginBottom: '12px' },
            '& .MuiPickersCalendarHeader-label': { fontSize: '14px', fontWeight: 600 },
            '& .MuiIconButton-root': { color: 'var(--foreground)', borderRadius: 'var(--radius-control)', '&:hover': { backgroundColor: 'var(--hover)' } },
            '& button:focus-visible': { outline: '2px solid var(--focus)', outlineOffset: '2px' },
            '& button.Mui-disabled': { color: 'var(--text-disabled)', backgroundColor: 'var(--disabled)', opacity: 1 },
            '& .MuiDayCalendar-weekDayLabel': { color: 'var(--muted-foreground)' },
            '& .MuiDayCalendar-weekContainer': { gap: '2px' },
            '& .MuiPickersDay-root': {
              color: 'var(--foreground)', borderRadius: 'var(--radius-control)', fontFamily: 'inherit',
              '&:hover': { backgroundColor: 'var(--hover)' },
              '&:active': { backgroundColor: 'var(--pressed)' },
              '&.Mui-selected': selectedStyle,
              '&.MuiPickersDay-today': { borderColor: 'var(--ring)' },
              '&:nth-of-type(1):not(.Mui-selected)': { color: 'var(--danger)' },
              '&:nth-of-type(7):not(.Mui-selected)': { color: 'var(--info)' },
            },
            '& .MuiYearCalendar-button, & .MuiMonthCalendar-button': {
              color: 'var(--foreground)', fontFamily: 'inherit', borderRadius: 'var(--radius-control)',
              '&:hover': { backgroundColor: 'var(--accent)' }, '&.Mui-selected': selectedStyle,
            },
          }}
        />
      </div>
    </LocalizationProvider>
  )
}
export { Calendar }
