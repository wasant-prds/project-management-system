import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PMS_PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.PMS_PREVIEW_ORIGIN || 'http://127.0.0.1:3791'
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('Use the isolated synthetic preview')
const before = process.argv.includes('--before')
const directory = `artifacts/issue-47/${before ? 'before' : 'after'}`
await mkdir(directory, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: process.env.PMS_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) })
const routes = ['/', '/projects', '/work-items', '/board', '/analysis', '/daily-work', '/company', '/settings', '/projects/project-0', '/login', '/qa/foundation']
const results = []
const errors = []
let completed = false
let failure = null
const viewports = [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]
const name = (route) => route.slice(1).replaceAll('/', '-') || 'dashboard'
async function focused(locator) {
  await locator.page().waitForFunction((node) => node === document.activeElement, await locator.elementHandle())
  return true
}
async function bounds(page, locator) {
  // Radix mounts the portal before Floating UI has committed its viewport position.
  await page.waitForFunction((node) => {
    const box = node.getBoundingClientRect()
    return box.width > 0 && box.x >= -1 && box.y >= -1 && box.right <= innerWidth + 1 && box.bottom <= innerHeight + 1
  }, await locator.elementHandle())
  const box = await locator.boundingBox()
  const viewport = page.viewportSize()
  assert.ok(box && box.x >= -1 && box.y >= -1 && box.x + box.width <= viewport.width + 1 && box.y + box.height <= viewport.height + 1, 'surface fits viewport')
  assert.ok(await locator.evaluate((node) => node.scrollWidth <= node.clientWidth + 1), 'surface has no horizontal overflow')
}
try {
  for (const theme of ['light', 'dark', 'special-dark']) {
    for (const viewport of viewports) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce', timezoneId: 'America/Los_Angeles' })
      const page = await context.newPage()
      page.on('pageerror', (error) => errors.push(error.message))
      for (const route of routes) {
        await page.goto(`${origin}${route}?theme=${theme}`, { waitUntil: 'networkidle' })
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${route} page overflow`)
        assert.ok(await page.locator('main').evaluateAll((nodes) => nodes.every((node) => node.scrollWidth <= node.clientWidth + 1)), `${route} main overflow`)
        if (route === '/board') {
          const localScroll = await page.locator('section[aria-label="Work Items by status"] > .motion-data-enter').evaluate((node) => {
            node.scrollLeft = node.scrollWidth
            const moved = node.scrollLeft > 0
            node.scrollLeft = 0
            return moved
          })
          assert.ok(localScroll, 'Board columns scroll within their original pane')
        }
        await page.locator('[data-slot="tabs-list"]').evaluateAll((nodes) => nodes.forEach((node) => {
          if (node.scrollWidth <= node.clientWidth) return
          node.scrollLeft = node.scrollWidth
          if (node.scrollLeft <= 0) throw new Error('Tabs must scroll locally')
          node.scrollLeft = 0
        }))
        await page.screenshot({ path: `${directory}/${name(route)}-${theme}-${viewport.width}.png` })
        results.push({ route, theme, ...viewport, case: 'page bounds and screenshot', pass: true })
        if (route !== '/qa/foundation') continue
        const trigger = page.getByRole('button', { name: /^ค้นหาและตัวกรอง/ })
        const triggerBox = await trigger.boundingBox()
        await trigger.focus()
        await page.keyboard.press('Enter')
        const panel = page.locator('.search-filter-panel')
        await panel.waitFor()
        await bounds(page, panel)
        const select = panel.getByRole('combobox')
        await select.focus()
        await page.keyboard.press('Enter')
        await page.getByRole('listbox').waitFor()
        await page.keyboard.press('ArrowDown')
        await page.keyboard.press('Enter')
        assert.ok(await focused(select), 'select restores focus')
        const calendarTrigger = panel.locator('[data-slot="date-picker"] button').first()
        // Calendar has its own focus scope inside the parent filter popover.
        await calendarTrigger.focus()
        await page.keyboard.press('Enter')
        await page.locator('[data-slot="date-picker-calendar"]').waitFor()
        await page.keyboard.press('Escape')
        await page.locator('[data-slot="date-picker-calendar"]').waitFor({ state: 'hidden' })
        await panel.waitFor()
        assert.ok(await focused(calendarTrigger), 'calendar restores focus')
        await page.screenshot({ path: `${directory}/filter-${theme}-${viewport.width}.png` })
        await page.keyboard.press('Escape')
        await panel.waitFor({ state: 'hidden' })
        assert.ok(await focused(trigger), 'filter restores focus')
        const closedBox = await trigger.boundingBox()
        assert.deepEqual(closedBox, triggerBox, 'opening/closing overlays does not shift toolbar layout')
        const dialogTrigger = page.getByRole('button', { name: 'เปิด dialog ตัวอย่าง' })
        await dialogTrigger.focus()
        await page.keyboard.press('Enter')
        const dialog = page.getByRole('dialog')
        await dialog.waitFor()
        await bounds(page, dialog)
        await page.screenshot({ path: `${directory}/dialog-${theme}-${viewport.width}.png` })
        await page.keyboard.press('Escape')
        await dialog.waitFor({ state: 'hidden' })
        assert.ok(await focused(dialogTrigger), 'dialog restores focus')
        if (!before) {
          assert.equal(await page.locator('[data-qa-date]').innerText(), '03/10/2026')
          const selectedTab = page.getByRole('tab', { name: 'ภาพรวม' })
          await selectedTab.focus()
          await page.keyboard.press('ArrowRight')
          const detailsTab = page.getByRole('tab', { name: 'รายละเอียด' })
          await page.waitForFunction((node) => node.getAttribute('aria-selected') === 'true', await detailsTab.elementHandle())
          assert.equal(await detailsTab.getAttribute('aria-selected'), 'true')
          const summary = page.locator('.search-filter-summary')
          assert.equal(await summary.innerText(), 'Project Alpha · กำลังดำเนินการ')
          assert.equal(await page.locator('#qa-invalid').getAttribute('aria-invalid'), 'true')
          const input = page.locator('#qa-input')
          const idleShadow = await input.evaluate((node) => getComputedStyle(node).boxShadow)
          await input.focus()
          const focus = await input.evaluate((node) => ({ visible: node.matches(':focus-visible'), shadow: getComputedStyle(node).boxShadow }))
          assert.ok(focus.visible && focus.shadow !== idleShadow, 'keyboard focus ring remains visible')
          const styles = await page.locator('[data-slot="button"]').evaluateAll((nodes) => nodes.map((node) => {
            const style = getComputedStyle(node)
            return { variant: node.dataset.variant, disabled: node.disabled, border: style.borderTopWidth, weight: style.fontWeight, shadow: style.boxShadow }
          }))
          const primary = styles.find((style) => style.variant === 'default' && !style.disabled)
          const secondary = styles.find((style) => style.variant === 'outline')
          assert.ok(Number(primary.weight) > Number(secondary.weight) && secondary.border !== '0px', 'action hierarchy has weight and border cues')
          const disabledShadow = styles.find((style) => style.disabled).shadow
          assert.ok(disabledShadow.split(/,(?![^()]*\))/).every((shadow) => shadow.trim() === 'none' || shadow.includes('rgba(0, 0, 0, 0)')), 'disabled controls have no painted elevation')
          assert.equal(await page.locator('[data-slot="card"] [data-slot="card"]').evaluate((node) => getComputedStyle(node).boxShadow), 'none', 'nested card stays flat')
          results.push({ theme, ...viewport, case: 'shared controls, keyboard, focus, Bangkok date, active-filter summary', pass: true })
        }
      }
      if (!before) {
        // Sync history is a timestamp surface; opening it must not execute a sync.
        await page.goto(`${origin}/projects/project-0?theme=${theme}#integrations`, { waitUntil: 'networkidle' })
        await page.getByRole('button', { name: 'ประวัติ sync', exact: true }).first().click()
        await page.getByRole('region', { name: 'ประวัติ Issue Sync' }).locator('summary').filter({ hasText: /03\/11\/2026, 13:00/ }).waitFor()
        results.push({ theme, ...viewport, case: 'Bangkok datetime in read-only sync history', pass: true })
      }
      // Existing Login regression includes the narrower 320px viewport.
      if (viewport.width === 390) {
        await page.setViewportSize({ width: 320, height: 844 })
        await page.goto(`${origin}/login?theme=${theme}`, { waitUntil: 'networkidle' })
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
        await page.screenshot({ path: `${directory}/login-${theme}-320.png` })
        results.push({ route: '/login', theme, width: 320, height: 844, pass: true })
      }
      await context.close()
      console.log(`Shared foundation ${before ? 'before' : 'after'}: ${theme} ${viewport.width}px passed`)
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
