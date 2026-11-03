import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { loader } from '../issue-sync/support.mjs'

const manifest = JSON.parse(readFileSync(new URL('../../database/migrations/manifest.json', import.meta.url), 'utf8'))
function health({ timezone = 'Asia/Bangkok', currentMigration = true, databaseFailure = false } = {}) {
  const load = loader({
    '@/database/migrations/manifest.json': { default: manifest },
    '@/lib/db': { prisma: { async $queryRaw(strings, ...values) {
      if (databaseFailure) throw new Error('private database diagnostics')
      if (strings.join('').includes('schema_migrations')) {
        const current = manifest.migrations.at(-1)
        assert.deepEqual(values, [current.version, current.checksum, manifest.revision])
        return [{ ready: currentMigration }]
      }
      return [{ timezone }]
    } } },
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
  })
  return load('app/api/health/route.ts').GET
}

test('health requires the current migration and checksum rather than just a connected baseline database', async () => {
  assert.equal((await health({ currentMigration: false })()).status, 503)
  const ready = await health()()
  assert.equal(ready.status, 200)
  assert.equal((await ready.json()).database, 'connected')
})

test('health rejects timezone drift and never returns database diagnostics', async () => {
  for (const options of [{ timezone: 'UTC' }, { databaseFailure: true }]) {
    const response = await health(options)()
    assert.equal(response.status, 503)
    const body = await response.text()
    assert.equal(body.includes('private database diagnostics'), false)
    assert.equal(JSON.parse(body).timestamp.endsWith('+07:00'), true)
  }
})
