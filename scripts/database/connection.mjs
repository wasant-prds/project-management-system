import { Client } from 'pg'
import { databaseUrl } from '../database-url.mjs'

export function createClient(env = process.env) {
  return new Client({
    connectionString: env.DATABASE_URL || databaseUrl(env),
    connectionTimeoutMillis: 5000,
    options: '-c timezone=Asia/Bangkok',
  })
}
export async function transaction(client, operation) {
  await client.query('BEGIN')
  try {
    await client.query("SET LOCAL lock_timeout='5000ms'")
    await client.query("SET LOCAL statement_timeout='120000ms'")
    await client.query("SELECT pg_advisory_xact_lock(hashtext('pms_database_setup'))")
    const result = await operation()
    await client.query('COMMIT')
    return result
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      /* Keep original failure. */
    }
    throw error
  }
}
