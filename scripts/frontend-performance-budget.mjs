import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'

// First Load JS in Next's production report; asynchronous charts/calendar are separate.
export const routeBudgets = { '/': 185, '/analysis': 195, '/daily-work': 185, '/board': 185, '/work-items': 205, '/projects': 180, '/projects/[id]': 180, '/company': 175, '/settings': 175 }

export function checkBundleBudget(log, budgets = routeBudgets) {
  const rows = new Map()
  for (const line of log.split('\n')) {
    const match = line.match(/[┌├└]\s+[ƒ○]\s+(\S+)\s+[\d.]+\s+(?:kB|B)\s+([\d.]+)\s+kB/)
    if (match) rows.set(match[1], Number(match[2]))
  }
  return Object.entries(budgets).map(([route, budget]) => ({
    route, budget, actual: rows.get(route) ?? null, pass: rows.has(route) && rows.get(route) <= budget,
  }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const path = process.argv[2]
  if (!path) throw new Error('Usage: pnpm performance:budget <production-build-log>')
  const results = checkBundleBudget(await readFile(path, 'utf8'))
  for (const row of results) console.log(`${row.pass ? 'PASS' : 'FAIL'} ${row.route}: ${row.actual ?? 'missing'} kB / ${row.budget} kB`)
  process.exitCode = results.every((row) => row.pass) ? 0 : 1
}
