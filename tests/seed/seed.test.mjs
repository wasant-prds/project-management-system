import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { seedDatabase, SeedFailure } from '../../scripts/seed-database.mjs';

async function fixture(t, entries, files = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'pms-seed-unit-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(join(dir, 'config.json'), JSON.stringify({ tables: entries }));
  for (const [file, rows] of Object.entries(files)) {
    await mkdir(join(dir, file, '..'), { recursive: true });
    await writeFile(join(dir, file), JSON.stringify(rows));
  }
  return dir;
}
function client(data, failTable) {
  return { data, async $transaction(fn, options) {
    assert.equal(options.isolationLevel, 'Serializable');
    const pending = structuredClone(data);
    const tx = Object.fromEntries(Object.keys(data).map((table) => [table[0].toLowerCase() + table.slice(1), {
      count: async () => pending[table].length,
      createMany: async ({ data: rows }) => {
        if (table === failTable) throw Object.assign(new Error('private credential and row value'), { code: 'P2003' });
        pending[table].push(...rows);
      },
    }]));
    const result = await fn(tx); Object.assign(data, pending); return result;
  } };
}
const tables = [{ table: 'Company', file: 'Company.json' }, { table: 'User', file: 'User.json' }];
test('seed inserts each empty table and repeated runs skip existing tables', async (t) => {
  const dir = await fixture(t, tables, { 'Company.json': [{ id: 'company' }], 'User.json': [{ id: 'owner' }] });
  const db = client({ Company: [], User: [] });
  assert.deepEqual((await seedDatabase(db, dir)).map(r => r.status), ['inserted', 'inserted']);
  assert.deepEqual((await seedDatabase(db, dir)).map(r => r.status), ['skipped-existing', 'skipped-existing']);
  assert.equal(db.data.User.length, 1);
});
test('a populated table is unchanged while an empty table seeds; skipped file need not exist', async (t) => {
  const dir = await fixture(t, tables, { 'User.json': [{ id: 'owner' }] });
  const db = client({ Company: [{ id: 'existing', name: 'Keep this' }], User: [] });
  assert.deepEqual((await seedDatabase(db, dir)).map(r => r.status), ['skipped-existing', 'inserted']);
  assert.deepEqual(db.data.Company, [{ id: 'existing', name: 'Keep this' }]);
});
test('constraint failure rolls back all pending tables and exposes only safe table/code', async (t) => {
  const dir = await fixture(t, tables, { 'Company.json': [{ id: 'company' }], 'User.json': [{ id: 'owner' }] });
  const db = client({ Company: [], User: [] }, 'User');
  await assert.rejects(seedDatabase(db, dir), e => e instanceof SeedFailure && e.table === 'User' && e.code === 'P2003' && !e.message.includes('private'));
  assert.deepEqual(db.data, { Company: [], User: [] });
});
test('directory seeds preserve row order and existing naive datetime parsing', async (t) => {
  const dir = await fixture(t, [{ table: 'User', file: 'User' }], { 'User/b.json': [{ id: 'b' }], 'User/a.json': [{ id: 'a', createdAt: '2026-09-28T08:00:00' }] });
  const db = client({ User: [] }); await seedDatabase(db, dir);
  assert.deepEqual(db.data.User.map(r => r.id), ['a', 'b']);
  assert.equal(db.data.User[0].createdAt, '2026-09-28T08:00:00Z');
});
test('invalid config, unknown model and paths fail without inserts', async (t) => {
  for (const entries of [[], [tables[0], tables[0]], [{ table: 'Company', file: '../outside.json' }], [{ table: 'Missing', file: 'missing.json' }]]) {
    const dir = await fixture(t, entries); const db = client({ Company: [] });
    await assert.rejects(seedDatabase(db, dir)); assert.deepEqual(db.data.Company, []);
  }
});
test('missing or malformed files for an empty table fail and rollback', async (t) => {
  const dir = await fixture(t, tables, { 'Company.json': [{ id: 'company' }] }); const db = client({ Company: [], User: [] });
  await assert.rejects(seedDatabase(db, dir), SeedFailure);
  await writeFile(join(dir, 'User.json'), '{}');
  await assert.rejects(seedDatabase(db, dir), SeedFailure);
  assert.deepEqual(db.data, { Company: [], User: [] });
});
