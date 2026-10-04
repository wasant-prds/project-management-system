import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { previewResponse } from '../tests/frontend-ui/preview-fixtures.mjs'

// Production Next SSR/hydration/chunks with browser-intercepted synthetic APIs.
// Run only against an isolated standalone test container on loopback, never a live deployment.
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PMS_PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.PMS_PRODUCTION_TEST_ORIGIN
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin || '')) throw new Error('Set PMS_PRODUCTION_TEST_ORIGIN to the isolated loopback test container')
const proof = process.env.PMS_PRODUCTION_TEST_PROOF
if (!proof) throw new Error('Set PMS_PRODUCTION_TEST_PROOF to the synthetic proof configured only on the isolated container')
const browser = await chromium.launch({ headless: true, channel: process.env.PMS_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) })
const results = []
const check = async (name, width, theme, action, injectedFailure = false) => {
  const context = await browser.newContext({ viewport: { width, height: 1000 }, extraHTTPHeaders: { 'x-pms-owner-proof': proof } })
  const page = await context.newPage()
  page.setDefaultTimeout(15000)
  const errors = [], messages = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => { if (['warning', 'error'].includes(message.type())) messages.push(message.text()) })
  await page.route('**/api/**', async (route) => {
    const result = previewResponse(new URL(route.request().url()), route.request().method())
    if (result.value.preferences) result.value.preferences.theme = theme
    await route.fulfill({ status: result.status, json: result.value })
  })
  try {
    const evidence = await action(page)
    assert.deepEqual(errors, [], 'unhandled errors')
    if (!injectedFailure) assert.deepEqual(messages, [], 'console warnings/errors or hydration regressions')
    assert.ok(!messages.some((message) => /hydration|did not match|server rendered HTML/i.test(message)), 'hydration error')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
    results.push({ name, pass: true, evidence }); console.log(`PASS ${name}`)
  } catch (error) {
    results.push({ name, pass: false, error: error.message, errors, console: messages }); console.error(`FAIL ${name}: ${error.message}`)
  } finally { await context.close() }
}

try {
  for (const width of [375, 1440]) {
    for (const theme of ['light', 'dark']) {
      for (const route of ['/daily-work', '/analysis', '/company', '/projects']) {
        await check(`Next production hydration ${route} ${theme} ${width}`, width, theme, async (page) => {
          const response = await page.goto(`${origin}${route}`, { waitUntil: 'networkidle' })
          assert.equal(response.status(), 200)
          await page.waitForFunction((theme) => document.documentElement.classList.contains(theme), theme)
          if (route === '/daily-work') {
            await page.locator('[data-slot="calendar"]').waitFor()
            await page.getByRole('button', { name: /Add Work Log|^Add$/ }).click()
            await page.getByRole('heading', { name: 'Add Work Log', exact: true }).waitFor()
            await page.keyboard.press('Escape')
            await page.getByRole('dialog').waitFor({ state: 'hidden' })
          } else if (route === '/analysis') {
            const shell = page.locator('[aria-label="กราฟ Analysis"]')
            await shell.locator('[data-slot="card"]').first().scrollIntoViewIfNeeded()
            await shell.locator('[data-slot="card"]').last().scrollIntoViewIfNeeded()
            await shell.locator('svg.recharts-surface').nth(1).waitFor()
          }
          return { hydrated: true, consoleErrors: 0 }
        })
      }
    }
  }
  for (const kind of ['calendar', 'dialog', 'analysis']) {
    await check(`Next production ${kind} chunk failure and retry`, 1440, 'light', async (page) => {
      let requests = 0
      const marker = { calendar: 'MuiDateCalendar', dialog: 'Link hours to a project work item', analysis: 'เปิด Daily Work ช่วง' }[kind]
      await page.route('**/_next/static/chunks/*.js', async (route) => {
        const response = await route.fetch()
        const content = await response.text()
        if (content.includes(marker) && ++requests === 1) await route.abort('failed')
        else await route.fulfill({ response })
      })
      const path = kind === 'analysis' ? '/analysis' : '/daily-work'
      await page.goto(`${origin}${path}`, { waitUntil: 'networkidle' })
      if (kind === 'dialog') await page.getByRole('button', { name: /Add Work Log|^Add$/ }).click()
      if (kind === 'analysis') {
        const shell = page.locator('[aria-label="กราฟ Analysis"]')
        await shell.locator('[data-slot="card"]').first().scrollIntoViewIfNeeded()
        await shell.locator('[data-slot="card"]').last().scrollIntoViewIfNeeded()
      }
      const label = { calendar: 'ลองโหลดปฏิทินอีกครั้ง', dialog: 'ลองโหลดแบบฟอร์มอีกครั้ง', analysis: 'ลองโหลดกราฟอีกครั้ง' }[kind]
      await page.getByRole('button', { name: label, exact: true }).first().waitFor()
      const retained = await (kind === 'analysis' ? page.locator('[aria-label="กราฟ Analysis"] table') : page.locator('[data-work-log-card]').first()).elementHandle()
      for (const button of await page.getByRole('button', { name: label, exact: true }).elementHandles()) await button.click()
      if (kind === 'dialog') await page.getByRole('heading', { name: 'Add Work Log', exact: true }).waitFor()
      if (kind === 'calendar') await page.locator('[data-slot="calendar"]').waitFor()
      if (kind === 'analysis') await page.locator('svg.recharts-surface').nth(1).waitFor()
      assert.ok(requests >= 2, 'retry must request the failed production chunk again')
      assert.ok(await retained.evaluate((node) => node.isConnected), 'local retry must preserve usable data nodes')
      return { requests, usableDataRetained: true }
    }, true)
  }
} finally { await browser.close() }
const report = { scope: 'Production Next standalone SSR/hydration/Webpack with intercepted synthetic APIs; no real auth/database or field CWV claim', total: results.length, pass: results.filter((row) => row.pass).length, fail: results.filter((row) => !row.pass).length, results }
await writeFile('document/issue-30-production-browser-results.json', JSON.stringify(report, null, 2) + '\n')
console.log(`Production browser: ${report.total} total / ${report.pass} PASS / ${report.fail} FAIL`)
process.exitCode = report.fail ? 1 : 0
