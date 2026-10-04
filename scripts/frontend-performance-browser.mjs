import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'

// E2E against the isolated synthetic preview; never a unit test or field-CWV assertion.
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PMS_PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.PMS_PREVIEW_ORIGIN || 'http://127.0.0.1:3791'
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('Use an isolated loopback preview origin')
const browser = await chromium.launch({ headless: true, channel: process.env.PMS_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) })
const routes = ['/', '/projects', '/projects/project-0', '/work-items', '/board', '/analysis', '/daily-work', '/company', '/settings']
const targeted = process.argv.includes('--targeted')
const results = []
let failed = false
try {
  for (const theme of (targeted ? [] : ['light', 'dark', 'special-dark'])) {
    for (const width of [375, 768, 1024, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      for (const route of routes) {
        const page = await context.newPage()
        const errors = []
        page.on('pageerror', (error) => errors.push(error.message))
        page.on('console', (message) => { if (['warning', 'error'].includes(message.type())) errors.push(message.text()) })
        try {
          await page.goto(`${origin}${route}?theme=${theme}`, { waitUntil: 'networkidle' })
          await page.waitForSelector('main')
          await page.locator('main').last().evaluate((element) => { element.scrollTop = element.scrollHeight })
          await page.waitForTimeout(400)
          await page.locator('main').last().evaluate((element) => { element.scrollTop = 0 })
          const overflow = await page.evaluate(() => ({ page: document.documentElement.scrollWidth > innerWidth + 1, main: Array.from(document.querySelectorAll('main')).at(-1).scrollWidth > Array.from(document.querySelectorAll('main')).at(-1).clientWidth + 1 }))
          assert.equal(overflow.page, false, 'page overflow')
          assert.equal(overflow.main, false, 'main overflow')
          assert.deepEqual(errors, [], 'console/page errors')
          assert.ok(await page.locator('main').last().innerText())
          results.push({ route, theme, width, pass: true }); console.log(`PASS ${route} ${theme} ${width}`)
        } catch (error) {
          failed = true; results.push({ route, theme, width, pass: false, error: error.message, console: errors })
        } finally { await page.close() }
      }
      await context.close()
    }
  }
  const context = await browser.newContext({ viewport: { width: 375, height: 900 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  const check = async (name, action) => {
    try { await action(); results.push({ name, pass: true }); console.log(`PASS ${name}`) }
    catch (error) { failed = true; results.push({ name, pass: false, error: error.message }); console.error(`FAIL ${name}: ${error.message}`) }
  }
  await check('Analysis large report pagination and full export-ready dataset', async () => {
    await page.route('**/api/analysis/summary?*', async (route) => {
      const response = await route.fetch()
      const data = await response.json()
      data.workItems = Array.from({ length: 123 }, (_, id) => ({ ...data.workItems[0], id: `row-${id}`, title: `Record-${id}` }))
      await route.fulfill({ response, json: data })
    })
    await page.goto(`${origin}/analysis`, { waitUntil: 'networkidle' })
    await page.getByRole('tab', { name: 'Work Items (123)', exact: true }).click()
    const panel = page.getByRole('tabpanel')
    assert.equal(await panel.locator('tbody tr').count(), 50)
    await panel.getByRole('button', { name: 'ถัดไป', exact: true }).click()
    assert.match(await panel.innerText(), /Record-50/)
    await panel.getByRole('button', { name: 'ถัดไป', exact: true }).click()
    assert.equal(await panel.locator('tbody tr').count(), 23)
    assert.match(await panel.innerText(), /Record-122/)
  })
  await page.unroute('**/api/analysis/summary?*')
  await check('Analysis refresh failure preserves usable report and retries', async () => {
    await page.goto(`${origin}/analysis`, { waitUntil: 'networkidle' })
    await page.route('**/api/analysis/summary?*', (route) => route.fulfill({ status: 503, json: { error: { message: 'Synthetic outage' } } }))
    await page.getByRole('button', { name: 'ใช้ตัวกรอง', exact: true }).click()
    await page.getByText('Synthetic outage', { exact: true }).waitFor()
    assert.ok(await page.getByRole('tab', { name: /Work Items/ }).isVisible())
    await page.unroute('**/api/analysis/summary?*')
    await page.getByRole('button', { name: 'ลองอีกครั้ง', exact: true }).click()
    await page.getByText('Synthetic outage', { exact: true }).waitFor({ state: 'hidden' })
  })
  for (const route of ['/analysis', '/daily-work', '/projects', '/work-items', '/company', '/board']) {
    await check(`${route} slow loading retains page shell`, async () => {
      await page.goto(`${origin}${route}?qa=slow`, { waitUntil: 'domcontentloaded' })
      await page.waitForSelector('main')
      assert.ok(await page.locator('header').count())
      await page.waitForLoadState('networkidle')
    })
    await check(`${route} empty state`, async () => {
      await page.goto(`${origin}${route}?qa=empty`, { waitUntil: 'networkidle' })
      assert.ok(await page.locator('main').last().innerText())
      assert.equal(await page.locator('main').last().evaluate((main) => main.scrollWidth > main.clientWidth + 1), false)
    })
    await check(`${route} error recovery`, async () => {
      await page.goto(`${origin}${route}?qa=error`, { waitUntil: 'networkidle' })
      assert.ok(await page.getByRole('alert').count())
      assert.ok(await page.getByRole('button', { name: /ลองอีกครั้ง/ }).count())
    })
  }
  await check('Daily Work deferred add dialog opens with keyboard', async () => {
    await page.goto(`${origin}/daily-work`, { waitUntil: 'networkidle' })
    const add = page.getByRole('button', { name: /เพิ่มบันทึก|Add Work Log|Add.*Log|^Add$/ }).first()
    await add.focus(); await page.keyboard.press('Enter')
    await page.getByRole('dialog').waitFor()
    await page.keyboard.press('Escape')
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
  })

  for (const theme of ['light', 'dark', 'special-dark']) {
    for (const width of [375, 768, 1024, 1440]) {
      await check(`Analysis deferred chart geometry ${theme} ${width}`, async () => {
        const isolated = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
        const chartPage = await isolated.newPage()
        try {
          let release
          const gate = new Promise((resolve) => { release = resolve })
          await chartPage.route('**/analysis-charts-*.js', async (route) => { await gate; await route.continue() })
          await chartPage.goto(`${origin}/analysis?theme=${theme}`, { waitUntil: 'domcontentloaded' })
          const shell = chartPage.locator('[aria-label="กราฟ Analysis"]')
          await shell.locator('[data-slot="skeleton"]').first().waitFor()
          await shell.locator('[data-slot="card"]').first().scrollIntoViewIfNeeded()
          await shell.locator('[data-slot="card"]').last().scrollIntoViewIfNeeded()
          const before = await shell.boundingBox()
          release()
          await shell.locator('[data-slot="chart"]').nth(1).waitFor()
          await shell.locator('[data-slot="skeleton"]').first().waitFor({ state: 'hidden' })
          await shell.locator('svg.recharts-surface').nth(1).waitFor()
          const after = await shell.boundingBox()
          assert.ok(before && after)
          assert.ok(Math.abs(before.height - after.height) <= 1, `chart footprint moved: ${before.height} -> ${after.height}`)
          if ((theme === 'light' && width === 1440) || (theme === 'dark' && width === 375)) await chartPage.screenshot({ path: `document/issue-30-analysis-${theme}-${width}.png` })
        } finally { await isolated.close() }
      })
    }
  }


  for (const width of [375, 768, 1024, 1440]) {
    await check(`Daily Work calendar lazy geometry ${width}`, async () => {
      const isolated = await browser.newContext({ viewport: { width, height: 900 } })
      const calendarPage = await isolated.newPage()
      try {
        let release
        const gate = new Promise((resolve) => { release = resolve })
        await calendarPage.route('**/calendar-*.js', async (route) => { await gate; await route.continue() })
        await calendarPage.goto(`${origin}/daily-work`, { waitUntil: 'domcontentloaded' })
        const placeholder = calendarPage.locator('[data-slot="skeleton"]').filter({ hasNot: calendarPage.locator('*') }).first()
        await placeholder.waitFor()
        const before = await placeholder.boundingBox()
        release()
        const calendar = calendarPage.locator('[data-slot="calendar"]')
        await calendar.waitFor()
        const after = await calendar.boundingBox()
        assert.equal(before.height, 336)
        assert.equal(after.height, before.height)
      } finally { await isolated.close() }
    })
  }
  await page.goto(`${origin}/analysis?themeSwitch=1`, { waitUntil: 'networkidle' })
  await page.getByText('สถานะ Work Items', { exact: true }).scrollIntoViewIfNeeded()
  await page.locator('svg.recharts-surface').first().waitFor()
  for (const [theme, label] of [['dark', 'Dark'], ['special-dark', 'Special Dark'], ['light', 'Light']]) {
    await check(`Theme switching ${theme} preserves chart nodes and layout`, async () => {
      const chart = await page.locator('[data-slot="chart"]').first().elementHandle()
      const before = await chart.boundingBox()
      await page.getByRole('button', { name: 'Toggle theme', exact: true }).click()
      await page.getByRole('menuitem', { name: label, exact: true }).click()
      await page.waitForFunction((theme) => document.documentElement.classList.contains(theme), theme)
      const after = await chart.boundingBox()
      assert.ok(await chart.evaluate((element) => element.isConnected))
      assert.equal(before.width, after.width)
      assert.equal(before.height, after.height)
    })
  }
  await context.close()
} finally { await browser.close() }
const report = { scope: 'Isolated browser E2E; synthetic data; no production CWV claim', total: results.length, pass: results.filter((row) => row.pass).length, fail: results.filter((row) => !row.pass).length, results }
await writeFile(targeted ? 'document/issue-30-browser-targeted-results.json' : 'document/issue-30-browser-results.json', JSON.stringify(report, null, 2) + '\n')
for (const row of results.filter((row) => !row.pass)) console.error(row)
console.log(`Browser: ${report.total} total / ${report.pass} PASS / ${report.fail} FAIL`)
process.exitCode = failed ? 1 : 0
