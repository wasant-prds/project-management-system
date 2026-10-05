import { PrismaClient } from '@prisma/client'
import { resolve } from 'node:path'
import { seedDatabase, SeedFailure } from '../scripts/seed-database.mjs'

if (process.env.PMS_JSON_SEED_ISOLATED_TEST !== '1') {
  console.error('JSON seed is disabled. Use the SQL master seed runner for an approved empty database.')
  process.exit(1)
}

const prisma = new PrismaClient({ log: [] })
const seedDir = resolve(process.env.SEEDS_ROOT ?? process.cwd(), process.env.SEED_PATH ?? 'database/seeds/master')

seedDatabase(prisma, seedDir)
  .then((results) => {
    for (const { table, status, rows } of results) {
      console.log(`Seed ${table}: ${status} (${rows} rows)`)
    }
    console.log('Seeding completed successfully.')
  })
  .catch((error: unknown) => {
    // Never print Prisma messages, seed row values or connection credentials.
    const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : ''
    if (error instanceof SeedFailure) console.error(`Seed ${error.table} failed${code ? ` (${code})` : ''}; transaction rolled back. Check dataset constraints and files.`)
    else if (/^P\d{4}$/.test(code)) console.error(`Seed failed (${code}); transaction rolled back. Check dataset constraints and references.`)
    else console.error('Seed failed; check config.json and seed files at SEED_PATH. Transaction rolled back.')
    process.exitCode = 1
  })
  .finally(async () => { await prisma.$disconnect() })
