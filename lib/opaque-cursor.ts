import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { parseDecimalId, parsePublicId, serializeDecimalId } from '@/lib/public-id'

const VERSION = 2

export type OpaqueCursor = {
  internalId: bigint
  tieBreaker: string
}

function cursorKey(env: NodeJS.ProcessEnv) {
  const secret = env.PMS_CURSOR_SECRET ?? env.PMS_INTERNAL_OWNER_PROOF
  if (!secret) return null
  return createHash('sha256').update(`pms-cursor-v2:${secret}`).digest()
}

export function encodeOpaqueCursor(
  payload: { ownerPublicId: string; filterHash: string; internalId: bigint; tieBreaker: string },
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  if (!parsePublicId(payload.ownerPublicId) || payload.filterHash.length === 0) return null
  const key = cursorKey(env)
  if (!key) return null
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.from(JSON.stringify({
    v: VERSION,
    owner: payload.ownerPublicId,
    filter: payload.filterHash,
    id: serializeDecimalId(payload.internalId),
    tie: payload.tieBreaker,
  }), 'utf8')
  const encrypted = Buffer.concat([cipher.update(body), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([Buffer.from([VERSION]), iv, tag, encrypted]).toString('base64url')
}

function readPayload(value: unknown): { owner: string; filter: string; id: string; tie: string } | null {
  if (typeof value !== 'object' || value === null) return null
  if (!('v' in value) || value.v !== VERSION) return null
  const owner = parsePublicId('owner' in value ? value.owner : null)
  const filter = 'filter' in value && typeof value.filter === 'string' ? value.filter : ''
  const id = 'id' in value && typeof value.id === 'string' ? value.id : ''
  const tie = 'tie' in value && typeof value.tie === 'string' ? value.tie : ''
  if (!owner || filter.length === 0 || id.length === 0 || tie.length === 0) return null
  return { owner, filter, id, tie }
}

export function decodeOpaqueCursor(
  token: string,
  expected: { ownerPublicId: string; filterHash: string },
  env: NodeJS.ProcessEnv = process.env,
): OpaqueCursor | null {
  if (!parsePublicId(expected.ownerPublicId)) return null
  const key = cursorKey(env)
  if (!key) return null
  try {
    const bytes = Buffer.from(token, 'base64url')
    if (bytes.length < 1 + 12 + 16 + 1 || bytes[0] !== VERSION) return null
    const iv = bytes.subarray(1, 13)
    const tag = bytes.subarray(13, 29)
    const encrypted = bytes.subarray(29)
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    const json = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8')
    const payload = readPayload(JSON.parse(json) as unknown)
    if (!payload || payload.owner !== expected.ownerPublicId || payload.filter !== expected.filterHash) return null
    return { internalId: parseDecimalId(payload.id), tieBreaker: payload.tie }
  } catch {
    return null
  }
}
