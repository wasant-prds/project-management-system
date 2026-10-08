import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { createComponentLoader, descendants, React, renderToStaticMarkup, root, textContent } from './component-runtime.mjs'

const picker = createComponentLoader()('lib/date-picker.ts')
const {
  DATE_PICKER_PLACEHOLDER,
  THAI_WEEKDAYS,
  addCalendarMonths,
  adjacentMonth,
  bangkokPickerToday,
  calendarDateParts,
  calendarMonthDays,
  calendarMonthLabel,
  formatDatePickerDisplay,
  shiftCalendarFocus,
  submittedCalendarDate,
} = picker

function source(path) {
  return readFileSync(join(root, path), 'utf8')
}

function tsxFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return tsxFiles(path)
    return entry.name.endsWith('.tsx') || entry.name.endsWith('.jsx') ? [path] : []
  })
}

function pickerBlock(path, id) {
  const match = source(path).match(new RegExp(`<DatePicker[\\s\\S]*?id="${id}"[\\s\\S]*?/>`))
  assert.ok(match, `${path} should render DatePicker ${id}`)
  return match[0]
}

function pickerHarness(initial) {
  const states = []
  let cursor = 0
  const load = createComponentLoader({
    react: {
      ...React,
      useState(initialState) {
        const index = cursor
        cursor += 1
        if (!(index in states)) states[index] = typeof initialState === 'function' ? initialState() : initialState
        return [states[index], (next) => {
          states[index] = typeof next === 'function' ? next(states[index]) : next
        }]
      },
      useRef(value) { return { current: value } },
      useEffect() {},
    },
  })
  const { DatePicker } = load('components/ui/date-picker.tsx')
  const render = (props = initial) => {
    cursor = 0
    return descendants(DatePicker(props))
  }
  return {
    render,
    button: (elements) => elements.find((element) => element.type === 'button'),
    field: (elements) => elements.find((element) => element.type === 'input'),
    popover: (elements) => elements.find((element) => element.props && typeof element.props.onOpenChange === 'function'),
    popup: (elements) => elements.find((element) => typeof element.props?.onSelect === 'function'),
  }
}

test('TC-40-01 fixed day/month/year display and empty placeholder do not follow a device locale', () => {
  assert.equal(formatDatePickerDisplay('2026-10-08'), '08/10/2026')
  assert.equal(formatDatePickerDisplay(''), DATE_PICKER_PLACEHOLDER)
  assert.equal(DATE_PICKER_PLACEHOLDER, 'วว/ดด/ปปปป')
})

test('TC-40-02 display formatting stays fixed when Intl locale formatting is unavailable', () => {
  const original = Intl.DateTimeFormat
  Intl.DateTimeFormat = function failLocale() { throw new Error('locale formatting is not allowed') }
  try {
    assert.equal(formatDatePickerDisplay('2026-10-08'), '08/10/2026')
    assert.equal(calendarDateParts('2026-10-08')?.day, 8)
  } finally {
    Intl.DateTimeFormat = original
  }
})

test('TC-40-03 invalid calendar strings display the placeholder and do not become a submitted value', () => {
  for (const value of ['2026-02-30', '2026-13-01', '08/10/2026', 'abc', '']) {
    assert.equal(calendarDateParts(value), null)
    assert.equal(formatDatePickerDisplay(value), DATE_PICKER_PLACEHOLDER)
    assert.equal(submittedCalendarDate(value), '')
  }
  const ui = pickerHarness({ id: 'workDate', value: '2026-02-30', onValueChange() { throw new Error('invalid value must not emit') } })
  const elements = ui.render()
  assert.equal(textContent(ui.button(elements)), DATE_PICKER_PLACEHOLDER)
  assert.equal(ui.field(elements).props.value, '')
})

test('TC-40-04 today follows the Asia/Bangkok calendar date when the device date differs', () => {
  const instant = new Date('2026-10-07T18:30:00.000Z')
  assert.equal(bangkokPickerToday(instant), '2026-10-08')
  const ui = pickerHarness({ id: 'date', now: () => instant })
  let elements = ui.render()
  ui.popover(elements).props.onOpenChange(true)
  elements = ui.render()
  assert.equal(ui.popup(elements).props.today, '2026-10-08')
})

