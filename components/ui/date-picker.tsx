'use client'

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { CalendarDays } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { RetryableLazy } from '@/components/ui/retryable-lazy'
import {
  DATE_PICKER_PLACEHOLDER,
  bangkokPickerToday,
  formatDatePickerDisplay,
  submittedCalendarDate,
} from '@/lib/date-picker'
import { cn } from '@/lib/utils'

type PopupCalendarProps = Readonly<{
  value: string
  today: string
  clearable: boolean
  onSelect: (value: string) => void
}>

const loadDatePickerCalendar = () => import('@/components/ui/date-picker-calendar').then((module) => ({ default: module.DatePickerCalendar }))
const REQUIRED_DATE_MESSAGE = 'กรุณาระบุวันที่'

export type DatePickerProps = Readonly<{
  id: string
  name?: string
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  required?: boolean
  disabled?: boolean
  clearable?: boolean
  placeholder?: string
  className?: string
  'aria-invalid'?: boolean
  'aria-describedby'?: string
  now?: () => Date
}>

function stopOverlayDismiss(event: { stopPropagation: () => void }) {
  event.stopPropagation()
}

function focusCalendarDay(event: { preventDefault: () => void }) {
  event.preventDefault()
}

function trapPopupTab(event: KeyboardEvent<HTMLDivElement>) {
  if (event.key !== 'Tab') return
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled])')]
  const first = items[0]
  const last = items[items.length - 1]
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
    return
  }
  if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

function DatePickerPopup(props: PopupCalendarProps) {
  return (
    <RetryableLazy
      loader={loadDatePickerCalendar}
      componentProps={props}
      loading={<p role="status" className="grid min-h-[18.5rem] place-items-center text-sm text-muted-foreground">กำลังโหลดปฏิทิน…</p>}
      error={(retry) => (
        <div className="grid min-h-[18.5rem] place-items-center">
          <button type="button" className="motion-control h-9 rounded-md px-3 text-sm text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none" onClick={retry}>
            โหลดปฏิทินไม่สำเร็จ ลองอีกครั้ง
          </button>
        </div>
      )}
    />
  )
}

function DatePicker({
  id,
  name,
  value,
  defaultValue = '',
  onValueChange,
  required = false,
  disabled = false,
  clearable = false,
  placeholder = DATE_PICKER_PLACEHOLDER,
  className,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  now,
}: DatePickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [uncontrolled, setUncontrolled] = useState(defaultValue)
  const [open, setOpen] = useState(false)
  const [nativeInvalid, setNativeInvalid] = useState(false)
  const controlled = value !== undefined
  const current = controlled ? value : uncontrolled
  const submitted = submittedCalendarDate(current)
  if (nativeInvalid && submitted !== '') setNativeInvalid(false)
  const canClear = clearable && !required
  const today = open ? bangkokPickerToday(now ? now() : new Date()) : ''
  const constraintInvalid = nativeInvalid && submitted === ''
  const invalid = Boolean(ariaInvalid) || constraintInvalid
  const errorId = `${id}-error`
  const describedBy = [ariaDescribedBy, constraintInvalid ? errorId : undefined].filter(Boolean).join(' ') || undefined

  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  function commit(next: string) {
    const safe = submittedCalendarDate(next)
    if (!controlled) setUncontrolled(safe)
    onValueChange?.(safe)
    setNativeInvalid(false)
    setOpen(false)
  }

  function onConstraintInvalid(event: FormEvent<HTMLInputElement>) {
    // The hidden field only carries the constraint. Cancel the English browser tooltip and keep focus on the visible trigger.
    event.preventDefault()
    setNativeInvalid(true)
    const field = event.currentTarget
    const firstInvalid = field.form?.querySelector(':invalid')
    if (firstInvalid && firstInvalid !== field) return
    triggerRef.current?.focus()
  }

  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== 'ArrowDown' || disabled) return
    event.preventDefault()
    setOpen(true)
  }

  return (
    <div data-slot="date-picker" className="relative min-w-0">
      <Popover open={open} onOpenChange={(next) => { if (!disabled) setOpen(next) }}>
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            id={id}
            type="button"
            disabled={disabled}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-describedby={describedBy}
            data-invalid={invalid ? 'true' : undefined}
            onKeyDown={onTriggerKeyDown}
            className={cn(
              'motion-control surface-inset border-border-strong flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border bg-input px-3 text-left text-base outline-none sm:text-sm',
              'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
              'disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-disabled disabled:text-disabled-foreground disabled:opacity-100',
              'data-[invalid=true]:border-destructive data-[invalid=true]:ring-destructive/20 dark:data-[invalid=true]:ring-destructive/40',
              className,
            )}
          >
            <span className={cn('min-w-0 flex-1 truncate tabular-nums', submitted === '' && 'text-muted-foreground')}>
              {submitted === '' ? placeholder : formatDatePickerDisplay(submitted)}
            </span>
            <CalendarDays className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          collisionPadding={16}
          role="dialog"
          aria-label="เลือกวันที่"
          onEscapeKeyDown={stopOverlayDismiss}
          onCloseAutoFocus={stopOverlayDismiss}
          onOpenAutoFocus={focusCalendarDay}
          className="z-[60] w-72 max-w-[calc(100vw-2rem)] p-2"
        >
          <div onKeyDown={trapPopupTab}>
            {open && (
              <DatePickerPopup value={submitted} today={today} clearable={canClear} onSelect={commit} />
            )}
          </div>
        </PopoverContent>
      </Popover>
      <input
        className="pointer-events-none absolute start-0 top-0 size-px opacity-0"
        tabIndex={-1}
        aria-hidden="true"
        autoComplete="off"
        value={submitted}
        required={required}
        disabled={disabled}
        onChange={(event) => { event.currentTarget.value = submitted }}
        onInvalid={onConstraintInvalid}
        {...(name ? { name } : {})}
      />
      {constraintInvalid ? <p id={errorId} role="alert" className="mt-1.5 text-sm text-destructive">{REQUIRED_DATE_MESSAGE}</p> : null}
    </div>
  )
}

export { DatePicker }
