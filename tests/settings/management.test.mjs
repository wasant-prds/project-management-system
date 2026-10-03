import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import vm from 'node:vm'

const require = createRequire(import.meta.url)
const typescript = require('typescript')

function loadTypeScript(path, mocks) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8')
  const output = typescript.transpileModule(source, {
    compilerOptions: { module: typescript.ModuleKind.CommonJS, target: typescript.ScriptTarget.ES2022 },
  }).outputText
  const loadedModule = { exports: {} }
  vm.runInNewContext(output, {
    module: loadedModule,
    exports: loadedModule.exports,
    require: (name) => {
      if (Object.hasOwn(mocks, name)) return mocks[name]
      throw new Error(`Unexpected import: ${name}`)
    },
    URL,
    console: { error() {} },
  }, { filename: path })
  return loadedModule.exports
}

function makeSettingsUser(overrides = {}) {
  return {
    id: 'owner-1',
    name: 'Owner',
    email: 'owner@example.test',
    phone: null,
    avatar: null,
    theme: 'light',
    locale: 'th',
    password: 'never-return-this',
    ...overrides,
  }
}

function makeHarness(options = {}) {
  const user = options.user ?? makeSettingsUser()
  const calls = { reads: [], writes: [] }
  const database = {
    user: {
      findUnique: async (query) => {
        calls.reads.push(query)
        if (options.readFailure) throw options.readFailure
        return query.where.id === user.id ? { ...user } : null
      },
      update: async (query) => {
        calls.writes.push(query)
        if (options.writeFailure) throw options.writeFailure
        if (query.where.id !== user.id) throw { code: 'P2025' }
        if (query.data.email && query.data.email !== user.email && options.duplicateEmail) {
          throw { code: 'P2002', message: 'private unique failure details' }
        }
        Object.assign(user, query.data)
        return { ...user }
      },
    },
  }
  const input = loadTypeScript('../../lib/settings-input.ts', {})
  const service = loadTypeScript('../../lib/settings.ts', {
    '@/lib/db': { prisma: database },
    '@/lib/settings-input': input,
  })
  const response = {
    json: (body, init = {}) => ({ status: init.status ?? 200, headers: init.headers ?? {}, body }),
  }
  const owner = {
    getOwner: async () => {
      if (options.ownerFailure) throw options.ownerFailure
      return { id: options.ownerId ?? 'owner-1' }
    },
    ownerErrorResponse: (error) => error?.status === 401
      ? response.json({ error: { code: 'OWNER_UNAUTHENTICATED', message: 'กรุณายืนยันตัวตนเจ้าของระบบ' } }, { status: 401 })
      : null,
  }
  const route = loadTypeScript('../../app/api/settings/me/route.ts', {
    'next/server': { NextResponse: response },
    '@/lib/owner': owner,
    '@/lib/settings': service,
    '@/lib/settings-input': input,
  })
  return { route, calls, user }
}

function request(body) {
  return { json: async () => body }
}

function settingsBody(response) {
  return JSON.parse(JSON.stringify(response.body))
}

test('settings parser accepts supported owner profile and preference fields', () => {
  const { parseOwnerSettingsPatch } = loadTypeScript('../../lib/settings-input.ts', {})
  const parsed = parseOwnerSettingsPatch({
    profile: { name: '  Wasant  ', email: 'owner@example.test', phone: ' 123 ', avatar: 'https://images.example.test/avatar.png' },
    preferences: { theme: 'special-dark', locale: 'en' },
  })

  assert.equal(parsed.error, undefined)
  assert.deepEqual(JSON.parse(JSON.stringify(parsed.data)), {
    profile: { name: 'Wasant', email: 'owner@example.test', phone: '123', avatar: 'https://images.example.test/avatar.png' },
    preferences: { theme: 'special-dark', locale: 'en' },
  })
})

test('settings parser rejects empty, invalid, unknown, security, notification, and timezone fields', () => {
  const { parseOwnerSettingsPatch } = loadTypeScript('../../lib/settings-input.ts', {})
  for (const invalid of [
    {},
    { userId: 'other-user', profile: { name: 'Owner' } },
    { profile: { name: '   ' } },
    { profile: { email: 'not-an-email' } },
    { profile: { email: `${'a'.repeat(123)}@@${'b'.repeat(127)}` } },
    { profile: { bio: 'not persisted' } },
    { profile: { phone: 123 } },
    { profile: { avatar: 'javascript:alert(1)' } },
    { preferences: { theme: 'system' } },
    { preferences: { locale: 'fr' } },
    { preferences: { timezone: 'UTC' } },
    { preferences: { emailNotifications: true } },
    { preferences: { twoFactorEnabled: true } },
  ]) {
    assert.ok(parseOwnerSettingsPatch(invalid).error, `Expected rejection for ${JSON.stringify(invalid)}`)
  }
})

test('GET returns only the authenticated owner profile, persisted preferences, and fixed timezone', async () => {
  const { route, calls } = makeHarness({ user: makeSettingsUser({ theme: 'dark', locale: 'en' }) })
  const response = await route.GET()

  assert.equal(response.status, 200)
  assert.equal(response.headers['Cache-Control'], 'no-store')
  assert.deepEqual(settingsBody(response), {
    profile: { name: 'Owner', email: 'owner@example.test', phone: null, avatar: null },
    preferences: { theme: 'dark', locale: 'en', timezone: 'Asia/Bangkok' },
  })
  assert.deepEqual(JSON.parse(JSON.stringify(calls.reads[0].where)), { id: 'owner-1' })
  assert.equal(JSON.stringify(response.body).includes('never-return-this'), false)
})

