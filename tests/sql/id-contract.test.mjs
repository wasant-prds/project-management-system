import assert from 'node:assert/strict';
import test from 'node:test';
import { BIGINT_MAX_ID, parseDecimalId, serializeDecimalId, parsePublicId, serializePublicId } from '../../scripts/sql-id.mjs';

test('public ID preserves canonical random UUIDv4 across API serialization', () => {
  const value = '0b0bbf65-7229-4f4d-a2a1-82f0e6058e83';
  assert.equal(parsePublicId(value), value);
  assert.equal(JSON.stringify({ id: serializePublicId(value) }), `{"id":"${value}"}`);
});

test('public ID rejects internal numeric IDs, legacy CUIDs and noncanonical or non-v4 UUIDs', () => {
  const valid = '0b0bbf65-7229-4f4d-a2a1-82f0e6058e83';
  for (const value of ['1', '9223372036854775807', 1, 1n, null, undefined, '', 'cuid-old',
    valid.toUpperCase(), ` ${valid}`, `${valid}\n`, '00000000-0000-0000-0000-000000000000',
    valid.replace('-4f4d-', '-1f4d-'), valid.replace('-a2a1-', '-72a1-')]) {
    assert.throws(() => parsePublicId(value), /Invalid public UUID/);
    assert.throws(() => serializePublicId(value), /Invalid public UUID/);
  }
});

test('TC-31 decimal ID accepts a canonical positive integer and preserves BIGINT max', () => {
  assert.equal(parseDecimalId('1'), 1n);
  assert.equal(parseDecimalId('9223372036854775807'), BIGINT_MAX_ID);
  assert.equal(serializeDecimalId(parseDecimalId('9223372036854775807')), '9223372036854775807');
  assert.notEqual(String(Number('9223372036854775807')), '9223372036854775807');
});

test('TC-31 decimal ID rejects noncanonical syntax, zero, sign, fraction and non-strings', () => {
  for (const value of ['0', '01', '+1', '-1', '1.0', '1e2', ' 1', '1 ', '', '1n', 1, 1n, null, undefined]) {
    assert.throws(() => parseDecimalId(value), /Invalid decimal ID/);
  }
  assert.throws(() => parseDecimalId('9223372036854775808'), /Invalid decimal ID/);
  assert.throws(() => serializeDecimalId(0n), /Invalid internal ID/);
  assert.throws(() => serializeDecimalId(1), /Invalid internal ID/);
});
