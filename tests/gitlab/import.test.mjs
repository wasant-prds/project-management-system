import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const baseUrl = 'https://gitlab.example.test/base'
const config = { baseUrl, token: 'synthetic-private-token' }
const ownerId = 'owner-1'
const fixedNow = new Date('2026-09-30T11:00:00.000Z')

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
    Date,
    Intl,
    URL,
    URLSearchParams,
    Buffer,
    AbortController,
    setTimeout,
    clearTimeout,
    process,
    console: { error() {} },
  }, { filename: path })
  return loaded.exports
}

const bangkok = {
  currentBangkokWallClockDate: (instant = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hourCycle: 'h23',
    }).formatToParts(instant)
    const value = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]))
    const result = new Date(0)
    result.setUTCFullYear(Number(value.year), Number(value.month) - 1, Number(value.day))
    result.setUTCHours(Number(value.hour), Number(value.minute), Number(value.second), Number(value.fractionalSecond))
    return result
  },
}

const workItemRules = {
  WORK_ITEM_TYPES: ['bug', 'data', 'documentation', 'epic', 'feature', 'maintenance', 'opl', 'ops', 'support', 'task'],
  shouldStampSubmittedAt: (status) => status === 'completed' || status === 'sa-testing',
}

const plain = (value) => JSON.parse(JSON.stringify(value))

const { syncGitLabProject, parseGitLabTimestamp, canonicalGitLabBaseUrl, getGitLabConfiguration, validateApprovedLabelMap } = loadTs(
  '../../lib/gitlab-issue-import.ts',
  { '@/lib/bangkok-datetime': bangkok, '@/lib/work-items': workItemRules },
)

function makeMapping(overrides = {}) {
  return {
    id: 'mapping-1',
    canonicalGitLabInstanceUrl: baseUrl,
    gitLabProjectId: '42',
    projectId: 'pms-project-1',
    approvedLabelMap: { bug: 'bug', 'user story': 'feature' },
    firstSyncApprovedAt: new Date('2026-09-30T09:00:00.000Z'),
    updatedAt: new Date('2026-09-30T09:00:00.000Z'),
    ...overrides,
  }
}

function makeIssue(overrides = {}) {
  return {
    id: 701,
    iid: 17,
    project_id: 42,
    title: 'Fix sign in flow',
    description: 'Use the correct redirect.',
    state: 'opened',
    labels: ['bug', 'customer feedback'],
    due_date: '2026-10-03',
    created_at: '2026-09-29T10:00:00Z',
    updated_at: '2026-09-30T11:30:00Z',
    web_url: 'https://gitlab.example.test/base/group/project/-/issues/17',
    ...overrides,
  }
}

function response(body, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(body), { status, headers })
}

