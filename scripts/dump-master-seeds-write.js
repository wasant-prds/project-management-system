#!/usr/bin/env node
/**
 * Post-process JSON dumped from PostgreSQL into database/seeds/master.
 *
 * Modes:
 *   --print-tables <config.json>              Print model<TAB>pg_table lines
 *   --write <destDir> <stageDir> <config.json>  Write snapshot files and drop leftovers
 */

const fs = require('fs')
const path = require('path')

const PG_TABLE_BY_MODEL = {
  WorkItem: 'work_items',
}

const FIELD_MAP_BY_MODEL = {
  WorkItem: { labels_types: 'types' },
}

const STATUS_FROM_DB = {
  'in-progress': 'in_progress',
  'sa-testing': 'sa_testing',
  'pm-testing': 'pm_testing',
}

const DECIMAL_KEYS = new Set(['hours', 'budget', 'spent'])
const DATE_KEY = /(?:At|Date)$|^date$/i

const KEY_ORDER_BY_MODEL = {
  Company: [
    'id',
    'name',
    'industry',
    'email',
    'phone',
    'address',
    'website',
    'logo',
    'description',
    'createdAt',
    'updatedAt',
  ],
  User: [
    'id',
    'name',
    'role',
    'email',
    'phone',
    'avatar',
    'status',
    'joinDate',
    'password',
    'createdAt',
    'updatedAt',
  ],
  Project: [
    'id',
    'name',
    'spent',
    'budget',
    'status',
    'dueDate',
    'priority',
    'progress',
    'createdAt',
    'creatorId',
    'startDate',
    'updatedAt',
    'description',
    'colorProject',
  ],
  ProjectMember: ['id', 'role', 'joinedAt', 'userId', 'projectId'],
  Milestone: [
    'id',
    'name',
    'status',
    'dueDate',
    'createdAt',
    'projectId',
    'updatedAt',
    'description',
  ],
  WorkItem: [
    'id',
    'title',
    'description',
    'kind',
    'priority',
    'role',
    'status',
    'types',
    'workDate',
    'dueDate',
    'submittedAt',
    'createdAt',
    'updatedAt',
    'projectId',
    'assigneeId',
  ],
  Comment: ['id', 'content', 'createdAt', 'updatedAt', 'authorId'],
  Document: [
    'id',
    'name',
    'fileUrl',
    'fileSize',
    'fileType',
    'createdAt',
    'projectId',
    'updatedAt',
    'uploaderId',
    'description',
  ],
  TimeEntry: [
    'id',
    'date',
    'hours',
    'status',
    'userId',
    'remarks',
    'createdAt',
    'projectId',
    'updatedAt',
    'workItemId',
    'description',
  ],
  ActivityLog: [
    'id',
    'action',
    'entity',
    'userId',
    'entityId',
    'metadata',
    'createdAt',
    'projectId',
    'description',
  ],
  Notification: [
    'id',
    'link',
    'read',
    'type',
    'title',
    'userId',
    'message',
    'createdAt',
  ],
}

function loadConfig(configPath) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  if (!Array.isArray(config.tables) || config.tables.length === 0) {
    throw new Error(`Seed config has no tables: ${configPath}`)
  }
  return config
}

function pgTable(model) {
  return PG_TABLE_BY_MODEL[model] || model
}

function isYearDirectory(file) {
  return !file.endsWith('.json')
}

function normalizeDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
    return value
  }

  const hasZone = /Z$|[+-]\d{2}:\d{2}$/.test(value)
  const parsed = new Date(hasZone ? value : `${value}Z`)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toISOString().replace(/Z$/, '')
}

function normalizeValue(model, key, value) {
  if (value === undefined) {
    return value
  }

  if (model === 'WorkItem' && key === 'status' && typeof value === 'string') {
    return STATUS_FROM_DB[value] || value
  }

  if (DECIMAL_KEYS.has(key) && value !== null) {
    const numeric = typeof value === 'number' ? value : Number(value)
    if (Number.isFinite(numeric)) {
      return numeric
    }
  }

  if (DATE_KEY.test(key) && typeof value === 'string') {
    return normalizeDate(value)
  }

  return value
}

function orderKeys(model, row) {
  const preferred = KEY_ORDER_BY_MODEL[model]
  if (!preferred) {
    return row
  }

  const ordered = {}
  for (const key of preferred) {
    if (Object.prototype.hasOwnProperty.call(row, key)) {
      ordered[key] = row[key]
    }
  }
  for (const [key, value] of Object.entries(row)) {
    if (!Object.prototype.hasOwnProperty.call(ordered, key)) {
      ordered[key] = value
    }
  }
  return ordered
}

