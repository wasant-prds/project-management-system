import test from 'node:test'
import assert from 'node:assert/strict'
import { loader, plain } from './support.mjs'

const { syncedIssueFields, matchesUnlinkedIssue } = loader()('lib/integrations/issue-content.ts')
const { issueTitleSimilarity } = loader()('lib/integrations/issue-review.ts')
const source = (overrides = {}) => ({
  number: '5',
  title: '[SA] DHAS Grand Rally',
  description: 'Details',
  status: 'todo',
  labels: [],
  url: 'https://github.com/acme/repo/issues/5',
  ...overrides,
})

test('source labels populate the displayed kind, priority, role, status and type badges', () => {
  const result = syncedIssueFields(
    source({
      labels: [
        'type::task',
        'type::documentation',
        'priority::high',
        'role::SA',
        'status::completed',
        'release:2026',
      ],
    }),
    {},
  )
  assert.deepEqual(plain(result.fields), {
    title: '[#5] [SA] DHAS Grand Rally',
    description: 'Details',
    kind: 'Task',
    priority: 'high',
    role: 'SA',
    status: 'completed',
    types: ['documentation', 'release:2026'],
  })
  assert.deepEqual(plain(result.warnings), ['Unmapped label: release:2026'])
})

test('formatting removes duplicate issue prefixes and Markdown headings without inventing roles', () => {
  for (const title of [
    '[SA] DHAS Grand Rally',
    '## [#5] [SA] DHAS Grand Rally',
    '[#5] [#5] [SA] DHAS Grand Rally',
    '[#&#8203;5] [SA] DHAS Grand Rally',
  ])
    assert.equal(syncedIssueFields(source({ title }), {}).fields.title, '[#5] [SA] DHAS Grand Rally')
  assert.equal(
    syncedIssueFields(source({ title: '[DEV] Fix login' }), {}).fields.title,
    '[#5] [Developer] Fix login',
  )
  assert.equal(
    syncedIssueFields(source({ title: '[Developer / Infra] Deploy' }), {}).fields.title,
    '[#5] [Developer / Infra] Deploy',
  )
  assert.equal(
    syncedIssueFields(source({ title: '[Campaign] Launch' }), {}).fields.title,
    '[#5] [Campaign] Launch',
  )
  assert.equal(syncedIssueFields(source({ title: 'Launch' }), {}).fields.title, '[#5] Launch')
})

test('explicit labels override title roles and local fields; absent metadata retains local fields', () => {
  const local = { kind: 'Task', role: 'infra', priority: 'urgent' }
  const mapped = syncedIssueFields(
    source({ labels: ['role::Developer', 'priority::low', 'kind::Incident', 'legacy-doc'] }),
    { 'legacy-doc': 'documentation' },
    local,
  )
  assert.equal(mapped.fields.title, '[#5] [Developer] DHAS Grand Rally')
  assert.equal(mapped.fields.role, 'Developer')
  assert.equal(mapped.fields.kind, 'Incident')
  assert.equal(mapped.fields.priority, 'low')
  assert.deepEqual(plain(mapped.fields.types), ['documentation'])
  const fallback = syncedIssueFields(source({ title: 'Deploy' }), {}, local).fields
  assert.equal(fallback.title, '[#5] [Infra] Deploy')
  assert.equal(fallback.priority, 'urgent')
  assert.equal(fallback.kind, 'Task')
  assert.deepEqual(plain(fallback.types), [])
  assert.equal(syncedIssueFields(source({ labels: ['role::none'] }), {}, local).fields.role, null)
})

test('contradictory standard labels fail instead of silently selecting one', () => {
  for (const labels of [
    ['priority::high', 'priority::low'],
    ['role::none', 'role::Developer'],
    ['status::todo', 'status::completed'],
    ['kind::Issue', 'type::task'],
  ])
    assert.throws(
      () => syncedIssueFields(source({ labels }), {}),
      (error) => error.code === 'SOURCE_LABEL_CONFLICT',
    )
  assert.doesNotThrow(() => syncedIssueFields(source({ labels: ['role::SA', 'role::System Analyst'] }), {}))
})