function makeDatabase({ mapping = makeMapping(), items = [], references = [] } = {}) {
  const state = {
    mapping,
    workItems: new Map(items.map((item) => [item.id, structuredClone(item)])),
    references: new Map(references.map((reference) => [referenceKey(reference), structuredClone(reference)])),
    nextId: 1,
    transactionOptions: [],
  }
  const prisma = {
    async $transaction(callback, options) {
      state.transactionOptions.push(options)
      const next = structuredClone({ workItems: state.workItems, references: state.references, nextId: state.nextId })
      const tx = {
        gitLabProjectMapping: {
          async findUnique({ where }) {
            return where.id === mapping.id ? {
              canonicalGitLabInstanceUrl: mapping.canonicalGitLabInstanceUrl,
              gitLabProjectId: mapping.gitLabProjectId,
              projectId: mapping.projectId,
              updatedAt: mapping.updatedAt,
            } : null
          },
        },
        externalWorkItemReference: {
          async findUnique({ where }) {
            const identity = Object.values(where)[0]
            return next.references.get(`${identity.provider}|${identity.canonicalGitLabInstanceUrl}|${identity.gitLabProjectId}|${identity.gitLabGlobalIssueId}`) ?? null
          },
          async create({ data }) {
            const reference = { id: `reference-${next.nextId++}`, ...data }
            const key = referenceKey(reference)
            if (next.references.has(key)) throw Object.assign(new Error('unique'), { code: 'P2002' })
            next.references.set(key, reference)
            return reference
          },
          async update({ where, data }) {
            for (const [key, reference] of next.references) {
              if (reference.id === where.id) {
                const updated = { ...reference, ...data }
                next.references.set(key, updated)
                return updated
              }
            }
            throw Object.assign(new Error('missing'), { code: 'P2025' })
          },
        },
        workItem: {
          async create({ data }) {
            const id = `work-item-${next.nextId++}`
            const record = { id, createdAt: bangkok.currentBangkokWallClockDate(fixedNow), updatedAt: bangkok.currentBangkokWallClockDate(fixedNow), ...data }
            next.workItems.set(id, record)
            return { id }
          },
          async findUnique({ where }) { return next.workItems.get(where.id) ?? null },
          async update({ where, data }) {
            const record = next.workItems.get(where.id)
            if (!record) throw Object.assign(new Error('missing'), { code: 'P2025' })
            const updated = { ...record, ...data, updatedAt: bangkok.currentBangkokWallClockDate(fixedNow) }
            next.workItems.set(where.id, updated)
            return updated
          },
        },
      }
      const result = await callback(tx)
      state.workItems = next.workItems
      state.references = next.references
      state.nextId = next.nextId
      return result
    },
  }
  return { prisma, state }
}

function referenceKey(reference) {
  return `${reference.provider}|${reference.canonicalGitLabInstanceUrl}|${reference.gitLabProjectId}|${reference.gitLabGlobalIssueId}`
}

function clientForPages(pages, seen = []) {
  return async (url, options) => {
    seen.push({ url, options })
    const pageNumber = Number(new URL(url).searchParams.get('page') ?? '1')
    const next = pages[pageNumber - 1]
    if (!next) return response([])
    return response(next.issues, { headers: next.headers })
  }
}

test('canonicalizes only HTTPS GitLab base URLs and rejects client-controlled credentials or hosts', () => {
  assert.equal(canonicalGitLabBaseUrl('https://gitlab.example.test/base///'), baseUrl)
  assert.equal(canonicalGitLabBaseUrl('http://gitlab.example.test'), null)
  assert.equal(canonicalGitLabBaseUrl('https://user:pass@gitlab.example.test'), null)
  assert.deepEqual(plain(getGitLabConfiguration({ GITLAB_BASE_URL: baseUrl, GITLAB_TOKEN: 'synthetic' })), {
    baseUrl, token: 'synthetic',
  })
  assert.equal(getGitLabConfiguration({ GITLAB_BASE_URL: baseUrl }), null)
})

