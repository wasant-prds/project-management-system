import assert from 'node:assert/strict'
import test from 'node:test'
import { parseTapOutput, renderUnitReport, shouldUseColor } from '../../scripts/format-unit-tests.mjs'

test('unit report groups TAP results by source file and totals pass, fail, and skip cases', () => {
  const titles = new Map([
    ['resolves the owner', ['auth/owner.test.mjs']],
    ['rejects a foreign owner', ['auth/owner.test.mjs']],
    ['skips the real database', ['database/rollout-docker.test.mjs']],
  ])
  const tap = [
    'TAP version 13',
    'ok 1 - resolves the owner',
    '  ---',
    '  duration_ms: 20',
    '  type: \'test\'',
    '  ...',
    'not ok 2 - rejects a foreign owner',
    '  ---',
    '  duration_ms: 10',
    '  type: \'test\'',
    '  ...',
    'ok 3 - skips the real database # SKIP requires Docker',
    '  ---',
    '  duration_ms: 0',
    '  type: \'test\'',
    '  ...',
    '1..3',
    '# tests 3',
    '# pass 1',
    '# fail 1',
    '# skipped 1',
  ].join('\n')

  const report = renderUnitReport(parseTapOutput(tap, titles))

  assert.match(report, /ชุด: unit/)
  assert.match(report, /tests\/auth/)
  assert.match(report, /owner\.test\.mjs/)
  assert.match(report, /resolves the owner\s+PASS\s+0\.02s/)
  assert.match(report, /rejects a foreign owner\s+FAIL\s+0\.01s/)
  assert.match(report, /tests\/database\s+SKIP/)
  assert.match(report, /เคส\s+1 PASS\s+1 FAIL\s+1 SKIP/)
})

test('unit report uses aligned color-coded terminal output when color is enabled', () => {
  const results = [
    { title: 'short case', status: 'pass', durationMs: 12, file: 'auth/owner.test.mjs' },
    { title: 'a longer case title keeps result columns aligned', status: 'skip', durationMs: 0, file: 'auth/owner.test.mjs' },
  ]
  const report = renderUnitReport(results, { useColor: true })
  const plainReport = report.replace(/\u001b\[[0-9;]*m/g, '')
  const testLines = plainReport.split('\n').filter((line) => line.includes('short case') || line.includes('longer case title'))

  assert.match(report, /\u001b\[33m\u001b\[1mtests\/auth/)
  assert.match(report, /\u001b\[33mowner\.test\.mjs/)
  assert.match(report, /\u001b\[36mshort case/)
  assert.match(report, /\u001b\[1m\u001b\[32mPASS/)
  assert.match(report, /\u001b\[1m\u001b\[33mSKIP/)
  assert.match(report, /\u001b\[2m0\.01s/)
  assert.equal(testLines[0].indexOf('PASS'), testLines[1].indexOf('SKIP'))
})

test('terminal colors respect NO_COLOR, FORCE_COLOR, and terminal support', () => {
  assert.equal(shouldUseColor({ env: {}, isTTY: true }), true)
  assert.equal(shouldUseColor({ env: {}, isTTY: false }), false)
  assert.equal(shouldUseColor({ env: { NO_COLOR: '' }, isTTY: true }), false)
  assert.equal(shouldUseColor({ env: { FORCE_COLOR: '1', TERM: 'dumb' }, isTTY: false }), true)
  assert.equal(shouldUseColor({ env: { FORCE_COLOR: '0' }, isTTY: true }), false)
})
