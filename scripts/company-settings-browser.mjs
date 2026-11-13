import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { previewData } from '../tests/frontend-ui/preview-fixtures.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PMS_PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.PMS_PREVIEW_ORIGIN || 'http://127.0.0.1:3791'
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('Use the isolated synthetic preview')
const before = process.argv.includes('--before')
const layoutOnly = process.argv.includes('--layout-only')
const directory = `artifacts/issue-52/${before ? 'before' : layoutOnly ? 'layout-final' : 'after'}`
await mkdir(directory, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: process.env.PMS_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) })
const results = [], errors = []
let completed = false
async function capture(page, name) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'document overflow')
  assert.ok(await page.locator('main').last().evaluate((node) => node.scrollWidth <= node.clientWidth + 1), 'main overflow')
  for (const selector of ['[data-company-card]', '[role="dialog"]', '[role="tabpanel"][data-state="active"]']) {
    assert.ok(await page.locator(selector).evaluateAll((nodes) => nodes.every((node) => { const r = node.getBoundingClientRect(); return r.x >= -1 && r.right <= innerWidth + 1 && node.scrollWidth <= node.clientWidth + 1 })), `${selector} fits`)
  }
  assert.ok(await page.getByRole('dialog').evaluateAll((nodes) => nodes.every((node) => { const r = node.getBoundingClientRect(); return r.y >= 0 && r.bottom <= innerHeight + 1 })), 'dialog fits vertically')
  await page.screenshot({ path: `${directory}/${name}.png` })
  results.push({ case: name, pass: true })
}
const uuid = (n) => `52000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const long = 'LongCompanyName'.repeat(12)
const seed = [
  { ...previewData().companies[0], id: uuid(1), name: 'บริษัทค่าเริ่มต้น' },
  { ...previewData().companies[0], id: uuid(2), code: null, name: long, displayName: long, location: long, address: long, phone: '0123456789'.repeat(4), description: `${long}\n${long}`, summary: { projects: 999999999999999, workItems: 999999999999999, hours: '999999999999999999999999999999.125' } },
  { ...previewData().companies[0], id: uuid(3), code: null, name: 'บริษัทที่ยังไม่มี Project', displayName: null, summary: { projects: 0, workItems: 0, hours: '0' } },
]
async function synthetic(page, theme) {
  let companies = structuredClone(seed)
  let settings = structuredClone(previewData().settings)
  settings.preferences.theme = theme
  settings.profile.name = long
  settings.profile.email = `${'owner'.repeat(20)}@example.test`
  settings.profile.phone = '0801234567'
  let pending, companyMode = 'normal', settingsMode = 'normal'
  const requests = []
  await page.route(`${origin}/api/**`, async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname, method = request.method()
    const body = request.postDataJSON()
    requests.push({ path, method, body })
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) })
    if (!['/api/company', '/api/settings/me'].includes(path) && !path.startsWith('/api/company/')) {
      if (method !== 'GET') throw new Error(`Unexpected preview mutation: ${path}`)
      return route.continue()
    }
    if (method === 'GET') {
      const mode = path === '/api/company' ? companyMode : settingsMode
      if (mode === 'loading') await new Promise((resolve) => { pending = resolve })
      if (mode === 'error') return json({ error: { code: 'UNAVAILABLE', message: 'จำลองโหลดข้อมูลไม่สำเร็จ' } }, 503)
      return json(path === '/api/company' ? { companies: mode === 'empty' ? [] : companies, page: { nextCursor: null } } : settings)
    }
    const failure = await new Promise((resolve) => { pending = resolve })
    if (failure) return json({ error: { code: 'CONFLICT', message: 'จำลองบันทึกไม่สำเร็จ กรุณาลองใหม่' } }, 409)
    if (path === '/api/settings/me') {
      if (body.profile) Object.assign(settings.profile, body.profile, body.profile.phone === '' ? { phone: null } : {})
      if (body.preferences) Object.assign(settings.preferences, body.preferences)
      return json(settings)
    }
    if (method === 'DELETE') { companies = companies.filter((row) => !path.endsWith(row.id)); return json({ success: true }) }
    const row = method === 'POST' ? { ...seed[2], id: uuid(4) } : companies.find((row) => path.endsWith(row.id))
    Object.assign(row, body)
    if (method === 'POST') companies.push(row)
    return json({ company: row })
  })
  return { requests, release: (fail = false) => { assert.ok(pending, 'pending mock request'); const resolve = pending; pending = undefined; resolve(fail) }, companyMode: (mode) => { companyMode = mode }, settingsMode: (mode) => { settingsMode = mode } }
}
try {
  for (const theme of ['light', 'dark', 'special-dark']) for (const [width, height] of [[390, 844], [768, 1024], [1440, 900]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', hasTouch: width === 390 })
    const page = await context.newPage()
    page.on('pageerror', (error) => errors.push(error.message))
    const name = `${theme}-${width}`
    const mocks = before ? null : await synthetic(page, theme)
    await page.goto(`${origin}/company?theme=${theme}`, { waitUntil: 'networkidle' })
    await capture(page, `company-${name}`)
    if (!before && !layoutOnly) await companyInteractions(page, mocks, name)
    if (layoutOnly) {
      await page.getByRole('button', { name: 'เพิ่มบริษัท', exact: true }).click()
      await capture(page, `company-dialog-${name}`)
      await page.keyboard.press('Escape')
    }
    await page.goto(`${origin}/settings?theme=${theme}`, { waitUntil: 'networkidle' })
    await page.locator('#owner-name').waitFor()
    await capture(page, `profile-${name}`)
    if (!before && !layoutOnly) await profileInteractions(page, mocks, name)
    await page.getByRole('tab', { name: 'การแสดงผล', exact: true }).click()
    await capture(page, `appearance-${name}`)
    if (!before && !layoutOnly) await themeInteractions(page, mocks, name, theme, width)
    if (layoutOnly) {
      const initial = await page.evaluate(() => localStorage.getItem('project-management-theme'))
      await page.getByRole('radio', { name: 'Light', exact: true }).focus()
      await page.keyboard.press('ArrowRight')
      const radio = page.getByRole('radio', { name: 'Dark', exact: true })
      assert.equal(await radio.isChecked(), true)
      assert.ok(await radio.evaluate((node) => node === document.activeElement && Number.parseFloat(getComputedStyle(node.nextElementSibling).outlineWidth) >= 2), 'native radio keyboard focus')
      assert.equal(await page.evaluate(() => localStorage.getItem('project-management-theme')), initial)
      await capture(page, `appearance-focus-${name}`)
    }
    await context.close()
    console.log(`Company/Settings passed: ${name}`)
  }
  assert.deepEqual(errors, [])
  completed = true
} finally {
  await writeFile(`${directory}/results.json`, JSON.stringify({ completed, results, errors }, null, 2))
  await browser.close()
}

async function companyInteractions(page, mocks, name) {
  const cards = page.locator('[data-company-card]')
  assert.equal(await cards.count(), 3)
  assert.equal(await cards.nth(0).getByRole('button', { name: 'ลบ', exact: true }).count(), 0)
  assert.equal(await cards.nth(1).getByRole('button', { name: 'ลบ', exact: true }).count(), 0)
  assert.equal(await cards.nth(1).getByRole('link').getAttribute('href'), `/projects?companyId=${seed[1].id}`)
  await cards.nth(1).scrollIntoViewIfNeeded()
  await capture(page, `company-long-${name}`)
  const edit = cards.first().getByRole('button', { name: 'แก้ไข', exact: true })
  await edit.click()
  let dialog = page.getByRole('dialog')
  assert.equal(await dialog.locator('#company-name').isDisabled(), true)
  assert.equal(await dialog.locator('#company-displayName').isDisabled(), false)
  await capture(page, `company-default-${name}`)
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(await edit.evaluate((node) => node === document.activeElement), true)
  await cards.nth(1).getByRole('button', { name: 'แก้ไข', exact: true }).click()
  await dialog.locator('#company-phone').fill('020000000')
  await dialog.getByRole('button', { name: 'บันทึก', exact: true }).click()
  await dialog.getByRole('button', { name: 'กำลังบันทึก…' }).waitFor()
  assert.equal(await dialog.locator('#company-phone').isDisabled(), true)
  await page.keyboard.press('Escape')
  assert.equal(await dialog.isVisible(), true)
  assert.equal(mocks.requests.at(-1).path, `/api/company/${seed[1].id}`)
  assert.equal(mocks.requests.at(-1).body.phone, '020000000')
  mocks.release(true)
  await dialog.getByRole('alert').waitFor()
  assert.equal(await dialog.locator('#company-phone').inputValue(), '020000000')
  await capture(page, `company-save-error-${name}`)
  await dialog.getByRole('button', { name: 'บันทึก', exact: true }).click()
  await dialog.getByRole('button', { name: 'กำลังบันทึก…' }).waitFor()
  mocks.release()
  await dialog.waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: 'เพิ่มบริษัท', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'บันทึก', exact: true }).click()
  assert.equal(await dialog.locator('#company-name').evaluate((node) => node.validity.valueMissing), true)
  const values = { name: 'บริษัทใหม่', displayName: 'ชื่อสำหรับแสดง', location: 'กรุงเทพฯ', address: 'ที่อยู่จำลอง', phone: '0800000000', description: 'รายละเอียดจำลอง' }
  for (const [field, value] of Object.entries(values)) await dialog.locator(`#company-${field}`).fill(value)
  await capture(page, `company-create-${name}`)
  await dialog.getByRole('button', { name: 'บันทึก', exact: true }).click()
  await dialog.getByRole('button', { name: 'กำลังบันทึก…' }).waitFor()
  assert.deepEqual(mocks.requests.at(-1).body, values)
  mocks.release()
  await dialog.waitFor({ state: 'hidden' })
  await cards.filter({ hasText: values.displayName }).waitFor()
  await cards.filter({ hasText: seed[2].name }).getByRole('button', { name: 'ลบ', exact: true }).click()
  const alert = page.getByRole('alertdialog')
  await alert.getByRole('button', { name: 'ยกเลิก', exact: true }).click()
  assert.equal(mocks.requests.filter((r) => r.method === 'DELETE').length, 0)
  await cards.filter({ hasText: seed[2].name }).getByRole('button', { name: 'ลบ', exact: true }).click()
  await alert.getByRole('button', { name: 'ยืนยันลบ Company', exact: true }).click()
  await alert.getByRole('button', { name: 'กำลังลบ...' }).waitFor()
  mocks.release()
  await alert.waitFor({ state: 'hidden' })
  await cards.filter({ hasText: seed[2].name }).waitFor({ state: 'hidden' })
  for (const mode of ['loading', 'error', 'empty']) {
    mocks.companyMode(mode)
    await page.reload({ waitUntil: mode === 'loading' ? 'domcontentloaded' : 'networkidle' })
    if (mode === 'loading') await page.getByText('กำลังโหลด Company…', { exact: true }).waitFor()
    if (mode === 'error') await page.getByRole('button', { name: 'ลองอีกครั้ง', exact: true }).waitFor()
    if (mode === 'empty') await page.getByText('ยังไม่มี Company', { exact: true }).waitFor()
    await capture(page, `company-${mode}-${name}`)
    if (mode === 'loading') { mocks.release(); await cards.first().waitFor() }
  }
  mocks.companyMode('normal')
}

async function profileInteractions(page, mocks, name) {
  await page.locator('#owner-email').fill('invalid')
  await page.getByRole('button', { name: 'บันทึกโปรไฟล์', exact: true }).click()
  assert.equal(await page.locator('#owner-email').evaluate((node) => node.validity.typeMismatch), true)
  assert.equal(mocks.requests.filter((r) => r.path === '/api/settings/me' && r.method === 'PATCH').length, 0)
  await page.locator('#owner-email').fill('contact@example.test')
  await page.locator('#owner-name').fill('ชื่อใหม่')
  await page.locator('#owner-phone').fill('')
  await page.getByRole('button', { name: 'บันทึกโปรไฟล์', exact: true }).click()
  await page.locator('#owner-name:disabled').waitFor()
  assert.deepEqual(mocks.requests.at(-1).body, { profile: { name: 'ชื่อใหม่', email: 'contact@example.test', phone: '' } })
  mocks.release(true)
  await page.getByText('จำลองบันทึกไม่สำเร็จ กรุณาลองใหม่', { exact: true }).waitFor()
  await capture(page, `profile-conflict-${name}`)
  await page.getByRole('button', { name: 'บันทึกโปรไฟล์', exact: true }).click()
  await page.locator('#owner-name:disabled').waitFor()
  mocks.release()
  await page.getByText('บันทึกโปรไฟล์แล้ว', { exact: true }).waitFor()
  await page.locator('#owner-name').fill('draft ยกเลิก')
  await page.getByRole('button', { name: 'ยกเลิก', exact: true }).click()
  assert.equal(await page.locator('#owner-name').inputValue(), 'ชื่อใหม่')
  await page.reload({ waitUntil: 'networkidle' })
  assert.equal(await page.locator('#owner-name').inputValue(), 'ชื่อใหม่')
  assert.equal(await page.locator('#owner-phone').inputValue(), '')
}

async function themeInteractions(page, mocks, name, theme, width) {
  const radios = page.getByRole('radio')
  assert.equal(await radios.count(), 3)
  const selected = () => page.locator('input[name="owner-theme"]:checked').inputValue()
  const current = () => page.evaluate(() => ({ theme: document.documentElement.className, stored: localStorage.getItem('project-management-theme') }))
  assert.equal(await selected(), theme)
  const initial = await current()
  const initialPatches = mocks.requests.filter((r) => r.path === '/api/settings/me' && r.method === 'PATCH').length
  const target = theme === 'dark' ? 'special-dark' : 'dark'
  // Native radios support tab/arrow/space, and their complete labels are touch targets.
  await page.getByRole('radio', { name: 'Light', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  assert.equal(await selected(), 'dark')
  assert.ok(await page.getByRole('radio', { name: 'Dark', exact: true }).evaluate((node) => node === document.activeElement))
  assert.ok(await page.getByRole('radio', { name: 'Dark', exact: true }).evaluate((node) => Number.parseFloat(getComputedStyle(node.nextElementSibling).outlineWidth) >= 2), 'keyboard focus has a visible outline')
  for (const value of ['light', 'dark', 'special-dark']) {
    const label = page.locator('label').filter({ has: page.locator(`#owner-theme-${value}`) })
    if (width === 390) await label.tap(); else await label.click()
    assert.equal(await selected(), value)
    assert.deepEqual(await current(), initial, 'draft never changes provider or localStorage')
  }
  assert.equal(mocks.requests.filter((r) => r.path === '/api/settings/me' && r.method === 'PATCH').length, initialPatches)
  await capture(page, `appearance-draft-${name}`)
  await page.getByRole('button', { name: 'ยกเลิก', exact: true }).click()
  assert.equal(await selected(), theme)
  assert.deepEqual(await current(), initial)
  // Each preview renders its own existing palette regardless of the surrounding theme.
  const colors = await page.locator('[data-theme-preview]').evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).backgroundColor))
  assert.equal(new Set(colors).size, 3)
  await page.locator('label').filter({ has: page.locator(`#owner-theme-${target}`) }).click()
  await page.getByRole('button', { name: 'บันทึกการตั้งค่า', exact: true }).click()
  await page.locator('#owner-theme-light:disabled').waitFor()
  assert.deepEqual(mocks.requests.at(-1).body, { preferences: { theme: target } })
  assert.deepEqual(await current(), initial)
  await capture(page, `appearance-saving-${name}`)
  mocks.release(true)
  await page.getByText('จำลองบันทึกไม่สำเร็จ กรุณาลองใหม่', { exact: true }).waitFor()
  assert.equal(await selected(), target)
  assert.deepEqual(await current(), initial)
  await capture(page, `appearance-error-${name}`)
  await page.getByRole('button', { name: 'บันทึกการตั้งค่า', exact: true }).click()
  await page.locator('#owner-theme-light:disabled').waitFor()
  mocks.release()
  await page.getByText('บันทึกการตั้งค่าแล้ว', { exact: true }).waitFor()
  assert.equal((await current()).stored, target)
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('tab', { name: 'การแสดงผล', exact: true }).click()
  assert.equal(await selected(), target)
  assert.equal((await current()).stored, target)
  // A dirty draft survives a header save locally; Cancel returns to the latest saved header choice.
  const dirtyTheme = target === 'dark' ? 'special-dark' : 'dark'
  await page.locator('label').filter({ has: page.locator(`#owner-theme-${dirtyTheme}`) }).click()
  const readsBeforeHeader = mocks.requests.filter((r) => r.path === '/api/settings/me' && r.method === 'GET').length
  await page.getByRole('button', { name: 'Toggle theme', exact: true }).click()
  await page.getByRole('menuitem', { name: /^Light/ }).click()
  await page.locator('#owner-theme-light:disabled').waitFor()
  mocks.release()
  await page.locator('#owner-theme-light:not(:disabled)').waitFor({ state: 'attached' })
  assert.equal((await current()).stored, 'light')
  assert.equal(await selected(), dirtyTheme)
  assert.equal(mocks.requests.filter((r) => r.path === '/api/settings/me' && r.method === 'GET').length, readsBeforeHeader, 'header save does not refetch/remount Settings')
  await page.getByRole('button', { name: 'ยกเลิก', exact: true }).click()
  assert.equal(await selected(), 'light')
  await page.locator('#owner-locale').selectOption('en')
  await page.getByRole('button', { name: 'บันทึกการตั้งค่า', exact: true }).click()
  await page.locator('#owner-locale:disabled').waitFor()
  assert.deepEqual(mocks.requests.at(-1).body, { preferences: { locale: 'en' } })
  mocks.release()
  await page.getByText('บันทึกการตั้งค่าแล้ว', { exact: true }).waitFor()
  assert.equal(await page.locator('html').getAttribute('lang'), 'en')
  assert.equal(await page.locator('#owner-timezone').inputValue(), 'Asia/Bangkok')
  for (const mode of ['loading', 'error']) {
    mocks.settingsMode(mode)
    await page.reload({ waitUntil: mode === 'loading' ? 'domcontentloaded' : 'networkidle' })
    if (mode === 'loading') await page.getByText('กำลังโหลดการตั้งค่า...', { exact: true }).waitFor()
    else await page.getByRole('button', { name: 'ลองโหลดอีกครั้ง', exact: true }).waitFor()
    await capture(page, `settings-${mode}-${name}`)
    if (mode === 'loading') { mocks.release(); await page.locator('#owner-name').waitFor() }
  }
  mocks.settingsMode('normal')
  await page.getByRole('button', { name: 'ลองโหลดอีกครั้ง', exact: true }).click()
  await page.locator('#owner-name').waitFor()
}