test('multiple role labels sync as a combined title and preserve additional role badges deterministically', () => {
  const original = source({
    title: '[Developer / Infra] Implement issue sync',
    labels: ['role::infra', 'role::Developer', 'type::feature'],
  })
  const first = syncedIssueFields(original, {}).fields
  assert.equal(first.title, '[#5] [Developer / Infra] Implement issue sync')
  assert.equal(first.role, 'Developer')
  assert.deepEqual(plain(first.types), ['feature', 'role::infra'])
  assert.deepEqual(
    plain(syncedIssueFields({ ...original, labels: [...original.labels].reverse() }, {}, first).fields),
    plain(first),
  )
  const reversed = syncedIssueFields(
    source({ title: '[Infra / Developer] Deploy', labels: ['role::Developer', 'role::infra'] }),
    {},
  ).fields
  assert.equal(reversed.title, '[#5] [Infra / Developer] Deploy')
  assert.equal(reversed.role, 'infra')
  assert.deepEqual(plain(reversed.types), ['role::Developer'])
})

test('combined prefixes, compound role labels and source role removals keep all roles without repeated prefixes', () => {
  const title = '[SA / Developer / Infra] Review'
  const first = syncedIssueFields(
    source({ title, labels: ['role::SA', 'role::Developer', 'role::infra'] }),
    {},
  ).fields
  assert.equal(first.role, 'SA')
  assert.equal(first.title, '[#5] [SA / Developer / Infra] Review')
  assert.deepEqual(plain(first.types), ['role::Developer', 'role::infra'])
  const removed = syncedIssueFields(
    source({ title: '[Developer] Review', labels: ['role::Developer'] }),
    {},
    first,
  ).fields
  assert.equal(removed.title, '[#5] [Developer] Review')
  assert.deepEqual(plain(removed.types), [])
  const compound = syncedIssueFields(
    source({ title: 'Deploy', labels: ['role::Developer / Infra'] }),
    {},
  ).fields
  assert.equal(compound.title, '[#5] [Developer / Infra] Deploy')
  assert.deepEqual(plain(compound.types), ['role::infra'])
  const qualifier = syncedIssueFields(
    source({ title: '[Developer / Data Migration] Import', labels: ['role::Developer'] }),
    {},
  ).fields
  assert.equal(qualifier.title, '[#5] [Developer / Data Migration] Import')
  assert.equal(qualifier.role, 'Developer')
  const unknown = syncedIssueFields(source({ labels: ['role::constructor'] }), {}).fields
  assert.ok(unknown.types.includes('role::constructor'))
})

test('legacy matching requires an exact normalized title or explicit canonical source URL', () => {
  assert.equal(
    matchesUnlinkedIssue({ title: '## [#5] [SA] DHAS   Grand Rally', description: null }, source()),
    true,
  )
  assert.equal(
    matchesUnlinkedIssue({ title: '[#6] [SA] DHAS Grand Rally', description: null }, source()),
    false,
  )
  assert.equal(
    matchesUnlinkedIssue({ title: '[Developer] DHAS Grand Rally', description: null }, source()),
    false,
  )
  assert.equal(
    matchesUnlinkedIssue(
      { title: 'Different title', description: 'Source: https://github.com/acme/repo/issues/5' },
      source(),
    ),
    true,
  )
  assert.equal(
    matchesUnlinkedIssue(
      { title: 'Different title', description: 'Source: https://github.com/acme/repo/issues/50' },
      source(),
    ),
    false,
  )
  assert.equal(
    matchesUnlinkedIssue(
      {
        title: 'Different title',
        description: 'Source: https://evil.test/https://github.com/acme/repo/issues/5',
      },
      source(),
    ),
    false,
  )
})

test('Unicode bigram similarity has a strict 60% boundary and ignores title prefixes', () => {
  assert.equal(issueTitleSimilarity('abcdef', 'abcdxy'), 0.6)
  assert.ok(issueTitleSimilarity('Fix login', 'Fix login page') > 0.6)
  assert.equal(issueTitleSimilarity('## [#5] [SA] งาน cafe\u0301', '[Developer] งาน café'), 1)
  assert.equal(issueTitleSimilarity('', ''), 0)
  assert.equal(issueTitleSimilarity('ก', 'ก'), 1)
  assert.equal(issueTitleSimilarity('a', 'b'), 0)
  assert.ok(issueTitleSimilarity('aaaa', 'aaab') < 1)
})
