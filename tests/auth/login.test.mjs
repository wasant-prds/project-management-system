import assert from 'node:assert/strict'
import test from 'node:test'
import http from 'node:http'
import { once } from 'node:events'
import { createOwnerGate, safeLoginDestination } from '../../scripts/owner-gate.mjs'

async function listen(server) {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return server.address().port
}

async function setup(t, secure = false) {
  const forwarded = []
  const events = []
  const backend = http.createServer((request, response) => {
    forwarded.push({ path: request.url, headers: request.headers })
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ ok: true }))
  })
  const upstreamPort = await listen(backend)
  const env = { APP_ORIGIN: `${secure ? 'https' : 'http'}://workspace.example.test`, OWNER_GATE_USERNAME: 'owner', OWNER_GATE_PASSWORD: 'synthetic-login-password-over-32-characters', PMS_INTERNAL_OWNER_PROOF: 'synthetic-proof' }
  let timestamp = Date.now()
  const gate = createOwnerGate(env, upstreamPort, { audit: (event) => events.push(event), now: () => new Date(timestamp) })
  const base = `http://127.0.0.1:${await listen(gate)}`
  t.after(() => { for (const server of [gate, backend]) { server.closeAllConnections(); server.close() } })
  const login = (body = {}, headers = {}) => fetch(base + '/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: env.APP_ORIGIN, ...headers },
    body: JSON.stringify({ username: env.OWNER_GATE_USERNAME, password: env.OWNER_GATE_PASSWORD, ...body }),
  })
  return { base, env, login, forwarded, events, advance: (ms) => { timestamp += ms } }
}

test('browser login sets an opaque HttpOnly session and preserves the requested page without forwarding secrets', async (t) => {
  const { base, env, login, forwarded, events } = await setup(t)
  const denied = await fetch(base + '/projects?status=active', { redirect: 'manual' })
  assert.equal(denied.status, 307)
  assert.equal(denied.headers.get('location'), '/login?next=%2Fprojects%3Fstatus%3Dactive')
  assert.equal(denied.headers.get('www-authenticate'), null)
  const response = await login({ next: '/projects?status=active' })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { redirectTo: '/projects?status=active' })
  const cookie = response.headers.get('set-cookie')
  assert.match(cookie, /^pms_owner_session=[a-f0-9]{64}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=28800$/)
  assert.doesNotMatch(cookie, /synthetic|owner:/)
  const accepted = await fetch(base + '/api/projects', { headers: { Cookie: cookie.split(';')[0] + '; preference=test', 'x-pms-owner-proof': 'forged', 'x-pms-owner-authenticated': '1' } })
  assert.equal(accepted.status, 200)
  const headers = forwarded.at(-1).headers
  assert.equal(headers['x-pms-owner-proof'], env.PMS_INTERNAL_OWNER_PROOF)
  assert.equal(headers['x-pms-owner-authenticated'], undefined)
  assert.equal(headers.authorization, undefined)
  assert.equal(headers.cookie, 'preference=test')
  assert.doesNotMatch(JSON.stringify(events), /synthetic|password|pms_owner_session/)
  const alreadySignedIn = await fetch(base + '/login?next=%2Fboard', { headers: { Cookie: cookie.split(';')[0] }, redirect: 'manual' })
  assert.equal(alreadySignedIn.status, 303)
  assert.equal(alreadySignedIn.headers.get('location'), '/board')
})

test('public login/static files never forward a forged owner proof; other public paths stay protected', async (t) => {
  const { base, forwarded } = await setup(t)
  for (const path of ['/login', '/_next/static/chunks/app/login/page.js', '/_next/static/media/font.woff2', '/favicon.ico', '/icon.svg?v=test']) {
    const response = await fetch(base + path, { headers: { 'x-pms-owner-proof': 'synthetic-proof', 'x-pms-owner-authenticated': '1', 'x-middleware-subrequest': 'middleware' } })
    assert.equal(response.status, 200)
    for (const key of ['x-pms-owner-proof', 'x-pms-owner-authenticated', 'x-middleware-subrequest']) assert.equal(forwarded.at(-1).headers[key], undefined)
  }
  const count = forwarded.length
  for (const path of ['/login/anything', '/api/auth/login/anything', '/_next/image?url=private']) {
    const response = await fetch(base + path, { redirect: 'manual' })
    assert.ok([401, 307].includes(response.status))
  }
  assert.equal(forwarded.length, count)
  assert.equal((await fetch(base + '/login', { method: 'POST' })).status, 401)
})

