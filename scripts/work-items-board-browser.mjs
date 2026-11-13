import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { previewData } from '../tests/frontend-ui/preview-fixtures.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PMS_PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.PMS_PREVIEW_ORIGIN || 'http://127.0.0.1:3791'
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('Use the isolated synthetic preview')
const before = process.argv.includes('--before')
const directory = `artifacts/issue-50/${before ? 'before' : 'after'}`
await mkdir(directory, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: process.env.PMS_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) })
const results = [], errors = [], measurements = []
let completed = false
const uuid = (n) => `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const data = previewData()
const company = { ...data.companies[0], id: uuid(1) }
const projects = [0, 1].map((index) => ({ ...data.projects[index], id: uuid(index + 2), companyId: company.id, company, name: index ? 'Second project' : 'โครงการตรวจสอบความหนาแน่นและชื่อยาวสำหรับ Work Items' }))
const seed = Array.from({ length: 15 }, (_, index) => ({
  ...data.workItems[index % 6], id: uuid(index + 10), project: projects[index === 14 ? 1 : 0],
  title: `${index + 1}. ตรวจสอบชื่องานยาวและการจัดลำดับข้อมูล ${'LongIdentifier'.repeat(5)}`,
  description: 'รายละเอียดงานที่ยังเปิดอ่านได้ครบ\n\n| รายการ | ผล |\n| --- | --- |\n| GFM | ผ่าน |',
  assignee: { id: uuid(4), name: 'ผู้รับผิดชอบชื่อยาวสำหรับตรวจการตัดข้อความ', avatar: null },
  types: ['bug', 'documentation', 'maintenance', 'support', 'role::Developer'],
  status: index < 8 ? 'todo' : ['in-progress', 'blocked', 'completed', 'cancelled', 'backlog', 'sa-testing', 'todo'][index - 8],
  workDate: '2026-11-01', dueDate: index < 8 ? '2026-11-01' : index < 10 ? '2026-11-30' : '2026-12-15',
  updatedAt: index === 14 ? '2026-11-01T09:00:00+07:00' : '2026-11-13T09:00:00+07:00',
}))
async function synthetic(page, extended = false) {
  let items = structuredClone(seed), pending, fail = true
  if (extended) items.push(...Array.from({ length: 12 }, (_, index) => ({ ...structuredClone(seed[14]), id: uuid(index + 100) })))
  const requests = []
  await page.route(`${origin}/api/**`, async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
    const body = request.postDataJSON()
    requests.push({ path, method, body })
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) })
    if (path === '/api/company') return json({ companies: [company], page: { nextCursor: null } })
    if (path === '/api/projects') return json({ projects, page: { nextCursor: null } })
    if (path === '/api/work-items/import') return json({ imported: 1, rows: [{ row: 1, outcome: 'created' }] })
    if (method === 'PATCH' || method === 'POST') {
      await new Promise((resolve) => { pending = resolve })
      if (fail) return json({ error: { code: 'VALIDATION_ERROR', message: 'จำลองบันทึกไม่สำเร็จ' } }, 400)
      const item = items.find((row) => path.endsWith(row.id)) || { ...items[0], id: uuid(99) }
      Object.assign(item, body)
      return json({ workItem: item }, method === 'POST' ? 201 : 200)
    }
    if (path.startsWith('/api/work-items/')) return json({ workItem: items.find((row) => path.endsWith(row.id)) })
    if (path === '/api/work-items') {
      const p = url.searchParams
      const rows = items.filter((item) => (!p.get('search') || `${item.title} ${item.description}`.toLowerCase().includes(p.get('search').toLowerCase()))
        && (!p.get('projectId') || item.project.id === p.get('projectId'))
        && (!p.get('status') || item.status === p.get('status'))
        && (!p.get('role') || item.role === p.get('role'))
        && (!p.get('kind') || item.kind === p.get('kind')))
      return json({ workItems: rows, years: ['2026'], summary: { total: rows.length, inProgress: rows.filter((row) => row.status === 'in-progress').length, completed: rows.filter((row) => row.status === 'completed').length, overdue: 8, kinds: Object.fromEntries(['Task', 'Issue', 'Incident'].map((kind) => [kind, rows.filter((row) => row.kind === kind).length])) }, page: { nextCursor: null } })
    }
    return route.continue()
  })
  return { requests, release: (shouldFail) => { fail = shouldFail; pending() }, ready: () => Boolean(pending) }
}
async function capture(page, name) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no document overflow')
  assert.ok(await page.locator('main').last().evaluate((node) => node.scrollWidth <= node.clientWidth + 1), 'no main overflow')
  await page.screenshot({ path: `${directory}/${name}.png` })
  results.push({ case: name, pass: true })
}
async function measure(page, route, theme, width) {
  const cards = page.locator('[data-slot="card"]').filter({ has: page.locator(route === 'work-items' ? 'h3' : 'button[aria-haspopup="dialog"]') })
  await cards.last().waitFor()
  const sizes = await cards.evaluateAll((nodes) => nodes.filter((node) => !node.querySelector('[data-slot="card"]')).map((node) => {
    const rect = node.getBoundingClientRect()
    return { height: rect.height, width: rect.width, visible: rect.top >= 0 && rect.bottom <= innerHeight, fits: node.scrollWidth <= node.clientWidth + 1 }
  }))
  assert.ok(sizes.length)
  measurements.push({ route, theme, width, cards: sizes, averageHeight: sizes.reduce((sum, row) => sum + row.height, 0) / sizes.length, visible: sizes.filter((row) => row.visible).length })
}
async function workItemInteractions(page, mocks, name) {
  const project = page.locator(`[data-project-group="${projects[0].id}"]`)
  const buckets = project.locator('[data-urgency-group]')
  assert.deepEqual(await buckets.evaluateAll((nodes) => nodes.map((node) => node.dataset.urgencyGroup)), ['overdue', 'near-due', 'on-track', 'complete'])
  assert.equal(await buckets.first().getAttribute('data-state'), 'open')
  for (const bucket of ['near-due', 'on-track', 'complete']) await project.locator(`[data-urgency-group="${bucket}"] [data-slot="collapsible-trigger"]`).click()
  assert.ok(await project.locator('[data-urgency-group="complete"]').getByRole('button', { name: seed[11].title, exact: true }).count(), 'cancelled stays Complete')
  const title = page.getByRole('button', { name: seed[0].title, exact: true })
  await title.focus(); await page.keyboard.press('Enter')
  let dialog = page.getByRole('dialog')
  await dialog.waitFor()
  assert.equal(await dialog.locator('table').count(), 1, 'GFM still renders')
  await dialog.getByText('documentation', { exact: true }).waitFor()
  await capture(page, `work-detail-${name}`)
  await dialog.getByRole('button', { name: 'แก้ไข', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByRole('heading', { name: 'แก้ไข Work Item', exact: true }).waitFor()
  assert.equal(await dialog.locator('#title').inputValue(), seed[0].title)
  const types = dialog.getByRole('group', { name: 'ประเภทงาน' })
  assert.equal(await types.getByRole('button', { name: 'documentation', exact: true }).getAttribute('aria-pressed'), 'true')
  await dialog.locator('#title').fill('แก้ไขชื่อโดยยังรักษาข้อมูลเดิม')
  await capture(page, `work-edit-${name}`)
  await dialog.getByRole('button', { name: 'บันทึกการแก้ไข', exact: true }).click()
  await dialog.locator('#title:disabled').waitFor()
  const patch = mocks.requests.findLast((row) => row.method === 'PATCH')
  assert.equal(patch.path, `/api/work-items/${seed[0].id}`)
  assert.deepEqual(patch.body.types, seed[0].types)
  assert.equal(patch.body.projectId, projects[0].id)
  mocks.release(true)
  await dialog.locator('#title:not(:disabled)').waitFor()
  assert.equal(await dialog.locator('#title').inputValue(), 'แก้ไขชื่อโดยยังรักษาข้อมูลเดิม')
  await capture(page, `work-edit-failure-${name}`)
  await dialog.getByRole('button', { name: 'ยกเลิก', exact: true }).click()
  const create = page.getByRole('button', { name: /^(New Work Item|New)$/ })
  await create.click()
  dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'สร้าง Work Item', exact: true }).waitFor()
  await capture(page, `work-create-${name}`)
  await dialog.locator('#title').fill('สร้าง Work Item ใน preview')
  await dialog.getByRole('combobox', { name: /Project/ }).click()
  await page.getByRole('option', { name: projects[0].name, exact: true }).click()
  await dialog.getByRole('button', { name: 'สร้าง Work Item', exact: true }).click()
  await dialog.locator('#title:disabled').waitFor()
  const post = mocks.requests.findLast((row) => row.method === 'POST')
  assert.ok(!('id' in post.body), 'ordinary create never supplies an identity')
  assert.equal(post.body.projectId, projects[0].id)
  mocks.release(false)
  await dialog.waitFor({ state: 'hidden' })
  results.push({ case: `CRUD dialogs, UUID payloads, types, GFM, failure draft ${name}`, pass: true })

  await page.getByRole('button', { name: /^ค้นหาและตัวกรอง/ }).click()
  let panel = page.locator('.search-filter-panel')
  await panel.getByRole('combobox', { name: 'กรองสถานะ', exact: true }).click()
  await page.getByRole('option', { name: 'To Do', exact: true }).click()
  await panel.getByRole('searchbox').fill('LongIdentifier')
  await panel.getByRole('button', { name: 'แสดงผลลัพธ์' }).click()
  await page.waitForFunction(() => document.querySelector('.search-filter-trigger').title.includes('ค้นหา: LongIdentifier'))
  assert.match(await page.locator('.search-filter-trigger').getAttribute('title'), /To Do/)
  await capture(page, `work-filtered-${name}`)
  await page.getByRole('button', { name: /^ค้นหาและตัวกรอง/ }).click()
  panel = page.locator('.search-filter-panel')
  assert.equal(await panel.getByRole('searchbox').inputValue(), 'LongIdentifier')
  await panel.getByRole('button', { name: /^Sort work items/ }).click()
  await page.getByRole('menuitemradio', { name: 'Due date ↑', exact: true }).click()
  await panel.getByRole('button', { name: /^Sort work items/ }).click()
  await page.getByRole('menuitem', { name: 'Reset to default', exact: true }).click()
  assert.equal(await panel.getByRole('combobox', { name: 'กรองสถานะ', exact: true }).textContent(), 'To Do', 'sort reset preserves filters')
  await panel.getByRole('button', { name: 'ล้างตัวกรอง' }).click()
  await panel.getByRole('button', { name: 'แสดงผลลัพธ์' }).click()
  await page.waitForFunction(() => document.querySelector('.search-filter-trigger').getAttribute('title') === null)
  await page.locator('[data-work-item-card]').first().waitFor()
  assert.equal(await project.locator('[data-urgency-group="near-due"]').getAttribute('data-state'), 'closed', 'filter reset restores default expansion')
  results.push({ case: `filters, summary, sort-only reset and expansion reset ${name}`, pass: true })

  await page.locator('.data-transfer-trigger').click()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Export importable JSON', exact: true }).click()
  const exported = JSON.parse(await readFile(await (await downloadPromise).path(), 'utf8'))
  assert.ok(exported.length > 0 && exported.every((row) => /^50000000-0000-4000-8000-\d{12}$/.test(row.id) && row.projectId === projects.find((project) => project.id === row.projectId)?.id))
  await page.locator('.data-transfer-trigger').click()
  const chooserPromise = page.waitForEvent('filechooser')
  await page.getByRole('menuitem', { name: 'Import work items from JSON', exact: true }).click()
  await (await chooserPromise).setFiles({ name: 'work-items.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) })
  await page.getByText(/เพิ่ม 1 รายการ/).first().waitFor()
  assert.deepEqual(mocks.requests.findLast((row) => row.path.endsWith('/import')).body, exported)
  results.push({ case: `public UUID import/export ${name}`, pass: true })
}
try {
  for (const theme of ['light', 'dark', 'special-dark']) {
    for (const [width, height] of [[390, 844], [768, 1024], [1440, 900]]) {
      const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', timezoneId: 'America/Los_Angeles', hasTouch: width === 390 })
      await context.addInitScript(() => {
        const Original = Date
        window.Date = class extends Original { constructor(...args) { super(...(args.length ? args : ['2026-11-13T09:00:00+07:00'])) } static now() { return new Original('2026-11-13T09:00:00+07:00').getTime() } }
      })
      const page = await context.newPage()
      page.on('pageerror', (error) => errors.push(error.message))
      const mocks = await synthetic(page)
      for (const route of ['work-items', 'board']) {
        await page.goto(`${origin}/${route}?theme=${theme}`, { waitUntil: 'networkidle' })
        await measure(page, route, theme, width)
        await capture(page, `${route}-${theme}-${width}`)
        if (!before) {
          assert.ok(measurements.at(-1).cards.every((row) => row.fits), 'cards fit their content')
          if (route === 'board') {
            assert.equal(await page.locator('[data-board-status]').count(), 8)
            assert.ok(await page.locator('[data-board-status="pm-testing"]').evaluate((node) => node.getBoundingClientRect().height < 180), 'empty column stays compact')
            const opener = page.locator('[data-work-item-card] button[aria-haspopup="dialog"]').first()
            await opener.focus(); await page.keyboard.press('Enter')
            await page.getByRole('dialog').waitFor()
            await page.getByRole('dialog').getByRole('heading', { name: seed[12].title, exact: true }).waitFor()
            await capture(page, `board-detail-${theme}-${width}`)
            await page.keyboard.press('Escape')
            const move = page.getByRole('button', { name: `เปลี่ยนสถานะ ${seed[12].title}`, exact: true })
            await move.scrollIntoViewIfNeeded(); await move.focus(); await page.keyboard.press('Enter')
            await page.getByRole('menuitem', { name: 'To Do', exact: true }).click()
            await page.waitForFunction(() => document.querySelector('[aria-busy="true"][data-work-item-card]'))
            assert.ok(await page.getByRole('button', { name: `เปลี่ยนสถานะ ${seed[12].title}`, exact: true }).isDisabled(), 'pending move is locked')
            assert.ok(await page.getByRole('button', { name: /^ค้นหาและตัวกรอง/ }).isDisabled(), 'filters stay locked while saving')
            await capture(page, `board-pending-${theme}-${width}`)
            mocks.release(true)
            await page.getByRole('alert').filter({ hasText: 'จำลองบันทึกไม่สำเร็จ' }).waitFor()
            await page.getByRole('button', { name: `เปลี่ยนสถานะ ${seed[12].title}`, exact: true }).waitFor()
            const restored = page.locator('[data-board-status="backlog"]')
            assert.ok(await restored.getByRole('button', { name: seed[12].title, exact: true }).count(), 'failure restores original column')
            await capture(page, `board-failure-${theme}-${width}`)
            const retryMove = page.getByRole('button', { name: `เปลี่ยนสถานะ ${seed[12].title}`, exact: true })
            if (width === 390) await retryMove.tap()
            else await retryMove.click()
            await page.getByRole('menuitem', { name: 'To Do', exact: true }).click()
            await page.waitForFunction(() => document.querySelector('[aria-busy="true"][data-work-item-card]'))
            mocks.release(false)
            await page.getByText('บันทึกสถานะ To Do แล้ว', { exact: true }).waitFor()
            await page.locator('[data-board-status="todo"]').getByRole('button', { name: seed[12].title, exact: true }).waitFor()
            results.push({ case: `board keyboard move, pending, rollback and success ${theme}-${width}`, pass: true })
          } else {
            await workItemInteractions(page, mocks, `${theme}-${width}`)
          }
        }
      }
      await context.close()
      console.log(`Work Items / Board passed: ${theme} ${width}px`)
    }
  }
  assert.deepEqual(errors, [])
  if (!before) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    page.on('pageerror', (error) => errors.push(error.message))
    await synthetic(page, true)
    await page.goto(`${origin}/work-items`, { waitUntil: 'networkidle' })
    const main = page.locator('main').last()
    const first = page.locator(`[data-project-group="${projects[0].id}"]`)
    const second = page.locator(`[data-project-group="${projects[1].id}"]`)
    await first.locator('[data-work-item-card]').first().waitFor()
    await second.locator('[data-slot="collapsible-trigger"]').first().click()
    await main.evaluate((node) => { const project = node.querySelector('[data-project-group]'); node.scrollTop = project.offsetTop + 240 })
    await page.waitForFunction(() => {
      const main = document.querySelector('main main'), project = document.querySelector('[data-project-group]')
      const head = project.querySelector('[data-slot="collapsible-trigger"]').parentElement
      const subgroup = project.querySelector('[data-urgency-group] [data-slot="collapsible-trigger"]').parentElement.parentElement
      return Math.abs(head.getBoundingClientRect().top - main.getBoundingClientRect().top) < 2 && Math.abs(subgroup.getBoundingClientRect().top - head.getBoundingClientRect().bottom) < 2
    })
    assert.ok(await page.locator('h1').evaluate((node) => node.getBoundingClientRect().bottom < 0), 'title unpins')
    await capture(page, 'work-sticky-two-rows')
    await second.locator('[data-work-item-card]').last().scrollIntoViewIfNeeded()
    assert.ok(await first.locator('[data-slot="collapsible-trigger"]').first().evaluate((node) => node.getBoundingClientRect().bottom < document.querySelector('main main').getBoundingClientRect().top), 'first project unpins after last card')
    await capture(page, 'work-sticky-boundary')
    results.push({ case: 'two-row sticky geometry, title unpins and project boundary', pass: true })
    await context.close()
    assert.deepEqual(errors, [])
    const baseline = JSON.parse(await readFile('artifacts/issue-50/before/results.json', 'utf8'))
    for (const current of measurements) {
      const previous = baseline.measurements.find((row) => row.route === current.route && row.theme === current.theme && row.width === current.width)
      assert.ok(current.averageHeight < previous.averageHeight, `density improves ${current.route} ${current.theme} ${current.width}`)
    }
  }
  completed = true
} finally {
  await browser.close()
  await writeFile(`${directory}/results.json`, JSON.stringify({ completed, synthetic: true, database: false, results, measurements, errors }, null, 2))
}
console.log(`${results.length} browser checks passed`)
