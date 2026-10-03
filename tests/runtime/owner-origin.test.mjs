import assert from 'node:assert/strict'
import test from 'node:test'
import { authorize, ownerAccessEvent } from '../../scripts/owner-gate.mjs'

const env = { APP_ORIGIN: 'http://localhost:3777', OWNER_GATE_USERNAME: 'owner', OWNER_GATE_PASSWORD: 'synthetic-password-for-origin-unit-case' }
const authorization = `Basic ${Buffer.from(`${env.OWNER_GATE_USERNAME}:${env.OWNER_GATE_PASSWORD}`).toString('base64')}`

test('owner gate permits the theme PATCH only at the exact configured browser origin', () => {
  const request = { method: 'PATCH', headers: { authorization, origin: 'http://localhost:3777' } }
  assert.equal(authorize(request, { ...env, APP_ORIGIN: 'http://localhost:3002' }), 403)
  assert.equal(authorize(request, env), 200)
  const numericHost = { ...env, APP_ORIGIN: 'http://127.0.0.1:3777' }
  assert.equal(authorize({ ...request, headers: { authorization, origin: numericHost.APP_ORIGIN } }, numericHost), 200)
  assert.equal(authorize(request, numericHost), 403)
  for (const origin of [undefined, 'http://localhost:3002', 'http://127.0.0.1:3777', 'https://localhost:3777', 'http://attacker.example.test']) {
    assert.equal(authorize({ ...request, headers: { authorization, origin } }, env), 403)
  }
})

test('matching the browser origin never permits a theme PATCH without valid owner credentials', () => {
  for (const credentials of [undefined, 'Basic invalid', `Basic ${Buffer.from('owner:wrong').toString('base64')}`]) {
    assert.equal(authorize({ method: 'PATCH', headers: { authorization: credentials, origin: env.APP_ORIGIN } }, env), 401)
  }
})

test('owner access diagnostics distinguish missing, opaque and mismatched origin without logging credentials', () => {
  const date = new Date('2026-10-03T13:00:00.000Z')
  for (const [origin, expected] of [[undefined, 'missing'], ['null', 'opaque'], ['not-a-url', 'invalid'], ['http://localhost:3002', 'http://localhost:3002'], ['http://user:synthetic-secret@localhost:3777/private?token=synthetic-token', 'http://localhost:3777']]) {
    const event = ownerAccessEvent({ method: 'PATCH', headers: { authorization, origin } }, 403, date)
    assert.equal(event.status, 403)
    assert.equal(event.origin, expected)
    assert.equal(event.outcome, 'rejected')
    assert.equal(event.timestamp, '2026-10-03T20:00:00.000+07:00')
    assert.doesNotMatch(JSON.stringify(event), /synthetic-secret|synthetic-token|Basic|authorization|private/)
  }
})
