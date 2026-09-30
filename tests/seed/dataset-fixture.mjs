import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { seedDatabase } from '../../scripts/seed-database.mjs';
import { schemaSha256 } from '../../scripts/db-schema-rollout-gate.mjs';

const FIXED_CONTAINER_PATH = '/usr/local/bin:/usr/bin:/bin';

// Invoked only against the disposable database created by docker.test.mjs.
const prisma = new PrismaClient({ log: [] });
let stage = 'migration and initial seed';
try {
  const dir = '/app/database/seeds/master';
  const config = JSON.parse(await readFile(`${dir}/config.json`, 'utf8'));
  const approvedEnvironment = {
    APP_ENV: 'local',
    DB_SCHEMA_BACKUP_RESTORE_VERIFIED: 'true',
    DB_SCHEMA_SYNC_APPROVED: 'true',
    DB_SCHEMA_SYNC_APPROVED_ENV: 'local',
    DB_SCHEMA_SYNC_APPROVED_SCHEMA_SHA256: schemaSha256('/app/prisma/schema.prisma'),
  };
  const migrationOutput = execFileSync('/bin/sh', ['/usr/local/bin/docker-entrypoint-migrate.sh'], {
    encoding: 'utf8', stdio: 'pipe', timeout: 60000,
    env: {
      PATH: FIXED_CONTAINER_PATH,
      ...approvedEnvironment,
      RUN_SEED: 'true',
      SEEDS_ROOT: '/app',
      SEED_PATH: 'database/seeds/master',
      POSTGRES_USER: 'postgres',
      POSTGRES_PASSWORD: 'synthetic',
      POSTGRES_DB: 'postgres',
      POSTGRES_HOST: '127.0.0.1',
      POSTGRES_PORT: '5432',
    },
  });
  stage = 'verify initial seed results';
  assert.match(migrationOutput, /Seeding completed successfully\./);
  for (const { table } of config.tables) {
    assert.match(migrationOutput, new RegExp(String.raw`Seed ${table}: (inserted|empty-seed) \([0-9]+ rows\)`));
  }
  const snapshots = new Map();
  stage = 'capture seeded records';
  for (const { table } of config.tables) {
    const model = prisma[table[0].toLowerCase() + table.slice(1)];
    snapshots.set(table, await model.findMany({ orderBy: { id: 'asc' } }));
  }
  const repeated = await seedDatabase(prisma, dir);
  stage = 'verify repeated seed';
  assert.ok(repeated.every(result => ['skipped-existing', 'empty-seed'].includes(result.status)));
  for (const { table } of config.tables) {
    const model = prisma[table[0].toLowerCase() + table.slice(1)];
    assert.deepEqual(await model.findMany({ orderBy: { id: 'asc' } }), snapshots.get(table));
  }
  console.log('Installation dataset inserts into empty tables and repeated seeding preserves all records');
} catch (error) {
  // Never print assertions, row contents or raw Prisma errors for real datasets.
  const code = /^P\d{4}$/.test(error?.code || '') ? ` (${error.code})` : '';
  console.error(`Installation dataset verification failed during ${stage}${code}; check seed files and constraints`);
  process.exitCode = 1;
} finally { await prisma.$disconnect(); }
