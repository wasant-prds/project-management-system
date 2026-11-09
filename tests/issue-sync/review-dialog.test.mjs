import test from 'node:test'
import assert from 'node:assert/strict'
import { createComponentLoader, descendants, textContent, React } from '../frontend-ui/component-runtime.mjs'
import { uuid } from './support.mjs'

const group = (number) => ({
  configId: uuid(number),
  sourceProject: `Project ${number}`,
  runId: uuid(number + 100),
  issues: [
    {
      issueId: '701',
      title: 'Fix login',
      sourceUrl: 'https://github.com/acme/repo/issues/17',
      candidates: [
        { id: uuid(number + 200), title: 'Fix login page', description: 'Old description', similarity: 0.75 },
      ],
    },
  ],
})

test('one review dialog lists all comparisons, waits for every answer and preserves choices while saving', () => {
  let choices = {},
    captured
  const load = createComponentLoader({
    react: {
      ...React,
      useState: () => [
        choices,
        (next) => {
          choices = next(choices)
        },
      ],
    },
  })
  const { IssueSyncReviewDialog } = load('components/page/projects/issue-sync-review-dialog.tsx')
  const props = {
    groups: [group(1), group(2)],
    busy: false,
    error: '',
    onClose() {},
    onConfirm(value) {
      captured = value
    },
  }
  const render = () => descendants(IssueSyncReviewDialog(props))
  const confirm = () => render().find((node) => node.props.onClick && textContent(node) === 'ยืนยันทั้งหมด')
  assert.equal(render().filter((node) => node.type === 'fieldset').length, 2)
  assert.equal(confirm().props.disabled, true)
  const radios = render().filter((node) => node.type === 'input')
  assert.ok(radios.every((node) => node.props.type === 'radio' && node.props.checked === false))
  radios[0].props.onChange()
  assert.equal(confirm().props.disabled, true)
  render()
    .filter((node) => node.type === 'input')[3]
    .props.onChange()
  assert.equal(confirm().props.disabled, false)
  confirm().props.onClick()
  assert.deepEqual(JSON.parse(JSON.stringify(captured)), [
    { runId: uuid(101), decisions: [{ issueId: '701', workItemId: uuid(201) }] },
    { runId: uuid(102), decisions: [{ issueId: '701', workItemId: null }] },
  ])
  assert.ok(
    render().some((node) => node.type === 'a' && node.props.href === `/work-items?workItemId=${uuid(201)}`),
  )
  props.busy = true
  assert.ok(
    render()
      .filter((node) => node.type === 'fieldset')
      .every((node) => node.props.disabled),
  )
  assert.equal(Object.keys(choices).length, 2)
})

test('review dialog prevents binding multiple source issues to the same destination', () => {
  let choices = {}
  const load = createComponentLoader({
    react: {
      ...React,
      useState: () => [
        choices,
        (next) => {
          choices = next(choices)
        },
      ],
    },
  })
  const { IssueSyncReviewDialog } = load('components/page/projects/issue-sync-review-dialog.tsx')
  const groups = [group(1), group(2)]
  groups[1].issues[0].candidates[0].id = uuid(201)
  const props = {
    groups,
    busy: false,
    error: '',
    onClose() {},
    onConfirm() {
      assert.fail('must not confirm duplicate bindings')
    },
  }
  const render = () => descendants(IssueSyncReviewDialog(props))
  render()
    .filter((node) => node.type === 'input')[0]
    .props.onChange()
  render()
    .filter((node) => node.type === 'input')[2]
    .props.onChange()
  assert.ok(render().some((node) => node.props.role === 'alert'))
  assert.equal(
    render().find((node) => node.props.onClick && textContent(node) === 'ยืนยันทั้งหมด').props.disabled,
    true,
  )
})

test('syncing multiple configs collects pending matches before opening a single modal', async () => {
  const states = [],
    effects = [],
    requests = []
  let cursor = 0,
    releaseSecond
  const configs = [1, 2].map((number) => ({
    id: uuid(number),
    provider: 'github',
    sourceProject: `Project ${number}`,
    assignees: ['alice'],
    enabled: true,
    firstSyncApproved: true,
    approvedLabelMap: {},
  }))
  const run = (number) => ({
    id: uuid(number + 100),
    counts: { created: 0, updated: 0, skipped: 0, failed: 0, pending: 1 },
    results: [{ outcome: 'pending', ...group(number).issues[0] }],
  })
  const load = createComponentLoader(
    {
      react: {
        ...React,
        useState(initial) {
          const index = cursor++
          states[index] ??= initial
          return [
            states[index],
            (next) => {
              states[index] = typeof next === 'function' ? next(states[index]) : next
            },
          ]
        },
        useEffect(operation) {
          if (!effects.length) effects.push(operation)
        },
        useCallback: (operation) => operation,
        useId: () => 'sync',
        useRef: (value) => ({ current: value }),
      },
    },
    {
      fetch: async (url) => {
        requests.push(url)
        if (url.endsWith(`/${uuid(2)}/sync`))
          await new Promise((done) => {
            releaseSecond = done
          })
        return {
          ok: true,
          json: async () =>
            url.endsWith('/sync')
              ? { run: run(url.includes(uuid(1)) ? 1 : 2) }
              : url.endsWith('/runs')
                ? { runs: [], nextBefore: null }
                : { configs, legacyMappings: [] },
        }
      },
    },
  )
  const { ProjectIssueSync } = load('components/page/projects/project-issue-sync.tsx')
  const { IssueSyncReviewDialog } = load('components/page/projects/issue-sync-review-dialog.tsx')
  const render = () => {
    cursor = 0
    return descendants(ProjectIssueSync({ projectId: uuid(20), onSynced() {} }))
  }
  render()
  effects[0]()
  await new Promise(setImmediate)
  const button = render().find((node) => node.props.onClick && textContent(node) === 'Sync ทั้ง Project')
  const syncing = button.props.onClick()
  await new Promise(setImmediate)
  assert.equal(render().filter((node) => node.type === IssueSyncReviewDialog).length, 0)
  releaseSecond()
  await syncing
  const dialogs = render().filter((node) => node.type === IssueSyncReviewDialog)
  assert.equal(dialogs.length, 1)
  assert.equal(dialogs[0].props.groups.length, 2)
  assert.equal(requests.filter((url) => url.endsWith('/sync')).length, 2)
})
