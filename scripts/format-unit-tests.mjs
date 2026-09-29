import { readdir, readFile } from 'node:fs/promises'
import { dirname, join, relative, sep } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectRoot = process.cwd()
const testsRoot = join(projectRoot, 'tests')
const COLUMN_WIDTH = 72
const TEST_CALL = /\btest\s*\(\s*(['"])((?:\\.|[\s\S])*?)\1\s*(?=,|\))/g
const ANSI = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  blue: '\u001b[34m',
  cyan: '\u001b[36m',
  green: '\u001b[32m',
  red: '\u001b[31m',
  yellow: '\u001b[33m',
}

async function findTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return findTestFiles(path)
    return entry.isFile() && entry.name.endsWith('.test.mjs') ? [path] : []
  }))
  return nested.flat().sort()
}

async function buildTitleFileIndex(files) {
  const titleFiles = new Map()
  for (const file of files) {
    const source = await readFile(file, 'utf8')
    const matches = source.matchAll(TEST_CALL)
    for (const match of matches) {
      const title = match[2].replace(/\\(['"\\])/g, '$1')
      const relativeFile = relative(testsRoot, file).split(sep).join('/')
      const indexedFiles = titleFiles.get(title) ?? []
      indexedFiles.push(relativeFile)
      titleFiles.set(title, indexedFiles)
    }
  }
  return titleFiles
}

export function parseTapOutput(raw, titleFiles = new Map()) {
  const remainingFiles = new Map([...titleFiles].map(([title, files]) => [
    title,
    Array.isArray(files) ? [...files] : [files],
  ]))
  const results = []
  let currentResult = null

  for (const line of raw.split(/\r?\n/)) {
    const testLine = line.match(/^\s*(not ok|ok)\s+\d+\s+-\s+(.*)$/)
    if (testLine) {
      const detail = testLine[2]
      const directive = detail.match(/\s+#\s*(SKIP|TODO)\b(?:.*)$/)
      const title = directive ? detail.slice(0, directive.index).trimEnd() : detail.trim()
      const files = remainingFiles.get(title) ?? []
      const file = files.shift() ?? 'unmapped.test.mjs'
      let status = 'pass'
      if (testLine[1] === 'not ok') status = 'fail'
      else if (directive) status = 'skip'
      currentResult = { title, status, durationMs: null, file }
      results.push(currentResult)
      continue
    }

    const duration = line.match(/^\s*duration_ms:\s*([\d.]+)/)
    if (currentResult && duration) currentResult.durationMs = Number(duration[1])
    if (line.trim() === '...') currentResult = null
  }

  return results
}

function formatDuration(durationMs) {
  return durationMs === null ? '' : `${(durationMs / 1000).toFixed(2)}s`
}

function resultLabel(status) {
  if (status === 'pass') return 'PASS'
  if (status === 'skip') return 'SKIP'
  return 'FAIL'
}

function color(text, ...styles) {
  if (styles.length === 0) return text
  return `${styles.join('')}${text}${ANSI.reset}`
}

function aligned(left, right, column = COLUMN_WIDTH, visibleLeftLength = left.length) {
  const spacing = Math.max(2, column - visibleLeftLength)
  return `${left}${' '.repeat(spacing)}${right}`
}

function resultStyles(status) {
  if (status === 'pass') return [ANSI.bold, ANSI.green]
  if (status === 'skip') return [ANSI.bold, ANSI.yellow]
  return [ANSI.bold, ANSI.red]
}

function packageStyles(status) {
  if (status === 'FAIL') return [ANSI.red]
  if (status === 'SKIP') return [ANSI.yellow]
  return [ANSI.green]
}

function packageCountKey(status) {
  if (status === 'FAIL') return 'fail'
  if (status === 'SKIP') return 'skip'
  return 'ok'
}

function reportRight(status, duration, useColor) {
  const label = resultLabel(status)
  const styledLabel = useColor ? color(label, ...resultStyles(status)) : label
  const styledDuration = duration && useColor ? color(duration, ANSI.dim) : duration
  return `${styledLabel}${duration ? `  ${styledDuration}` : ''}`
}

function packageStatus(results) {
  if (results.some((result) => result.status === 'fail')) return 'FAIL'
  if (results.every((result) => result.status === 'skip')) return 'SKIP'
  return 'ok'
}

function groupResultsByPackage(results) {
  const packages = new Map()
  for (const result of results) {
    const folder = dirname(result.file).split(sep).join('/')
    const packageName = folder === '.' ? 'tests' : `tests/${folder}`
    const packageFiles = packages.get(packageName) ?? new Map()
    const fileResults = packageFiles.get(result.file) ?? []
    fileResults.push(result)
    packageFiles.set(result.file, fileResults)
    packages.set(packageName, packageFiles)
  }
  return packages
}

function branch(index, count) {
  return index === count - 1 ? '└─ ' : '├─ '
}

function testColumnWidth(fileEntries) {
  const widths = fileEntries.flatMap(([, fileResults], fileIndex) => fileResults.map((result, resultIndex) => {
    const prefix = fileIndex === fileEntries.length - 1 ? '   ' : '│  '
    return `${prefix}${branch(resultIndex, fileResults.length)}${result.title}`.length + 2
  }))
  return Math.max(COLUMN_WIDTH, ...widths)
}

function renderTestRow(result, resultIndex, fileResults, testPrefix, testColumn, useColor) {
  const testBranch = branch(resultIndex, fileResults.length)
  const rawLeft = `${testPrefix}${testBranch}${result.title}`
  const left = useColor
    ? `${color(testPrefix, ANSI.dim)}${color(testBranch, ANSI.dim)}${color(result.title, ANSI.cyan)}`
    : rawLeft
  const duration = formatDuration(result.durationMs)
  return aligned(left, reportRight(result.status, duration, useColor), testColumn, rawLeft.length)
}

function renderTestFile(file, fileResults, fileIndex, fileCount, testColumn, useColor) {
  const testPrefix = fileIndex === fileCount - 1 ? '   ' : '│  '
  const fileBranch = branch(fileIndex, fileCount)
  const fileName = file.split('/').at(-1)
  const styledBranch = useColor ? color(fileBranch, ANSI.dim) : fileBranch
  const styledName = useColor ? color(fileName, ANSI.yellow) : fileName
  const lines = [`${styledBranch}${styledName}`]
  fileResults.forEach((result, resultIndex) => {
    lines.push(renderTestRow(result, resultIndex, fileResults, testPrefix, testColumn, useColor))
  })
  return lines
}

function renderPackage(name, files, useColor) {
  const packageResults = [...files.values()].flat()
  const status = packageStatus(packageResults)
  const elapsed = packageResults.reduce((sum, result) => sum + (result.durationMs ?? 0), 0)
  const packageStatusText = `${status}  ${formatDuration(elapsed)}`
  const styledPackage = useColor ? color(name, ANSI.yellow, ANSI.bold) : name
  const styledPackageStatus = useColor ? color(packageStatusText, ...packageStyles(status)) : packageStatusText
  const lines = [aligned(styledPackage, styledPackageStatus, COLUMN_WIDTH, name.length)]
  const fileEntries = [...files.entries()].sort(([left], [right]) => left.localeCompare(right))
  const testColumn = testColumnWidth(fileEntries)

  fileEntries.forEach(([file, fileResults], fileIndex) => {
    lines.push(...renderTestFile(file, fileResults, fileIndex, fileEntries.length, testColumn, useColor))
  })
  lines.push('')
  return lines
}

function renderSummary(totals, packageTotals, useColor) {
  const packageSummary = `สรุป  กลุ่ม  ${packageTotals.ok} ok  ${packageTotals.empty} ไม่มีเทสต์  ${packageTotals.fail} fail  ${packageTotals.skip} skip`
  const caseSummary = `      เคส       ${totals.pass} PASS  ${totals.fail} FAIL  ${totals.skip} SKIP`
  if (!useColor) return [packageSummary, caseSummary]

  return [
    packageSummary
      .replace(`${packageTotals.ok} ok`, color(`${packageTotals.ok} ok`, ANSI.green))
      .replace(`${packageTotals.fail} fail`, color(`${packageTotals.fail} fail`, ANSI.red))
      .replace(`${packageTotals.skip} skip`, color(`${packageTotals.skip} skip`, ANSI.yellow)),
    caseSummary
      .replace(`${totals.pass} PASS`, color(`${totals.pass} PASS`, ANSI.green, ANSI.bold))
      .replace(`${totals.fail} FAIL`, color(`${totals.fail} FAIL`, ANSI.red, ANSI.bold))
      .replace(`${totals.skip} SKIP`, color(`${totals.skip} SKIP`, ANSI.yellow, ANSI.bold)),
  ]
}

function separator(char, useColor) {
  const line = char.repeat(COLUMN_WIDTH)
  return useColor ? color(line, ANSI.dim) : line
}

export function renderUnitReport(results, { useColor = false } = {}) {
  const lines = [
    separator('=', useColor),
    'ชุด: unit (ไม่ต่อ PostgreSQL/Redis จริง)',
    'ผ่านเมื่อ: assertion ในแต่ละ test ตรงกับค่าที่คาด',
    '[no tests] = กลุ่มยังไม่มีไฟล์ *.test.mjs — ปกติ',
    separator('=', useColor),
    '',
    'ผลเทสต์',
    separator('─', useColor),
  ]
  const packages = groupResultsByPackage(results)
  const totals = { pass: 0, fail: 0, skip: 0 }
  const packageTotals = { ok: 0, fail: 0, skip: 0, empty: 0 }
  for (const result of results) totals[result.status] += 1

  for (const [name, files] of [...packages].sort(([left], [right]) => left.localeCompare(right))) {
    const status = packageStatus([...files.values()].flat())
    packageTotals[packageCountKey(status)] += 1
    lines.push(...renderPackage(name, files, useColor))
  }

  if (results.length === 0) lines.push('[no tests] ไม่พบผลทดสอบจาก Node test runner', '')
  lines.push(separator('─', useColor), ...renderSummary(totals, packageTotals, useColor))
  lines.push('PASS = assertion ผ่านตามค่าที่คาด')
  lines.push('SKIP = ข้ามเทสต์ — ไม่ใช่ FAIL')
  lines.push(separator('─', useColor))
  return `${lines.join('\n')}\n`
}

async function readStdin() {
  let output = ''
  for await (const chunk of process.stdin) output += chunk
  return output
}

export function shouldUseColor({ env = process.env, isTTY = Boolean(process.stdout.isTTY) } = {}) {
  if (Object.hasOwn(env, 'NO_COLOR')) return false
  if (env.FORCE_COLOR !== undefined) return env.FORCE_COLOR !== '0'
  return isTTY && env.TERM !== 'dumb'
}

async function main() {
  if (process.argv[2] !== '--stdin') {
    console.error('Usage: node scripts/format-unit-tests.mjs --stdin')
    process.exitCode = 2
    return
  }
  const testFiles = await findTestFiles(testsRoot)
  const titleFiles = await buildTitleFileIndex(testFiles)
  const raw = await readStdin()
  const results = parseTapOutput(raw, titleFiles)
  process.stdout.write(renderUnitReport(results, { useColor: shouldUseColor() }))
}

const scriptPath = process.argv[1]
if (scriptPath && import.meta.url === pathToFileURL(scriptPath).href) {
  await main()
}
