import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PMS_PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.PMS_PREVIEW_ORIGIN || 'http://127.0.0.1:3791'
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('Use the isolated synthetic preview')
const directory = 'artifacts/frontend-modal'
await mkdir(directory, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: process.env.PMS_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) })
const results = []

async function startAudit(page, contentSlot = 'dialog-content', overlaySlot = 'dialog-overlay') {
  await page.evaluate(({ contentSlot, overlaySlot }) => {
    window.__stopSurfaceAudit?.()
    const ids = new WeakMap()
    let nextId = 0
    let frame
    let startedAt
    const audit = window.__surfaceAudit = { frames: 0, contents: [], overlays: [], gaps: 0, flashes: 0, blur: false, rects: [], events: [] }
    const id = (node) => { if (!ids.has(node)) ids.set(node, ++nextId); return ids.get(node) }
    const record = (node, list) => { const value = id(node); if (!list.includes(value)) list.push(value) }
    const onAnimation = (event) => {
      if ([contentSlot, overlaySlot].includes(event.target.dataset?.slot)) audit.events.push({ slot: event.target.dataset.slot, name: event.animationName })
    }
    document.addEventListener('animationstart', onAnimation, true)
    const sample = () => {
      const content = document.querySelector(`[data-slot="${contentSlot}"][data-state="open"]`)
      const overlay = document.querySelector(`[data-slot="${overlaySlot}"][data-state="open"]`)
      if (content) {
        startedAt ??= performance.now()
        audit.frames += 1
        record(content, audit.contents)
        if (overlay) record(overlay, audit.overlays)
        else audit.gaps += 1
        const style = getComputedStyle(content)
        const backdrop = overlay && getComputedStyle(overlay)
        if (backdrop && backdrop.backdropFilter !== 'none') audit.blur = true
        if (performance.now() - startedAt > 260) {
          if (Number(style.opacity) < 0.999 || (backdrop && Number(backdrop.opacity) < 0.999)) audit.flashes += 1
          const rect = content.getBoundingClientRect()
          audit.rects.push({ x: rect.x, y: rect.y, width: rect.width, height: rect.height })
        }
      } else if (startedAt !== undefined) audit.gaps += 1
      frame = requestAnimationFrame(sample)
    }
    frame = requestAnimationFrame(sample)
    window.__stopSurfaceAudit = () => { cancelAnimationFrame(frame); document.removeEventListener('animationstart', onAnimation, true) }
  }, { contentSlot, overlaySlot })
}

async function verifyAudit(page, reduced = false) {
  await page.waitForFunction(() => window.__surfaceAudit.frames >= 45)
  const audit = await page.evaluate(() => { window.__stopSurfaceAudit(); return window.__surfaceAudit })
  assert.equal(audit.contents.length, 1, 'the modal surface was remounted')
  assert.equal(audit.overlays.length, 1, 'the backdrop was remounted')
  assert.equal(audit.gaps, 0, 'modal/backdrop disappeared between updates')
  assert.equal(audit.flashes, 0, 'opacity dropped after the initial entrance')
  assert.equal(audit.blur, false, 'full-screen backdrop blur must stay off')
  assert.ok(audit.events.length <= (reduced ? 0 : 2), 'entrances replayed')
  for (const property of ['x', 'y', 'width', 'height']) {
    const values = audit.rects.map((rect) => rect[property])
    assert.ok(Math.max(...values) - Math.min(...values) < 1, `${property} moved after settling`)
  }
  return audit
}

async function dailyWork(context, theme, width, reduced) {
  const page = await context.newPage()
  let release
  const gate = new Promise((resolve) => { release = resolve })
  await page.route('**/work-log-dialog-*.js', async (route) => { await gate; await route.continue() })
  try {
    await page.goto(`${origin}/daily-work?theme=${theme}`, { waitUntil: 'networkidle' })
    await startAudit(page)
    const opener = page.getByRole('button', { name: /Add Work Log|^Add$/ }).first()
    await opener.click()
    await page.getByText('กำลังโหลดแบบฟอร์ม…', { exact: true }).waitFor()
    const surface = await page.locator('[data-slot="dialog-content"]').elementHandle()
    await page.waitForFunction(() => window.__surfaceAudit.frames >= 24)
    release()
    await page.getByRole('heading', { name: 'Add Work Log', exact: true }).waitFor()
    assert.equal(await surface.evaluate((node) => node.isConnected), true, 'loading replaced the dialog surface')
    const modal = page.locator('[data-slot="dialog-content"]')
    await modal.locator('#description').fill('Motion audit: text remains steady while editing')
    await modal.locator('#remarks').fill('Synthetic preview only')
    await modal.getByRole('button', { name: 'Select project...', exact: true }).click()
    await page.locator('[data-slot="popover-content"] button').first().click()
    await modal.getByRole('combobox').last().click()
    await page.getByRole('option').last().click()
    await modal.locator('#date').click()
    await page.locator('[data-slot="popover-content"]').waitFor()
    await page.keyboard.press('Escape')
    assert.equal(await modal.count(), 1)
    const audit = await verifyAudit(page, reduced)
    await page.screenshot({ path: `${directory}/daily-${theme}-${width}-${reduced}.png` })
    await modal.getByRole('button', { name: 'Cancel', exact: true }).click()
    await modal.waitFor({ state: 'hidden' })
    assert.ok(await opener.evaluate((node) => node === document.activeElement), 'closing must restore the opener focus')
    await startAudit(page)
    await opener.click()
    await page.getByRole('heading', { name: 'Add Work Log', exact: true }).waitFor()
    await verifyAudit(page, reduced)
    results.push({ case: 'Daily Work cold load, typing, pickers, reopen', theme, width, reduced, audit, pass: true })
  } finally { release(); await page.close() }
}

