// Issue #53: Login, application states and final consistency across the 10 pages, in the isolated synthetic preview.
// Synthetic credentials only; /api/auth/login is intercepted and never reaches a server.
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PMS_PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.PMS_PREVIEW_ORIGIN || 'http://127.0.0.1:3791'
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('Use the isolated synthetic preview')
const before = process.argv.includes('--before')
const directory = `artifacts/issue-53/${before ? 'before' : 'after'}`
await mkdir(directory, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: process.env.PMS_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) })
const results = [], errors = [], jumps = []
let completed = false

const MAIN_PAGES = [
  ['dashboard', '/'], ['projects', '/projects'], ['project-detail', '/projects/project-0'], ['work-items', '/work-items'], ['board', '/board'],
  ['analysis', '/analysis'], ['daily-work', '/daily-work'], ['company', '/company'], ['settings', '/settings'],
]
const DIALOGS = [['projects', '/projects', 'สร้าง Project'], ['daily-work', '/daily-work', 'เพิ่มบันทึกงาน'], ['company', '/company', 'เพิ่มบริษัท']]
const SYNTHETIC = { username: 'qa-owner', password: 'synthetic-only-passphrase' }

async function capture(page, name, extra = {}) {
  await page.waitForTimeout(80)
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)
  if (!before) assert.ok(fits, `${name}: document overflow`)
  if (!before) {
    for (const selector of ['[data-slot="page-state"]', '[data-slot="inline-state"]', '[role="dialog"]', '.login-card']) {
      assert.ok(await page.locator(selector).evaluateAll((nodes) => nodes.every((node) => { const r = node.getBoundingClientRect(); return r.width === 0 || (r.x >= -1 && r.right <= innerWidth + 1) })), `${name}: ${selector} fits`)
    }
  }
  await page.screenshot({ path: `${directory}/${name}.png` })
  results.push({ case: name, pass: true, ...extra })
}

async function open(page, path, query = '') {
  const separator = path.includes('?') ? '&' : '?'
  await page.goto(`${origin}${path}${separator}${query}`, { waitUntil: 'networkidle' })
}

