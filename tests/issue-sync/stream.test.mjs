import test from 'node:test'
import assert from 'node:assert/strict'
import { loader, plain } from './support.mjs'
import { createComponentLoader, React, renderToStaticMarkup } from '../frontend-ui/component-runtime.mjs'

const progress = (phase = 'syncing') => ({
  phase,
  processed: 17,
  counts: { created: 10, updated: 2, skipped: 3, failed: 1, pending: 1 },
})
const bytes = new TextEncoder()
function responseFrom(parts) {
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const part of parts) controller.enqueue(part)
        controller.close()
      },
    }),
    { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' } },
  )
}

test('stream client decodes split JSON, split Thai UTF-8, and the final line without a newline', async () => {
  const run = { id: 'public-run', title: 'งานภาษาไทย', status: 'success' }
  const body = bytes.encode(
    JSON.stringify({ type: 'progress', progress: progress() }) +
      '\n' +
      JSON.stringify({ type: 'result', run }),
  )
  let options
  const { streamIssueSync } = loader(
    {},
    {
      fetch: async (_url, input) => {
        options = input
        return responseFrom(Array.from(body, (value) => new Uint8Array([value])))
      },
    },
  )('lib/integrations/issue-sync-stream.ts')
  const events = [],
    controller = new AbortController()
  assert.deepEqual(
    plain(await streamIssueSync('/sync', true, (event) => events.push(event), controller.signal)),
    run,
  )
  assert.deepEqual(plain(events), [progress()])
  assert.equal(options.headers.Accept, 'application/x-ndjson')
  assert.equal(options.signal, controller.signal)
  assert.deepEqual(JSON.parse(options.body), { approveFirstSync: true })
})

test('stream client handles HTTP errors, safe streamed errors, malformed data and truncated responses', async () => {
  for (const [response, expected] of [
    [new Response(JSON.stringify({ error: { message: 'Denied' } }), { status: 403 }), /Denied/],
    [
      responseFrom([
        bytes.encode(
          JSON.stringify({ type: 'error', error: { code: 'ERROR', message: 'Safe failure' } }) + '\n',
        ),
      ]),
      /Safe failure/,
    ],
    [responseFrom([bytes.encode('bad synthetic-secret\n')]), /รูปแบบข้อมูล/],
    [
      responseFrom([bytes.encode(JSON.stringify({ type: 'progress', progress: progress() }) + '\n')]),
      /สิ้นสุดก่อนส่งผลสรุป/,
    ],
  ]) {
    const { streamIssueSync } = loader(
      {},
      { fetch: async () => response },
    )('lib/integrations/issue-sync-stream.ts')
    await assert.rejects(
      streamIssueSync('/sync', false, () => {}),
      (error) => expected.test(error.message) && !error.message.includes('synthetic-secret'),
    )
  }
})

test('stream client keeps compatibility with the JSON sync response', async () => {
  const { streamIssueSync } = loader(
    {},
    {
      fetch: async () =>
        new Response(JSON.stringify({ run: { id: 'existing-client' } }), {
          headers: { 'Content-Type': 'application/json' },
        }),
    },
  )('lib/integrations/issue-sync-stream.ts')
  assert.equal(
    (await streamIssueSync('/sync', false, () => assert.fail('no stream progress for JSON'))).id,
    'existing-client',
  )
})

test('progress panel shows themed stages, real counters and source completion without claiming a failed run succeeded', () => {
  const { IssueSyncProgressPanel } = createComponentLoader()(
    'components/page/projects/issue-sync-progress.tsx',
  )
  const state = {
    sourceProject: 'group/project',
    sourceIndex: 1,
    totalSources: 2,
    completedSources: 0,
    status: 'running',
    progress: progress(),
  }
  const render = () => renderToStaticMarkup(React.createElement(IssueSyncProgressPanel, { state }))
  let html = render()
  for (const text of [
    'เชื่อมต่อต้นทาง',
    'อ่านและบันทึก Issues',
    'ตรวจประวัติเดิม',
    'สรุปผล',
    'ประมวลผล',
    '17',
    'รอยืนยัน 1',
  ])
    assert.ok(html.includes(text), text)
  assert.match(html, /aria-valuenow="12.5"/)
  assert.match(html, /aria-current="step"/)
  assert.match(html, /motion-safe:animate-pulse/)
  assert.match(html, /grid-cols-2.*sm:grid-cols-4/)
  state.progress.phase = 'complete'
  state.completedSources = 1
  state.status = 'failed'
  html = render()
  assert.ok(html.includes('Sync ไม่สำเร็จ'))
  assert.ok(!html.includes('Sync เสร็จแล้ว'))
  assert.match(html, /aria-valuenow="50"/)
  assert.doesNotMatch(html, /aria-current="step"/)
})
