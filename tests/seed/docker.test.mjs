import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
const enabled = process.env.PMS_RUN_SEED_DOCKER_TESTS === '1';
function docker(args) {
  try { return execFileSync('docker', args, { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { throw new Error('Isolated seed Docker command failed; diagnostics withheld'); }
}
test('PostgreSQL WorkItem DATE columns and Restrict FK survive gated Prisma schema sync', { skip: !enabled, timeout: 90000 }, async () => {
  const name = `pms-seed-test-${process.pid}-${Date.now()}`;
  try {
    docker(['run', '--rm', '-d', '--name', name, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16-alpine', '-c', 'timezone=Asia/Bangkok']);
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      try { if (docker(['exec', name, 'psql', '-U', 'postgres', '-Atc', "SHOW timezone"]).trim() === 'Asia/Bangkok') { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.equal(ready, true);
    const args = ['run', '--rm', '--network', `container:${name}`, '--mount', `type=bind,source=${join(process.cwd(), 'scripts')},target=/app/scripts,readonly`, '--mount', `type=bind,source=${join(process.cwd(), 'tests', 'seed')},target=/app/tests/seed,readonly`, '-e', 'DATABASE_URL=postgresql://postgres@127.0.0.1:5432/postgres?options=--timezone%3DAsia%2FBangkok', '--entrypoint', 'node', process.env.PMS_SEED_TEST_IMAGE || 'pms-seed-validation', '/app/tests/seed/db-fixture.mjs'];
    assert.match(docker(args), /WorkItem PostgreSQL DATE columns and Restrict FK verified/);
  } finally { try { docker(['rm', '-f', name]); } catch {} }
});

test('legacy JSON installation seed is blocked before any database access in the SQL runtime', { skip: !enabled, timeout: 90000 }, () => {
  const result = spawnSync('docker', ['run', '--rm', '--network', 'none', '--entrypoint', 'node',
    '-e', 'DATABASE_URL=postgresql://synthetic:synthetic-private-password@127.0.0.1:5432/postgres',
    process.env.PMS_SEED_TEST_IMAGE || 'pms-seed-validation', 'node_modules/tsx/dist/cli.mjs', 'prisma/seed.ts'],
    { encoding: 'utf8', timeout: 60000, windowsHide: true })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /JSON seed is disabled/)
  assert.doesNotMatch(result.stdout + result.stderr, /synthetic-private-password/)
})
