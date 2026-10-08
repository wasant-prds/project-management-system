'use client'

import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  THAI_WEEKDAYS,
  addCalendarMonths,
  calendarDayName,
  calendarMonthDays,
  calendarMonthLabel,
  calendarViewOf,
  focusCalendarDate,
  initialCalendarFocus,
  shiftCalendarFocus,
} from '@/lib/date-picker'
import { cn } from '@/lib/utils'

export type DatePickerCalendarProps = Readonly<{
  value: string
  today: string
  clearable: boolean
  onSelect: (value: string) => void
}>

function dayClass(selected: boolean, today: boolean, inMonth: boolean): string {
  if (selected) return 'bg-primary text-primary-foreground hover:bg-primary-hover'
  if (today) return 'border border-ring text-foreground hover:bg-hover'
  if (inMonth) return 'text-foreground hover:bg-hover'
  return 'text-muted-foreground hover:bg-hover'
}

function DatePickerCalendar({ value, today, clearable, onSelect }: DatePickerCalendarProps) {
  const baseId = useId()
  const [view, setView] = useState(() => calendarViewOf(value, today))
  const [focused, setFocused] = useState(() => initialCalendarFocus(value, today))
  const focusCell = useRef(true)
  const days = calendarMonthDays(view.year, view.month)
  const monthLabel = calendarMonthLabel(view.year, view.month)

  useEffect(() => {
    if (!focusCell.current) return
    focusCell.current = false
    document.getElementById(`${baseId}-${focused}`)?.focus()
  }, [baseId, focused])

  function showDate(next: string | null, shouldFocusCell: boolean) {
    const target = focusCalendarDate(next)
    if (!target) return
    focusCell.current = shouldFocusCell
    setFocused(target.iso)
    setView({ year: target.year, month: target.month })
  }

  function onGridKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = shiftCalendarFocus(focused, event.key)
    if (!next) return
    event.preventDefault()
    showDate(next, true)
  }

  return (
    <div data-slot="date-picker-calendar" className="grid min-h-[18.5rem] w-full gap-2 bg-popover text-popover-foreground">
      <div className="flex items-center justify-between gap-2">
        <button type="button" className="motion-control inline-flex size-9 items-center justify-center rounded-md text-foreground hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none" aria-label="เดือนก่อนหน้า" onClick={() => showDate(addCalendarMonths(focused, -1), false)}>
          <ChevronLeft className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
        <p className="text-sm font-semibold tabular-nums" aria-live="polite">{monthLabel}</p>
        <button type="button" className="motion-control inline-flex size-9 items-center justify-center rounded-md text-foreground hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none" aria-label="เดือนถัดไป" onClick={() => showDate(addCalendarMonths(focused, 1), false)}>
          <ChevronRight className="size-4" strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      <div role="grid" aria-label={monthLabel} className="grid gap-0.5" onKeyDown={onGridKeyDown}>
        <div role="row" className="grid grid-cols-7 gap-0.5 text-center text-xs text-muted-foreground">
          {THAI_WEEKDAYS.map((weekday) => <span key={weekday} role="columnheader">{weekday}</span>)}
        </div>
        {Array.from({ length: 6 }, (_, week) => (
          <div role="row" key={days[week * 7]?.iso ?? week} className="grid grid-cols-7 gap-0.5">
            {days.slice(week * 7, week * 7 + 7).map((day) => {
              const selected = day.iso === value
              const isToday = day.iso === today
              return (
                <button
                  key={day.iso}
                  id={`${baseId}-${day.iso}`}
                  type="button"
                  role="gridcell"
                  tabIndex={day.iso === focused ? 0 : -1}
                  data-date={day.iso}
                  data-outside={day.inMonth ? 'false' : 'true'}
                  data-selected={selected ? 'true' : 'false'}
                  data-today={isToday ? 'true' : 'false'}
                  aria-label={calendarDayName(day.iso)}
                  aria-selected={selected}
                  aria-current={isToday ? 'date' : undefined}
                  className={cn(
                    'motion-control h-9 w-full rounded-md text-sm tabular-nums focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none active:bg-pressed',
                    dayClass(selected, isToday, day.inMonth),
                  )}
                  onClick={() => onSelect(day.iso)}
                >
                  {day.label}
                </button>
              )
            })}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2">
        {clearable ? (
          <button type="button" className="motion-control h-9 rounded-md px-3 text-sm text-foreground hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none" onClick={() => onSelect('')}>
            ล้าง
          </button>
        ) : <span />}
        <button type="button" className="motion-control h-9 rounded-md px-3 text-sm text-foreground hover:bg-hover focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none" onClick={() => onSelect(today)}>
          วันนี้
        </button>
      </div>
    </div>
  )
}

export { DatePickerCalendar }
