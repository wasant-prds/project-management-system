import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
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
  count: () => Promise<number>
}

function isSeedModel(value: unknown): value is SeedModel {
  return (
    typeof value === 'object' &&
    value !== null &&
    'createMany' in value &&
    typeof value.createMany === 'function' &&
    'count' in value &&
    typeof value.count === 'function'
  )
}

function resolveSeedDir(): string {
  const seedsRoot = process.env.SEEDS_ROOT ?? process.cwd()
  const seedPath = process.env.SEED_PATH ?? 'database/seeds/master'
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

const DATE_KEY = /(?:At|Date)$|^date$/i
const NAIVE_ISO_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/

function coerceSeedValue(key: string, value: unknown): unknown {
  if (typeof value === 'string' && DATE_KEY.test(key) && NAIVE_ISO_DATETIME.test(value)) {
    return `${value}Z`
  }
  return value
}

function loadRows(filePath: string): Record<string, unknown>[] {
  const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
  if (!Array.isArray(parsed)) {
    throw new TypeError(`Seed file must be a JSON array: ${filePath}`)
  }
  return parsed.map((row) => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      throw new TypeError(`Seed row must be an object: ${filePath}`)
    }
    return Object.fromEntries(
      Object.entries(row as Record<string, unknown>).map(([key, value]) => [
        key,
        coerceSeedValue(key, value),
      ]),
    )
  })
}

function loadTableRows(filePath: string): Record<string, unknown>[] {
  if (statSync(filePath).isDirectory()) {
    const files = readdirSync(filePath)
      .filter((name) => name.endsWith('.json'))
      .sort((left, right) => left.localeCompare(right))
    return files.flatMap((name) => loadRows(join(filePath, name)))
  }

  return loadRows(filePath)
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
  const existingData: { table: string; rows: number }[] = []
  for (const { table } of config.tables) {
    const model = prisma[prismaDelegate(table) as keyof typeof prisma]
    if (!isSeedModel(model)) {
      throw new Error(`No Prisma model matching table ${table} (${prismaDelegate(table)})`)
    }

    const rows = await model.count()
    if (rows > 0) existingData.push({ table, rows })
  }

  if (existingData.length > 0) {
    console.log('⚠️  Database already contains data in seed tables:')
    for (const { table, rows } of existingData) {
      console.log(`   - ${table}: ${rows} rows`)
    }
    console.log('⏭️  Skipping seed to prevent data loss.')
    console.log('💡 If you want to re-seed, please manually delete the data first or drop the database.')
    return
  }

  console.log('✅ Database is empty. Starting seed process...')

  const rowsByTable = new Map<string, Record<string, unknown>[]>()
  for (const { table, file } of config.tables) {
    const filePath = join(seedDir, file)
    if (!existsSync(filePath)) {
      throw new Error(`Seed file not found for ${table}: ${filePath}`)
    }
    rowsByTable.set(table, loadTableRows(filePath))
  }

  const projectIds = new Set((rowsByTable.get('Project') ?? []).map((row) => row.id))
  const userIds = new Set((rowsByTable.get('User') ?? []).map((row) => row.id))
  const workItems = rowsByTable.get('WorkItem')
  if (workItems) {
    const validWorkItems = workItems.filter(
      (row) => projectIds.has(row.projectId) && userIds.has(row.assigneeId),
    )
    const skippedWorkItems = workItems.length - validWorkItems.length
    if (skippedWorkItems > 0) {
      console.warn(
        `⚠️  Skipping ${skippedWorkItems} WorkItem rows with a missing Project or User reference.`,
      )
      rowsByTable.set('WorkItem', validWorkItems)
    }
  }

  const loaded: { table: string; rows: number }[] = []

  await prisma.$transaction(
    async (tx) => {
      for (const { table, file } of config.tables) {
        const rows = rowsByTable.get(table) ?? []
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