async function retryDialog(context) {
  const page = await context.newPage()
  let requests = 0
  await page.route('**/work-log-dialog-*.js', (route) => ++requests === 1 ? route.abort('failed') : route.continue())
  try {
    await page.goto(`${origin}/daily-work`, { waitUntil: 'networkidle' })
    await startAudit(page)
    await page.getByRole('button', { name: /Add Work Log/ }).click()
    await page.getByRole('heading', { name: 'โหลดแบบฟอร์มไม่สำเร็จ', exact: true }).waitFor()
    const surface = await page.locator('[data-slot="dialog-content"]').elementHandle()
    await page.waitForFunction(() => window.__surfaceAudit.frames >= 24)
    await page.getByRole('button', { name: 'ลองโหลดแบบฟอร์มอีกครั้ง', exact: true }).click()
    await page.getByRole('heading', { name: 'Add Work Log', exact: true }).waitFor()
    assert.equal(await surface.evaluate((node) => node.isConnected), true, 'retry replaced the dialog surface')
    await verifyAudit(page)
    assert.equal(requests, 2)
    results.push({ case: 'Daily Work failed chunk and retry keep one surface', pass: true })
  } finally { await page.close() }
}

async function otherSurfaces(context, theme, width, reduced) {
  const page = await context.newPage()
  try {
    await page.goto(`${origin}/work-items?theme=${theme}`, { waitUntil: 'networkidle' })
    await startAudit(page)
    await page.getByRole('button', { name: /^(New Work Item|New)$/ }).click()
    await page.getByRole('dialog').waitFor()
    await verifyAudit(page, reduced)
    results.push({ case: 'Work Item modal', theme, width, reduced, pass: true })

    await page.goto(`${origin}/board?theme=${theme}`, { waitUntil: 'networkidle' })
    await startAudit(page)
    await page.locator('main button[aria-haspopup="dialog"]').first().click()
    await page.getByRole('dialog').waitFor()
    await verifyAudit(page, reduced)
    results.push({ case: 'Board detail modal', theme, width, reduced, pass: true })

    await page.route('**/api/company*', async (route) => {
      const response = await route.fetch()
      const data = await response.json()
      data.companies.push({ ...data.companies[0], id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', code: null, name: 'Disposable UI fixture', summary: { projects: 0, workItems: 0, hours: '0' } })
      await route.fulfill({ response, json: data })
    })
    await page.goto(`${origin}/company?theme=${theme}`, { waitUntil: 'networkidle' })
    await startAudit(page, 'alert-dialog-content', 'alert-dialog-overlay')
    await page.getByRole('button', { name: 'ลบ', exact: true }).click()
    await page.getByRole('alertdialog').waitFor()
    await verifyAudit(page, reduced)
    await page.getByRole('button', { name: 'ยกเลิก', exact: true }).click()
    await page.getByRole('alertdialog').waitFor({ state: 'hidden' })
    results.push({ case: 'Company delete confirmation, cancel only', theme, width, reduced, pass: true })

    if (width < 1024) {
      await page.goto(`${origin}/settings?theme=${theme}`, { waitUntil: 'networkidle' })
      await startAudit(page, 'sidebar', 'sheet-overlay')
      await page.getByRole('button', { name: 'เปิดหรือปิดเมนูหลัก', exact: true }).click()
      await page.getByRole('dialog').waitFor()
      await verifyAudit(page, reduced)
      results.push({ case: 'Mobile navigation sheet', theme, width, reduced, pass: true })
    }
  } finally { await page.close() }
}

try {
  for (const theme of ['light', 'dark', 'special-dark']) {
    for (const width of [375, 1440]) {
      for (const reduced of (theme === 'light' ? [false, true] : [false])) {
        const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference' })
        try {
          await dailyWork(context, theme, width, reduced)
          await otherSurfaces(context, theme, width, reduced)
          if (theme === 'light' && width === 1440 && !reduced) await retryDialog(context)
          console.log(`PASS modal interactions ${theme} ${width} reduced=${reduced}`)
        } finally { await context.close() }
      }
    }
  }
} catch (error) {
  results.push({ pass: false, error: error.stack })
  console.error(error)
  process.exitCode = 1
} finally {
  await browser.close()
  await writeFile(`${directory}/report.json`, JSON.stringify(results, null, 2))
  console.log(`${results.filter((result) => result.pass).length} modal interaction checks passed`)
}
