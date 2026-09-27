import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
const enabled = process.env.PMS_RUN_SEED_DOCKER_TESTS === '1';
function docker(args) {
  try { return execFileSync('docker', args, { encoding: 'utf8', timeout: 60000, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch { throw new Error('Isolated seed Docker command failed; diagnostics withheld'); }
}
test('real PostgreSQL/Prisma seeds only empty tables and rolls back invalid references', { skip: !enabled, timeout: 90000 }, async () => {
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
    assert.match(docker(args), /Prisma per-table seed.*verified/);
  } finally { try { docker(['rm', '-f', name]); } catch {} }
});

test('installation seed dataset inserts into an empty database and preserves records on rerun', { skip: !enabled || !existsSync('database/seeds/master/config.json'), timeout: 90000 }, async () => {
  const name = `pms-seed-dataset-${process.pid}-${Date.now()}`;
  try {
    docker(['run', '--rm', '-d', '--name', name, '-e', 'POSTGRES_HOST_AUTH_METHOD=trust', 'postgres:16-alpine', '-c', 'timezone=Asia/Bangkok']);
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
      try { if (docker(['exec', name, 'psql', '-U', 'postgres', '-Atc', 'SHOW timezone']).trim() === 'Asia/Bangkok') { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert.equal(ready, true);
    const args = ['run', '--rm', '--network', `container:${name}`, '--mount', `type=bind,source=${join(process.cwd(), 'scripts')},target=/app/scripts,readonly`, '--mount', `type=bind,source=${join(process.cwd(), 'tests', 'seed')},target=/app/tests/seed,readonly`, '--mount', `type=bind,source=${join(process.cwd(), 'database', 'seeds')},target=/app/database/seeds,readonly`, '-e', 'DATABASE_URL=postgresql://postgres@127.0.0.1:5432/postgres?options=--timezone%3DAsia%2FBangkok', '--entrypoint', 'node', process.env.PMS_SEED_TEST_IMAGE || 'pms-seed-validation', '/app/tests/seed/dataset-fixture.mjs'];
    assert.match(docker(args), /Installation dataset inserts into empty tables/);
  } finally { try { docker(['rm', '-f', name]); } catch {} }
});
