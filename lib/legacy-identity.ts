import { readFileSync } from 'node:fs'
import { parseDecimalId, parsePublicId, serializeDecimalId } from '@/lib/public-id'

export type LiveIdentityRecord = {
  entityName: string
  sourceScope: 'live'
  sourceChecksum: string
  targetRevision: string
  oldId: string
  createdAt: string
  newId: string
  newPublicId: string
}

const CHECKSUM = /^[0-9a-f]{64}$/
const ENTITY_NAME = /^[A-Za-z][A-Za-z0-9_]{0,62}$/
const REVISION = /^[A-Za-z0-9._-]{1,64}$/
const CREATED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/

export function validateLiveIdentity(value: unknown): LiveIdentityRecord {
  if (!value || typeof value !== 'object') throw new Error('Invalid live identity mapping')
  const record = value as Record<string, unknown>
  if (record.sourceScope !== 'live') throw new Error('Seed mapping cannot authorize a live identity')
  if (typeof record.entityName !== 'string' || !ENTITY_NAME.test(record.entityName)) throw new Error('Invalid live identity entity')
  if (typeof record.sourceChecksum !== 'string' || !CHECKSUM.test(record.sourceChecksum)) throw new Error('Invalid live identity checksum')
  if (typeof record.targetRevision !== 'string' || !REVISION.test(record.targetRevision)) throw new Error('Invalid live identity revision')
  if (typeof record.oldId !== 'string' || record.oldId.length < 1 || record.oldId.length > 256) throw new Error('Invalid live identity id')
  if (typeof record.createdAt !== 'string' || !CREATED_AT.test(record.createdAt)) throw new Error('Invalid live identity timestamp')
  if (typeof record.newPublicId !== 'string' || !parsePublicId(record.newPublicId)) throw new Error('Invalid live identity public id')
  if (typeof record.newId !== 'string') throw new Error('Invalid live identity numeric id')
  return {
    entityName: record.entityName,
    sourceScope: 'live',
    sourceChecksum: record.sourceChecksum,
    targetRevision: record.targetRevision,
    oldId: record.oldId,
    createdAt: record.createdAt,
    newId: serializeDecimalId(parseDecimalId(record.newId)),
    newPublicId: record.newPublicId,
  }
}

export function resolveLivePublicId(entityName: string, oldId: string, records: readonly unknown[]): string | null {
  const matches: LiveIdentityRecord[] = []
  for (const record of records) {
    let valid: LiveIdentityRecord
    try {
      valid = validateLiveIdentity(record)
    } catch {
      return null
    }
    if (valid.entityName === entityName && valid.oldId === oldId) matches.push(valid)
  }
  const publicIds = new Set(matches.map((record) => record.newPublicId))
  if (publicIds.size !== 1) return null
  return matches[0].newPublicId
}

export function readLiveIdentityFile(filePath: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
    if (!Array.isArray(parsed)) throw new Error('Invalid live identity file')
    return parsed
  } catch (error) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') return []
    throw error
  }
}

export function classifyOwnerSelector(value: string | undefined):
  | { kind: 'unset' }
  | { kind: 'public'; publicId: string }
  | { kind: 'legacy'; oldId: string }
  | { kind: 'rejected' } {
  if (value === undefined || value.length === 0) return { kind: 'unset' }
  const publicId = parsePublicId(value)
  if (publicId) return { kind: 'public', publicId }
  if (/^(?:[1-9][0-9]*)$/.test(value)) return { kind: 'rejected' }
  if (value.length > 256 || /[\s\u0000]/.test(value)) return { kind: 'rejected' }
  return { kind: 'legacy', oldId: value }
}
