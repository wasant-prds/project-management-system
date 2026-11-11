import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

// Production components with synthetic preview boundaries; no database or credentials.
const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PMS_PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.PMS_PREVIEW_ORIGIN || 'http://127.0.0.1:3791'
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('Use an isolated loopback preview origin')
const reportDirectory = 'artifacts/frontend-motion'
await mkdir(reportDirectory, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: process.env.PMS_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) })
const routes = ['/', '/projects', '/work-items', '/board', '/analysis', '/daily-work', '/company', '/settings']
const results = []
const targeted = process.argv.includes('--targeted')

async function openAuditedPage(context) {
  const page = await context.newPage()
  await page.addInitScript(() => {
    const audit = window.__motionAudit = { entrances: [], minOpacity: 1, chromeAnimated: false, snapshots: 0 }
    document.startViewTransition = () => { audit.snapshots += 1; throw new Error('Unexpected route snapshot') }
    document.addEventListener('animationstart', (event) => {
      audit.entrances.push({ name: event.animationName, main: event.target.tagName === 'MAIN' })
    }, true)
    const sample = () => {
      const main = document.querySelector('main:not([data-slot="sidebar-inset"])')
      if (main) audit.minOpacity = Math.min(audit.minOpacity, Number(getComputedStyle(main).opacity))
      for (const node of document.querySelectorAll('header, [data-slot="sidebar-container"], [data-slot="sidebar-inset"]')) {
        const style = getComputedStyle(node)
        if (Number(style.opacity) < 1 || style.animationName !== 'none') audit.chromeAnimated = true
      }
      requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  })
  return page
}

async function verify(page, reduced = false) {
  const audit = await page.evaluate(() => ({
    ...window.__motionAudit,
    secondaryAnimations: Array.from(document.querySelectorAll('.cinematic-chart, .cinematic-beat-support, .cinematic-beat-data, .cinematic-beat-actions, .motion-stagger > *, .motion-data-enter, .motion-content-enter, [data-slot="skeleton"]'))
      .map((node) => getComputedStyle(node).animationName).filter((name) => name !== 'none'),
    mainTransform: getComputedStyle(document.querySelector('main:not([data-slot="sidebar-inset"])')).transform,
    mainAnimation: getComputedStyle(document.querySelector('main:not([data-slot="sidebar-inset"])')).animationName,
  }))
  assert.equal(audit.snapshots, 0)
  assert.equal(audit.chromeAnimated, false, 'shell chrome must stay solid')
  assert.ok(audit.minOpacity >= 0.959, `main faded to ${audit.minOpacity}`)
  assert.equal(audit.mainTransform, 'none', 'sticky content must keep its coordinate space')
  assert.equal(audit.mainAnimation, reduced ? 'none' : 'pms-page-enter')
  // A busy first paint may skip an entrance; it must never replay after async data arrives.
  assert.ok(audit.entrances.filter((entry) => entry.main).length <= (reduced ? 0 : 1), 'main entrance must not replay')
  assert.deepEqual(audit.secondaryAnimations, [], 'nested content must not replay entrances')
  assert.equal(audit.entrances.some((entry) => /^pms-(content|cinematic|value)/.test(entry.name)), false)
  return audit
}

try {
  for (const theme of (targeted ? [] : ['light', 'dark', 'special-dark'])) {
    for (const width of [375, 1440]) {
      const context = await browser.newContext({ viewport: { width, height: 900 } })
      try {
        for (const route of routes) {
          const page = await openAuditedPage(context)
          try {
            await page.goto(`${origin}${route}?theme=${theme}`, { waitUntil: 'networkidle' })
            await page.locator('main').last().waitFor()
            const audit = await verify(page)
            results.push({ route, theme, width, pass: true, audit })
            console.log(`PASS ${route} ${theme} ${width}`)
            if (route === '/' && width === 1440) await page.screenshot({ path: `${reportDirectory}/${theme}.png` })
          } finally { await page.close() }
        }
      } finally { await context.close() }
    }
  }
  for (const reduced of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference' })
    try {
      for (const route of routes) {
        const page = await openAuditedPage(context)
        try {
          await page.goto(`${origin}${route}?qa=slow`, { waitUntil: 'networkidle' })
          const audit = await verify(page, reduced)
          results.push({ route, slow: true, reduced, pass: true, audit })
          console.log(`PASS ${route} slow reduced=${reduced}`)
        } finally { await page.close() }
      }
      const page = await openAuditedPage(context)
      try {
        await page.goto(`${origin}/analysis`, { waitUntil: 'networkidle' })
        await page.getByRole('button', { name: 'ใช้ตัวกรอง', exact: true }).click()
        await page.waitForLoadState('networkidle')
        await page.getByRole('tab', { name: /Work Items/ }).click()
        await verify(page, reduced)
        results.push({ interaction: 'analysis refresh and tab', reduced, pass: true })
        await page.goto(`${origin}/work-items`, { waitUntil: 'networkidle' })
        await page.getByRole('button', { name: 'New Work Item', exact: true }).click()
        await page.getByRole('dialog').waitFor()
        const headerAnimation = await page.locator('[data-slot="dialog-header"]').evaluate((node) => getComputedStyle(node).animationName)
        assert.equal(headerAnimation, 'none', 'dialog header must not animate inside its parent entrance')
        await page.keyboard.press('Escape')
        await page.getByRole('dialog').waitFor({ state: 'hidden' })
        results.push({ interaction: 'dialog open and close', reduced, pass: true })
      } finally { await page.close() }
    } finally { await context.close() }
  }
} catch (error) {
  results.push({ pass: false, error: error.stack })
  process.exitCode = 1
  console.error(error)
} finally {
  await browser.close()
  await writeFile(`${reportDirectory}/${targeted ? 'targeted-report' : 'report'}.json`, JSON.stringify(results, null, 2))
  console.log(`${results.filter((result) => result.pass).length} browser motion checks passed`)
}