test('GET applies safe theme and locale defaults and always returns the fixed system timezone', async () => {
  const { route } = makeHarness({ user: makeSettingsUser({ theme: undefined, locale: undefined }) })
  const response = await route.GET()

  assert.equal(response.status, 200)
  assert.deepEqual(settingsBody(response).preferences, {
    theme: 'light',
    locale: 'th',
    timezone: 'Asia/Bangkok',
  })
})

test('PATCH persists profile and preferences for server-resolved owner and GET returns them after reload', async () => {
  const { route, calls, user } = makeHarness()
  const saved = await route.PATCH(request({
    profile: { name: 'New Owner', email: 'new@example.test', phone: '+66 80 000 0000' },
    preferences: { theme: 'special-dark', locale: 'en' },
  }))

  assert.equal(saved.status, 200)
  assert.equal(calls.writes.length, 1)
  assert.deepEqual(JSON.parse(JSON.stringify(calls.writes[0].where)), { id: 'owner-1' })
  assert.deepEqual(JSON.parse(JSON.stringify(calls.writes[0].data)), {
    name: 'New Owner',
    email: 'new@example.test',
    phone: '+66 80 000 0000',
    theme: 'special_dark',
    locale: 'en',
  })

  const afterReload = await route.GET()
  assert.equal(user.name, 'New Owner')
  assert.deepEqual(settingsBody(afterReload), {
    profile: { name: 'New Owner', email: 'new@example.test', phone: '+66 80 000 0000', avatar: null },
    preferences: { theme: 'special-dark', locale: 'en', timezone: 'Asia/Bangkok' },
  })
})

test('PATCH rejects unsupported settings and invalid profile values before writing', async () => {
  const { route, calls } = makeHarness()
  const invalidBodies = [
    { userId: 'other-user', profile: { name: 'Spoofed' } },
    { profile: { name: '' } },
    { profile: { email: 'bad' } },
    { preferences: { timezone: 'UTC' } },
    { preferences: { twoFactorEnabled: true } },
  ]

  for (const body of invalidBodies) {
    const response = await route.PATCH(request(body))
    assert.equal(response.status, 400)
    assert.equal(response.body.error.code, 'VALIDATION_ERROR')
  }
  assert.equal(calls.writes.length, 0)
})

test('PATCH reports unique email conflicts without exposing database details', async () => {
  const { route, calls, user } = makeHarness({ duplicateEmail: true })
  const response = await route.PATCH(request({ profile: { email: 'used@example.test' } }))

  assert.equal(response.status, 409)
  assert.equal(response.body.error.code, 'CONFLICT')
  assert.equal(response.body.error.field, 'email')
  assert.equal(JSON.stringify(response.body).includes('private unique failure details'), false)
  assert.equal(calls.writes.length, 1)
  assert.equal(user.email, 'owner@example.test')
})

test('settings routes require owner authentication before reading or writing', async () => {
  const { route, calls } = makeHarness({ ownerFailure: Object.assign(new Error('denied'), { status: 401 }) })
  const read = await route.GET()
  const write = await route.PATCH(request({ profile: { name: 'Blocked' } }))

  assert.equal(read.status, 401)
  assert.equal(write.status, 401)
  assert.equal(calls.reads.length, 0)
  assert.equal(calls.writes.length, 0)
})

test('settings returns not found and dependency errors as safe API envelopes', async () => {
  const missing = makeHarness({ ownerId: 'missing-owner' })
  const missingResponse = await missing.route.GET()
  assert.equal(missingResponse.status, 404)
  assert.equal(missingResponse.body.error.code, 'NOT_FOUND')
  const missingWriteResponse = await missing.route.PATCH(request({ profile: { name: 'Owner' } }))
  assert.equal(missingWriteResponse.status, 404)
  assert.equal(missingWriteResponse.body.error.code, 'NOT_FOUND')

  const unavailable = makeHarness({ readFailure: { code: 'P1001', message: 'private database endpoint' } })
  const unavailableResponse = await unavailable.route.GET()
  assert.equal(unavailableResponse.status, 503)
  assert.equal(unavailableResponse.body.error.code, 'DEPENDENCY_UNAVAILABLE')
  assert.equal(JSON.stringify(unavailableResponse.body).includes('private database endpoint'), false)
})

test('PATCH malformed JSON and unexpected database failures return safe errors', async () => {
  const harness = makeHarness()
  const malformed = await harness.route.PATCH({ json: async () => { throw new SyntaxError('invalid json') } })
  assert.equal(malformed.status, 400)
  assert.equal(malformed.body.error.code, 'VALIDATION_ERROR')

  const failure = makeHarness({ writeFailure: new Error('sensitive query and connection data') })
  const failedWrite = await failure.route.PATCH(request({ preferences: { theme: 'dark' } }))
  assert.equal(failedWrite.status, 500)
  assert.equal(failedWrite.body.error.code, 'INTERNAL_ERROR')
  assert.equal(JSON.stringify(failedWrite.body).includes('sensitive query'), false)
})
