import assert from 'node:assert/strict'
import test from 'node:test'
import { createRuntimeQuery } from '../../scripts/sql-runtime.mjs'

test('SQL runtime removes Prisma-only URI options before invoking psql', () => {
  let invocation
  const query = createRuntimeQuery(
    'postgresql://owner:p%40ss%3Aword@db.internal:5432/app?schema=public&connection_limit=5&pool_timeout=20&options=-c%20timezone%3DAsia%2FBangkok&sslmode=require',
    { PMS_SQL_RUNTIME_APPLY: '1', PATH: 'kept' },
    (command, args, options) => {
      invocation = { command, args, options }
      return { status: 0, stdout: 'ok\n', stderr: '' }
    },
  )

  assert.equal(query('SELECT 1'), 'ok')
  assert.equal(invocation.command, 'psql')
  const connection = invocation.args.at(-1)
  assert.match(connection, /options=-c%20timezone%3DAsia%2FBangkok/)
  assert.match(connection, /sslmode=require/)
  assert.doesNotMatch(connection, /schema=|connection_limit=|pool_timeout=/)
  assert.doesNotMatch(connection, /p%40ss|p@ss/)
  assert.equal(invocation.options.env.PGPASSWORD, 'p@ss:word')
  assert.equal(invocation.options.env.PATH, 'kept')
})

test('SQL runtime rejects unknown Prisma targets before spawning psql', () => {
  let calls = 0
  assert.throws(() => createRuntimeQuery('postgresql://db.internal/app?schema=public', {}, () => { calls += 1 }), /disabled/)
  assert.equal(calls, 0)
})
