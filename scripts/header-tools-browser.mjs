import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PMS_PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.PMS_PREVIEW_ORIGIN || 'http://127.0.0.1:3791'
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('Use the isolated synthetic preview')
const directory = 'artifacts/header-tools'
await mkdir(directory, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: process.env.PMS_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) })
const results = []
const errors = []
const routes = ['/', '/projects', '/work-items', '/board', '/analysis', '/daily-work']

async function openPanel(page) {
  const trigger = page.getByRole('button', { name: /^ค้นหาและตัวกรอง/ })
  await trigger.click()
  const panel = page.locator('.search-filter-panel')
  await panel.waitFor()
  return { panel, trigger }
}

async function checkBounds(page, panel) {
  const bounds = await panel.boundingBox()
  const viewport = page.viewportSize()
  assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= viewport.width + 1 && bounds.y + bounds.height <= viewport.height + 1, 'panel must fit the viewport')
  assert.equal(await panel.evaluate((node) => node.scrollWidth <= node.clientWidth + 1), true, 'panel must not overflow horizontally')
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, 'page must not overflow horizontally')
  assert.equal(await panel.locator('button').last().isVisible(), true, 'last action must remain reachable')
}

try {
  for (const theme of ['light', 'dark', 'special-dark']) {
    for (const width of [390, 768, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' })
      const page = await context.newPage()
      page.on('pageerror', (error) => errors.push(error.message))
      for (const route of routes) {
        await page.goto(`${origin}${route}?theme=${theme}`, { waitUntil: 'networkidle' })
        assert.equal(await page.locator('.search-filter-panel').count(), 0, 'filters start collapsed')
        assert.equal(await page.locator('.page-toolbar .search-filter-trigger').count(), 1, 'filters belong to the heading')
        assert.equal(await page.locator('main input[type="search"]').count(), 0, 'no standalone search row remains')
        const { panel, trigger } = await openPanel(page)
        await checkBounds(page, panel)
        // A nested select is portalled; choosing it and Escape must not dismiss the parent panel.
        const select = panel.getByRole('combobox').first()
        if (await select.count()) {
          await select.click()
          await page.getByRole('option').first().click()
          await panel.waitFor()
          await select.click()
          await page.keyboard.press('Escape')
          await panel.waitFor()
        }
        await page.screenshot({ path: `${directory}/${route.slice(1) || 'dashboard'}-${theme}-${width}-open.png` })
        await panel.getByRole('button', { name: 'ปิดแผงค้นหาและตัวกรอง' }).click()
        await panel.waitFor({ state: 'hidden' })
        assert.equal(await trigger.evaluate((node) => node === document.activeElement), true, 'closing returns focus to the trigger')
        await trigger.focus()
        await page.keyboard.press('Enter')
        await panel.waitFor()
        await page.keyboard.press('Escape')
        await panel.waitFor({ state: 'hidden' })
        await page.screenshot({ path: `${directory}/${route.slice(1) || 'dashboard'}-${theme}-${width}.png` })
        results.push({ route, theme, width, case: 'collapsed header, panel bounds, nested select, keyboard and focus', pass: true })
      }
      await context.close()
      console.log(`Header panels passed: ${theme} ${width}px`)
    }
  }

  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(error.message))
  for (const [route, searchName, emptyText] of [
    ['/projects', 'ค้นหา Project', 'ไม่พบ Project'],
    ['/work-items', 'ค้นหา Work Items', 'ไม่พบ Work Item ที่ตรงกับตัวกรอง'],
    ['/daily-work', 'ค้นหา Daily Work', 'ไม่พบ Daily Work ที่ตรงกับคำค้นหา'],
  ]) {
    await page.goto(`${origin}${route}`, { waitUntil: 'networkidle' })
    let { panel } = await openPanel(page)
    await panel.getByRole('searchbox', { name: searchName }).fill('no-match-synthetic-qa')
    await panel.getByRole('button', { name: 'แสดงผลลัพธ์' }).click()
    await page.getByText(emptyText, { exact: true }).waitFor()
    ;({ panel } = await openPanel(page))
    assert.equal(await panel.getByRole('searchbox', { name: searchName }).inputValue(), 'no-match-synthetic-qa', 'search persists when reopened')
    await panel.getByRole('button', { name: 'ล้างตัวกรอง' }).click()
    assert.equal(await panel.getByRole('searchbox', { name: searchName }).inputValue(), '')
    await panel.getByRole('button', { name: 'แสดงผลลัพธ์' }).click()
    await page.getByText(emptyText, { exact: true }).waitFor({ state: 'hidden' })
    results.push({ route, case: 'search, reopen and reset restores results', pass: true })
  }

  for (const [route, formats] of [['/work-items', ['CSV', 'Markdown', 'JSON']], ['/daily-work', ['CSV', 'Markdown']], ['/analysis', ['CSV']]]) {
    await page.goto(`${origin}${route}`, { waitUntil: 'networkidle' })
    for (const format of formats) {
      await page.locator('.page-toolbar .data-transfer-trigger').click()
      const menu = page.locator('.data-transfer-menu')
      await menu.getByText('ส่งออกข้อมูล', { exact: true }).waitFor()
      if (route === '/work-items') await menu.getByText('นำเข้าข้อมูล', { exact: true }).waitFor()
      const downloadPromise = page.waitForEvent('download')
      await menu.getByRole('menuitem', { name: format === 'JSON' ? 'Export importable JSON' : route === '/analysis' ? 'ส่งออก CSV' : `Export ${format}`, exact: true }).click()
      const download = await downloadPromise
      const content = await readFile(await download.path(), 'utf8')
      assert.ok(content.length > 20, 'download must contain data')
      if (format === 'JSON') assert.ok(JSON.parse(content), 'JSON must parse')
      results.push({ route, format, case: 'grouped export downloads a populated file', pass: true })
    }
  }

  await page.goto(`${origin}/work-items`, { waitUntil: 'networkidle' })
  await page.locator('.data-transfer-trigger').click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: 'Import work items from JSON' }).click()
  await chooser
  assert.equal(await page.locator('input[type="file"]').getAttribute('accept'), '.json,application/json')
  results.push({ route: '/work-items', case: 'import menu opens JSON file chooser', pass: true })
  const importedRows = [{ id: '41000000-0000-4000-8000-000000000001', title: 'Synthetic import test', projectId: '42000000-0000-4000-8000-000000000001' }]
  await page.route('**/api/work-items/import', async (route) => {
    assert.deepEqual(route.request().postDataJSON(), importedRows)
    await route.fulfill({ json: { imported: 1, rows: [{ row: 1, outcome: 'created' }] } })
  })
  await page.locator('input[type="file"]').setInputFiles({ name: 'header-import.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(importedRows)) })
  await page.getByText('header-import.json: เพิ่ม 1 · ข้าม 0 · ผิดพลาด 0', { exact: true }).waitFor()
  results.push({ route: '/work-items', case: 'mocked import posts reviewed public UUIDs and displays the result', pass: true })

  await page.goto(`${origin}/board`, { waitUntil: 'networkidle' })
  let board = await openPanel(page)
  const boardRequest = page.waitForRequest((req) => req.url().includes('/api/work-items?') && new URL(req.url()).searchParams.get('role') === 'Developer')
  await board.panel.getByRole('combobox', { name: 'Functional role', exact: true }).click()
  await page.getByRole('option', { name: 'Developer', exact: true }).click()
  await boardRequest
  await board.panel.getByRole('button', { name: 'แสดงผลลัพธ์' }).click()
  board = await openPanel(page)
  assert.equal(await board.panel.getByRole('combobox', { name: 'Functional role', exact: true }).textContent(), 'Developer')
  const boardReset = page.waitForRequest((req) => req.url().includes('/api/work-items?') && !new URL(req.url()).searchParams.has('role'))
  await board.panel.getByRole('button', { name: 'ล้างตัวกรอง' }).click()
  await boardReset
  results.push({ route: '/board', case: 'role changes the API query, persists and resets', pass: true })

  await page.goto(`${origin}/`, { waitUntil: 'networkidle' })
  const dashboard = await openPanel(page)
  await dashboard.panel.getByRole('combobox', { name: 'Functional role', exact: true }).click()
  await page.getByRole('option', { name: 'Developer', exact: true }).click()
  await dashboard.panel.getByRole('combobox', { name: 'Work Item kind', exact: true }).click()
  await page.getByRole('option', { name: 'Task', exact: true }).click()
  await dashboard.panel.locator('#dashboard-start-date').click()
  await page.getByRole('dialog', { name: 'เลือกวันที่', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await dashboard.panel.waitFor()
  await dashboard.panel.getByRole('button', { name: 'ใช้ตัวกรอง', exact: true }).click()
  await page.waitForURL((url) => url.searchParams.get('kind') === 'Task' && url.searchParams.get('role') === 'Developer')
  assert.ok(new URL(page.url()).searchParams.get('startDate'))
  assert.ok(new URL(page.url()).searchParams.get('endDate'))
  results.push({ route: '/', case: 'nested calendar preserves panel and native GET submits dates and selected filters', pass: true })

  // Draft reports only apply on submit; successful apply closes the panel.
  await page.goto(`${origin}/analysis`, { waitUntil: 'networkidle' })
  const { panel } = await openPanel(page)
  await panel.getByRole('combobox', { name: 'กรองตามชนิดงาน' }).click()
  await page.getByRole('option', { name: 'Task', exact: true }).click()
  const request = page.waitForRequest((req) => req.url().includes('/api/analysis/summary?') && new URL(req.url()).searchParams.get('kind') === 'Task')
  await panel.getByRole('button', { name: 'ใช้ตัวกรอง', exact: true }).click()
  await request
  await panel.waitFor({ state: 'hidden' })
  results.push({ route: '/analysis', case: 'draft filters apply on submit and close the panel', pass: true })
  await context.close()
  assert.deepEqual(errors, [], 'no browser runtime errors')
  console.log(`Passed ${results.length} header and data-transfer browser cases`)
} finally {
  await writeFile(`${directory}/results.json`, JSON.stringify({ results, errors }, null, 2))
  await browser.close()
}
