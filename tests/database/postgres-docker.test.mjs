import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'

test(
  'PostgreSQL repositories and APIs preserve application contracts',
  { skip: process.env.PMS_RUN_POSTGRES_TESTS !== '1', timeout: 240000 },
  async () => {
    const name = `pms-sql-test-${randomUUID()}`
    const run = (args) => {
      const result = spawnSync('docker', args, {
        encoding: 'utf8',
        timeout: 180000,
        maxBuffer: 8 * 1024 * 1024,
      })
      assert.equal(result.status, 0, result.stdout + result.stderr)
      return result.stdout
    }
    try {
      run([
        'run',
        '--rm',
        '-d',
        '--name',
        name,
        '--network',
        'none',
        '-e',
        'POSTGRES_HOST_AUTH_METHOD=trust',
        'postgres:16-alpine',
        '-c',
        'timezone=Asia/Bangkok',
      ])
      let ready = false
      for (let attempt = 0; attempt < 100; attempt++) {
        const state = spawnSync(
          'docker',
          ['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres'],
          { timeout: 5000 },
        )
        if (state.status === 0) {
          ready = true
          break
        }
        await new Promise((done) => setTimeout(done, 200))
      }
      assert.ok(ready, 'Disposable PostgreSQL did not start')
      const mounts = ['lib', 'app', 'tests', 'scripts'].flatMap((directory) => [
        '--mount',
        `type=bind,source=${resolve(directory)},target=/app/${directory},readonly`,
      ])
      const output = run([
        'run',
        '--rm',
        '--network',
        `container:${name}`,
        ...mounts,
        '--mount',
        `type=bind,source=${resolve('database/schema.sql')},target=/app/database/schema.sql,readonly`,
        '-e',
        'DATABASE_URL=postgresql://postgres@127.0.0.1:5432/postgres',
        '-e',
        'NODE_ENV=test',
        '--entrypoint',
        'node',
        process.env.PMS_DATABASE_TEST_IMAGE || 'pms-sql-tools-check',
        '--test',
        'tests/database/integration-fixture.mjs',
      ])
      process.stdout.write(output)
    } finally {
      run(['rm', '-f', name])
    }
  },
)
