import test from 'node:test'
import assert from 'node:assert/strict'
import { moduleLoader } from '../support/module-loader.mjs'
const loadTs = (path, mocks = {}, globals = {}) => moduleLoader(mocks, globals)(path.replace(/^\.\.\/\.\.\//, ''))
const OWNER = '11111111-1111-4111-8111-111111111111'
const publicId = loadTs('../../lib/public-id.ts')
const legacy = loadTs('../../lib/legacy-identity.ts')
const cursor = loadTs('../../lib/opaque-cursor.ts')

test('TC-33-01 rejects numeric, CUID, uppercase, and non-v4 public references', () => {
  assert.equal(publicId.parsePublicId(OWNER), OWNER)
  assert.equal(publicId.parsePublicId('7'), null)
  assert.equal(publicId.parsePublicId('cm8legacycuidvalue0001'), null)
  assert.equal(publicId.parsePublicId('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'.toUpperCase()), null)
  assert.equal(publicId.parsePublicId('11111111-1111-1111-8111-111111111111'), null)
  assert.equal(publicId.classifyReference('7').kind, 'rejected')
  assert.equal(publicId.classifyReference(' legacy ').kind, 'rejected')
  assert.equal(publicId.classifyReference('cm8legacycuidvalue0001').kind, 'legacy')
})

test('TC-33-02 round-trips the signed BIGINT maximum and rejects zero', () => {
  const max = publicId.BIGINT_MAX_ID
  assert.equal(publicId.serializeDecimalId(max), '9223372036854775807')
  assert.equal(publicId.parseDecimalId('9223372036854775807'), max)
  assert.throws(() => publicId.serializeDecimalId(0n), /Invalid internal ID/)
  assert.throws(() => publicId.parseDecimalId('9223372036854775808'), /Invalid decimal ID/)
})

test('TC-33-04 keeps seed mappings and numeric owner selectors out of live identity', () => {
  assert.equal(legacy.classifyOwnerSelector(undefined).kind, 'unset')
  assert.equal(legacy.classifyOwnerSelector(OWNER).kind, 'public')
  assert.equal(legacy.classifyOwnerSelector('1').kind, 'rejected')
  assert.throws(() => legacy.validateLiveIdentity({
    entityName: 'users', sourceScope: 'seed', sourceChecksum: 'a'.repeat(64), targetRevision: '31.0.0',
    oldId: 'old', createdAt: '2026-10-04T10:00:00.000', newId: '7', newPublicId: OWNER,
  }), /Seed mapping cannot authorize/)
  const live = legacy.validateLiveIdentity({
    entityName: 'users', sourceScope: 'live', sourceChecksum: 'a'.repeat(64), targetRevision: '31.0.0',
    oldId: 'old', createdAt: '2026-10-04T10:00:00.000', newId: '7', newPublicId: OWNER,
  })
  assert.equal(legacy.resolveLivePublicId('users', 'old', [live]), OWNER)
  assert.equal(legacy.resolveLivePublicId('users', 'old', [{ ...live, sourceScope: 'seed' }]), null)
})

test('TC-33-08 hides the internal key inside an opaque cursor and fails closed', () => {
  const env = { PMS_CURSOR_SECRET: 'identity-boundary-secret' }
  const token = cursor.encodeOpaqueCursor({
    ownerPublicId: OWNER, filterHash: 'year=all', internalId: 7n, tieBreaker: OWNER,
  }, env)
  assert.equal(typeof token, 'string')
  assert.equal(token.includes(OWNER), false)
  assert.equal(token.includes('"id"'), false)
  assert.equal(cursor.decodeOpaqueCursor(token, { ownerPublicId: OWNER, filterHash: 'year=all' }, env).internalId, 7n)
  assert.equal(cursor.decodeOpaqueCursor(token, { ownerPublicId: OWNER, filterHash: 'other' }, env), null)
  assert.equal(cursor.decodeOpaqueCursor(Buffer.from('{"v":1,"id":"7"}').toString('base64url'), { ownerPublicId: OWNER, filterHash: 'year=all' }, env), null)
  assert.equal(cursor.encodeOpaqueCursor({
    ownerPublicId: OWNER, filterHash: 'year=all', internalId: 7n, tieBreaker: OWNER,
  }, {}), null)
})