test('invalid credentials, tampered cookies, malformed bodies and cross-origin login cannot authenticate', async (t) => {
  const { base, env, login, forwarded } = await setup(t)
  for (const body of [{ username: 'other' }, { password: 'wrong' }]) {
    const response = await login(body)
    assert.equal(response.status, 401)
    assert.equal(response.headers.get('set-cookie'), null)
    assert.equal(response.headers.get('www-authenticate'), null)
  }
  for (const body of [{ username: [] }, { password: null }, { username: 'owner:wrong' }, { password: 'x'.repeat(9000) }]) assert.equal((await login(body)).status, 400)
  for (const origin of ['', 'https://attacker.example.test', 'null']) assert.equal((await login({}, { Origin: origin })).status, 403)
  assert.equal((await login({}, { 'Content-Type': 'text/plain' })).status, 400)
  assert.equal((await fetch(base + '/api/auth/login')).status, 405)
  assert.equal((await fetch(base + '/api/projects', { headers: { Cookie: 'pms_owner_session=' + '0'.repeat(64), Origin: env.APP_ORIGIN } })).status, 401)
  assert.equal(forwarded.length, 0)
})

test('sessions enforce origin policy, expire and are revoked on logout and replacement', async (t) => {
  const { base, env, login, advance } = await setup(t)
  const first = await login()
  const cookie = first.headers.get('set-cookie').split(';')[0]
  for (const origin of [undefined, 'https://attacker.example.test']) {
    const response = await fetch(base + '/api/projects', { method: 'PATCH', headers: { Cookie: cookie, ...(origin ? { Origin: origin } : {}) } })
    assert.equal(response.status, 403)
  }
  assert.equal((await fetch(base + '/api/projects', { method: 'PATCH', headers: { Cookie: cookie, Origin: env.APP_ORIGIN } })).status, 200)
  assert.equal((await fetch(base + '/api/auth/logout', { headers: { Cookie: cookie } })).status, 405)
  assert.equal((await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: cookie } })).status, 403)
  const second = await login({}, { Cookie: cookie })
  const newCookie = second.headers.get('set-cookie').split(';')[0]
  assert.notEqual(cookie, newCookie)
  assert.equal((await fetch(base + '/api/projects', { headers: { Cookie: cookie } })).status, 401)
  const logout = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { Cookie: newCookie, Origin: env.APP_ORIGIN } })
  assert.equal(logout.status, 200)
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/)
  assert.equal((await fetch(base + '/api/projects', { headers: { Cookie: newCookie } })).status, 401)
  const expiring = (await login()).headers.get('set-cookie').split(';')[0]
  advance(8 * 60 * 60 * 1000)
  assert.equal((await fetch(base + '/api/projects', { headers: { Cookie: expiring } })).status, 401)
})

