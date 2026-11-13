import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { previewData } from '../tests/frontend-ui/preview-fixtures.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PMS_PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.PMS_PREVIEW_ORIGIN || 'http://127.0.0.1:3791'
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('Use the isolated synthetic preview')
const before = process.argv.includes('--before')
const layoutOnly = process.argv.includes('--layout-only')
const directory = `artifacts/issue-51/${before ? 'before' : layoutOnly ? 'layout-final' : 'after'}`
await mkdir(directory, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: process.env.PMS_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) })
const results = [], measurements = [], errors = []
let completed = false
const uuid = (n) => `51000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const data = previewData()
const company = { ...data.companies[0], id: uuid(1), name: 'บริษัทตัวอย่างสำหรับบันทึกงาน' }
const projects = [0, 1].map((i) => ({ ...data.projects[i], id: uuid(i + 2), name: i ? 'Project รอง' : 'โครงการชื่อยาวสำหรับตรวจความชัดเจนของบันทึกงานประจำวัน', companyId: company.id, company }))
const items = projects.map((project, i) => ({ ...data.workItems[i], id: uuid(i + 10), project, title: `งาน ${i + 1} ตรวจสอบรายละเอียดและชั่วโมงทศนิยม ${'LongIdentifier'.repeat(5)}` }))
const seed = ['1.005', '1.005', '0.125'].map((hours, i) => ({ ...data.workLogs[0], id: uuid(i + 20), project: projects[0], workItem: items[0], user: { ...data.workLogs[0].user, id: uuid(90) }, hours, date: i === 2 ? '2026-11-12' : '2026-11-13', description: i === 2 ? 'รายการวันก่อนหน้า' : `รายละเอียด ${i + 1} ${'รายละเอียดงานและผลการดำเนินการ '.repeat(12)}`, remarks: i === 1 ? '' : `หมายเหตุครบถ้วน\n\n| ผล | สถานะ |\n| --- | --- |\n| ทดสอบ | ผ่าน |\n\n${'หมายเหตุยาว '.repeat(30)}` }))
async function synthetic(page) {
  let logs = structuredClone(seed), pending, fail = false, mode = 'normal'
  const requests = []
  await page.route(`${origin}/api/**`, async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname, method = request.method()
    const body = request.postDataJSON()
    requests.push({ path, query: Object.fromEntries(url.searchParams), method, body })
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) })
    if (path === '/api/projects') return json({ projects, page: { nextCursor: null } })
    if (path === '/api/work-items') return json({ workItems: items.filter((item) => item.project.id === url.searchParams.get('projectId')), page: { nextCursor: null } })
    if (method !== 'GET') {
      await new Promise((resolve) => { pending = resolve })
      if (fail) return json({ error: { code: 'VALIDATION_ERROR', message: 'จำลอง API บันทึกไม่สำเร็จ' } }, 400)
      if (method === 'DELETE') { logs = logs.filter((log) => !path.endsWith(log.id)); return json({ success: true }) }
      const row = method === 'PATCH' ? logs.find((log) => path.endsWith(log.id)) : { ...seed[0], id: uuid(99) }
      Object.assign(row, body, { project: projects.find((project) => project.id === body.projectId), workItem: items.find((item) => item.id === body.workItemId) })
      if (method === 'POST') logs.push(row)
      return json({ workLog: row }, method === 'POST' ? 201 : 200)
    }
    if (path === '/api/work-logs') {
      if (mode === 'loading') await new Promise((resolve) => { pending = resolve })
      if (mode === 'error') return json({ error: { code: 'UNAVAILABLE', message: 'จำลองโหลดบันทึกไม่สำเร็จ' } }, 503)
      const q = url.searchParams
      return json({ workLogs: mode === 'empty' ? [] : logs.filter((log) => (!q.get('date') || log.date === q.get('date')) && (!q.get('startDate') || log.date >= q.get('startDate')) && (!q.get('endDate') || log.date <= q.get('endDate'))) })
    }
    return route.continue()
  })
  return { requests, release: (failure = false) => { fail = failure; const resolve = pending; pending = undefined; resolve() }, mode: (value) => { mode = value } }
}
async function capture(page, name) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'document overflow')
  assert.ok(await page.locator('main').last().evaluate((node) => node.scrollWidth <= node.clientWidth + 1), 'main overflow')
  const dialog = page.getByRole('dialog')
  if (await dialog.count()) assert.ok(await dialog.evaluate((node) => { const r = node.getBoundingClientRect(); return r.x >= 0 && r.right <= innerWidth + 1 && r.y >= 0 && r.bottom <= innerHeight + 1 && node.scrollWidth <= node.clientWidth + 1 }), 'dialog fits')
  await page.screenshot({ path: `${directory}/${name}.png` })
  results.push({ case: name, pass: true })
}
async function measure(page, theme, width) {
  const cards = page.locator('[data-work-log-card]')
  await cards.first().waitFor()
  const sizes = await cards.evaluateAll((nodes) => nodes.map((node) => ({ height: node.getBoundingClientRect().height, fits: node.scrollWidth <= node.clientWidth + 1 })))
  assert.ok(sizes.every((size) => size.fits))
  measurements.push({ theme, width, averageHeight: sizes.reduce((sum, size) => sum + size.height, 0) / sizes.length })
}
try {
  for (const theme of ['light', 'dark', 'special-dark']) for (const [width, height] of [[390, 844], [768, 1024], [1440, 900]]) {
    const context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce', timezoneId: 'America/Los_Angeles', hasTouch: width === 390 })
    const page = await context.newPage()
    page.on('pageerror', (error) => errors.push(error.message))
    const mocks = await synthetic(page)
    const name = `${theme}-${width}`
    await page.goto(`${origin}/daily-work?theme=${theme}&date=2026-11-13`, { waitUntil: 'networkidle' })
    await measure(page, theme, width)
    await page.locator('[data-work-log-card]').first().scrollIntoViewIfNeeded()
    await capture(page, `journal-${name}`)
    await page.locator('main').last().evaluate((node) => { node.scrollTop = 0 })
    if (!before) {
      assert.equal(await page.locator('[data-selected-period]').isVisible(), true)
      assert.match(await page.locator('[data-selected-period]').innerText(), /13\/11\/2026/)
    }
    await capture(page, `overview-${name}`)
    if (!before && !layoutOnly) {
      await interactions(page, mocks, name, theme)
      const edge = await context.newPage()
      edge.on('pageerror', (error) => errors.push(error.message))
      await edge.goto(`${origin}/daily-work?theme=${theme}&qa=edge&layoutCheck=1`, { waitUntil: 'networkidle' })
      await edge.locator('[data-layout-audit="pass"]').waitFor()
      await edge.locator('[data-work-log-card]').first().scrollIntoViewIfNeeded()
      await capture(edge, `edge-layout-${name}`)
      await edge.locator('[data-work-log-card]').first().getByRole('button', { name: 'ดูรายละเอียด', exact: true }).click()
      await edge.getByRole('dialog').getByRole('button', { name: 'แก้ไข', exact: true }).waitFor()
      await capture(edge, `edge-detail-${name}`)
      await edge.close()
    }
    await context.close()
    console.log(`Daily Work passed: ${name}`)
  }
  if (!before) {
    const baseline = JSON.parse(await readFile('artifacts/issue-51/before/results.json', 'utf8'))
    for (const row of measurements) assert.ok(row.averageHeight < baseline.measurements.find((old) => old.theme === row.theme && old.width === row.width).averageHeight, `density improves ${row.theme} ${row.width}`)
  }
  assert.deepEqual(errors, [])
  completed = true
} finally {
  await writeFile(`${directory}/results.json`, JSON.stringify({ completed, results, measurements, errors }, null, 2))
  await browser.close()
}

async function interactions(page, mocks, name, theme) {
  const dismissToast = async () => {
    const toast = page.locator('[data-slot="toast"][data-state="open"]')
    if (await toast.count()) {
      await toast.locator('[toast-close]').click()
      await toast.waitFor({ state: 'hidden' })
    }
  }
  const summary = page.locator('[data-work-log-summary]')
  assert.match(await summary.innerText(), /2\.01/, 'sum 1.005 + 1.005 before rounding')
  assert.match(await summary.innerText(), /13\/11\/2026/)
  const cards = page.locator('[data-work-log-card]')
  assert.equal(await cards.count(), 2)
  assert.equal(await cards.nth(1).getByRole('button', { name: 'หมายเหตุ', exact: true }).count(), 0)
  const remarks = cards.first().getByRole('button', { name: /^(หมายเหตุ|ซ่อนหมายเหตุ)$/, exact: true })
  await remarks.focus(); await page.keyboard.press('Enter')
  assert.equal(await remarks.getAttribute('aria-expanded'), 'true')
  assert.equal(await page.locator(`[id="${await remarks.getAttribute('aria-controls')}"]`).innerText(), seed[0].remarks)
  await capture(page, `remarks-${name}`)
  await remarks.click()
  await cards.first().getByRole('button', { name: 'ดูรายละเอียด', exact: true }).click()
  let dialog = page.getByRole('dialog')
  await dialog.locator('table').waitFor()
  assert.ok((await dialog.innerText()).includes(seed[0].description.trim()), 'full description remains readable')
  await capture(page, `detail-${name}`)
  await dialog.getByRole('button', { name: 'แก้ไข', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.getByRole('heading', { name: 'แก้ไขบันทึกงาน', exact: true }).waitFor()
  assert.equal(await dialog.locator('#hours').inputValue(), '1.01')
  await dialog.locator('#description').fill('แก้รายละเอียดโดยรักษาทศนิยมเดิม')
  await capture(page, `edit-${name}`)
  await dialog.getByRole('button', { name: 'บันทึกการแก้ไข', exact: true }).click()
  await dialog.locator('#description:disabled').waitFor()
  assert.equal(await dialog.getByRole('button', { name: 'กำลังบันทึก…' }).isDisabled(), true)
  assert.equal(mocks.requests.findLast((r) => r.method === 'PATCH').body.hours, '1.005')
  assert.equal(mocks.requests.findLast((r) => r.method === 'PATCH').path, `/api/work-logs/${seed[0].id}`)
  mocks.release(true)
  await dialog.locator('#description:not(:disabled)').waitFor()
  assert.equal(await dialog.locator('#description').inputValue(), 'แก้รายละเอียดโดยรักษาทศนิยมเดิม')
  await capture(page, `edit-error-${name}`)
  await dismissToast()
  await dialog.getByRole('button', { name: 'บันทึกการแก้ไข', exact: true }).click()
  await dialog.locator('#description:disabled').waitFor()
  mocks.release()
  await dialog.waitFor({ state: 'hidden' })
  await dismissToast()

  const opener = page.getByRole('button', { name: 'เพิ่มบันทึกงาน', exact: true }).first()
  await opener.click()
  dialog = page.getByRole('dialog')
  await dialog.getByRole('heading', { name: 'เพิ่มบันทึกงาน', exact: true }).waitFor()
  const posts = () => mocks.requests.filter((r) => r.method === 'POST')
  const count = posts().length
  await dialog.getByRole('button', { name: 'บันทึก', exact: true }).click()
  await page.getByText('กรุณาระบุวันที่ ชั่วโมง Project งาน และรายละเอียดให้ครบ', { exact: true }).waitFor()
  assert.equal(posts().length, count)
  await capture(page, `validation-${name}`)
  await dialog.locator('#work-log-project').click()
  await page.locator('[data-slot="popover-content"]').getByRole('button', { name: projects[0].name, exact: true }).click()
  await dialog.locator('#work-log-work-item:not(:disabled)').waitFor()
  await dialog.locator('#work-log-work-item').click()
  await page.locator('[data-slot="popover-content"]').getByRole('button').first().click()
  assert.equal(await dialog.locator('#description').inputValue(), items[0].title, 'linked selection fills blank description')
  await dialog.locator('#work-log-project').click()
  await page.locator('[data-slot="popover-content"]').getByRole('button', { name: projects[1].name, exact: true }).click()
  await dialog.locator('#work-log-work-item:not(:disabled)').waitFor()
  assert.equal(await dialog.locator('#work-log-work-item').textContent().then((s) => s.trim()), 'เลือกงาน…', 'changing Project clears Work Item')
  await dialog.locator('#work-log-work-item').click()
  await page.locator('[data-slot="popover-content"]').getByRole('button').first().click()
  await dialog.locator('#hours').fill('0')
  await dialog.getByRole('button', { name: 'บันทึก', exact: true }).click()
  await page.getByText('ชั่วโมงต้องเป็นเลขทศนิยมที่มากกว่า 0', { exact: true }).waitFor()
  assert.equal(posts().length, count)
  await dismissToast()
  await dialog.locator('#hours').fill('0.125')
  await capture(page, `create-${name}`)
  await dialog.getByRole('button', { name: 'บันทึก', exact: true }).click()
  await dialog.locator('#description:disabled').waitFor()
  const post = posts().at(-1)
  assert.ok(!('id' in post.body))
  assert.equal(post.body.projectId, projects[1].id)
  assert.equal(post.body.workItemId, items[1].id)
  assert.equal(post.body.date, '2026-11-13')
  mocks.release()
  await dialog.waitFor({ state: 'hidden' })
  await dismissToast()
  const created = cards.filter({ hasText: projects[1].name })
  await created.getByRole('button', { name: 'ดูรายละเอียด', exact: true }).click()
  dialog = page.getByRole('dialog')
  const deletes = () => mocks.requests.filter((r) => r.method === 'DELETE')
  page.once('dialog', (confirmation) => confirmation.dismiss())
  await dialog.getByRole('button', { name: 'ลบ', exact: true }).click()
  assert.equal(deletes().length, 0)
  page.once('dialog', (confirmation) => confirmation.accept())
  await dialog.getByRole('button', { name: 'ลบ', exact: true }).click()
  await dialog.getByRole('button', { name: 'กำลังลบ…' }).waitFor()
  assert.equal(await dialog.getByRole('button', { name: 'แก้ไข', exact: true }).isDisabled(), true)
  mocks.release(true)
  await dialog.getByRole('button', { name: 'ลบ', exact: true }).waitFor()
  assert.equal(await created.count(), 1, 'failed delete keeps record')
  await capture(page, `delete-error-${name}`)
  await dismissToast()
  page.once('dialog', (confirmation) => confirmation.accept())
  await dialog.getByRole('button', { name: 'ลบ', exact: true }).click()
  await dialog.getByRole('button', { name: 'กำลังลบ…' }).waitFor()
  mocks.release()
  await dialog.waitFor({ state: 'hidden' })
  await created.waitFor({ state: 'hidden' })
  results.push({ case: `CRUD, validation, exact decimals, linked selections, pending/failure/UUIDs ${name}`, pass: true })

  await dismissToast()
  await page.getByRole('button', { name: 'ดูบันทึกงานรวมตาม Project', exact: true }).click()
  dialog = page.getByRole('dialog')
  await dialog.locator('table').first().waitFor()
  assert.ok((await dialog.innerText()).includes(seed[1].description.trim()))
  await capture(page, `grouped-${name}`)
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'hidden' })

  const openFilters = async () => {
    await page.getByRole('button', { name: /^ค้นหาและตัวกรอง/ }).click()
    return page.locator('.search-filter-panel')
  }
  for (const [label, startDate, endDate] of [['สัปดาห์', '2026-11-08', '2026-11-14'], ['เดือน', '2026-11-01', '2026-11-30'], ['ปี', '2026-01-01', '2026-12-31'], ['วัน', '2026-11-13', '2026-11-13']]) {
    const panel = await openFilters()
    const request = page.waitForRequest((r) => {
      if (!r.url().includes('/api/work-logs?')) return false
      const q = new URL(r.url()).searchParams
      return label === 'วัน' ? q.get('date') === startDate : q.get('startDate') === startDate && q.get('endDate') === endDate
    })
    await panel.getByRole('radio', { name: `มุมมอง${label}`, exact: true }).click()
    await request
    await panel.getByRole('button', { name: 'แสดงผลลัพธ์' }).click()
    await cards.first().waitFor()
    assert.ok((await summary.innerText()).includes(label === 'วัน' ? '13/11/2026' : `${startDate.slice(8)}/${startDate.slice(5, 7)}/${startDate.slice(0, 4)}`))
  }
  // Reuse the actual calendar; calendar selection keeps the original day query.
  const calendarRequest = page.waitForRequest((r) => new URL(r.url()).pathname === '/api/work-logs' && new URL(r.url()).searchParams.get('date') === '2026-11-12')
  await page.locator('[data-slot="calendar"]').getByRole('gridcell', { name: '12', exact: true }).click()
  await calendarRequest
  await cards.first().waitFor()
  assert.equal(await cards.count(), 1)
  await capture(page, `calendar-selected-${name}`)
  results.push({ case: `day/week/month/year and calendar query contracts ${name}`, pass: true })

  const query = new URLSearchParams({ theme, startDate: '2026-11-12', endDate: '2026-11-13', companyId: company.id, projectId: projects[0].id, role: 'Developer', kind: 'Task' })
  await page.goto(`${origin}/daily-work?${query}`, { waitUntil: 'networkidle' })
  await cards.first().waitFor()
  const dashboardRequest = mocks.requests.filter((r) => r.path === '/api/work-logs').at(-1)
  assert.deepEqual(dashboardRequest.query, Object.fromEntries([...query].filter(([key]) => key !== 'theme')))
  const context = page.getByText(/^ตัวกรองจาก Dashboard:/)
  assert.ok((await context.innerText()).includes(company.name))
  assert.ok((await context.innerText()).includes(projects[0].name))
  assert.ok(!(await context.innerText()).includes(company.id))
  assert.ok((await summary.innerText()).includes('12/11/2026 – 13/11/2026'))
  let panel = await openFilters()
  await panel.getByRole('searchbox').fill('รายการวันก่อนหน้า')
  await panel.getByRole('button', { name: 'แสดงผลลัพธ์' }).click()
  assert.equal(await cards.count(), 1)
  await capture(page, `dashboard-filtered-${name}`)
  for (const [format, marker, excluded] of [['CSV', 'รายการวันก่อนหน้า', seed[1].description], ['Markdown', seed[2].remarks, seed[1].description]]) {
    await page.locator('.data-transfer-trigger').click()
    const download = page.waitForEvent('download')
    await page.getByRole('menuitem', { name: `Export ${format}`, exact: true }).click()
    const file = await download
    const content = await readFile(await file.path(), 'utf8')
    assert.ok(content.includes(marker))
    assert.ok(!content.includes(excluded), 'export selected filtered set only')
    assert.match(file.suggestedFilename(), /^work_logs_2026_11_12_.*\.(csv|md)$/)
  }
  results.push({ case: `named Dashboard context and filtered CSV/Markdown contracts ${name}`, pass: true })
  await page.goto(`${origin}/daily-work?theme=${theme}&startDate=2026-11-12&endDate=2026-11-13&companyId=${uuid(777)}&projectId=${uuid(778)}`, { waitUntil: 'networkidle' })
  await cards.first().waitFor()
  assert.match(await page.getByText(/^ตัวกรองจาก Dashboard:/).innerText(), /Company ที่เลือก · Project ที่เลือก/)

  for (const mode of ['loading', 'empty', 'error']) {
    mocks.mode(mode)
    await page.goto(`${origin}/daily-work?theme=${theme}&date=2026-11-13`, { waitUntil: 'domcontentloaded' })
    if (mode === 'loading') {
      await page.getByText('กำลังโหลด Daily Work…', { exact: true }).waitFor()
      assert.equal(await summary.locator('[data-slot="skeleton"]').count(), 2)
      await capture(page, `${mode}-${name}`)
      mocks.release()
      await cards.first().waitFor()
    } else if (mode === 'empty') {
      await page.getByText('ยังไม่มี Daily Work ในวันที่เลือก', { exact: true }).waitFor()
      await capture(page, `${mode}-${name}`)
    } else {
      await page.getByText('โหลด Daily Work ไม่สำเร็จ', { exact: true }).waitFor()
      assert.ok(!(await summary.innerText()).includes('0.00'))
      await capture(page, `${mode}-${name}`)
      mocks.mode('normal')
      await dismissToast()
      await page.getByRole('button', { name: 'ลองอีกครั้ง', exact: true }).click()
      await cards.first().waitFor()
    }
  }
  await opener.focus(); await page.keyboard.press('Enter')
  await page.getByRole('dialog').getByRole('heading', { name: 'เพิ่มบันทึกงาน', exact: true }).waitFor()
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  assert.equal(await opener.evaluate((node) => node === document.activeElement), true, 'return focus')
  await capture(page, `keyboard-focus-${name}`)
  results.push({ case: `loading/empty/error/retry, fallback names and keyboard focus ${name}`, pass: true })
}
