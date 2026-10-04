import assert from 'node:assert/strict';
import test from 'node:test';
import { isSameLegacyIdentity, legacyMappingKey, sortLegacyMappings, validateLegacyMapping } from '../../scripts/sql-legacy-id.mjs';

const checksum = 'a'.repeat(64);
const otherChecksum = 'b'.repeat(64);

function mapping(overrides = {}) {
  return {
    entityName: 'Company',
    sourceScope: 'seed',
    sourceChecksum: checksum,
    targetRevision: '31.0.0',
    oldId: 'cuid-old',
    createdAt: '2026-09-26T18:35:40.000',
    newId: '10',
    newPublicId: '0b0bbf65-7229-4f4d-a2a1-82f0e6058e83',
    ...overrides,
  };
}

test('TC-31 legacy mapping sorts by createdAt then old ID without locale rules', () => {
  const sorted = sortLegacyMappings([
    mapping({ oldId: 'b', createdAt: '2026-09-26T18:35:40.000', newId: '3' }),
    mapping({ oldId: 'a', createdAt: '2026-09-26T18:35:40.000', newId: '2' }),
    mapping({ oldId: 'z', createdAt: '2026-09-26T18:35:39.000', newId: '1' }),
  ]);
  assert.deepEqual(sorted.map((record) => record.oldId), ['z', 'a', 'b']);
  assert.equal(sorted[0].newId, '1');
});

test('legacy mappings retain both identifiers and reject missing or numeric public identity', () => {
  const record = validateLegacyMapping(mapping());
  assert.equal(record.newId, '10');
  assert.equal(record.newPublicId, '0b0bbf65-7229-4f4d-a2a1-82f0e6058e83');
  assert.deepEqual(validateLegacyMapping(record), record);
  for (const newPublicId of [undefined, '10', 'cuid-old']) {
    assert.throws(() => validateLegacyMapping(mapping({ newPublicId })), /Invalid public UUID/);
  }
});

test('TC-31 legacy mapping keeps seed and live identities distinct', () => {
  const seed = validateLegacyMapping(mapping());
  const live = validateLegacyMapping(mapping({ sourceScope: 'live', sourceChecksum: otherChecksum, newId: '99' }));
  assert.equal(isSameLegacyIdentity(seed, live), false);
  assert.notEqual(legacyMappingKey(seed), legacyMappingKey(live));
  assert.equal(seed.newId, '10');
  assert.equal(live.newId, '99');
});

test('TC-31 legacy mapping rejects missing provenance, bad scope and noncanonical IDs', () => {
  for (const overrides of [
    { sourceScope: 'production' },
    { sourceChecksum: 'abc' },
    { createdAt: '2026-09-26' },
    { oldId: ' has space' },
    { entityName: 'work items' },
  ]) {
    assert.throws(() => validateLegacyMapping(mapping(overrides)), /Invalid legacy mapping/);
  }
  for (const newId of ['01', '1.5', '0']) {
    assert.throws(() => validateLegacyMapping(mapping({ newId })), /Invalid decimal ID/);
  }
});
