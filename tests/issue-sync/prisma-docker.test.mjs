import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { ROOT } from './support.mjs'

test('GitLab and GitHub sync persist correctly through real Prisma transactions on isolated PostgreSQL', { skip: process.env.PMS_RUN_ISSUE_SYNC_DOCKER_TESTS !== '1', timeout: 120000 }, async () => {
  const name = `pms-issue-sync-prisma-${randomUUID()}`
  const docker = (args) => {
    const result = spawnSync('docker', args, { encoding: 'utf8', windowsHide: true, timeout: 60000, maxBuffer: 8 * 1024 * 1024 })
    if (result.error || result.status !== 0) throw new Error((result.stderr || result.error?.message || 'Isolated Docker command failed').slice(0, 700))
    return result.stdout
  }
  try {
    docker(['run', '--rm', '-d', '--name', name, '--network', 'none', '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16-alpine', '-c', 'timezone=Asia/Bangkok'])
    for (let attempt = 0; ; attempt++) {
      try { docker(['exec', name, 'psql', '-U', 'postgres', '-Atc', 'SELECT 1']); break } catch (error) { if (attempt >= 60) throw error; await new Promise((resolve) => setTimeout(resolve, 200)) }
    }
    const args = ['run', '--rm', '--network', `container:${name}`, '--entrypoint', 'node', '-e', 'DATABASE_URL=postgresql://postgres@127.0.0.1:5432/postgres?options=--timezone%3DAsia%2FBangkok']
    for (const path of ['lib', 'tests/issue-sync', 'scripts']) args.push('--mount', `type=bind,source=${resolve(ROOT, path)},target=/app/${path},readonly`)
    args.push(process.env.PMS_PRISMA_TEST_IMAGE || 'project-management-system-production-migrations:latest', '/app/tests/issue-sync/prisma-fixture.mjs')
    assert.match(docker(args), /Real Prisma issue sync verified for GitLab and GitHub/)
  } finally { spawnSync('docker', ['rm', '-f', name], { windowsHide: true, stdio: 'ignore' }) }
})
