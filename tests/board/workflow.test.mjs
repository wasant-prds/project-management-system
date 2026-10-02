import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')

function loadTs(path, mocks = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loaded = { exports: {} }
  vm.runInNewContext(output, {
    module: loaded,
    exports: loaded.exports,
    require: (name) => {
      if (!(name in mocks)) throw new Error(`Unexpected import: ${name}`)
      return mocks[name]
    },
    URL,
    URLSearchParams,
    Error,
    console,
  }, { filename: path })
  return loaded.exports
}

const workItems = loadTs('../../lib/work-items.ts')
const bangkokDateTime = loadTs('../../lib/bangkok-datetime.ts')
const board = loadTs('../../components/page/board/board-workflow.ts', {
  '@/lib/work-items': workItems,
  '@/lib/bangkok-datetime': bangkokDateTime,
})

function makeWorkItem(overrides = {}) {
  return {
    id: 'work-1',
    title: 'Implement Board workflow',
    description: 'Use the shared Work Item status.',
    kind: 'Task',
    priority: 'medium',
    role: 'Developer',
    status: 'todo',
    types: [],
    workDate: '2026-10-01',
    dueDate: '2026-10-05',
    submittedAt: null,
    createdAt: '2026-10-01T09:00:00.000+07:00',
    updatedAt: '2026-10-01T09:00:00.000+07:00',
    project: {
      id: 'project-1',
      name: 'PMS',
      colorProject: null,
      company: { id: 'company-1', name: 'Company One', displayName: null },
    },
    assignee: { id: 'owner-1', name: 'Owner', avatar: null },
    ...overrides,
  }
}

function response(payload, ok = true) {
  return { ok, json: async () => payload }
}

test('Board columns use every shared status once and keep cancelled separate from completed', () => {
  const first = makeWorkItem({ id: 'done-1', status: 'completed' })
  const duplicate = { ...first, title: 'Duplicate row' }
  const cancelled = makeWorkItem({ id: 'cancelled-1', status: 'cancelled' })
  const groups = board.groupBoardWorkItems([first, duplicate, cancelled])

  assert.deepEqual(Object.keys(groups), [
    'backlog', 'todo', 'in-progress', 'blocked', 'sa-testing', 'pm-testing', 'completed', 'cancelled',
  ])
  assert.equal(groups.completed.length, 1)
  assert.equal(groups.cancelled.length, 1)
  assert.equal(Object.values(groups).flat().length, 2)
})

test('Board date labels keep Bangkok date-only and +07:00 calendar boundaries across machine timezones', () => {
  const initialTimezone = process.env.TZ
  try {
    for (const timezone of ['America/Los_Angeles', 'Asia/Tokyo']) {
      process.env.TZ = timezone
      assert.equal(board.formatBoardCalendarDate('2026-09-30'), '2026-09-30')
      assert.equal(board.formatBoardCalendarDate('2026-09-30T23:59:59.999+07:00'), '2026-09-30')
      assert.equal(board.formatBoardCalendarDate('2026-10-01T00:00:00.000+07:00'), '2026-10-01')
    }
  } finally {
    if (initialTimezone === undefined) delete process.env.TZ
    else process.env.TZ = initialTimezone
  }
  assert.equal(board.formatBoardCalendarDate('2026-10-01T00:00:00.000Z'), '—')
})

test('Board loads every filtered Work Item page with Company, Project, and role filters', async () => {
  const calls = []
  const request = async (url) => {
    calls.push(url)
    const params = new URL(url, 'http://local').searchParams
    assert.equal(params.get('year'), 'all')
    assert.equal(params.get('month'), 'all')
    assert.equal(params.get('companyId'), 'company-1')
    assert.equal(params.get('projectId'), 'project-1')
    assert.equal(params.get('role'), 'infra')
    if (params.has('cursor')) {
      assert.equal(params.get('cursor'), 'next-page')
      return response({ workItems: [makeWorkItem({ id: 'work-2', role: 'infra' })], page: { nextCursor: null } })
    }
    return response({ workItems: [makeWorkItem({ role: 'infra' })], page: { nextCursor: 'next-page' } })
  }

  const result = await board.fetchBoardWorkItems(request, {
    companyId: 'company-1', projectId: 'project-1', role: 'infra',
  })

  assert.equal(calls.length, 2)
  assert.deepEqual(Array.from(result, (item) => item.id), ['work-1', 'work-2'])
})

test('Board role filter can select Work Items without a functional role', async () => {
  let requestUrl = ''
  const request = async (url) => {
    requestUrl = url
    return response({ workItems: [], page: { nextCursor: null } })
  }

  await board.fetchBoardWorkItems(request, { companyId: 'all', projectId: 'all', role: 'none' })

  assert.equal(new URL(requestUrl, 'http://local').searchParams.get('role'), 'none')
  assert.equal(new URL(requestUrl, 'http://local').searchParams.has('companyId'), false)
  assert.equal(new URL(requestUrl, 'http://local').searchParams.has('projectId'), false)
})

