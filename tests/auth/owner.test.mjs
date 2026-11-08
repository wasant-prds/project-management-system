import test from 'node:test'
import assert from 'node:assert/strict'
import { moduleLoader } from '../support/module-loader.mjs'
const loadTs = (path, mocks = {}, runtimeProcess = process) => moduleLoader(mocks, { process: runtimeProcess })(path.replace(/^\.\.\/\.\.\//, ''))
import { authorize, formatBangkokTimestamp } from '../../scripts/owner-gate.mjs'

test('middleware denies direct API/page reads and accepts only the gate proof', () => {
  class MockNextResponse {
    constructor(body, value) {
      this.status = value.status
      this.body = body
    }

    static next(value) {
      return { status: 200, forwarded: value?.request?.headers }
    }

    static json(body, value) {
      return { status: value.status, body }
    }
  }
  const { middleware } = loadTs('../../middleware.ts', { 'next/server': { NextResponse: MockNextResponse } }, { env: { PMS_INTERNAL_OWNER_PROOF: 'server-only-proof' } })
  const request = (path, proof, method = 'GET') => ({
    nextUrl: { pathname: path }, method, headers: new Headers(proof ? { 'x-pms-owner-proof': proof } : {}),
  })
  assert.equal(middleware(request('/api/projects')).status, 401)
  assert.equal(middleware(request('/api/work-items', null, 'POST')).status, 401)
  assert.equal(middleware(request('/work-items')).status, 401)
  assert.equal(middleware(request('/api/projects', 'forged')).status, 401)
  const accepted = middleware(request('/api/projects', 'server-only-proof'))
  assert.equal(accepted.status, 200)
  assert.equal(accepted.forwarded.get('x-pms-owner-proof'), 'server-only-proof')
  assert.equal(accepted.forwarded.get('x-pms-owner-authenticated'), '1')
  assert.equal(middleware(request('/work-items', 'server-only-proof')).status, 200)
  assert.equal(middleware(request('/api/health')).status, 200)
})

test('owner access audit timestamps use Bangkok wall-clock independently of machine timezone', () => {
  const previousTimezone = process.env.TZ
  process.env.TZ = 'America/Los_Angeles'
  try {
    assert.equal(formatBangkokTimestamp(new Date('2026-09-29T00:00:00.000Z')), '2026-09-29T07:00:00.000+07:00')
    assert.equal(formatBangkokTimestamp(new Date('2026-09-29T17:00:00.000Z')), '2026-09-30T00:00:00.000+07:00')
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ
    else process.env.TZ = previousTimezone
  }
})

test('Daily Work dates parse, persist, query, and display with Bangkok wall-clock semantics', () => {
  const previousTimezone = process.env.TZ
  process.env.TZ = 'America/Los_Angeles'
  try {
    const { parseBangkokDateTime, currentBangkokWallClockDate, bangkokDateRange, serializeBangkokTimestamp, formatBangkokDateLabel } = loadTs('../../lib/bangkok-datetime.ts', {})
    const { formatDate } = loadTs('../../lib/utils.ts', { clsx: { clsx: () => '' }, 'tailwind-merge': { twMerge: () => '' } })
    assert.equal(parseBangkokDateTime('2026-09-30').toISOString(), '2026-09-30T00:00:00.000Z')
    assert.equal(parseBangkokDateTime('2026-09-30T01:02:03.004+07:00').toISOString(), '2026-09-30T01:02:03.004Z')
    assert.equal(parseBangkokDateTime('2026-09-30T01:02:03Z'), null)
    assert.equal(parseBangkokDateTime('2026-02-30'), null)
    assert.equal(currentBangkokWallClockDate(new Date('2026-09-29T17:00:00.000Z')).toISOString(), '2026-09-30T00:00:00.000Z')
    const range = bangkokDateRange('2026-09-30')
    assert.equal(range.start.toISOString(), '2026-09-30T00:00:00.000Z')
    assert.equal(range.end.toISOString(), '2026-10-01T00:00:00.000Z')
    assert.equal(serializeBangkokTimestamp(range.start), '2026-09-30T00:00:00.000+07:00')
    assert.equal(formatBangkokDateLabel('2026-09-30T00:00:00.000+07:00'), 'Sep 30, 2026')
    assert.equal(formatDate('2026-09-30T00:00:00.000+07:00'), '2026-09-30')
    assert.equal(formatDate('2026-09-30'), '2026-09-30')
  } finally {
    if (previousTimezone === undefined) delete process.env.TZ
    else process.env.TZ = previousTimezone
  }
})

test('Daily Work displays clear access errors and clears stale rows on failed reads', async () => {
  const { readWorkLogsResponse } = loadTs('../../lib/work-log-response.ts', {})
  for (const [status, code, title] of [
    [401, 'OWNER_UNAUTHENTICATED', 'Authentication required'],
    [403, 'ACCESS_DENIED', 'Access denied'],
    [503, 'DEPENDENCY_UNAVAILABLE', 'Error'],
  ]) {
    const result = await readWorkLogsResponse({
      ok: false,
      status,
      json: async () => ({ error: { code } }),
    })
    assert.equal(result.workLogs.length, 0)
    assert.equal(result.error.title, title)
    assert.ok(result.error.message)
  }
  const successful = await readWorkLogsResponse({
    ok: true,
    status: 200,
    json: async () => ({ workLogs: [{ id: 'log-1' }] }),
  })
  assert.deepEqual(Array.from(successful.workLogs), [{ id: 'log-1' }])
  assert.equal(successful.error, null)
})

test('owner gate rejects forged internal proof headers without valid Basic credentials', () => {
  const env = { OWNER_GATE_USERNAME: 'owner', OWNER_GATE_PASSWORD: 'a'.repeat(32), APP_ORIGIN: 'http://localhost:3777', PMS_INTERNAL_OWNER_PROOF: 'server-only-proof' }
  const forgedHeaders = {
    'x-pms-owner-proof': env.PMS_INTERNAL_OWNER_PROOF,
    'x-pms-owner-authenticated': '1',
  }
  const request = (authorization) => ({ method: 'GET', headers: { ...forgedHeaders, authorization } })

  assert.equal(authorize(request(undefined), env), 401)
  assert.equal(authorize(request('Basic Zm9yZ2VkOmNyZWRlbnRpYWxz'), env), 401)
})

test('owner gate checks request Origin for writes and any supplied Origin', () => {
  const env = { OWNER_GATE_USERNAME: 'owner', OWNER_GATE_PASSWORD: 'a'.repeat(32), APP_ORIGIN: 'http://localhost:3777' }
  const authorization = `Basic ${Buffer.from(`owner:${env.OWNER_GATE_PASSWORD}`).toString('base64')}`
  const request = (method, origin) => ({ method, headers: { authorization, ...(origin ? { origin } : {}) } })

  assert.equal(authorize(request('GET'), env), 200)
  assert.equal(authorize(request('GET', 'https://attacker.example'), env), 403)
  assert.equal(authorize(request('POST'), env), 403)
  assert.equal(authorize(request('POST', 'https://attacker.example'), env), 403)
  assert.equal(authorize(request('POST', env.APP_ORIGIN), env), 200)
})