test('TC-40-05 the today action emits the Bangkok calendar date supplied to the popup', () => {
  const selected = []
  const { DatePickerCalendar } = createComponentLoader()('components/ui/date-picker-calendar.tsx')
  const html = renderToStaticMarkup(React.createElement(DatePickerCalendar, {
    value: '',
    today: '2026-10-08',
    clearable: false,
    onSelect: (value) => selected.push(value),
  }))
  assert.match(html, />วันนี้</)
  const states = []
  let cursor = 0
  const load = createComponentLoader({
    react: {
      ...React,
      useState(initial) {
        const index = cursor
        cursor += 1
        if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
        return [states[index], (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next }]
      },
      useId: () => 'picker',
      useRef(value) { return { current: value } },
      useEffect() {},
    },
  })
  const calendar = load('components/ui/date-picker-calendar.tsx').DatePickerCalendar
  const render = () => {
    cursor = 0
    return descendants(calendar({ value: '', today: '2026-10-08', clearable: false, onSelect: (value) => selected.push(value) }))
  }
  const today = render().find((element) => element.type === 'button' && textContent(element) === 'วันนี้')
  today.props.onClick()
  assert.deepEqual(selected, ['2026-10-08'])
})

test('TC-40-06 month grid starts on Sunday and uses Thai month, year, and weekday labels', () => {
  const days = calendarMonthDays(2026, 10)
  const firstWeekday = new Date(Date.UTC(2026, 9, 1)).getUTCDay()
  assert.equal(days.length, 42)
  assert.equal(days[0].inMonth, false)
  assert.equal(days.findIndex((day) => day.iso === '2026-10-01'), firstWeekday)
  assert.equal(days.filter((day) => day.inMonth).length, 31)
  assert.deepEqual([...THAI_WEEKDAYS], ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'])
  assert.equal(calendarMonthLabel(2026, 10), 'ตุลาคม 2026')
  const { DatePickerCalendar } = createComponentLoader()('components/ui/date-picker-calendar.tsx')
  const html = renderToStaticMarkup(React.createElement(DatePickerCalendar, { value: '2026-10-08', today: '2026-10-08', clearable: false, onSelect() {} }))
  assert.match(html, /ตุลาคม 2026/)
  assert.match(html, /อา/)
  assert.match(html, /พฤ/)
  assert.equal((html.match(/role="columnheader"/g) ?? []).length, 7)
  assert.ok(html.indexOf('role="grid"') < html.indexOf('role="columnheader"'))
  assert.doesNotMatch(html, /Su |Mo |Tu |October/)
})

test('TC-40-07 selected, today, and outside-month days use product tokens', () => {
  const { DatePickerCalendar } = createComponentLoader()('components/ui/date-picker-calendar.tsx')
  const html = renderToStaticMarkup(React.createElement(DatePickerCalendar, {
    value: '2026-10-01',
    today: '2026-10-08',
    clearable: false,
    onSelect() {},
  }))
  assert.match(html, /data-date="2026-10-01"[^>]*data-selected="true"[^>]*class="[^"]*bg-primary[^"]*text-primary-foreground/)
  assert.match(html, /data-date="2026-10-08"[^>]*data-today="true"[^>]*class="[^"]*border-ring/)
  assert.match(html, /data-outside="true"[^>]*class="[^"]*text-muted-foreground/)
  assert.match(html, /bg-popover/)
  assert.doesNotMatch(html, /#[0-9a-fA-F]{3,8}|rgb\(|rgba\(/)
})

test('TC-40-08 month navigation crosses year boundaries and clamps leap-day overflow', () => {
  const nextYear = adjacentMonth(2026, 12, 1)
  const previousYear = adjacentMonth(2026, 1, -1)
  assert.equal(nextYear.year, 2027)
  assert.equal(nextYear.month, 1)
  assert.equal(previousYear.year, 2025)
  assert.equal(previousYear.month, 12)
  assert.equal(addCalendarMonths('2024-01-31', 1), '2024-02-29')
  assert.equal(addCalendarMonths('2025-01-31', 1), '2025-02-28')
  assert.equal(addCalendarMonths('2024-02-29', 12), '2025-02-28')
  assert.equal(calendarMonthDays(2024, 2).some((day) => day.iso === '2024-02-29' && day.inMonth), true)
  assert.equal(shiftCalendarFocus('2026-10-08', 'PageDown'), addCalendarMonths('2026-10-08', 1))
  assert.equal(shiftCalendarFocus('2026-10-08', 'PageUp'), addCalendarMonths('2026-10-08', -1))
})

test('TC-40-09 controlled mode emits YYYY-MM-DD and keeps the parent value until it changes', () => {
  const changes = []
  const props = { id: 'analysis-start-date', required: true, value: '2026-10-01', onValueChange: (value) => changes.push(value) }
  const ui = pickerHarness(props)
  let elements = ui.render()
  assert.equal(textContent(ui.button(elements)), '01/10/2026')
  assert.equal(ui.field(elements).props.value, '2026-10-01')
  ui.popover(elements).props.onOpenChange(true)
  elements = ui.render()
  ui.popup(elements).props.onSelect('2026-10-09')
  elements = ui.render()
  assert.deepEqual(changes, ['2026-10-09'])
  assert.equal(textContent(ui.button(elements)), '01/10/2026')
  elements = ui.render({ ...props, value: '2026-10-09' })
  assert.equal(textContent(ui.button(elements)), '09/10/2026')
  assert.equal(ui.field(elements).props.value, '2026-10-09')
})

test('TC-40-10 uncontrolled mode submits the default YYYY-MM-DD value and updates it after a selection', () => {
  const ui = pickerHarness({ id: 'dashboard-start-date', name: 'startDate', required: true, defaultValue: '2026-10-08' })
  let elements = ui.render()
  assert.equal(ui.field(elements).props.name, 'startDate')
  assert.equal(ui.field(elements).props.value, '2026-10-08')
  assert.equal(textContent(ui.button(elements)), '08/10/2026')
  ui.popover(elements).props.onOpenChange(true)
  elements = ui.render()
  ui.popup(elements).props.onSelect('2026-10-15')
  elements = ui.render()
  assert.equal(ui.field(elements).props.value, '2026-10-15')
  assert.equal(textContent(ui.button(elements)), '15/10/2026')
  const { DatePicker } = createComponentLoader()('components/ui/date-picker.tsx')
  const html = renderToStaticMarkup(React.createElement('form', { action: '/', method: 'get' },
    React.createElement(DatePicker, { id: 'dashboard-start-date', name: 'startDate', required: true, defaultValue: '2026-10-08', className: 'h-9' })))
  assert.match(html, /id="dashboard-start-date"/)
  assert.match(html, /name="startDate"/)
  assert.match(html, /value="2026-10-08"/)
  assert.match(html, /08\/10\/2026/)
  assert.doesNotMatch(html, /type="date"/)
})

test('TC-40-11 required fields keep constraint validation and have no clear action', () => {
  const ui = pickerHarness({ id: 'project-start', required: true, value: '' })
  let elements = ui.render()
  const buttonIndex = elements.findIndex((element) => element.type === 'button')
  const fieldIndex = elements.findIndex((element) => element.type === 'input')
  assert.ok(buttonIndex >= 0 && buttonIndex < fieldIndex)
  assert.equal(ui.field(elements).props.required, true)
  assert.equal(ui.field(elements).props.readOnly, undefined)
  assert.equal(ui.field(elements).props.tabIndex, -1)
  assert.equal(ui.button(elements).props['data-invalid'], undefined)
  ui.popover(elements).props.onOpenChange(true)
  elements = ui.render()
  assert.equal(ui.popup(elements).props.clearable, false)
  const { DatePickerCalendar } = createComponentLoader()('components/ui/date-picker-calendar.tsx')
  const html = renderToStaticMarkup(React.createElement(DatePickerCalendar, { value: '2026-10-08', today: '2026-10-08', clearable: false, onSelect() {} }))
  assert.doesNotMatch(html, />ล้าง</)
})

test('TC-40-12 optional fields can be cleared back to an empty string', () => {
  const changes = []
  const ui = pickerHarness({ id: 'dueDate', clearable: true, value: '2026-10-08', onValueChange: (value) => changes.push(value) })
  let elements = ui.render()
  ui.popover(elements).props.onOpenChange(true)
  elements = ui.render()
  assert.equal(ui.popup(elements).props.clearable, true)
  ui.popup(elements).props.onSelect('')
  assert.deepEqual(changes, [''])
  const selected = []
  const states = []
  let cursor = 0
  const load = createComponentLoader({
    react: {
      ...React,
      useState(initial) {
        const index = cursor
        cursor += 1
        if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
        return [states[index], (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next }]
      },
      useId: () => 'picker',
      useRef(value) { return { current: value } },
      useEffect() {},
    },
  })
  const calendar = load('components/ui/date-picker-calendar.tsx').DatePickerCalendar
  cursor = 0
  const clear = descendants(calendar({ value: '2026-10-08', today: '2026-10-08', clearable: true, onSelect: (value) => selected.push(value) }))
    .find((element) => element.type === 'button' && textContent(element) === 'ล้าง')
  clear.props.onClick()
  assert.deepEqual(selected, [''])
})

test('TC-40-13 a disabled trigger does not open and does not emit a value', () => {
  const changes = []
  const ui = pickerHarness({ id: 'startDate', disabled: true, value: '2026-10-08', onValueChange: (value) => changes.push(value) })
  const elements = ui.render()
  assert.equal(ui.button(elements).props.disabled, true)
  assert.equal(ui.field(elements).props.disabled, true)
  ui.popover(elements).props.onOpenChange(true)
  ui.button(elements).props.onKeyDown({ key: 'ArrowDown', preventDefault() {} })
  assert.equal(ui.popup(ui.render()), undefined)
  assert.deepEqual(changes, [])
})

test('TC-40-14 trigger and calendar navigation expose Thai names, popup semantics, and keyboard movement', () => {
  const ui = pickerHarness({ id: 'dashboard-end-date', name: 'endDate', required: true, defaultValue: '2026-10-08' })
  const elements = ui.render()
  const button = ui.button(elements)
  assert.equal(button.props.id, 'dashboard-end-date')
  assert.equal(button.props.type, 'button')
  assert.equal(button.props['aria-haspopup'], 'dialog')
  assert.equal(button.props['aria-expanded'], false)
  assert.match(button.props.className, /h-10/)
  const withHeight = pickerHarness({ id: 'dashboard-start-date', className: 'h-9', defaultValue: '2026-10-08' })
  assert.match(withHeight.button(withHeight.render()).props.className, /(?<![\w-])h-9(?![\w-])/)
  assert.doesNotMatch(withHeight.button(withHeight.render()).props.className, /(?<![\w-])h-10(?![\w-])/)
  const states = []
  let cursor = 0
  const load = createComponentLoader({
    react: {
      ...React,
      useState(initial) {
        const index = cursor
        cursor += 1
        if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
        return [states[index], (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next }]
      },
      useId: () => 'picker',
      useRef(value) { return { current: value } },
      useEffect() {},
    },
  })
  const calendar = load('components/ui/date-picker-calendar.tsx').DatePickerCalendar
  const props = { value: '2026-10-08', today: '2026-10-08', clearable: false, onSelect() {} }
  const render = () => {
    cursor = 0
    return descendants(calendar(props))
  }
  let nodes = render()
  assert.ok(nodes.some((element) => element.props?.['aria-label'] === 'เดือนก่อนหน้า'))
  assert.ok(nodes.some((element) => element.props?.['aria-label'] === 'เดือนถัดไป'))
  const grid = nodes.find((element) => element.props?.role === 'grid')
  grid.props.onKeyDown({ key: 'ArrowRight', preventDefault() {} })
  nodes = render()
  const nextDay = nodes.find((element) => element.props?.['data-date'] === '2026-10-09')
  assert.equal(nextDay.props.tabIndex, 0)
  assert.equal(shiftCalendarFocus('2026-10-08', 'ArrowUp'), '2026-10-01')
  assert.equal(shiftCalendarFocus('2026-10-08', 'Home'), '2026-10-04')
  assert.equal(shiftCalendarFocus('2026-10-08', 'End'), '2026-10-10')
  const content = elements.find((element) => element.props?.['aria-label'] === 'เลือกวันที่')
  const escape = { stopped: false, prevented: false }
  content.props.onEscapeKeyDown({ stopPropagation() { escape.stopped = true }, preventDefault() { escape.prevented = true } })
  content.props.onCloseAutoFocus({ stopPropagation() { escape.stopped = true }, preventDefault() { escape.prevented = true } })
  assert.equal(escape.stopped, true)
  assert.equal(escape.prevented, false)
  assert.doesNotMatch(source('components/ui/date-picker.tsx'), /showPicker\(/)
  assert.doesNotMatch(source('components/ui/date-picker-calendar.tsx'), /showPicker\(/)
})

test('TC-40-15 server markup submits the GET field without importing the calendar grid up front', () => {
  const popup = source('components/ui/date-picker.tsx')
  assert.match(popup, /import\('@\/components\/ui\/date-picker-calendar'\)/)
  assert.doesNotMatch(popup, /from '@\/components\/ui\/date-picker-calendar'/)
  const { DatePicker } = createComponentLoader()('components/ui/date-picker.tsx')
  const html = renderToStaticMarkup(React.createElement('form', { action: '/', method: 'get' },
    React.createElement(DatePicker, { id: 'dashboard-start-date', name: 'startDate', required: true, defaultValue: '2026-10-01', className: 'h-9' })))
  assert.match(html, /<form[^>]*method="get"/)
  assert.match(html, /name="startDate" value="2026-10-01"/)
  assert.match(html, /required/)
  assert.match(html, /วว\/ดด\/ปปปป|01\/10\/2026/)
  assert.doesNotMatch(html, /type="date"|data-slot="date-picker-calendar"/)
})

test('TC-40-16 trigger and popup classes use shared surface tokens and no hard-coded colors', () => {
  const ui = pickerHarness({ id: 'project-due', value: '2026-10-31' })
  const className = ui.button(ui.render()).props.className
  assert.match(className, /surface-inset/)
  assert.match(className, /bg-input/)
  assert.match(className, /border-border-strong/)
  assert.match(className, /focus-visible:ring-ring/)
  assert.doesNotMatch(className, /#[0-9a-fA-F]{3,8}|rgb\(|rgba\(/)
  const popup = source('components/ui/date-picker.tsx')
  assert.match(popup, /z-\[60\]/)
  assert.match(popup, /max-w-\[calc\(100vw-2rem\)\]/)
  assert.match(source('components/ui/popover.tsx'), /bg-popover text-popover-foreground/)
})

test('TC-40-17 production UI no longer renders a native date input', () => {
  const files = [...tsxFiles(join(root, 'app')), ...tsxFiles(join(root, 'components'))]
  const offenders = files.filter((file) => /type=["']date["']/.test(readFileSync(file, 'utf8')))
  assert.deepEqual(offenders, [])
})

test('TC-40-18 Dashboard date filters stay required GET fields aligned with the filter row', () => {
  const page = source('app/page.tsx')
  const start = pickerBlock('app/page.tsx', 'dashboard-start-date')
  const end = pickerBlock('app/page.tsx', 'dashboard-end-date')
  assert.match(start, /name="startDate"/)
  assert.match(start, /required/)
  assert.match(start, /defaultValue=\{data\.meta\.period\.startDate\}/)
  assert.match(start, /className="h-9"/)
  assert.match(end, /name="endDate"/)
  assert.match(end, /required/)
  assert.match(end, /defaultValue=\{data\.meta\.period\.endDate\}/)
  assert.match(page, /method="get"/)
})

test('TC-40-19 Analysis keeps required draft dates and the original reversed-range message', () => {
  const page = source('app/analysis/page.tsx')
  for (const id of ['analysis-start-date', 'analysis-end-date']) {
    const field = pickerBlock('app/analysis/page.tsx', id)
    assert.match(field, /required/)
    assert.doesNotMatch(field, /clearable/)
  }
  assert.match(page, /วันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด/)
  assert.match(page, /onValueChange=\{\(startDate\) => setDraftFilters/)
  assert.match(page, /onValueChange=\{\(endDate\) => setDraftFilters/)
})

test('TC-40-20 Project forms keep both dates required and preserve the existing disabled behavior', () => {
  assert.match(source('app/projects/page.tsx'), /from '@\/components\/ui\/lazy-date-picker'/)
  assert.doesNotMatch(source('app/projects/page.tsx'), /from '@\/components\/ui\/date-picker'/)
  for (const id of ['project-start', 'project-due']) {
    const field = pickerBlock('app/projects/page.tsx', id)
    assert.match(field, /required/)
    assert.doesNotMatch(field, /disabled/)
  }
  for (const id of ['startDate', 'dueDate']) {
    const field = pickerBlock('components/page/projects/project-create-modal.tsx', id)
    assert.match(field, /required/)
    assert.match(field, /disabled=\{isLoading\}/)
  }
  for (const id of ['edit-startDate', 'edit-dueDate']) {
    const field = pickerBlock('components/page/projects/project-edit-modal.tsx', id)
    assert.match(field, /required/)
    assert.doesNotMatch(field, /disabled/)
  }
})

test('TC-40-21 Work Item work date and due date stay optional, clearable, and locked while saving', () => {
  assert.match(source('components/page/work-items/work-item-dialog.tsx'), /from '@\/components\/ui\/lazy-date-picker'/)
  for (const id of ['workDate', 'dueDate']) {
    const field = pickerBlock('components/page/work-items/work-item-dialog.tsx', id)
    assert.match(field, /clearable/)
    assert.match(field, /disabled=\{isLoading\}/)
    assert.doesNotMatch(field, /required/)
  }
})

test('TC-40-22 Daily Work date stays required, not clearable, and locked while saving', () => {
  const field = pickerBlock('components/page/daily-work/work-log-dialog.tsx', 'date')
  assert.match(field, /required/)
  assert.match(field, /disabled=\{isLoading\}/)
  assert.doesNotMatch(field, /clearable/)
})

test('TC-40-23 Daily Work board calendar and Work Items year/month filters stay unchanged', () => {
  const calendar = source('components/ui/calendar.tsx')
  assert.match(calendar, /DateCalendar/)
  assert.doesNotMatch(calendar, /components\/ui\/date-picker|DatePicker/)
  const dailyWork = source('app/daily-work/page.tsx')
  const deferredCalendar = source('components/page/daily-work/deferred-widgets.tsx')
  assert.match(deferredCalendar, /import\('@\/components\/ui\/calendar'\)/)
  assert.match(dailyWork, /DeferredCalendar as Calendar/)
  assert.match(dailyWork, /<Calendar/)
  assert.doesNotMatch(dailyWork, /DatePicker/)
  const workItems = source('app/work-items/page.tsx')
  assert.match(workItems, /<Select value=\{yearFilter\}/)
  assert.match(workItems, /<Select value=\{monthFilter\}/)
  assert.doesNotMatch(workItems, /DatePicker/)
})

function interactiveCalendar(props) {
  const states = []
  const refs = []
  const effects = []
  let cursor = 0
  let refCursor = 0
  const focusedIds = []
  const load = createComponentLoader({
    react: {
      ...React,
      useState(initial) {
        const index = cursor
        cursor += 1
        if (!(index in states)) states[index] = typeof initial === 'function' ? initial() : initial
        return [states[index], (next) => { states[index] = typeof next === 'function' ? next(states[index]) : next }]
      },
      useRef(value) {
        const index = refCursor
        refCursor += 1
        if (!(index in refs)) refs[index] = { current: value }
        return refs[index]
      },
      useId: () => 'cal',
      useEffect(effect) { effects.push(effect) },
    },
  }, {
    document: { getElementById(id) { return { id, focus() { focusedIds.push(id) } } } },
  })
  const calendar = load('components/ui/date-picker-calendar.tsx').DatePickerCalendar
  const render = () => {
    cursor = 0
    refCursor = 0
    effects.length = 0
    return descendants(calendar(props))
  }
  const flush = () => { for (const effect of effects.splice(0)) effect() }
  return { render, flush, focusedIds }
}

function monthLabel(nodes) {
  return textContent(nodes.find((element) => element.props?.['aria-live'] === 'polite'))
}

test('TC-40-25 month buttons keep focus and a second activation does not select the focused day', () => {
  const selected = []
  const ui = interactiveCalendar({ value: '2026-10-08', today: '2026-10-08', clearable: false, onSelect: (value) => selected.push(value) })
  let nodes = ui.render()
  ui.flush()
  assert.deepEqual(ui.focusedIds, ['cal-2026-10-08'])
  ui.focusedIds.length = 0
  nodes.find((element) => element.props?.['aria-label'] === 'เดือนถัดไป').props.onClick()
  nodes = ui.render()
  ui.flush()
  assert.deepEqual(ui.focusedIds, [])
  assert.deepEqual(selected, [])
  assert.equal(monthLabel(nodes), 'พฤศจิกายน 2026')
  assert.equal(nodes.find((element) => element.props?.['data-date'] === '2026-11-08').props.tabIndex, 0)
  nodes.find((element) => element.props?.['aria-label'] === 'เดือนถัดไป').props.onClick()
  nodes = ui.render()
  ui.flush()
  assert.deepEqual(ui.focusedIds, [])
  assert.deepEqual(selected, [])
  assert.equal(monthLabel(nodes), 'ธันวาคม 2026')
  const keys = interactiveCalendar({ value: '2026-10-08', today: '2026-10-08', clearable: false, onSelect() {} })
  let gridNodes = keys.render()
  keys.flush()
  keys.focusedIds.length = 0
  gridNodes.find((element) => element.props?.role === 'grid').props.onKeyDown({ key: 'ArrowRight', preventDefault() {} })
  gridNodes = keys.render()
  keys.flush()
  assert.deepEqual(keys.focusedIds, ['cal-2026-10-09'])
  assert.equal(gridNodes.find((element) => element.props?.['data-date'] === '2026-10-09').props.tabIndex, 0)
})

test('TC-40-26 required validation announces a Thai message and focuses only the first invalid field', () => {
  const start = pickerHarness({ id: 'project-start', required: true, value: '' })
  const due = pickerHarness({ id: 'project-due', required: true, value: '' })
  const startNodes = start.render()
  const dueNodes = due.render()
  const focuses = []
  start.button(startNodes).props.ref.current = { focus() { focuses.push('project-start') } }
  due.button(dueNodes).props.ref.current = { focus() { focuses.push('project-due') } }
  const startField = {}
  const dueField = {}
  const form = { querySelector: () => startField }
  startField.form = form
  dueField.form = form
  let prevented = 0
  start.field(startNodes).props.onInvalid({ preventDefault() { prevented += 1 }, currentTarget: startField })
  due.field(dueNodes).props.onInvalid({ preventDefault() { prevented += 1 }, currentTarget: dueField })
  assert.equal(prevented, 2)
  assert.deepEqual(focuses, ['project-start'])
  const startAfter = start.render()
  const dueAfter = due.render()
  assert.equal(start.button(startAfter).props['data-invalid'], 'true')
  assert.equal(start.button(startAfter).props['aria-invalid'], undefined)
  assert.equal(start.button(startAfter).props['aria-describedby'], 'project-start-error')
  assert.equal(textContent(startAfter.find((element) => element.props?.role === 'alert')), 'กรุณาระบุวันที่')
  assert.equal(due.button(dueAfter).props['data-invalid'], 'true')
  assert.equal(textContent(dueAfter.find((element) => element.props?.role === 'alert')), 'กรุณาระบุวันที่')

  const blocked = pickerHarness({ id: 'project-start', required: true, value: '', 'aria-describedby': 'project-hint' })
  const blockedNodes = blocked.render()
  const blockedFocus = []
  blocked.button(blockedNodes).props.ref.current = { focus() { blockedFocus.push('project-start') } }
  const nameField = { id: 'project-name' }
  blocked.field(blockedNodes).props.onInvalid({ preventDefault() {}, currentTarget: { form: { querySelector: () => nameField } } })
  assert.deepEqual(blockedFocus, [])
  const blockedAfter = blocked.render()
  assert.equal(blocked.button(blockedAfter).props['data-invalid'], 'true')
  assert.equal(blocked.button(blockedAfter).props['aria-describedby'], 'project-hint project-start-error')

  const reset = pickerHarness({ id: 'edit-startDate', required: true, value: '' })
  let resetNodes = reset.render()
  const resetField = {}
  resetField.form = { querySelector: () => resetField }
  reset.field(resetNodes).props.onInvalid({ preventDefault() {}, currentTarget: resetField })
  resetNodes = reset.render({ id: 'edit-startDate', required: true, value: '2026-10-08' })
  assert.equal(reset.button(resetNodes).props['data-invalid'], undefined)
  assert.equal(resetNodes.some((element) => element.props?.role === 'alert'), false)
  resetNodes = reset.render({ id: 'edit-startDate', required: true, value: '' })
  assert.equal(reset.button(resetNodes).props['data-invalid'], undefined)
  assert.equal(resetNodes.some((element) => element.props?.role === 'alert'), false)
  assert.doesNotMatch(source('components/ui/date-picker.tsx'), /requestAnimationFrame/)
})

test('TC-40-27 a failed date picker chunk stays inside the field and can be retried', () => {
  const load = createComponentLoader()
  const { DatePicker } = load('components/ui/lazy-date-picker.tsx')
  const { RetryableLazy } = load('components/ui/retryable-lazy.tsx')
  const tree = DatePicker({ id: 'project-start', name: 'startDate', required: true, className: 'h-9', value: '' })
  assert.equal(tree.type, RetryableLazy)
  assert.equal(typeof tree.props.loader, 'function')
  const shell = descendants(tree.props.loading.type(tree.props.loading.props))
  const shellButton = shell.find((element) => element.type === 'button')
  const shellField = shell.find((element) => element.type === 'input')
  assert.equal(shellButton.props.id, 'project-start')
  assert.equal(shellButton.props.disabled, true)
  assert.match(shellButton.props.className, /(?<![\w-])h-9(?![\w-])/)
  assert.doesNotMatch(shellButton.props.className, /(?<![\w-])h-10(?![\w-])/)
  assert.equal(shellField.props.required, true)
  assert.equal(shellField.props.disabled, false)
  assert.equal(shellField.props.name, 'startDate')
  assert.equal(shellField.props.value, '')
  let retried = false
  const error = tree.props.error(() => { retried = true })
  const errorHtml = renderToStaticMarkup(error)
  assert.match(errorHtml, /role="alert"/)
  assert.match(errorHtml, /id="project-start"/)
  assert.match(errorHtml, /required/)
  assert.match(errorHtml, /โหลดตัวเลือกวันที่ไม่สำเร็จ ลองอีกครั้ง/)
  descendants(error).find((element) => element.type === 'button' && textContent(element).includes('ลองอีกครั้ง')).props.onClick()
  assert.equal(retried, true)
  const disabledTree = DatePicker({ id: 'workDate', disabled: true, value: '2026-10-08' })
  const disabledShell = descendants(disabledTree.props.loading.type(disabledTree.props.loading.props))
  assert.equal(disabledShell.find((element) => element.type === 'input').props.disabled, true)
  assert.equal(textContent(disabledShell.find((element) => element.type === 'button')), '08/10/2026')
  assert.doesNotThrow(() => DatePicker({ id: 'project-due', required: true, value: '' }))
  assert.doesNotMatch(source('components/ui/lazy-date-picker.tsx'), /next\/dynamic/)
  assert.doesNotMatch(source('scripts/frontend-preview.mjs'), /ignoreWarnings/)
})

test('TC-40-24 date picker tests stay wired to a reusable runner command', () => {
  const packageJson = JSON.parse(source('package.json'))
  assert.equal(packageJson.scripts['test:date-picker'], 'node tests/run.mjs date-picker')
  assert.match(source('tests/run.mjs'), /"date-picker": \{ files: \[join\(testRoot, "frontend-ui", "date-picker\.test\.mjs"\)\] \}/)
})
