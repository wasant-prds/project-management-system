import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

type SeedTable = {
  table: string
  file: string
}

type SeedConfig = {
  name: string
  description?: string
  tables: SeedTable[]
}

type SeedModel = {
  createMany: (args: { data: unknown[] }) => Promise<unknown>
}

function isSeedModel(value: unknown): value is SeedModel {
  return (
    typeof value === 'object' &&
    value !== null &&
    'createMany' in value &&
    typeof value.createMany === 'function'
  )
}

function resolveSeedDir(): string {
  const seedsRoot = process.env.SEEDS_ROOT ?? join(process.cwd(), 'database')
  const seedPath = process.env.SEED_PATH ?? 'seeds/master'
  return resolve(seedsRoot, seedPath)
}

function loadConfig(seedDir: string): SeedConfig {
  const configPath = join(seedDir, 'config.json')
  if (!existsSync(configPath)) {
    throw new Error(`Seed config not found: ${configPath}`)
  }

  const config = JSON.parse(readFileSync(configPath, 'utf8')) as SeedConfig
  if (!Array.isArray(config.tables) || config.tables.length === 0) {
    throw new Error(`Seed config has no tables: ${configPath}`)
  }

  return config
}

function prismaDelegate(table: string): string {
  return table.charAt(0).toLowerCase() + table.slice(1)
}

function loadRows(filePath: string): Record<string, unknown>[] {
  const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
  if (!Array.isArray(parsed)) {
    throw new TypeError(`Seed file must be a JSON array: ${filePath}`)
  }
  return parsed as Record<string, unknown>[]
}

async function main() {
  console.log('🌱 Seeding database...')

  const seedDir = resolveSeedDir()
  const config = loadConfig(seedDir)

  console.log(`📂 Seed path: ${seedDir} (${config.name})`)
  if (config.description) {
    console.log(`   ${config.description}`)
  }

  console.log('🔍 Checking for existing data...')
  const existingCompanyCount = await prisma.company.count()
  const existingUserCount = await prisma.user.count()
  const existingProjectCount = await prisma.project.count()

  if (existingCompanyCount > 0 || existingUserCount > 0 || existingProjectCount > 0) {
    console.log('⚠️  Database already contains data:')
    console.log(`   - ${existingCompanyCount} Companies`)
    console.log(`   - ${existingUserCount} Users`)
    console.log(`   - ${existingProjectCount} Projects`)
    console.log('⏭️  Skipping seed to prevent data loss.')
    console.log('💡 If you want to re-seed, please manually delete the data first or drop the database.')
    return
  }

  console.log('✅ Database is empty. Starting seed process...')

  const loaded: { table: string; rows: number }[] = []

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = 'replica'`)

      for (const { table, file } of config.tables) {
        const filePath = join(seedDir, file)
        if (!existsSync(filePath)) {
          throw new Error(`Seed file not found for ${table}: ${filePath}`)
        }

        const rows = loadRows(filePath)
        const delegate = prismaDelegate(table)
        const model = tx[delegate as keyof typeof tx]

        if (!isSeedModel(model)) {
          throw new Error(`No Prisma model matching table ${table} (${delegate})`)
        }

        if (rows.length === 0) {
          console.log(`   ⏭️  ${table}: no rows`)
          loaded.push({ table, rows: 0 })
          continue
        }

        await model.createMany({ data: rows })
        console.log(`   ✅ ${table}: ${rows.length} rows`)
        loaded.push({ table, rows: rows.length })
      }
    },
    { maxWait: 15_000, timeout: 300_000 },
  )

  console.log('✅ Seeding completed successfully!')
  console.log('📊 Loaded:')
  for (const { table, rows } of loaded) {
    console.log(`   - ${table}: ${rows}`)
  }
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