test('cached browser Basic credentials cannot restore access after logout or session expiry', async (t) => {
  const { base, env, login, advance } = await setup(t)
  const authorization = `Basic ${Buffer.from(`${env.OWNER_GATE_USERNAME}:${env.OWNER_GATE_PASSWORD}`).toString('base64')}`
  const browserHeaders = { Authorization: authorization, 'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-Dest': 'empty', 'Sec-Fetch-Mode': 'cors' }
  const navigationHeaders = { ...browserHeaders, Accept: 'text/html', 'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate' }
  const response = await login()
  const cookie = response.headers.get('set-cookie').split(';')[0]
  assert.equal((await fetch(base + '/api/projects', { headers: { ...browserHeaders, Cookie: cookie } })).status, 200)
  const logout = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { ...browserHeaders, Cookie: cookie, Origin: env.APP_ORIGIN } })
  assert.equal(logout.status, 200)
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/)

  // The browser keeps sending its old Authorization header after the cookie is cleared.
  for (const retainedCookie of [undefined, cookie]) {
    const headers = { ...navigationHeaders, ...(retainedCookie ? { Cookie: retainedCookie } : {}) }
    const loginPage = await fetch(base + '/login', { headers, redirect: 'manual' })
    assert.equal(loginPage.status, 200)
    assert.equal(loginPage.headers.get('location'), null)
    const privatePage = await fetch(base + '/projects', { headers, redirect: 'manual' })
    assert.equal(privatePage.status, 307)
    assert.equal(privatePage.headers.get('location'), '/login?next=%2Fprojects')
    assert.equal((await fetch(base + '/api/projects', { headers: { ...browserHeaders, ...(retainedCookie ? { Cookie: retainedCookie } : {}) } })).status, 401)
  }

  const signedInAgain = await login({}, { Authorization: authorization })
  const newCookie = signedInAgain.headers.get('set-cookie').split(';')[0]
  assert.equal((await fetch(base + '/api/projects', { headers: { ...browserHeaders, Cookie: newCookie } })).status, 200)
  advance(8 * 60 * 60 * 1000)
  assert.equal((await fetch(base + '/api/projects', { headers: { ...browserHeaders, Cookie: newCookie } })).status, 401)
  assert.equal((await fetch(base + '/login', { headers: { ...navigationHeaders, Cookie: newCookie }, redirect: 'manual' })).status, 200)

  // Metadata signals are independently sufficient; HTML requests also cover
  // browsers/proxies that omit Fetch Metadata headers on navigations.
  // WebSocket upgrades must not restore access using cached Basic either.
  for (const requestHeaders of [
    { 'Sec-Fetch-Site': 'same-origin' },
    { 'Sec-Fetch-Dest': 'empty' },
    { 'Sec-Fetch-Mode': 'navigate' },
    { Accept: 'text/html,application/xhtml+xml' },
    { Connection: 'Upgrade', Upgrade: 'websocket', Origin: env.APP_ORIGIN },
  ]) {
    // Use raw HTTP here: Node fetch overwrites Sec-Fetch-Mode with "cors".
    const status = await new Promise((resolve, reject) => {
      const request = http.get(base + '/api/projects', { headers: { Authorization: authorization, ...requestHeaders } }, (response) => {
        response.resume()
        response.on('end', () => resolve(response.statusCode))
      })
      request.on('error', reject)
    })
    assert.equal(status, 401)
  }

  // Explicit Basic authentication remains available to non-browser HTTP API clients.
  assert.equal((await fetch(base + '/api/projects', { headers: { Authorization: authorization } })).status, 200)
  assert.equal((await fetch(base + '/login', { headers: { Authorization: authorization }, redirect: 'manual' })).status, 200)
})

test('HTTPS sessions require Secure and login retries are bounded without trusting forwarded IP headers', async (t) => {
  const { login, advance } = await setup(t, true)
  assert.match((await login()).headers.get('set-cookie'), /; Secure$/)
  for (let i = 0; i < 10; i++) assert.equal((await login({ password: 'wrong' }, { 'X-Forwarded-For': `192.0.2.${i}` })).status, 401)
  const limited = await login()
  assert.equal(limited.status, 429)
  assert.equal(limited.headers.get('retry-after'), '60')
  advance(60_000)
  assert.equal((await login()).status, 200)
})

test('login destinations only allow internal workspace pages', () => {
  const origin = 'https://workspace.example.test'
  for (const value of [null, '', 'https://attacker.example', '//attacker.example', '/\\attacker.example', '/%2f%2fattacker.example', '/\n/attacker.example', '/login', '/login?next=/login', '/api/projects', '/_next/static/a', '/projects/../login']) assert.equal(safeLoginDestination(value, origin), '/')
  assert.equal(safeLoginDestination('/projects?status=active', origin), '/projects?status=active')
  assert.equal(safeLoginDestination('/board', origin), '/board')
})
