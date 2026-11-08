import { sql, identifier, joinSql } from './sql'
import type { Database } from './client'

type Table =
  | 'users'
  | 'companies'
  | 'projects'
  | 'work_items'
  | 'work_logs'
  | 'external_project_mappings'
  | 'external_work_item_references'
  | 'issue_sync_configs'
  | 'issue_sync_runs'
type Changes = Record<string, unknown>
function writable(data: Changes): Array<[string, unknown]> {
  return Object.entries(data)
    .filter(([, value]) => value !== undefined)
    .map(([column, value]) => {
      if (['id', 'public_id', 'created_at', 'updated_at'].includes(column))
        throw new Error('Database-owned identity and timestamps cannot be assigned')
      return [column, value]
    })
}
/** Flat column writes only; callers resolve public references and build explicit fields. */
export async function insertRecord(connection: Database, table: Table, data: Changes): Promise<bigint> {
  const entries = writable(data)
  const row = await connection.one<{ id: bigint }>(
    sql`INSERT INTO ${identifier(table)} (${joinSql(entries.map(([column]) => identifier(column)))}) VALUES (${joinSql(entries.map(([, value]) => sql`${value}`))}) RETURNING id`,
  )
  if (!row) throw new Error('Database insert did not return an identity')
  return row.id
}
/** Reviewed imports may preserve a public UUID; internal identities remain database-owned. */
export async function insertImportedRecord(
  connection: Database,
  table: Table,
  publicId: string,
  data: Changes,
): Promise<bigint> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(publicId))
    throw new Error('Import public identity must be UUIDv4')
  const entries: Array<[string, unknown]> = [['public_id', publicId], ...writable(data)]
  const row = await connection.one<{ id: bigint }>(
    sql`INSERT INTO ${identifier(table)} (${joinSql(entries.map(([column]) => identifier(column)))}) VALUES (${joinSql(entries.map(([, value]) => sql`${value}`))}) RETURNING id`,
  )
  if (!row) throw new Error('Import did not return an identity')
  return row.id
}
export async function updateRecord(
  connection: Database,
  table: Table,
  id: bigint,
  data: Changes,
): Promise<number> {
  const entries = writable(data)
  if (!entries.length) return 0
  return connection.execute(
    sql`UPDATE ${identifier(table)} SET ${joinSql(entries.map(([column, value]) => sql`${identifier(column)} = ${value}`))} WHERE id = ${id}`,
  )
}
