import test from 'node:test'
import assert from 'node:assert/strict'
import { createComponentLoader, descendants, textContent, React } from '../frontend-ui/component-runtime.mjs'
import { uuid } from './support.mjs'

test('Project sync renders live server counts before the final response and completes only after the result', async () => {
  const states = [],
    refs = [],
    effects = [],
    requests = []
  let cursor = 0,
    refCursor = 0,
    output,
    signal
  const config = {
    id: uuid(1),
    provider: 'gitlab',
    sourceProject: 'group/project',
    assignees: ['alice'],
    enabled: true,
    firstSyncApproved: true,
    approvedLabelMap: {},
  }
  const counts = { created: 2, updated: 0, skipped: 0, failed: 0, pending: 0 }
  const encode = (event) => new TextEncoder().encode(JSON.stringify(event) + '\n')
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
        useRef(value) {
          const index = refCursor++
          refs[index] ??= { current: value }
          return refs[index]
        },
        useEffect(operation) {
          if (!effects.length) effects.push(operation)
        },
        useCallback: (operation) => operation,
        useId: () => 'sync',
      },
    },
    {
      fetch: async (url, options) => {
        requests.push(url)
        if (url.endsWith('/sync')) {
          signal = options.signal
          return new Response(
            new ReadableStream({
              start(controller) {
                output = controller
                controller.enqueue(
                  encode({ type: 'progress', progress: { phase: 'syncing', processed: 2, counts } }),
                )
              },
            }),
            { headers: { 'Content-Type': 'application/x-ndjson' } },
          )
        }
        return new Response(
          JSON.stringify(
            url.endsWith('/runs')
              ? { runs: [], nextBefore: null }
              : { configs: [config], legacyMappings: [] },
          ),
        )
      },
    },
  )
  const { ProjectIssueSync } = load('components/page/projects/project-issue-sync.tsx')
  const { IssueSyncProgressPanel } = load('components/page/projects/issue-sync-progress.tsx')
  const render = () => {
    cursor = 0
    refCursor = 0
    return descendants(ProjectIssueSync({ projectId: uuid(20), onSynced() {} }))
  }
  render()
  const cleanup = effects[0]()
  await new Promise(setImmediate)
  const syncing = render()
    .find((node) => node.props.onClick && textContent(node) === 'Sync ทั้ง Project')
    .props.onClick()
  await new Promise(setImmediate)
  let progress = render().find((node) => node.type === IssueSyncProgressPanel).props.state
  assert.equal(progress.status, 'running')
  assert.equal(progress.progress.processed, 2)
  assert.equal(progress.progress.counts.created, 2)
  assert.equal(progress.completedSources, 0)
  output.enqueue(
    encode({
      type: 'result',
      run: {
        id: uuid(100),
        status: 'success',
        counts,
        results: [{ outcome: 'created' }, { outcome: 'created' }],
      },
    }),
  )
  output.close()
  await syncing
  progress = render().find((node) => node.type === IssueSyncProgressPanel).props.state
  assert.equal(progress.status, 'success')
  assert.equal(progress.completedSources, 1)
  const second = render()
    .find((node) => node.props.onClick && textContent(node) === 'Sync ทั้ง Project')
    .props.onClick()
  await new Promise(setImmediate)
  const beforeUnmount = requests.length
  cleanup()
  assert.equal(signal.aborted, true)
  output.enqueue(encode({ type: 'progress', progress: { phase: 'syncing', processed: 99, counts } }))
  output.enqueue(encode({ type: 'result', run: { id: uuid(101), status: 'success', counts, results: [] } }))
  output.close()
  await second
  assert.equal(requests.length, beforeUnmount, 'unmounted sync must not refresh old Project data')
  assert.equal(
    render().find((node) => node.type === IssueSyncProgressPanel).props.state.progress.processed,
    2,
  )
})
