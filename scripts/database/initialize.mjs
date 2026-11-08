import { fileURLToPath } from 'node:url'
import { createClient, transaction } from './connection.mjs'
import { loadSchema, schemaMarker } from './schema.mjs'

export async function initializeDatabase(client, { approved = false, root } = {}) {
  const schema = await loadSchema(root)
  return transaction(client, async () => {
    const state = (
      await client.query(`SELECT
      (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')) AS objects,
      (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') AS functions,
      obj_description('public'::regnamespace,'pg_namespace') AS marker`)
    ).rows[0]
    if (state.objects || state.functions) {
      if (state.marker !== schemaMarker(schema.checksum))
        throw new Error('Existing schema differs; automatic changes are refused')
      const actual = (
        await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename")
      ).rows.map((row) => row.tablename)
      if (JSON.stringify(actual) !== JSON.stringify([...schema.tables].sort()))
        throw new Error('Existing table set differs from schema.sql')
      return { status: 'already-initialized' }
    }
    if (!approved) throw new Error('Empty database requires DB_SCHEMA_SYNC_APPROVED=true')
    await client.query(schema.sql)
    // The hash is hexadecimal generated locally, never user input.
    await client.query(`COMMENT ON SCHEMA public IS '${schemaMarker(schema.checksum)}'`)
    return { status: 'initialized', tables: schema.tables.length }
  })
}
export async function main(env = process.env) {
  const client = createClient(env)
  try {
    await client.connect()
    console.log(
      JSON.stringify(await initializeDatabase(client, { approved: env.DB_SCHEMA_SYNC_APPROVED === 'true' })),
    )
  } finally {
    await client.end()
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch(() => {
    console.error(
      'Database initialization refused or failed. Check approval and schema.sql; existing databases are never reset or upgraded automatically.',
    )
    process.exitCode = 1
  })