test('new Issues map fields, use Bangkok dates, and preserve owner-only identity', async () => {
  const { prisma, state } = makeDatabase()
  const requests = []
  const result = await syncGitLabProject({
    prisma, mapping: makeMapping(), ownerId, config,
    fetchImpl: clientForPages([{ issues: [makeIssue()] }], requests),
    now: () => fixedNow,
  })

  assert.deepEqual(plain(result.counts), { created: 1, updated: 0, skipped: 0, failed: 0 })
  assert.equal(result.results[0].reason, 'created_from_gitlab')
  const item = [...state.workItems.values()][0]
  assert.equal(item.kind, 'Issue')
  assert.equal(item.title, 'Fix sign in flow')
  assert.equal(item.status, 'todo')
  assert.deepEqual(plain(item.types), ['bug'])
  assert.equal(item.priority, 'none')
  assert.equal(item.role, null)
  assert.equal(item.workDate, null)
  assert.equal(item.dueDate.toISOString(), '2026-10-03T00:00:00.000Z')
  assert.equal(item.projectId, 'pms-project-1')
  assert.equal(item.assigneeId, ownerId)
  const reference = [...state.references.values()][0]
  assert.equal(reference.externalUrl, 'https://gitlab.example.test/base/group/project/-/issues/17')
  assert.equal(reference.canonicalGitLabInstanceUrl, baseUrl)
  assert.equal(reference.gitLabGlobalIssueId, '701')
  assert.equal(reference.remoteCreatedAt.toISOString(), '2026-09-29T17:00:00.000Z')
  assert.equal(reference.remoteUpdatedAt.toISOString(), '2026-09-30T18:30:00.000Z')
  assert.equal(result.results[0].sourceUrl, 'https://gitlab.example.test/base/group/project/-/issues/17')
  assert.deepEqual(plain(result.results[0].warnings), ['Unmapped GitLab label: customer feedback'])
  assert.equal(requests[0].options.headers['PRIVATE-TOKEN'], config.token)
  assert.equal(requests[0].options.method, 'GET')
  assert.match(requests[0].url, /scope=all/)
  assert.match(requests[0].url, /state=all/)
  assert.match(requests[0].url, /per_page=100/)
  assert.equal(state.transactionOptions[0].isolationLevel, 'Serializable')
})

test('closed Issues get a PMS submittedAt Bangkok timestamp without using GitLab closed_at', async () => {
  const { prisma, state } = makeDatabase()
  const result = await syncGitLabProject({
    prisma, mapping: makeMapping(), ownerId, config,
    fetchImpl: clientForPages([{ issues: [makeIssue({ state: 'closed', closed_at: '2026-09-25T08:00:00Z' })] }]),
    now: () => fixedNow,
  })
  assert.equal(result.counts.created, 1)
  assert.equal([...state.workItems.values()][0].status, 'completed')
  assert.equal([...state.workItems.values()][0].submittedAt.toISOString(), '2026-09-30T18:00:00.000Z')
})

test('resync updates GitLab-owned fields and preserves PMS-owned fields and Daily Work', async () => {
  const original = {
    id: 'existing-work-item', title: 'Old title', description: 'Old details', kind: 'Issue', status: 'todo',
    types: ['task'], dueDate: new Date('2026-09-01T00:00:00.000Z'), priority: 'urgent', role: 'infra',
    workDate: new Date('2026-08-28T00:00:00.000Z'), projectId: 'pms-project-1', assigneeId: ownerId,
    submittedAt: null, timeEntries: [{ id: 'entry-1', hours: '2.5' }],
  }
  const oldReference = {
    id: 'reference-1', provider: 'gitlab', canonicalGitLabInstanceUrl: baseUrl, gitLabProjectId: '42',
    gitLabGlobalIssueId: '701', gitLabIssueIid: '17', externalUrl: 'https://gitlab.example.test/base/group/project/-/issues/17',
    projectId: 'pms-project-1', remoteCreatedAt: new Date('2026-09-01T10:00:00.000Z'), remoteUpdatedAt: new Date('2026-09-20T10:00:00.000Z'),
    lastSyncedAt: new Date('2026-09-20T10:00:00.000Z'), workItemId: original.id,
  }
  const { prisma, state } = makeDatabase({ items: [original], references: [oldReference] })
  const result = await syncGitLabProject({
    prisma, mapping: makeMapping(), ownerId, config,
    fetchImpl: clientForPages([{ issues: [makeIssue({ title: 'New title', description: 'New body', state: 'closed', labels: ['user story'], due_date: null })] }]),
    now: () => fixedNow,
  })

  assert.deepEqual(plain(result.counts), { created: 0, updated: 1, skipped: 0, failed: 0 })
  assert.equal(result.results[0].reason, 'source_fields_changed')
  const item = state.workItems.get(original.id)
  assert.equal(item.title, 'New title')
  assert.equal(item.description, 'New body')
  assert.equal(item.status, 'completed')
  assert.deepEqual(plain(item.types), ['feature'])
  assert.equal(item.dueDate, null)
  assert.equal(item.priority, 'urgent')
  assert.equal(item.role, 'infra')
  assert.equal(item.workDate.toISOString(), original.workDate.toISOString())
  assert.equal(item.assigneeId, ownerId)
  assert.deepEqual(plain(item.timeEntries), original.timeEntries)
  assert.equal(item.submittedAt.toISOString(), '2026-09-30T18:00:00.000Z')
})