test('Board pagination reports API failures and rejects repeated cursors', async () => {
  await assert.rejects(
    board.fetchBoardWorkItems(async () => response({ error: { message: 'Owner access required' } }, false), {
      companyId: 'all', projectId: 'all', role: 'all',
    }),
    /Owner access required/,
  )

  let calls = 0
  await assert.rejects(
    board.fetchBoardWorkItems(async () => {
      calls += 1
      return response({ workItems: [], page: { nextCursor: 'same-cursor' } })
    }, { companyId: 'all', projectId: 'all', role: 'all' }),
    /ตัวชี้หน้าถัดไปไม่ถูกต้อง/,
  )
  assert.equal(calls, 2)
})

test('Board status writes PATCH the existing Work Item route and verify the saved status', async () => {
  let requestUrl = ''
  let requestOptions
  const request = async (url, options) => {
    requestUrl = url
    requestOptions = options
    return response({ workItem: { id: 'work/1', status: 'in-progress' } })
  }

  const savedStatus = await board.patchBoardWorkItemStatus(request, 'work/1', 'in-progress')

  assert.equal(requestUrl, '/api/work-items/work%2F1')
  assert.equal(requestOptions.method, 'PATCH')
  assert.equal(requestOptions.headers['Content-Type'], 'application/json')
  assert.deepEqual(JSON.parse(requestOptions.body), { status: 'in-progress' })
  assert.equal(savedStatus, 'in-progress')
})

test('Board status writes surface validation errors and reject a mismatched response', async () => {
  await assert.rejects(
    board.patchBoardWorkItemStatus(async () => response({ error: { message: 'Invalid status' } }, false), 'work-1', 'blocked'),
    /Invalid status/,
  )
  await assert.rejects(
    board.patchBoardWorkItemStatus(async () => response({ workItem: { id: 'work-1', status: 'completed' } }), 'work-1', 'blocked'),
    /สถานะที่บันทึกไม่ตรงกับ Work Item/,
  )
})

test('Board moves optimistically and keeps the server-confirmed shared status', async () => {
  const original = makeWorkItem()
  const other = makeWorkItem({ id: 'work-2', status: 'backlog' })
  let current = [original, other]
  let finishSave
  const save = new Promise((resolve) => { finishSave = resolve })
  const update = (updater) => { current = updater(current) }
  const transition = board.transitionBoardWorkItemStatus(
    current,
    original.id,
    'blocked',
    () => save,
    update,
  )

  assert.equal(current[0].status, 'blocked')
  finishSave('blocked')
  assert.equal((await transition).ok, true)
  assert.equal(current[0].status, 'blocked')
  assert.equal(current[1].status, 'backlog')
})

test('Board ignores an in-flight read while a status write is pending', async () => {
  const original = makeWorkItem()
  let current = [original]
  const controller = new AbortController()
  let pendingWrites = 0
  let finishSave
  const save = new Promise((resolve) => { finishSave = resolve })
  const update = (updater) => { current = updater(current) }

  pendingWrites += 1
  controller.abort()
  const transition = board.transitionBoardWorkItemStatus(
    current,
    original.id,
    'blocked',
    () => save,
    update,
  )
  const staleRead = [original]
  if (board.canApplyBoardLoad(controller.signal, pendingWrites)) current = staleRead

  assert.equal(board.canApplyBoardLoad(controller.signal, pendingWrites), false)
  assert.equal(current[0].status, 'blocked')
  finishSave('blocked')
  assert.equal((await transition).ok, true)
  pendingWrites -= 1
  assert.equal(current[0].status, 'blocked')
  assert.equal(board.canApplyBoardLoad(new AbortController().signal, pendingWrites), true)
})

test('Board selection follows the current Work Item through an optimistic rollback', async () => {
  const original = makeWorkItem()
  const selectedId = original.id
  let current = [original]
  let rejectSave
  const update = (updater) => { current = updater(current) }
  const transition = board.transitionBoardWorkItemStatus(
    current,
    original.id,
    'completed',
    () => new Promise((_resolve, reject) => { rejectSave = reject }),
    update,
  )

  assert.equal(board.getSelectedBoardWorkItem(current, selectedId)?.status, 'completed')
  rejectSave(new Error('Validation failed'))
  assert.equal((await transition).ok, false)
  assert.equal(board.getSelectedBoardWorkItem(current, selectedId)?.status, 'todo')
})

test('Board restores the previous status after API validation rejects a status save', async () => {
  const original = makeWorkItem()
  const other = makeWorkItem({ id: 'work-2', status: 'backlog' })
  let current = [original, other]
  const update = (updater) => { current = updater(current) }
  const result = await board.transitionBoardWorkItemStatus(
    current,
    original.id,
    'completed',
    () => board.patchBoardWorkItemStatus(
      async () => response({ error: { message: 'Invalid status' } }, false),
      original.id,
      'completed',
    ),
    update,
  )

  assert.equal(result.ok, false)
  assert.equal(result.message, 'Invalid status')
  assert.equal(current[0].status, 'todo')
  assert.equal(current[1].status, 'backlog')
})

test('Board rejects an invalid local status without changing the card or calling the API', async () => {
  const original = makeWorkItem()
  let current = [original]
  let saveCalls = 0
  const result = await board.transitionBoardWorkItemStatus(
    current,
    original.id,
    'archived',
    async () => { saveCalls += 1; return 'archived' },
    (updater) => { current = updater(current) },
  )

  assert.equal(result.ok, false)
  assert.equal(result.message, 'สถานะ Work Item ไม่ถูกต้อง')
  assert.equal(current[0].status, 'todo')
  assert.equal(saveCalls, 0)
})