async function login(page, name, width) {
  await open(page, '/login', `theme=${page.theme}`)
  await page.locator('#login-username').waitFor()
  await capture(page, `login-${name}`)
  if (before) return
  const card = page.locator('.login-card')
  assert.equal(await card.evaluate((node) => getComputedStyle(node).animationName), 'none', 'reduced motion disables card entrance')
  assert.equal(await page.locator('.login-story').isVisible(), width > 860)
  assert.ok(await page.getByRole('heading', { level: 1, name: 'ยินดีต้อนรับกลับมา' }).isVisible())
  assert.equal(await page.getByRole('group', { name: 'เลือกธีมการแสดงผล' }).getByRole('button').count(), 3)
  assert.equal(await page.locator('#login-username').getAttribute('autocomplete'), 'username')
  assert.equal(await page.locator('#login-password').getAttribute('autocomplete'), 'current-password')
  const submit = page.getByRole('button', { name: 'เข้าสู่พื้นที่ทำงาน' })
  const submitBox = await submit.boundingBox()
  assert.ok(submitBox && submitBox.y + submitBox.height <= (await page.evaluate(() => document.documentElement.scrollHeight)), 'submit reachable')
  for (const selector of ['.login-brand-caption', '.login-card-heading > p:last-child', '.login-private-label', '.login-field label > span', '.login-card-footer p > span']) {
    const node = page.locator(selector).first()
    if (!(await node.isVisible())) continue
    const size = await node.evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
    assert.ok(size >= 9, `${selector} ${size}px`)
  }
  // Keyboard focus is visible on the first field and on the password toggle.
  await page.locator('#login-username').focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  const toggle = page.locator('.login-password-toggle')
  assert.ok(await toggle.evaluate((node) => node === document.activeElement && getComputedStyle(node).outlineStyle !== 'none'), 'toggle focus ring')
  await page.locator('#login-username').fill(SYNTHETIC.username)
  await page.locator('#login-password').fill(SYNTHETIC.password)
  await toggle.click()
  assert.equal(await page.locator('#login-password').getAttribute('type'), 'text')
  assert.equal(await toggle.getAttribute('aria-pressed'), 'true')
  await toggle.click()
  assert.equal(await page.locator('#login-password').getAttribute('type'), 'password')
  let release
  const payloads = []
  await page.route(`${origin}/api/auth/login`, async (route) => {
    payloads.push(route.request().postDataJSON())
    const outcome = await new Promise((resolve) => { release = resolve })
    if (outcome === 'network') return route.abort('failed')
    return route.fulfill({ status: outcome, contentType: 'application/json', body: JSON.stringify({ error: { code: 'SYNTHETIC', message: 'synthetic' } }) })
  })
  for (const [outcome, message] of [[401, 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง'], [429, 'ลองเข้าสู่ระบบบ่อยเกินไป'], ['network', 'เชื่อมต่อระบบไม่ได้']]) {
    await page.getByRole('button', { name: 'เข้าสู่พื้นที่ทำงาน' }).click()
    await page.getByRole('button', { name: 'กำลังเข้าสู่ระบบ…' }).waitFor()
    assert.equal(await page.locator('.login-form').getAttribute('aria-busy'), 'true')
    assert.equal(await page.locator('#login-password').isDisabled(), true)
    if (outcome === 401) await capture(page, `login-submitting-${name}`)
    await page.waitForFunction(() => true)
    await new Promise((resolve) => setTimeout(resolve, 20))
    release(outcome)
    const alert = page.getByRole('alert')
    await alert.filter({ hasText: message }).waitFor()
    assert.ok(await alert.evaluate((node) => node === document.activeElement), 'error receives focus')
    assert.equal(await page.locator('#login-username').getAttribute('aria-invalid'), 'true')
    assert.equal(await page.locator('#login-password').inputValue(), SYNTHETIC.password)
    if (outcome === 401) await capture(page, `login-error-${name}`)
  }
  assert.equal(payloads.length, 3)
  assert.deepEqual(Object.keys(payloads[0]).sort(), ['next', 'password', 'username'])
  await page.unroute(`${origin}/api/auth/login`)
}

async function states(page, name, label, path) {
  await open(page, path, `theme=${page.theme}`)
  await capture(page, `${label}-${name}`)
  if (before) {
    for (const mode of ['empty', 'error']) { await open(page, path, `theme=${page.theme}&qa=${mode}`); await capture(page, `${label}-${mode}-${name}`) }
    return
  }
  if (label === 'settings' && process.env.PMS_PREVIEW_REAL_SETTINGS !== '1') {
    // The default preview replaces OwnerSettingsProvider; Settings states are covered by the #52 real-provider run.
    results.push({ case: `${label}-states-${name}`, pass: null, notCovered: 'preview settings boundary' })
    return
  }
  await open(page, path, `theme=${page.theme}&qa=empty`)
  const emptyText = await page.locator('main').last().innerText()
  assert.doesNotMatch(emptyText, /โหลด[^\n]*ไม่สำเร็จ/, `${label} empty is not an error`)
  await capture(page, `${label}-empty-${name}`)
  await open(page, path, `theme=${page.theme}&qa=error`)
  const alerts = page.locator('[role="alert"]')
  assert.ok(await alerts.count() >= 1, `${label} error announced`)
  assert.ok(await page.locator('[role="alert"] button, [role="alert"] a').count() >= 1, `${label} error offers an action`)
  assert.equal(await page.locator('[data-slot="kpi-value"]:text-is("0")').count(), 0, `${label} failure not shown as zero`)
  await capture(page, `${label}-error-${name}`)
  // Loading → loaded: the page heading should not jump.
  await page.goto(`${origin}${path}${path.includes('?') ? '&' : '?'}theme=${page.theme}&qa=slow`, { waitUntil: 'domcontentloaded' })
  const busy = page.locator('[aria-busy="true"]').first()
  await busy.waitFor({ timeout: 5000 })
  const heading = page.locator('h1').first()
  const loadingTop = (await heading.boundingBox())?.y
  await capture(page, `${label}-loading-${name}`)
  await page.waitForLoadState('networkidle')
  await page.waitForFunction(() => !document.querySelector('[data-slot="page-state"][aria-busy="true"]'), null, { timeout: 8000 })
  const loadedTop = (await heading.boundingBox())?.y
  const jump = Math.abs((loadedTop ?? 0) - (loadingTop ?? 0))
  jumps.push({ case: `${label}-${name}`, jump })
  assert.ok(jump <= 4, `${label} heading jump ${jump}px`)
}

try {
  const pairs = []
  for (const theme of ['light', 'dark', 'special-dark']) for (const size of [[320, 640], [390, 844], [768, 1024], [1440, 900]]) pairs.push([theme, size])
  for (const [theme, [width, height]] of pairs) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', hasTouch: width <= 390 })
    const page = await context.newPage()
    page.theme = theme
    page.on('pageerror', (error) => errors.push(`${theme}-${width}: ${error.message}`))
    const name = `${theme}-${width}`
    await login(page, name, width)
    if (width === 320) { await context.close(); console.log(`Login 320 passed: ${name}`); continue }
    for (const [label, path] of MAIN_PAGES) await states(page, name, label, path)
    await open(page, '/qa/not-found', `theme=${theme}`)
    await capture(page, `not-found-${name}`)
    await open(page, '/qa/route-error', `theme=${theme}`)
    await capture(page, `route-error-${name}`)
    await open(page, '/projects/missing-project', `theme=${theme}`)
    if (!before) {
      assert.ok(await page.getByText('ไม่พบ Project นี้').isVisible())
      assert.ok(await page.getByRole('link', { name: 'กลับไปรายการ Projects' }).isVisible())
      await open(page, '/qa/not-found', `theme=${theme}`)
      assert.equal(await page.getByRole('heading', { level: 1, name: 'ไม่พบหน้าที่ต้องการ' }).count(), 1)
      await open(page, '/projects/missing-project', `theme=${theme}`)
    }
    await capture(page, `project-missing-${name}`)
    if (!before) {
      await open(page, '/board', `theme=${theme}&qa=empty`)
      const summary = page.locator('[data-slot="inline-state"][role="status"]')
      assert.equal(await summary.count(), 1, 'board announces one empty summary')
      assert.equal(await page.locator('[data-board-status] [role="status"]').count(), 0, 'columns stay silent')
      for (const [label, path, trigger] of DIALOGS) {
        await open(page, path, `theme=${theme}`)
        await page.getByRole('button', { name: trigger, exact: true }).first().click()
        const dialog = page.getByRole('dialog')
        await dialog.waitFor()
        assert.ok(await dialog.evaluate((node) => { const r = node.getBoundingClientRect(); return r.y >= 0 && r.bottom <= innerHeight + 1 }), `${label} dialog fits`)
        await capture(page, `dialog-${label}-${name}`)
        await page.keyboard.press('Escape')
        await dialog.waitFor({ state: 'hidden' })
      }
    }
    await context.close()
    console.log(`Application states passed: ${name}`)
  }
  assert.deepEqual(errors, [])
  completed = true
} finally {
  await writeFile(`${directory}/results.json`, JSON.stringify({ completed, checkpoints: results.length, results, jumps, errors }, null, 2))
  await browser.close()
}
