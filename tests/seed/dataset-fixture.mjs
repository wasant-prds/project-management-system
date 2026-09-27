import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { seedDatabase } from '../../scripts/seed-database.mjs';

// Invoked only against the disposable database created by docker.test.mjs.
const prisma = new PrismaClient({ log: [] });
try {
  const dir = '/app/database/seeds/master';
  const config = JSON.parse(await readFile(`${dir}/config.json`, 'utf8'));
  const migrationOutput = execFileSync('sh', ['/usr/local/bin/docker-entrypoint-migrate.sh'], {
    encoding: 'utf8', stdio: 'pipe', timeout: 60000,
    env: { ...process.env, RUN_SEED: 'true', POSTGRES_USER: 'postgres', POSTGRES_PASSWORD: 'synthetic', POSTGRES_DB: 'postgres', POSTGRES_HOST: '127.0.0.1', POSTGRES_PORT: '5432' },
  });
  assert.match(migrationOutput, /Seeding completed successfully\./);
  for (const { table } of config.tables) {
    assert.match(migrationOutput, new RegExp(`Seed ${table}: (inserted|empty-seed) \\([0-9]+ rows\\)`));
  }
  const snapshots = new Map();
  for (const { table } of config.tables) {
    const model = prisma[table[0].toLowerCase() + table.slice(1)];
    snapshots.set(table, await model.findMany({ orderBy: { id: 'asc' } }));
  }
  const repeated = await seedDatabase(prisma, dir);
  assert.ok(repeated.every(result => ['skipped-existing', 'empty-seed'].includes(result.status)));
  for (const { table } of config.tables) {
    const model = prisma[table[0].toLowerCase() + table.slice(1)];
    assert.deepEqual(await model.findMany({ orderBy: { id: 'asc' } }), snapshots.get(table));
  }
  console.log('Installation dataset inserts into empty tables and repeated seeding preserves all records');
} catch (error) {
  // Never print assertions, row contents or raw Prisma errors for real datasets.
  const code = /^P\d{4}$/.test(error?.code || '') ? ` (${error.code})` : '';
  console.error(`Installation dataset verification failed${code}; check seed files and constraints`);
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
