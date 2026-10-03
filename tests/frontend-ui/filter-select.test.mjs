import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createComponentLoader, descendants, React, renderToStaticMarkup, root } from './component-runtime.mjs'

function runtime() {
  let state
  const load = createComponentLoader({ react: { ...React, useState(initial) {
    state ??= initial
    return [state, (next) => { state = next }]
  } } })
  const { FilterSelect } = load('components/ui/filter-select.tsx')
  const select = load('components/ui/select.tsx')
  const render = (props) => descendants(FilterSelect(props))
  return {
    render,
    rootSelect: (elements) => elements.find((element) => element.type === select.Select),
    trigger: (elements) => elements.find((element) => element.type === select.SelectTrigger),
    value: (elements) => elements.find((element) => element.type === select.SelectValue),
    items: (elements) => elements.filter((element) => element.type === select.SelectItem),
    hidden: (elements) => elements.find((element) => element.type === 'input'),
  }
}

const options = [{ value: '', label: 'ทุก Project' }, { value: 'project-1', label: 'Project Alpha' }, { value: 'option:', label: 'Project Prefix' }]

test('SELECT-01 Dashboard custom options preserve empty GET fields and serialize selected IDs without internal values', () => {
  const ui = runtime()
  const props = { id: 'dashboard-project', name: 'projectId', options }
  let elements = ui.render(props)
  assert.equal(ui.trigger(elements).props.id, 'dashboard-project')
  assert.equal(ui.value(elements).props.children, 'ทุก Project')
  assert.equal(ui.hidden(elements).props.name, 'projectId')
  assert.equal(ui.hidden(elements).props.value, '')
  assert.equal(ui.rootSelect(elements).props.name, undefined)
  const encoded = ui.items(elements).map((item) => item.props.value)
  assert.ok(encoded.every((value) => value.length > 0))
  assert.equal(new Set(encoded).size, options.length)

  ui.rootSelect(elements).props.onValueChange(encoded[1])
  elements = ui.render(props)
  assert.equal(ui.hidden(elements).props.value, 'project-1')
  assert.equal(ui.value(elements).props.children, 'Project Alpha')
  ui.rootSelect(elements).props.onValueChange(encoded[0])
  assert.equal(ui.hidden(ui.render(props)).props.value, '')
})

test('SELECT-02 controlled Board options emit original values and respect parent resets and loading locks', () => {
  const ui = runtime()
  const changes = []
  const props = { id: 'board-project-filter', value: 'all', options: [{ value: 'all', label: 'ทุก Project' }, ...options.slice(1)], onValueChange: (value) => changes.push(value) }
  let elements = ui.render(props)
  ui.rootSelect(elements).props.onValueChange(ui.items(elements)[1].props.value)
  assert.deepEqual(changes, ['project-1'])
  assert.equal(ui.value(ui.render(props)).props.children, 'ทุก Project')
  assert.equal(ui.value(ui.render({ ...props, value: 'project-1' })).props.children, 'Project Alpha')
  elements = ui.render({ ...props, value: 'all', disabled: true })
  assert.equal(ui.value(elements).props.children, 'ทุก Project')
  assert.equal(ui.rootSelect(elements).props.disabled, true)
  assert.equal(ui.hidden(elements), undefined)
})

test('SELECT-03 server-rendered filters have labeled custom triggers and original form defaults before hydration', () => {
  const { FilterSelect } = createComponentLoader()('components/ui/filter-select.tsx')
  const html = renderToStaticMarkup(React.createElement('form', { action: '/', method: 'get' },
    React.createElement('label', { htmlFor: 'dashboard-project' }, 'Project'),
    React.createElement(FilterSelect, { id: 'dashboard-project', name: 'projectId', defaultValue: 'project-1', options })))
  assert.match(html, /role="combobox"/)
  assert.match(html, /id="dashboard-project"/)
  assert.match(html, /type="hidden" name="projectId" value="project-1"/)
  assert.match(html, /Project Alpha/)
  assert.doesNotMatch(html, /<select[^>]*name="projectId"/)
})

test('SELECT-04 Dashboard and Board use the shared themed filter instead of native option popups', () => {
  for (const file of ['app/page.tsx', 'app/board/page.tsx']) {
    const source = readFileSync(`${root}/${file}`, 'utf8')
    assert.match(source, /FilterSelect/)
    assert.doesNotMatch(source, /<select\b|<option\b/)
  }
})
