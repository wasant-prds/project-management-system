import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'

// Review regressions: real production TSX and Webpack chunk retry; synthetic API only.
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PMS_PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.PMS_PREVIEW_ORIGIN || 'http://127.0.0.1:3791'
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('Use an isolated loopback preview origin')
const browser = await chromium.launch({ headless: true, channel: process.env.PMS_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) })
const results = []
const check = async (name, options, action) => {
  const context = await browser.newContext({ viewport: { width: options.width || 1440, height: 1000 }, reducedMotion: 'no-preference' })
  const page = await context.newPage()
  page.setDefaultTimeout(10000)
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    const evidence = await action(page)
    assert.deepEqual(errors, [], 'unhandled browser errors')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
    results.push({ name, pass: true, evidence }); console.log(`PASS ${name}`)
  } catch (error) {
    results.push({ name, pass: false, error: error.message, errors }); console.error(`FAIL ${name}: ${error.message}`)
  } finally { await context.close() }
}

try {
  for (const oldFirst of [false, true]) {
    await check(`Company mutation refresh ${oldFirst ? 'old read finishes first' : 'old read finishes last'}`, {}, async (page) => {
      let reads = 0, writes = 0, releaseOld, releaseFresh
      const oldGate = new Promise((resolve) => { releaseOld = resolve })
      const freshGate = new Promise((resolve) => { releaseFresh = resolve })
      const company = { id: 'review-company', code: null, name: 'Review Synthetic Company', displayName: null, location: null, address: null, phone: null, description: null, summary: { projects: 0, workItems: 0, hours: '0' } }
      await page.route('**/api/company*', async (route) => {
        if (route.request().method() === 'POST') { writes++; await route.fulfill({ json: { company } }); return }
        const read = ++reads
        await (read === 1 ? oldGate : freshGate)
        await route.fulfill({ json: { companies: read === 1 ? [] : [company], page: { nextCursor: null } } })
      })
      await page.goto(`${origin}/company`, { waitUntil: 'domcontentloaded' })
      await page.locator('#company-form summary').click()
      await page.locator('#company-name').fill(company.name)
      await page.getByRole('button', { name: 'บันทึก', exact: true }).click()
      await page.waitForFunction(() => document.querySelector('#company-name').value === '')
      assert.equal(reads, 2)
      if (oldFirst) { releaseOld(); await page.waitForTimeout(100); assert.equal(await page.getByText('ยังไม่มี Company', { exact: true }).count(), 0) }
      releaseFresh()
      await page.getByText('บันทึก Company แล้ว', { exact: true }).waitFor()
      releaseOld(); await page.waitForTimeout(150)
      assert.equal(await page.getByText(company.name, { exact: true }).count(), 1)
      assert.equal(await page.getByText('ยังไม่มี Company', { exact: true }).count(), 0)
      return { reads, writes, staleResultIgnored: true }
    })
  }

  for (const width of [375, 1440]) {
    for (const theme of ['light', 'dark']) {
      await check(`Calendar failure and local retry ${theme} ${width}`, { width }, async (page) => {
        let release, requests = 0
        const gate = new Promise((resolve) => { release = resolve })
        await page.route('**/calendar-*.js', async (route) => { if (++requests === 1) { await gate; await route.abort('failed') } else await route.continue() })
        await page.goto(`${origin}/daily-work?theme=${theme}`, { waitUntil: 'domcontentloaded' })
        const placeholder = page.locator('[data-slot="skeleton"]').first()
        await placeholder.waitFor()
        const before = await placeholder.boundingBox()
        await page.locator('[data-work-log-card]').first().waitFor()
        const card = await page.locator('[data-work-log-card]').first().elementHandle()
        release()
        const alert = page.getByRole('alert')
        await alert.waitFor()
        const after = await alert.boundingBox()
        assert.equal(before.height, 336); assert.equal(after.height, before.height)
        assert.ok(await card.evaluate((node) => node.isConnected))
        await page.getByRole('button', { name: 'ลองโหลดปฏิทินอีกครั้ง', exact: true }).click()
        await page.locator('[data-slot="calendar"]').waitFor()
        assert.equal(requests, 2)
        assert.ok(await card.evaluate((node) => node.isConnected), 'local retry must retain usable list nodes')
        return { beforeHeight: before.height, errorHeight: after.height, requests }
      })

      await check(`Dialog failure and local retry ${theme} ${width}`, { width }, async (page) => {
        let requests = 0
        await page.route('**/work-log-dialog-*.js', (route) => ++requests === 1 ? route.abort('failed') : route.continue())
        await page.goto(`${origin}/daily-work?theme=${theme}`, { waitUntil: 'networkidle' })
        const card = await page.locator('[data-work-log-card]').first().elementHandle()
        await page.getByRole('button', { name: /Add Work Log|^Add$/ }).click()
        await page.getByRole('heading', { name: 'โหลดแบบฟอร์มไม่สำเร็จ', exact: true }).waitFor()
        assert.ok(await card.evaluate((node) => node.isConnected))
        await page.getByRole('button', { name: 'ลองโหลดแบบฟอร์มอีกครั้ง', exact: true }).click()
        await page.getByRole('heading', { name: 'Add Work Log', exact: true }).waitFor()
        assert.equal(requests, 2)
        await page.keyboard.press('Escape')
        await page.getByRole('dialog').waitFor({ state: 'hidden' })
        assert.ok(await card.evaluate((node) => node.isConnected))
        return { requests, listRetained: true }
      })

      await check(`Add and details Dialog exit motion ${theme} ${width}`, { width }, async (page) => {
        await page.goto(`${origin}/daily-work?theme=${theme}`, { waitUntil: 'networkidle' })
        for (const mode of ['add', 'details']) {
          if (mode === 'add') await page.getByRole('button', { name: /Add Work Log|^Add$/ }).click()
          else await page.locator('[data-work-log-card]').first().getByRole('button', { name: 'ดูรายละเอียด', exact: true }).click()
          await page.getByRole('dialog').waitFor()
          if (mode === 'add') await page.getByRole('heading', { name: 'Add Work Log', exact: true }).waitFor()
          await page.waitForTimeout(250)
          await page.evaluate(() => {
            const node = document.querySelector('[role="dialog"]')
            window.reviewExit = { closed: false, duration: parseFloat(getComputedStyle(node).animationDuration) * 1000 }
            const observer = new MutationObserver(() => {
              if (node.getAttribute('data-state') === 'closed' && node.isConnected) window.reviewExit.closed = true
              if (!node.isConnected) observer.disconnect()
            })
            observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] })
          })
          await page.keyboard.press('Escape')
          await page.getByRole('dialog').waitFor({ state: 'hidden' })
          assert.equal(await page.evaluate(() => window.reviewExit.closed), true, `${mode} must remain mounted in closed animation state`)
          assert.ok(await page.evaluate(() => window.reviewExit.duration > 0))
        }
        return { addAndDetailsExit: true }
      })

      await check(`Analysis chunk error geometry table identity and retry ${theme} ${width}`, { width }, async (page) => {
        let release, requests = 0
        const gate = new Promise((resolve) => { release = resolve })
        await page.route('**/analysis-charts-*.js', async (route) => { if (++requests === 1) { await gate; await route.abort('failed') } else await route.continue() })
        await page.goto(`${origin}/analysis?theme=${theme}`, { waitUntil: 'domcontentloaded' })
        const shell = page.locator('[aria-label="กราฟ Analysis"]')
        await shell.locator('[data-slot="skeleton"]').first().waitFor()
        await shell.locator('[data-slot="card"]').first().scrollIntoViewIfNeeded()
        await shell.locator('[data-slot="card"]').last().scrollIntoViewIfNeeded()
        const before = await shell.boundingBox()
        const table = await shell.locator('table').elementHandle()
        const hours = await shell.locator('table').innerText()
        release()
        await shell.getByRole('alert').nth(1).waitFor()
        const error = await shell.boundingBox()
        assert.ok(Math.abs(before.height - error.height) <= 1)
        assert.ok(await table.evaluate((node) => node.isConnected))
        assert.equal(await shell.locator('table').innerText(), hours)
        for (const button of await shell.getByRole('button', { name: 'ลองโหลดกราฟอีกครั้ง', exact: true }).elementHandles()) await button.click()
        await shell.locator('[data-slot="chart"]').nth(1).waitFor()
        const after = await shell.boundingBox()
        assert.ok(Math.abs(before.height - after.height) <= 1)
        assert.ok(await table.evaluate((node) => node.isConnected))
        assert.equal(requests, 2, 'both plots share the recovered chunk')
        return { beforeHeight: before.height, errorHeight: error.height, afterHeight: after.height, requests, tableRetained: true }
      })
    }

    await check(`Dashboard chunk error geometry and retry ${width}`, { width }, async (page) => {
      let requests = 0
      await page.route('**/dashboard-charts-*.js', (route) => ++requests === 1 ? route.abort('failed') : route.continue())
      await page.goto(origin, { waitUntil: 'domcontentloaded' })
      await page.getByText('ชั่วโมง Daily Work ตามวัน', { exact: true }).scrollIntoViewIfNeeded()
      const alert = page.getByRole('alert')
      await alert.waitFor()
      assert.equal((await alert.boundingBox()).height, 260)
      assert.ok(await page.getByRole('link', { name: 'เปิด Daily Work', exact: true }).isVisible())
      await page.getByRole('button', { name: 'ลองโหลดกราฟอีกครั้ง', exact: true }).click()
      await page.locator('svg.recharts-surface').waitFor()
      assert.equal(requests, 2)
      return { errorHeight: 260, requests }
    })

    await check(`Slow Dialog visible feedback cancel and reopen ${width}`, { width }, async (page) => {
      let release, requests = 0
      const gate = new Promise((resolve) => { release = resolve })
      await page.route('**/work-log-dialog-*.js', async (route) => { requests++; await gate; await route.continue() })
      await page.goto(`${origin}/daily-work`, { waitUntil: 'networkidle' })
      const add = page.getByRole('button', { name: /Add Work Log|^Add$/ })
      await add.click()
      await page.getByRole('heading', { name: 'กำลังโหลดแบบฟอร์ม…', exact: true }).waitFor()
      await page.getByRole('button', { name: 'ยกเลิก', exact: true }).click()
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
      assert.ok(await add.evaluate((node) => node === document.activeElement))
      release(); await page.waitForLoadState('networkidle')
      assert.equal(await page.getByRole('dialog').count(), 0, 'late chunk must not reopen a cancelled dialog')
      await add.click()
      await page.getByRole('heading', { name: 'Add Work Log', exact: true }).waitFor()
      await page.keyboard.press('Escape')
      await page.getByRole('dialog').waitFor({ state: 'hidden' })
      assert.ok(await add.evaluate((node) => node === document.activeElement))
      assert.equal(requests, 1)
      return { visibleFeedback: true, cancellationAndFocus: true, requests }
    })
  }
} finally { await browser.close() }
const report = { scope: 'Review regressions; isolated browser E2E with Webpack chunk runtime; no production hydration or field CWV claim', total: results.length, pass: results.filter((row) => row.pass).length, fail: results.filter((row) => !row.pass).length, results }
await writeFile('document/issue-30-review-browser-results.json', JSON.stringify(report, null, 2) + '\n')
console.log(`Review browser: ${report.total} total / ${report.pass} PASS / ${report.fail} FAIL`)
process.exitCode = report.fail ? 1 : 0
