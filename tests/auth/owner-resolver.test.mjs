import test from 'node:test'
import assert from 'node:assert/strict'
import { moduleLoader } from '../support/module-loader.mjs'
const publicId = '11111111-1111-4111-8111-111111111111'
const user = {
  id: 7n,
  publicId,
  name: 'Owner',
  email: 'owner@example.test',
  avatar: null,
  role: 'member',
  status: 'Active',
}
function harness({ proof = 'proof', flag = '1', selector, rows = [user], row = user } = {}) {
  const calls = []
  const load = moduleLoader(
    {
      'next/headers': {
        headers: async () => new Headers({ 'x-pms-owner-authenticated': flag, 'x-pms-owner-proof': proof }),
      },
      '@/lib/database/repositories/users': {
        users: {
          ownerCandidates: async () => {
            calls.push('candidates')
            return rows
          },
          byPublicId: async (id) => {
            calls.push(id)
            return row
          },
        },
      },
    },
    { process: { env: { PMS_INTERNAL_OWNER_PROOF: 'proof', OWNER_USER_ID: selector }, cwd: process.cwd } },
  )
  return { ...load('lib/owner.ts'), calls }
}
for (const proof of ['', 'forged', 'shorter'])
  test(`owner rejects invalid proof: ${proof || 'missing'}`, async () => {
    const app = harness({ proof })
    await assert.rejects(app.getOwner(), (error) => app.ownerErrorResponse(error).status === 401)
    assert.equal(app.calls.length, 0)
  })
test('owner rejects a missing authenticated flag before querying rows', async () => {
  const app = harness({ flag: '0' })
  await assert.rejects(app.getOwner(), /Owner access required/)
  assert.equal(app.calls.length, 0)
})
for (const rows of [[], [user, { ...user, id: 8n }]])
  test(`owner requires exactly one candidate when selector is absent: ${rows.length}`, async () => {
    const app = harness({ rows })
    await assert.rejects(app.getOwner(), (error) => app.ownerErrorResponse(error).status === 503)
  })
test('owner resolves the reviewed public UUID and retains internal BIGINT only on the server', async () => {
  const app = harness({ selector: publicId }),
    result = await app.getOwner()
  assert.deepEqual(app.calls, [publicId])
  assert.equal(result.internalId, 7n)
  assert.equal(result.id, publicId)
  assert.equal('internalId' in app.ownerProfile(result), false)
})
test('owner numeric selectors and mismatched UUID results fail closed', async () => {
  for (const options of [
    { selector: '7' },
    { selector: publicId, row: null },
    { selector: publicId, row: { ...user, publicId: '22222222-2222-4222-8222-222222222222' } },
  ]) {
    const app = harness(options)
    await assert.rejects(app.getOwner(), (error) => app.ownerErrorResponse(error).status === 503)
  }
})
test('owner errors never expose internal diagnostics', async () => {
  const app = harness()
  for (const status of [401, 503]) {
    const response = app.ownerErrorResponse(
      new app.OwnerUnavailableError('sensitive database diagnostics', status),
    )
    assert.equal(response.status, status)
    assert.doesNotMatch(JSON.stringify(await response.json()), /sensitive/)
  }
})
