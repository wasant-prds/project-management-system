import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { moduleLoader } from '../support/module-loader.mjs'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const path = '../../app/work-items/page.tsx'
const source = ts.createSourceFile(path, readFileSync(new URL(path, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const querySource = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'workItemQuery').getText(source)
const pageSource = source.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === 'WorkItemsPage')
const load = moduleLoader()
const presentation = load('components/page/work-items/work-item-presentation.ts')
const exports = load('components/page/work-items/work-item-export.ts')
const OWNER = '11111111-1111-4111-8111-111111111111'
const filters = {
  yearFilter: 'all', monthFilter: 'all', projectFilter: 'all', companyFilter: 'all', dashboardDateRange: null,
  debouncedSearchQuery: '', statusFilter: 'all', priorityFilter: 'all', roleFilter: 'all',
  dashboardKindFilter: 'all', dashboardOpenOnly: false, dashboardOverdueOnly: false, sortMode: 'recent-activity',
}

// Execute the production request callbacks, replacing only network and React state boundaries.
function callback(name, globals) {
  const declaration = pageSource.body.statements
    .filter(ts.isVariableStatement)
    .flatMap((node) => [...node.declarationList.declarations])
    .find((node) => node.name.getText(source) === name)
  assert.ok(declaration, `Missing ${name}`)
  const output = ts.transpileModule(`${querySource}\nconst ${declaration.getText(source)}\nmodule.exports = ${name}`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loaded = { exports: {} }
  vm.runInNewContext(output, {
    module: loaded, exports: loaded.exports, URLSearchParams, AbortController, Set, console,
    useCallback: (value) => value, ...filters, ...globals,
  })
  return loaded.exports
}

function ui(fetch) {
  const state = { workItems: [], nextCursor: null, isLoadingMore: false, workItemSummary: null }
  const globals = {
    fetch,
    ...presentation,
    loadGenerationRef: { current: 0 },
    loadControllerRef: { current: null },
    yearOptionsLoadedRef: { current: false },
    toast: () => assert.fail('Unexpected error toast'),
  }
  for (const key of ['workItems', 'nextCursor', 'isLoadingMore', 'workItemSummary', 'loadingFilterKey', 'loadedFilterKey', 'loadError', 'availableYears']) {
    globals[`set${key[0].toUpperCase()}${key.slice(1)}`] = (next) => {
      state[key] = typeof next === 'function' ? next(state[key]) : next
    }
  }
  return { state, run: (name, overrides = {}) => callback(name, { ...globals, ...state, ...overrides })() }
}

test('Work Items requests two whole projects first, then five more with the same filters and ordering', async () => {
  const requests = []
  const responses = [
    { workItems: [{ id: 'first' }], summary: { total: 318 }, page: { nextCursor: 'project-page-2' } },
    { workItems: [{ id: 'second' }, { id: 'third' }], page: { nextCursor: null } },
  ]
  const screen = ui(async (url) => {
    requests.push(new URL(url, 'http://test').searchParams)
    return { ok: true, json: async () => responses.shift() }
  })
  const activeFilters = { statusFilter: 'todo', roleFilter: 'Developer', sortMode: 'due-asc' }
  await screen.run('load', activeFilters)
  assert.equal(requests[0].get('groupBy'), 'project')
  assert.equal(requests[0].get('limit'), '2')
  assert.equal(requests[0].has('cursor'), false)
  await screen.run('loadMore', activeFilters)
  assert.equal(requests[1].get('groupBy'), 'project')
  assert.equal(requests[1].get('limit'), '5')
  assert.equal(requests[1].get('cursor'), 'project-page-2')
  for (const request of requests) {
    assert.equal(request.get('status'), 'todo')
    assert.equal(request.get('role'), 'Developer')
    assert.equal(request.get('sort'), 'due-asc')
  }
  assert.deepEqual([...screen.state.workItems].map((row) => row.id), ['first', 'second', 'third'])
  assert.equal(screen.state.workItemSummary.total, 318)
  assert.equal(screen.state.nextCursor, null)
  await screen.run('loadMore', activeFilters)
  assert.equal(requests.length, 2)
})

test('changing ordering starts a new two-project page and ignores an old load-more response', async () => {
  let finishOldPage
  let calls = 0
  const requests = []
  const screen = ui(async (url) => {
    requests.push(new URL(url, 'http://test').searchParams)
    if (++calls === 2) return new Promise((resolve) => { finishOldPage = resolve })
    return { ok: true, json: async () => ({ workItems: [{ id: calls === 1 ? 'old' : 'new' }], page: { nextCursor: 'more' } }) }
  })
  await screen.run('load')
  const pending = screen.run('loadMore')
  await screen.run('load', { sortMode: 'project-title-desc' })
  finishOldPage({ ok: true, json: async () => ({ workItems: [{ id: 'stale' }], page: { nextCursor: null } }) })
  await pending
  assert.equal(requests[2].get('limit'), '2')
  assert.equal(requests[2].get('sort'), 'project-title-desc')
  assert.equal(requests[2].has('cursor'), false)
  assert.deepEqual([...screen.state.workItems].map((row) => row.id), ['new'])
  assert.equal(screen.state.nextCursor, 'more')
})

test('export still follows item pages through every cursor instead of exporting only the loaded projects', async () => {
  const requests = []
  const item = (id) => ({ id, title: id, status: 'todo', kind: 'Task', updatedAt: '2026-11-01T00:00:00+07:00', project: { id: OWNER, name: 'Project' } })
  const result = await callback('fetchAllFilteredItems', {
    ...exports,
    kindTab: 'all',
    fetchWorkItemPage: async (query) => {
      const params = new URLSearchParams(query)
      requests.push(params)
      return params.has('cursor')
        ? { workItems: [item('last')], page: { nextCursor: null } }
        : { workItems: [item('first')], page: { nextCursor: 'item-page-2' } }
    },
  })()
  assert.equal(result.length, 2)
  assert.equal(requests.length, 2)
  for (const request of requests) {
    assert.equal(request.has('groupBy'), false)
    assert.equal(request.get('limit'), '200')
  }
  assert.equal(requests[1].get('cursor'), 'item-page-2')
})

test('project ordering uses a deterministic public UUID tie-breaker and puts undated or finished projects last for due sorting', () => {
  const { compareWorkItemProjects } = load('lib/work-item-sort.ts')
  const a = { publicId: OWNER, name: 'Project 2', recentActivity: 1, earliestDue: 20261101, latestDue: 20261130 }
  const b = { ...a, publicId: '22222222-2222-4222-8222-222222222222' }
  for (const mode of exports.WORK_ITEM_SORT_MODES) assert.ok(compareWorkItemProjects(a, b, mode) < 0)
  const undated = { ...b, earliestDue: null, latestDue: null }
  for (const mode of ['due-asc', 'due-desc']) assert.ok(compareWorkItemProjects(a, undated, mode) < 0)
  const ten = { ...b, name: 'Project 10' }
  assert.ok(compareWorkItemProjects(a, ten, 'project-title-asc') < 0)
  assert.ok(compareWorkItemProjects(a, ten, 'project-title-desc') > 0)
})