test('sync refuses to update an imported Work Item that has left its mapped PMS Project', async () => {
  const workItem = {
    id: 'moved-work-item', title: 'PMS title', description: null, kind: 'Issue', status: 'todo', types: [],
    dueDate: null, priority: 'none', role: null, workDate: null, projectId: 'another-project', assigneeId: ownerId,
    submittedAt: null, timeEntries: [],
  }
  const reference = {
    id: 'reference-1', provider: 'gitlab', canonicalGitLabInstanceUrl: baseUrl, gitLabProjectId: '42',
    gitLabGlobalIssueId: '701', gitLabIssueIid: '17', externalUrl: 'https://gitlab.example.test/base/group/project/-/issues/17',
    projectId: 'pms-project-1', remoteCreatedAt: new Date('2026-09-29T17:00:00.000Z'),
    remoteUpdatedAt: new Date('2026-09-30T18:30:00.000Z'), lastSyncedAt: fixedNow, workItemId: workItem.id,
  }
  const { prisma, state } = makeDatabase({ items: [workItem], references: [reference] })
  const result = await syncGitLabProject({
    prisma, mapping: makeMapping(), ownerId, config,
    fetchImpl: clientForPages([{ issues: [makeIssue({ title: 'Remote title' })] }]),
    now: () => fixedNow,
  })

  assert.equal(result.counts.failed, 1)
  assert.equal(result.results[0].error.code, 'SOURCE_IDENTITY_CONFLICT')
  assert.equal(state.workItems.get(workItem.id).title, 'PMS title')
})

test('repeated same snapshot is skipped and older GitLab snapshots cannot overwrite newer fields', async () => {
  const { prisma, state } = makeDatabase()
  const firstFetch = clientForPages([{ issues: [makeIssue()] }])
  await syncGitLabProject({ prisma, mapping: makeMapping(), ownerId, config, fetchImpl: firstFetch, now: () => fixedNow })
  const laterSync = new Date('2026-09-30T12:00:00.000Z')
  const repeated = await syncGitLabProject({ prisma, mapping: makeMapping(), ownerId, config, fetchImpl: clientForPages([{ issues: [makeIssue()] }]), now: () => laterSync })
  assert.deepEqual(plain(repeated.counts), { created: 0, updated: 0, skipped: 1, failed: 0 })
  assert.equal([...state.references.values()][0].lastSyncedAt.toISOString(), '2026-09-30T19:00:00.000Z')
  const stale = await syncGitLabProject({
    prisma, mapping: makeMapping(), ownerId, config,
    fetchImpl: clientForPages([{ issues: [makeIssue({ title: 'Stale title', updated_at: '2026-09-29T00:00:00Z' })] }]),
    now: () => fixedNow,
  })
  assert.equal(stale.results[0].reason, 'stale_source')
  assert.equal(state.workItems.size, 1)
  assert.equal([...state.workItems.values()][0].title, 'Fix sign in flow')
})

