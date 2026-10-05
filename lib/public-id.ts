// Public identifiers are canonical lowercase UUIDv4 strings.
// Decimal helpers are for restricted tooling and must not accept API input.

export const BIGINT_MAX_ID = BigInt('9223372036854775807')

const DECIMAL_ID = /^(?:[1-9][0-9]*)$/
const PUBLIC_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export function parsePublicId(value: unknown): string | null {
  if (typeof value !== 'string' || value.length !== 36 || !PUBLIC_ID.test(value)) return null
  return value
}

export function parseDecimalId(value: string): bigint {
  if (!DECIMAL_ID.test(value)) throw new Error('Invalid decimal ID')
  const parsed = BigInt(value)
  if (parsed > BIGINT_MAX_ID) throw new Error('Invalid decimal ID')
  return parsed
}

export function serializeDecimalId(value: bigint): string {
  if (typeof value !== 'bigint' || value < BigInt(1) || value > BIGINT_MAX_ID) throw new Error('Invalid internal ID')
  return value.toString(10)
}

export type ReferenceClass =
  | { kind: 'public'; publicId: string }
  | { kind: 'legacy'; oldId: string }
  | { kind: 'rejected' }

export function classifyReference(value: unknown): ReferenceClass {
  if (typeof value !== 'string') return { kind: 'rejected' }
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed !== value) return { kind: 'rejected' }
  const publicId = parsePublicId(trimmed)
  if (publicId) return { kind: 'public', publicId }
  if (DECIMAL_ID.test(trimmed)) return { kind: 'rejected' }
  if (trimmed.length > 256 || /[\n\r\u0000]/.test(trimmed)) return { kind: 'rejected' }
  return { kind: 'legacy', oldId: trimmed }
}
