import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { previewData } from '../tests/frontend-ui/preview-fixtures.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PMS_PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.PMS_PREVIEW_ORIGIN || 'http://127.0.0.1:3791'
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('Use the isolated synthetic preview')
const before = process.argv.includes('--before')
const directory = `artifacts/issue-48/${before ? 'before' : 'after'}`
await mkdir(directory, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: process.env.PMS_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) })
const results = []
const errors = []
let completed = false
let failure = null
const viewports = [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]

async function screenshot(page, name) {
  await page.screenshot({ path: `${directory}/${name}.png` })
}

async function frames(page) {
  assert.ok(await page.locator('main').last().evaluate((node) => node.scrollWidth <= node.clientWidth + 1), 'no main overflow')
  for (const chart of await page.locator('[data-slot="chart"]').all()) {
    await chart.scrollIntoViewIfNeeded()
    assert.ok(await chart.evaluate((node) => {
      const frame = node.getBoundingClientRect()
      return node.scrollWidth <= node.clientWidth + 1 && [...node.querySelectorAll('.recharts-cartesian-axis-tick text')].every((label) => {
        const box = label.getBoundingClientRect()
        return box.left >= frame.left - 1 && box.right <= frame.right + 1 && box.top >= frame.top - 1 && box.bottom <= frame.bottom + 1
      })
    }), 'chart axes and labels stay inside their frame')
  }
}

async function tooltip(page, route, name, expected) {
  const chart = page.locator('[data-slot="chart"]').last()
  await chart.scrollIntoViewIfNeeded()
  const marker = chart.locator(route === '/' ? '.recharts-bar-rectangle' : 'a[aria-label^="เปิด Daily Work"] circle').first()
  await marker.hover()
  const popup = chart.locator('[data-slot="chart-tooltip"]')
  await popup.waitFor()
  assert.ok((await popup.innerText()).includes(expected), 'tooltip formats the original decimal hours')
  const frame = await chart.boundingBox()
  const box = await popup.boundingBox()
  assert.ok(box.x >= frame.x - 1 && box.x + box.width <= frame.x + frame.width + 1, 'tooltip stays within chart width')
  await screenshot(page, `${name}-tooltip`)
  await page.mouse.move(0, 0)
}

async function definitions(page, touch) {
  const trigger = page.locator('summary').filter({ hasText: 'วิธีคำนวณและขอบเขตข้อมูล' })
  await trigger.scrollIntoViewIfNeeded()
  await trigger.focus()
  await page.keyboard.press('Enter')
  assert.equal(await trigger.evaluate((node) => node.parentElement.open), true, 'keyboard opens definitions')
  assert.ok((await trigger.locator('..').innerText()).includes('completed ÷ (total − cancelled) × 100'))
  await page.keyboard.press('Space')
  assert.equal(await trigger.evaluate((node) => node.parentElement.open), false, 'keyboard closes definitions')
  if (touch) await trigger.tap()
  else await trigger.click()
  assert.equal(await trigger.evaluate((node) => node.parentElement.open), true, 'touch/click opens definitions')
}

async function sources(page, name) {
  const details = page.locator('summary').filter({ hasText: 'ชั่วโมงและข้อมูลต้นทาง' })
  await details.focus()
  await page.keyboard.press('Enter')
  assert.equal(await details.evaluate((node) => node.parentElement.open), true, 'hours table opens without hover')
  assert.ok(await details.locator('..').locator('table').isVisible())
  await screenshot(page, `${name}-period-table`)
  for (const tab of ['Work Items', 'Daily Work']) {
    await page.getByRole('tab', { name: new RegExp(`^${tab} \\(`) }).click()
    const table = page.getByRole('tabpanel').locator('table')
    await table.waitFor()
    assert.ok(await table.evaluate((node) => node.scrollWidth <= node.clientWidth + 1), 'source table has no overflow')
    await screenshot(page, `${name}-${tab === 'Work Items' ? 'work-items' : 'daily-work'}`)
  }
}

async function exportCsv(page, report) {
  await page.locator('.data-transfer-trigger').click()
  const pending = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'ส่งออก CSV', exact: true }).click()
  const download = await pending
  const csv = await readFile(await download.path(), 'utf8')
  assert.equal((csv.match(/"work-item",/g) ?? []).length, report.workItems.length, 'exports only returned filtered work')
  assert.equal((csv.match(/"daily-work",/g) ?? []).length, report.timeEntries.length, 'exports only returned filtered hours')
  assert.ok(csv.includes('1.01'), 'exports formatted exact hours')
  for (const item of report.workItems) assert.ok(csv.includes(item.id), 'export retains public UUID')
  assert.ok(!csv.includes(previewData().workItems[5].title), 'unfiltered source row is excluded')
  await page.getByText('ส่งออก CSV สำเร็จ', { exact: true }).waitFor()
}

