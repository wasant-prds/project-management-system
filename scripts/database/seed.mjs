import { readdir, readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient, transaction } from './connection.mjs'
import { loadSchema, schemaMarker, ROOT } from './schema.mjs'

export const SEED_PATH = 'database/seeds/sql-master'
export function validateSeedSql(source, table) {
  // Data files may contain INSERTs and quoted values, never DDL, psql commands or transaction control.
  const outside = source.replace(/'(?:''|[^'])*'/g, "''").replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, ' ')
  if (
    /\\|\$[a-z_]*\$|\b(?:begin|commit|rollback|create|alter|drop|truncate|delete|update|copy|grant|revoke|select|set|call)\b/i.test(
      outside,
    )
  )
    throw new Error('Seed SQL must contain inserts only')
  const inserts = [...outside.matchAll(/\bINSERT\s+INTO\s+"([a-z_]+)"/gi)]
  if (!inserts.length || inserts.some((match) => match[1] !== table))
    throw new Error('Seed insert target does not match the file name')
}
export async function loadSeeds({ root = ROOT, seedPath = SEED_PATH } = {}) {
  if (seedPath.replaceAll('\\', '/').replace(/\/$/, '') !== SEED_PATH)
    throw new Error('SEED_PATH must be database/seeds/sql-master')
  const schema = await loadSchema(root)
  const directory = resolve(root, SEED_PATH)
  const names = (await readdir(directory)).filter((name) => /^[0-9]{3}_[a-z_]+\.sql$/.test(name)).sort()
  if (!names.length) throw new Error('No numbered SQL seed files found')
  const files = []
  for (const name of names) {
    const table = name.replace(/^[0-9]{3}_|\.sql$/g, '')
    if (!schema.tables.includes(table)) throw new Error('Unknown seed table')
    const sql = await readFile(resolve(directory, name), 'utf8')
    if (!sql.replace(/--[^\n]*/g, '').trim()) continue
    validateSeedSql(sql, table)
    files.push({ name, table, sql })
  }
  return { schema, files }
}
export async function seedDatabase(client, options = {}) {
  const { schema, files } = await loadSeeds(options)
  return transaction(client, async () => {
    const marker = (
      await client.query("SELECT obj_description('public'::regnamespace,'pg_namespace') AS marker")
    ).rows[0].marker
    if (marker !== schemaMarker(schema.checksum)) throw new Error('Seed requires the current schema.sql')
    // Table identifiers come only from the authoritative local DDL, never input.
    for (const table of schema.tables) await client.query(`LOCK TABLE "${table}" IN SHARE ROW EXCLUSIVE MODE`)
    for (const table of schema.tables) {
      if ((await client.query(`SELECT EXISTS(SELECT 1 FROM "${table}") AS occupied`)).rows[0].occupied)
        throw new Error('Seed requires an empty database')
    }
    await client.query("SET LOCAL pms.preserve_source_timestamps='on'")
    for (const file of files) await client.query(file.sql)
    for (const table of schema.tables)
      await client.query('SELECT public.pms_align_identity($1::regclass)', [`public.${table}`])
    return { status: 'seeded', files: files.length }
  })
}
export async function main(env = process.env) {
  const client = createClient(env)
  try {
    await client.connect()
    console.log(JSON.stringify(await seedDatabase(client, { seedPath: env.SEED_PATH || SEED_PATH })))
  } finally {
    await client.end()
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch(() => {
    console.error(
      'SQL seed failed and was rolled back. Check numbered SQL files in database/seeds/sql-master, references and empty target tables.',
    )
    process.exitCode = 1
  })
