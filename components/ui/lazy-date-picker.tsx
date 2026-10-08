'use client'

import type { DatePickerProps } from '@/components/ui/date-picker'
import { RetryableLazy } from '@/components/ui/retryable-lazy'
import { DATE_PICKER_PLACEHOLDER, formatDatePickerDisplay, submittedCalendarDate } from '@/lib/date-picker'
import { cn } from '@/lib/utils'

const loadDatePicker = () => import('@/components/ui/date-picker').then((module) => ({ default: module.DatePicker }))

function DatePickerShell({
  id,
  name,
  className,
  disabled = false,
  required = false,
  value,
  defaultValue = '',
}: DatePickerProps) {
  const submitted = submittedCalendarDate(value ?? defaultValue)
  return (
    <div data-slot="date-picker" className="relative min-w-0" aria-busy="true">
      <button
        id={id}
        type="button"
        disabled
        className={cn(
          'surface-inset border-border-strong flex h-10 w-full min-w-0 items-center rounded-md border bg-input px-3 text-left text-base sm:text-sm',
          'disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-foreground disabled:opacity-100',
          className,
        )}
      >
        <span className={cn('min-w-0 flex-1 truncate tabular-nums', submitted === '' && 'text-muted-foreground')}>
          {submitted === '' ? DATE_PICKER_PLACEHOLDER : formatDatePickerDisplay(submitted)}
        </span>
      </button>
      <input
        className="pointer-events-none absolute start-0 top-0 size-px opacity-0"
        tabIndex={-1}
        aria-hidden="true"
        autoComplete="off"
        value={submitted}
        required={required}
        disabled={disabled}
        onChange={(event) => { event.currentTarget.value = submitted }}
        {...(name ? { name } : {})}
      />
    </div>
  )
}

export function DatePicker(props: DatePickerProps) {
  return (
    <RetryableLazy
      loader={loadDatePicker}
      componentProps={props}
      loading={<DatePickerShell {...props} />}
      error={(retry) => (
        <div role="alert" className="grid gap-2">
          <DatePickerShell {...props} />
          <button type="button" className="motion-control h-9 justify-self-start rounded-md px-3 text-sm text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none" onClick={retry}>
            โหลดตัวเลือกวันที่ไม่สำเร็จ ลองอีกครั้ง
          </button>
        </div>
      )}
    />
  )
}