function checkSource(href, report, period = report.meta.period) {
  const params = new URL(href, origin).searchParams
  for (const [key, value] of Object.entries({ ...period, ...report.meta.filters })) {
    assert.equal(params.get(key), value, `source preserves ${key}`)
  }
}

async function appliedFilters(page, theme, name) {
  const selected = previewData('report-filtered').analysis
  let requests = 0
  const received = []
  await page.route('**/api/analysis/summary?*', async (route) => {
    requests++
    const params = new URL(route.request().url()).searchParams
    received.push(Object.fromEntries(params))
    const result = structuredClone(params.has('companyId') ? selected : previewData().analysis)
    result.meta.period = { startDate: params.get('startDate'), endDate: params.get('endDate') }
    // Controlled API boundary: the test verifies the UI consumes returned metadata.
    if (params.has('companyId')) selected.meta.period = result.meta.period
    if (!params.has('companyId')) result.filterOptions = selected.filterOptions
    await route.fulfill({ json: result })
  })
  await page.goto(`${origin}/analysis?theme=${theme}`, { waitUntil: 'networkidle' })
  const context = page.getByRole('region', { name: 'ช่วงเวลาและตัวกรองที่ใช้กับรายงาน' })
  const originalContext = await context.innerText()
  const trigger = page.getByRole('button', { name: /^ค้นหาและตัวกรอง/ })
  await trigger.click()
  const panel = page.locator('.search-filter-panel')
  for (const [control, option] of [['Company', 'Example Company'], ['Project', 'ปรับปรุงระบบจัดการงาน'], ['Functional role', 'Developer'], ['ชนิดงาน', 'Task']]) {
    await panel.getByRole('combobox', { name: `กรองตาม${control === 'ชนิดงาน' ? '' : ' '}${control}` }).click()
    await page.getByRole('option', { name: option, exact: true }).click()
  }
  assert.equal(await context.innerText(), originalContext, 'draft never relabels the applied report')
  assert.equal(requests, 1, 'draft does not fetch')
  await screenshot(page, `${name}-draft-filters`)
  await page.keyboard.press('Escape')
  assert.equal(await page.locator('.data-transfer-trigger').isDisabled(), true, 'draft blocks export')
  await trigger.click()
  await panel.getByRole('button', { name: 'ใช้ตัวกรอง', exact: true }).click()
  await panel.waitFor({ state: 'hidden' })
  await context.getByText('Example Company', { exact: true }).waitFor()
  for (const [key, value] of Object.entries(selected.meta.filters)) assert.equal(received.at(-1)[key], value)
  await screenshot(page, `${name}-applied`)
  await exportCsv(page, selected)
  await page.getByRole('tab', { name: /^Work Items \(/ }).click()
  const source = page.getByRole('tabpanel').getByRole('link', { name: /^เปิด Work Item / }).first()
  checkSource(await source.getAttribute('href'), selected)
  assert.equal(new URL(await source.getAttribute('href'), origin).searchParams.get('workItemId'), selected.workItems[0].id)
  await page.unroute('**/api/analysis/summary?*')
}

try {
  for (const theme of ['light', 'dark', 'special-dark']) {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce', hasTouch: viewport.width < 1024, timezoneId: 'America/Los_Angeles' })
      const page = await context.newPage()
      page.on('pageerror', (error) => errors.push(error.message))
      for (const route of ['/', '/analysis']) {
        const name = `${route === '/' ? 'dashboard' : 'analysis'}-${theme}-${viewport.width}`
        await page.goto(`${origin}${route}?theme=${theme}`, { waitUntil: 'networkidle' })
        await page.locator('main').getByText('Work Items ทั้งหมด', { exact: true }).waitFor()
        await screenshot(page, `${name}-top`)
        const charts = page.locator('[data-slot="chart"]')
        // Charts are deferred until their existing intersection boundary is visible.
        const chartCards = page.locator('[data-slot="card"]').filter({ hasText: route === '/' ? 'ชั่วโมง Daily Work ตามวัน' : 'สถานะ Work Items' })
        await chartCards.first().scrollIntoViewIfNeeded()
        await charts.first().waitFor()
        await screenshot(page, `${name}-charts`)
        if (route === '/analysis') {
          await page.locator('[data-slot="card"]').filter({ hasText: /Logged hours ตามช่วงเวลา|ชั่วโมงที่บันทึกตามช่วงเวลา/ }).first().scrollIntoViewIfNeeded()
          await charts.nth(1).waitFor()
          await screenshot(page, `${name}-hours`)
        }
        if (!before) {
          await frames(page)
          await tooltip(page, route, name, '4.50')
          if (route === '/') {
            const titles = await page.locator('[data-slot="card-title"]').allTextContents()
            assert.ok(titles.indexOf('Work Items เร่งด่วน') < titles.indexOf('Work Items ล่าสุด'), 'urgent before recent in reading order')
            assert.ok(titles.indexOf('Work Items เกินกำหนด') < titles.indexOf('Work Items ล่าสุด'), 'overdue before recent in reading order')
            const urgent = page.locator('[data-slot="card"]').filter({ hasText: 'Work Items เร่งด่วน' }).getByRole('link', { name: 'ดูรายการ' })
            assert.ok((await urgent.getAttribute('href')).includes('openOnly=true'))
            assert.ok((await urgent.getAttribute('href')).includes('priority=urgent'))
          } else {
            await sources(page, name)
          }
          await definitions(page, viewport.width < 1024)
          await screenshot(page, `${name}-definitions`)
          results.push({ route, theme, ...viewport, case: 'reading order, chart frames, source tables, keyboard and touch definitions', pass: true })
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no page overflow')
        assert.ok(await page.locator('main').last().evaluate((node) => node.scrollWidth <= node.clientWidth + 1), 'no main overflow')
        results.push({ route, theme, ...viewport, case: 'summary and charts', pass: true })
        if (!before) {
          for (const mode of ['report-filtered', 'report-closed', 'empty', 'error', 'slow', 'edge']) {
            await page.goto(`${origin}${route}?theme=${theme}&qa=${mode}`, { waitUntil: mode === 'slow' ? 'domcontentloaded' : 'networkidle' })
            if (mode === 'error') {
              await page.getByText(route === '/' ? 'โหลด Dashboard ไม่สำเร็จ' : 'โหลด Analysis ไม่สำเร็จ', { exact: true }).waitFor()
              assert.equal(await page.locator('[data-slot="chart"]').count(), 0, 'read failure has no synthetic chart')
              assert.equal(await page.getByText('Work Items ทั้งหมด', { exact: true }).count(), 0, 'read failure has no zero KPI')
            } else if (mode === 'slow') {
              await page.locator('[aria-busy="true"]').waitFor()
              assert.equal(await page.getByText('Work Items ทั้งหมด', { exact: true }).count(), 0, 'loading has no zero KPI')
              await screenshot(page, `${name}-${mode}-loading`)
              await page.getByText('Work Items ทั้งหมด', { exact: true }).waitFor()
            } else {
              await page.getByText('Work Items ทั้งหมด', { exact: true }).waitFor()
              if (mode === 'empty') {
                const empty = route === '/' ? 'ไม่พบ Work Items, Daily Work หรือ Projects ในช่วงและตัวกรองนี้' : 'ไม่มี Work Item ให้แสดงในกราฟนี้'
                await page.getByText(empty, { exact: true }).waitFor()
                assert.equal(await page.locator('[data-slot="chart"]').count(), 0)
              } else if (mode === 'edge') {
                const card = page.locator('[data-slot="card"]').filter({ hasText: route === '/' ? 'ชั่วโมง Daily Work ตามวัน' : 'ชั่วโมงที่บันทึกตามช่วงเวลา' }).first()
                await card.scrollIntoViewIfNeeded()
                await page.locator('[data-slot="chart"]').last().waitFor()
                await frames(page)
                await tooltip(page, route, `${name}-${mode}`, '12345678901234567890123456789012345.12')
              } else {
                const report = previewData(mode)[route === '/' ? 'dashboard' : 'analysis']
                if (route === '/') {
                  const urgent = page.locator('[data-slot="card"]').filter({ hasText: 'Work Items เร่งด่วน' }).getByRole('link', { name: 'ดูรายการ' })
                  checkSource(await urgent.getAttribute('href'), report)
                  if (mode === 'report-closed') await page.getByText('ไม่มี Work Items เร่งด่วน ในตัวกรองนี้', { exact: true }).waitFor()
                } else {
                  const active = page.getByRole('region', { name: 'ช่วงเวลาและตัวกรองที่ใช้กับรายงาน' })
                  assert.ok((await active.innerText()).includes('03/10/2026'))
                  assert.ok((await active.innerText()).includes(mode === 'report-closed' ? '100.0%' : '0.0%'))
                  await exportCsv(page, report)
                }
              }
            }
            assert.ok(await page.locator('main').last().evaluate((node) => node.scrollWidth <= node.clientWidth + 1))
            await screenshot(page, `${name}-${mode}`)
            results.push({ route, theme, ...viewport, case: mode, pass: true })
          }
        }
      }
      if (!before) {
        await appliedFilters(page, theme, `analysis-${theme}-${viewport.width}`)
        results.push({ route: '/analysis', theme, ...viewport, case: 'draft/apply, named active summary, filtered CSV and exact source UUID', pass: true })
      }
      await context.close()
      console.log(`Dashboard/Analysis ${before ? 'before' : 'after'}: ${theme} ${viewport.width}px passed`)
    }
  }
  assert.deepEqual(errors, [], 'no uncaught browser errors')
  completed = true
} catch (error) {
  failure = error.message
  throw error
} finally {
  await browser.close()
  await writeFile(`${directory}/results.json`, JSON.stringify({ completed, failure, synthetic: true, database: false, timezone: 'America/Los_Angeles', results, errors }, null, 2))
}
