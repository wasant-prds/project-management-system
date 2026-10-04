import { parseDecimalId, serializeDecimalId, parsePublicId } from './sql-id.mjs';

const CREATED_AT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/;
const CHECKSUM = /^[0-9a-f]{64}$/;
const ENTITY_NAME = /^[A-Za-z][A-Za-z0-9_]{0,62}$/;
const TARGET_REVISION = /^[A-Za-z0-9._-]{1,64}$/;

function assertText(value, pattern, message) {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(message);
}

function assertOldId(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 256) throw new Error('Invalid legacy mapping id');
  if (value !== value.trim() || value.includes('\n') || value.includes('\r') || value.includes('\0')) {
    throw new Error('Invalid legacy mapping id');
  }
}

export function validateLegacyMapping(record) {
  if (!record || typeof record !== 'object') throw new Error('Invalid legacy mapping');
  if (record.sourceScope !== 'seed' && record.sourceScope !== 'live') throw new Error('Invalid legacy mapping scope');
  assertText(record.entityName, ENTITY_NAME, 'Invalid legacy mapping entity');
  assertText(record.sourceChecksum, CHECKSUM, 'Invalid legacy mapping checksum');
  assertText(record.targetRevision, TARGET_REVISION, 'Invalid legacy mapping revision');
  assertText(record.createdAt, CREATED_AT, 'Invalid legacy mapping timestamp');
  assertOldId(record.oldId);
  return {
    entityName: record.entityName,
    sourceScope: record.sourceScope,
    sourceChecksum: record.sourceChecksum,
    targetRevision: record.targetRevision,
    oldId: record.oldId,
    createdAt: record.createdAt,
    newId: serializeDecimalId(parseDecimalId(record.newId)),
    newPublicId: parsePublicId(record.newPublicId),
  };
}

export function compareOrdinal(left, right) {
  const leftPoints = Array.from(left);
  const rightPoints = Array.from(right);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftPoints[index].codePointAt(0) - rightPoints[index].codePointAt(0);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  if (leftPoints.length === rightPoints.length) return 0;
  return leftPoints.length < rightPoints.length ? -1 : 1;
}

export function compareLegacyMappings(left, right) {
  const byTime = compareOrdinal(left.createdAt, right.createdAt);
  if (byTime !== 0) return byTime;
  return compareOrdinal(left.oldId, right.oldId);
}

export function sortLegacyMappings(records) {
  return records.map((record) => validateLegacyMapping(record)).sort(compareLegacyMappings);
}

export function legacyMappingKey(record) {
  const valid = validateLegacyMapping(record);
  return [valid.entityName, valid.sourceScope, valid.sourceChecksum, valid.targetRevision, valid.oldId].join('\u0000');
}

export function isSameLegacyIdentity(left, right) {
  return legacyMappingKey(left) === legacyMappingKey(right);
}