test('pagination follows only same-instance Issue links and deduplicates overlapping global identities', async () => {
  const { prisma, state } = makeDatabase()
  const seen = []
  const nextLink = `<${baseUrl}/api/v4/projects/42/issues?scope=all&state=all&per_page=100&page=2>; rel="next"`
  const result = await syncGitLabProject({
    prisma, mapping: makeMapping(), ownerId, config,
    fetchImpl: clientForPages([
      { issues: [makeIssue()], headers: { Link: nextLink } },
      { issues: [makeIssue({ title: 'Duplicate from overlap' }), makeIssue({ id: 702, iid: 18, title: 'Second Issue', web_url: 'https://gitlab.example.test/base/group/project/-/issues/18' })] },
    ], seen),
    now: () => fixedNow,
  })
  assert.equal(seen.length, 2)
  assert.deepEqual(plain(result.counts), { created: 2, updated: 0, skipped: 0, failed: 0 })
  assert.equal(state.workItems.size, 2)
  assert.equal([...state.workItems.values()].find((item) => item.title === 'Fix sign in flow') !== undefined, true)
})

test('unsafe pagination URLs preserve committed page outcomes and never send the token off instance', async () => {
  const { prisma, state } = makeDatabase()
  const seen = []
  const result = await syncGitLabProject({
    prisma, mapping: makeMapping(), ownerId, config,
    fetchImpl: clientForPages([
      { issues: [makeIssue()], headers: { Link: '<https://attacker.invalid/api/v4/projects/42/issues?page=2>; rel="next"' } },
    ], seen),
    now: () => fixedNow,
  })
  assert.equal(result.counts.created, 1)
  assert.equal(result.runError.code, 'PROVIDER_UNAVAILABLE')
  assert.equal(result.runError.nextPage, null)
  assert.equal(seen.length, 1)
  assert.equal(state.workItems.size, 1)
})

test('rate limits honor a short Retry-After and stop safely when the requested wait exceeds the bounded retry', async () => {
  const { prisma, state } = makeDatabase()
  const waits = []
  let calls = 0
  const retryingFetch = async () => {
    calls += 1
    return calls === 1 ? response({}, { status: 429, headers: { 'Retry-After': '1' } }) : response([makeIssue()])
  }
  const retried = await syncGitLabProject({ prisma, mapping: makeMapping(), ownerId, config, fetchImpl: retryingFetch, wait: async (ms) => waits.push(ms), now: () => fixedNow })
  assert.equal(retried.counts.created, 1)
  assert.deepEqual(waits, [1000])

  let delayedCalls = 0
  const rateLimitedFetch = async () => {
    delayedCalls += 1
    return response({}, { status: 429, headers: { 'Retry-After': '5' } })
  }
  const limited = await syncGitLabProject({ prisma, mapping: makeMapping({ gitLabProjectId: '43' }), ownerId, config, fetchImpl: rateLimitedFetch, wait: async () => assert.fail('must not retry before Retry-After'), now: () => fixedNow })
  assert.equal(limited.runError.code, 'RATE_LIMITED')
  assert.equal(limited.results.length, 0)
  assert.equal(delayedCalls, 1)
  assert.equal(state.workItems.size, 1)
})

test('transient provider failures retry with bounded backoff and then import successfully', async () => {
  const { prisma, state } = makeDatabase()
  const waits = []
  let calls = 0
  const fetchImpl = async (url) => {
    calls += 1
    if (calls === 1) return response({}, { status: 503 })
    const pageNumber = new URL(url).searchParams.get('page')
    return response(pageNumber === '1' ? [makeIssue()] : [])
  }
  const result = await syncGitLabProject({
    prisma, mapping: makeMapping(), ownerId, config, fetchImpl,
    wait: async (ms) => waits.push(ms), now: () => fixedNow,
  })
  assert.equal(calls, 3)
  assert.deepEqual(waits, [150])
  assert.equal(result.counts.created, 1)
  assert.equal(state.workItems.size, 1)
})

test('bad Issue rows fail individually while other Issues still commit', async () => {
  const { prisma, state } = makeDatabase()
  const result = await syncGitLabProject({
    prisma, mapping: makeMapping(), ownerId, config,
    fetchImpl: clientForPages([{ issues: [makeIssue(), makeIssue({ id: 702, iid: 18, project_id: 99 })] }]),
    now: () => fixedNow,
  })
  assert.deepEqual(plain(result.counts), { created: 1, updated: 0, skipped: 0, failed: 1 })
  assert.equal(result.results.find((item) => item.outcome === 'failed').error.code, 'INVALID_REMOTE_ISSUE')
  assert.equal(state.workItems.size, 1)
})

