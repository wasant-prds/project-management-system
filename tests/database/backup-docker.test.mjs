import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  docker,
  sql,
  backup,
  rehearse,
  readArchive,
  compare,
  inventory,
} from '../../scripts/database/backup.mjs'

test(
  'real pg_dump restores exact SQL data and production HTTP uses pg without generated code',
  { skip: process.env.PMS_RUN_POSTGRES_TESTS !== '1', timeout: 180000 },
  async () => {
    const name = `pms-backup-test-${randomUUID()}`,
      app = `pms-http-test-${randomUUID()}`
    const folder = await mkdtemp(join(tmpdir(), 'pms-backup-check-'))
    let postgresStarted = false,
      appStarted = false
    try {
      docker([
        'run',
        '--rm',
        '-d',
        '--name',
        name,
        '--network',
        'none',
        '-e',
        'POSTGRES_HOST_AUTH_METHOD=trust',
        '-e',
        'POSTGRES_USER=postgres',
        '-e',
        'POSTGRES_DB=postgres',
        'postgres:16-alpine',
        '-c',
        'timezone=Asia/Bangkok',
      ])
      postgresStarted = true
      let ready = false
      for (let attempt = 0; attempt < 100; attempt++) {
        try {
          docker(['exec', name, 'pg_isready', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres'])
          ready = true
          break
        } catch {}
        await new Promise((done) => setTimeout(done, 200))
      }
      assert.ok(ready)
      sql(name, await readFile('database/schema.sql', 'utf8'))
      const owner = sql(
        name,
        "INSERT INTO users(email,name,password_hash) VALUES('owner@fixture.test','Owner','unused-hash') RETURNING public_id",
      )
      const company = sql(name, "INSERT INTO companies(name) VALUES('Fixture') RETURNING public_id")
      const project = sql(
        name,
        "INSERT INTO projects(name,company_id,start_date,due_date) SELECT 'Fixture',id,'2026-01-01','2026-12-31' FROM companies RETURNING public_id",
      )
      sql(
        name,
        "INSERT INTO work_items(title,kind,project_id,assignee_id) SELECT 'Fixture','Task',p.id,u.id FROM projects p,users u; INSERT INTO work_logs(hours,work_date,user_id,project_id,work_item_id) SELECT 1.234567890123456789012345678901,'2026-11-04',assignee_id,project_id,id FROM work_items;",
      )
      const settings = { site: 'dev', container: name, directory: folder, days: 30 }
      const original = inventory(name)
      const archive = await backup(settings)
      const receipt = JSON.parse(await readFile(`${archive}.verified.json`, 'utf8'))
      assert.equal(receipt.result, 'isolated-restore-passed')
      compare(original, await rehearse(archive, 'dev'))
      await assert.rejects(readArchive(archive, 'prod'))
      const verified = await readFile(archive)
      await writeFile(archive, 'corrupt')
      await assert.rejects(readArchive(archive, 'dev'))
      await writeFile(archive, verified)
      docker([
        'run',
        '--rm',
        '-d',
        '--name',
        app,
        '--network',
        `container:${name}`,
        '-e',
        'APP_ENV=dev',
        '-e',
        'APP_ORIGIN=http://127.0.0.1:3000',
        '-e',
        'RUNTIME_DOCKER=true',
        '-e',
        'POSTGRES_HOST=127.0.0.1',
        '-e',
        'POSTGRES_USER=postgres',
        '-e',
        'POSTGRES_DB=postgres',
        '-e',
        'POSTGRES_PASSWORD=synthetic',
        '-e',
        'OWNER_GATE_USERNAME=owner',
        '-e',
        'OWNER_GATE_PASSWORD=synthetic-owner-password-at-least-32',
        '-e',
        `OWNER_USER_ID=${owner}`,
        process.env.PMS_APP_TEST_IMAGE || 'pms-sql-app-check',
      ])
      appStarted = true
      const http = (path, authenticated = false, method = 'GET', body) =>
        JSON.parse(
          docker([
            'exec',
            app,
            'node',
            '-e',
            `const headers=${JSON.stringify(authenticated ? { Authorization: 'Basic ' + Buffer.from('owner:synthetic-owner-password-at-least-32').toString('base64'), Origin: 'http://127.0.0.1:3000', 'Content-Type': 'application/json' } : {})}; fetch(${JSON.stringify('http://127.0.0.1:3000' + path)},{method:${JSON.stringify(method)},headers,${body === undefined ? '' : `body:${JSON.stringify(JSON.stringify(body))},`}redirect:'manual'}).then(async r=>console.log(JSON.stringify({status:r.status,body:await r.json()}))).catch(()=>process.exit(1))`,
          ]).toString(),
        )
      ready = false
      for (let attempt = 0; attempt < 60; attempt++) {
        try {
          if (http('/api/health').status === 200) {
            ready = true
            break
          }
        } catch {}
        await new Promise((done) => setTimeout(done, 250))
      }
      assert.ok(ready, 'Standalone app did not become ready')
      assert.equal(http('/api/work-items?year=all').status, 401)
      for (const path of [
        '/api/users',
        '/api/company',
        '/api/projects',
        '/api/work-items?year=all',
        '/api/work-logs?startDate=2026-11-04&endDate=2026-11-04',
        '/api/dashboard/summary',
        '/api/analysis/summary',
        '/api/settings/me',
      ]) {
        const response = http(path, true)
        assert.equal(response.status, 200, `${path}: ${JSON.stringify(response.body)}`)
        assert.doesNotMatch(
          JSON.stringify(response.body),
          /"internalId"|"publicId"|"password_hash"|"leaseToken"/,
        )
      }
      const created = http('/api/work-items', true, 'POST', {
        title: 'HTTP create',
        kind: 'Task',
        projectId: project,
      })
      assert.equal(created.status, 201)
      assert.equal(created.body.workItem.projectId, project)
      assert.equal(
        http(`/api/work-items/${created.body.workItem.id}`, true, 'PATCH', { status: 'completed' }).status,
        200,
      )
      assert.equal(http(`/api/work-items/${created.body.workItem.id}`, true, 'DELETE').status, 200)
      assert.equal(http(`/api/company/${company}`, true, 'DELETE').status, 409)
    } finally {
      if (appStarted) docker(['rm', '-f', app])
      if (postgresStarted) docker(['rm', '-f', name])
      await rm(folder, { recursive: true, force: true })
    }
  },
)
