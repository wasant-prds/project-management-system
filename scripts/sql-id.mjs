// Decimal IDs are internal-only storage/tooling values; public endpoints use UUIDs.
export const BIGINT_MAX_ID = 9223372036854775807n;

const DECIMAL_ID = /^(?:[1-9][0-9]*)$/;

export function parseDecimalId(value) {
  if (typeof value !== 'string' || !DECIMAL_ID.test(value)) throw new Error('Invalid decimal ID');
  const parsed = BigInt(value);
  if (parsed > BIGINT_MAX_ID) throw new Error('Invalid decimal ID');
  return parsed;
}

export function serializeDecimalId(value) {
  if (typeof value !== 'bigint' || value < 1n || value > BIGINT_MAX_ID) throw new Error('Invalid internal ID');
  return value.toString(10);
}

const PUBLIC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function parsePublicId(value) {
  if (typeof value !== 'string' || value.length !== 36 || !PUBLIC_ID.test(value)) throw new Error('Invalid public UUID');
  return value;
}

export function serializePublicId(value) {
  return parsePublicId(value);
}