test('remote labels matching JavaScript prototype keys are treated as unmapped strings', async () => {
  const { prisma, state } = makeDatabase()
  const result = await syncGitLabProject({
    prisma, mapping: makeMapping({ approvedLabelMap: {} }), ownerId, config,
    fetchImpl: clientForPages([{ issues: [makeIssue({ labels: ['constructor', '__proto__'] })] }]),
    now: () => fixedNow,
  })

  assert.equal(result.counts.created, 1)
  assert.deepEqual(plain([...state.workItems.values()][0].types), [])
  assert.deepEqual(plain(result.results[0].warnings), [
    'Unmapped GitLab label: constructor',
    'Unmapped GitLab label: __proto__',
  ])

  const explicitMap = validateApprovedLabelMap(JSON.parse('{"constructor":"feature","__proto__":"bug"}'))
  assert.equal(Object.hasOwn(explicitMap, '__proto__'), true)
  const mappedDatabase = makeDatabase()
  const mapped = await syncGitLabProject({
    prisma: mappedDatabase.prisma,
    mapping: makeMapping({ approvedLabelMap: explicitMap }),
    ownerId,
    config,
    fetchImpl: clientForPages([{ issues: [makeIssue({ labels: ['__proto__', 'constructor'] })] }]),
    now: () => fixedNow,
  })
  assert.deepEqual(plain([...mappedDatabase.state.workItems.values()][0].types), ['bug', 'feature'])
  assert.equal(mapped.results[0].warnings, undefined)
})

test('invalid mapping labels and mapping changes stop sync before writing records', async () => {
  const { prisma, state } = makeDatabase()
  let calls = 0
  const fetchImpl = async () => { calls += 1; return calls === 1 ? response([makeIssue()]) : response([]) }
  const badLabelMap = await syncGitLabProject({ prisma, mapping: makeMapping({ approvedLabelMap: { bug: 'owner-role' } }), ownerId, config, fetchImpl }).catch((error) => error)
  assert.equal(badLabelMap.code, 'PROVIDER_UNAVAILABLE')
  assert.equal(calls, 0)

  const movedMapping = makeMapping({ projectId: 'another-project' })
  const moved = await syncGitLabProject({ prisma, mapping: movedMapping, ownerId, config, fetchImpl }).catch((error) => error)
  assert.equal(moved.counts.failed, 1)
  assert.equal(moved.results[0].error.code, 'MAPPING_CHANGED')
  assert.equal(state.workItems.size, 0)
  assert.equal(calls, 2)
})

test('source timestamps and due dates are parsed independently of the process timezone', async () => {
  const previousTz = process.env.TZ
  process.env.TZ = 'America/Los_Angeles'
  try {
    assert.equal(parseGitLabTimestamp('2026-09-30T11:30:00Z').toISOString(), '2026-09-30T18:30:00.000Z')
    assert.equal(parseGitLabTimestamp('2026-09-30T18:30:00+07:00').toISOString(), '2026-09-30T18:30:00.000Z')
    assert.equal(parseGitLabTimestamp('2026-09-30T11:30:00'), null)
    const { prisma, state } = makeDatabase()
    await syncGitLabProject({
      prisma,
      mapping: makeMapping(),
      ownerId,
      config,
      fetchImpl: clientForPages([{ issues: [makeIssue({ due_date: '2026-10-03' })] }]),
      now: () => fixedNow,
    })
    assert.equal([...state.workItems.values()][0].dueDate.toISOString(), '2026-10-03T00:00:00.000Z')
  } finally {
    if (previousTz === undefined) delete process.env.TZ
    else process.env.TZ = previousTz
  }
})
