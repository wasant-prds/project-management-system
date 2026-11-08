import { Pool, types, type PoolClient, type QueryResult } from 'pg'
import type { Sql } from './sql'

export interface Database {
  rows<T extends object>(statement: Sql): Promise<T[]>
  one<T extends object>(statement: Sql): Promise<T | null>
  execute(statement: Sql): Promise<number>
  transaction<T>(operation: (connection: Database) => Promise<T>): Promise<T>
}

const globalDatabase = globalThis as unknown as { pmsPostgresPool?: Pool }
function pool() {
  if (!globalDatabase.pmsPostgresPool) {
    if (!process.env.DATABASE_URL) throw new Error('Database connection is not configured')
    const connection = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      options: '-c timezone=Asia/Bangkok',
      types: {
        getTypeParser(oid: number, format?: 'text' | 'binary') {
          if (format !== 'binary') {
            if (oid === 20) return (value: string) => BigInt(value)
            if (oid === 1082) return (value: string) => new Date(`${value}T00:00:00.000Z`)
            if (oid === 1114) return (value: string) => new Date(`${value.replace(' ', 'T')}Z`)
            if (oid === 1700) return (value: string) => value
          }
          return types.getTypeParser(oid, format)
        },
      },
    })
    connection.on('error', () => console.error('Database connection unavailable'))
    globalDatabase.pmsPostgresPool = connection
  }
  return globalDatabase.pmsPostgresPool
}

// Dates represent Bangkok calendar/wall-clock values internally, never host-local time.
export function databaseParameter(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, -1)
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return value.map(databaseParameter)
  return value
}

class Connection implements Database {
  constructor(private readonly client?: PoolClient) {}
  private query(statement: Sql): Promise<QueryResult> {
    return (this.client ?? pool()).query(statement.text, statement.values.map(databaseParameter))
  }
  async rows<T extends object>(statement: Sql): Promise<T[]> {
    return (await this.query(statement)).rows as T[]
  }
  async one<T extends object>(statement: Sql): Promise<T | null> {
    return (await this.rows<T>(statement))[0] ?? null
  }
  async execute(statement: Sql): Promise<number> {
    return (await this.query(statement)).rowCount ?? 0
  }
  async transaction<T>(operation: (connection: Database) => Promise<T>): Promise<T> {
    if (this.client) throw new Error('Nested database transactions are not supported')
    const client = await pool().connect()
    try {
      await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
      const result = await operation(new Connection(client))
      await client.query('COMMIT')
      return result
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch {
        /* Preserve the operation error. */
      }
      throw error
    } finally {
      client.release()
    }
  }
}

export const database: Database = new Connection()
export async function closeDatabase() {
  const connection = globalDatabase.pmsPostgresPool
  delete globalDatabase.pmsPostgresPool
  if (connection) await connection.end()
}
export function databaseErrorCode(error: unknown): string | null {
  return typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
    ? error.code
    : null
}
export function databaseConstraint(error: unknown): string {
  return typeof error === 'object' &&
    error !== null &&
    'constraint' in error &&
    typeof error.constraint === 'string'
    ? error.constraint
    : ''
}