function remapRow(model, row) {
  const fieldMap = FIELD_MAP_BY_MODEL[model] || {}
  const remapped = {}
  for (const [key, value] of Object.entries(row)) {
    const nextKey = fieldMap[key] || key
    remapped[nextKey] = normalizeValue(model, nextKey, value)
  }
  return orderKeys(model, remapped)
}

function loadDumpedRows(stageDir, model) {
  const filePath = path.join(stageDir, `${model}.json`)
  if (!fs.existsSync(filePath)) {
    throw new Error(`Dumped table JSON not found: ${filePath}`)
  }

  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  if (!Array.isArray(parsed)) {
    throw new TypeError(`Dumped table JSON must be an array: ${filePath}`)
  }

  return parsed.map((row) => {
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      throw new TypeError(`Dumped row must be an object: ${filePath}`)
    }
    return remapRow(model, row)
  })
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`)
}

function rowYear(row) {
  const source = row.workDate || row.createdAt || row.dueDate
  if (typeof source === 'string' && /^\d{4}/.test(source)) {
    return source.slice(0, 4)
  }
  return 'unknown'
}

function compareIds(left, right) {
  return String(left.id).localeCompare(String(right.id))
}

function writeYearDirectory(destDir, rows) {
  fs.mkdirSync(destDir, { recursive: true })

  const byYear = new Map()
  for (const row of rows) {
    const year = rowYear(row)
    if (!byYear.has(year)) {
      byYear.set(year, [])
    }
    byYear.get(year).push(row)
  }

  const written = new Set()
  const years = [...byYear.keys()].sort()
  for (const year of years) {
    const fileName = `${year}.json`
    const yearRows = byYear.get(year).slice().sort(compareIds)
    writeJson(path.join(destDir, fileName), yearRows)
    written.add(fileName)
    console.log(`   ${path.basename(destDir)}/${fileName}: ${yearRows.length} rows`)
  }

  for (const name of fs.readdirSync(destDir)) {
    if (name.endsWith('.json') && !written.has(name)) {
      fs.unlinkSync(path.join(destDir, name))
      console.log(`   removed leftover ${path.basename(destDir)}/${name}`)
    }
  }
}

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true })
}

function removeLeftovers(destDir, allowedNames) {
  if (!fs.existsSync(destDir)) {
    return
  }

  for (const name of fs.readdirSync(destDir)) {
    if (allowedNames.has(name)) {
      continue
    }

    const target = path.join(destDir, name)
    const stat = fs.statSync(target)
    const isJson = name.endsWith('.json')
    if (stat.isFile() && isJson) {
      fs.unlinkSync(target)
      console.log(`   removed leftover ${name}`)
      continue
    }

    if (stat.isDirectory()) {
      const hasJson = fs.readdirSync(target).some((child) => child.endsWith('.json'))
      if (hasJson) {
        rmrf(target)
        console.log(`   removed leftover directory ${name}/`)
      }
    }
  }
}

function printTables(configPath) {
  const config = loadConfig(configPath)
  for (const { table } of config.tables) {
    process.stdout.write(`${table}\t${pgTable(table)}\n`)
  }
}

function writeSeeds(destDir, stageDir, configPath) {
  const config = loadConfig(configPath)
  fs.mkdirSync(destDir, { recursive: true })

  const allowedNames = new Set(['config.json'])

  for (const { table, file } of config.tables) {
    allowedNames.add(file)
    const rows = loadDumpedRows(stageDir, table)
    const destPath = path.join(destDir, file)

    if (isYearDirectory(file)) {
      if (fs.existsSync(destPath) && fs.statSync(destPath).isFile()) {
        fs.unlinkSync(destPath)
      }
      if (rows.length === 0) {
        fs.mkdirSync(destPath, { recursive: true })
        for (const name of fs.readdirSync(destPath).filter((child) => child.endsWith('.json'))) {
          fs.unlinkSync(path.join(destPath, name))
        }
        console.log(`   ${file}/: 0 rows`)
        continue
      }
      writeYearDirectory(destPath, rows)
      continue
    }

    if (fs.existsSync(destPath) && fs.statSync(destPath).isDirectory()) {
      rmrf(destPath)
    }

    writeJson(destPath, rows.slice().sort(compareIds))
    console.log(`   ${file}: ${rows.length} rows`)
  }

  removeLeftovers(destDir, allowedNames)
}

function main() {
  const mode = process.argv[2]
  if (mode === '--print-tables') {
    printTables(process.argv[3])
    return
  }
  if (mode === '--write') {
    writeSeeds(process.argv[3], process.argv[4], process.argv[5])
    return
  }

  throw new Error(
    'Usage: dump-master-seeds-write.js --print-tables <config.json> | --write <destDir> <stageDir> <config.json>',
  )
}

main()
