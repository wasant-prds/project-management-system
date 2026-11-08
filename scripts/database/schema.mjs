import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

export const ROOT = fileURLToPath(new URL('../../', import.meta.url))
export const schemaMarker = (checksum) => `pms-schema-sha256:${checksum}`
export async function loadSchema(root = ROOT) {
  const bytes = await readFile(resolve(root, 'database/schema.sql'))
  const sql = bytes.toString('utf8')
  const tables = [...sql.matchAll(/^CREATE TABLE "([a-z_]+)" \(/gm)].map((match) => match[1])
  if (!tables.length) throw new Error('Authoritative schema contains no tables')
  return { sql, tables, checksum: createHash('sha256').update(bytes).digest('hex') }
}
