import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdir, writeFile } from 'node:fs/promises'
import { previewData, previewResponse } from '../tests/frontend-ui/preview-fixtures.mjs'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PMS_PLAYWRIGHT_MODULE || 'playwright')
const origin = process.env.PMS_PREVIEW_ORIGIN || 'http://127.0.0.1:3791'
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) throw new Error('Use the isolated synthetic preview')
const before = process.argv.includes('--before')
const directory = `artifacts/issue-49/${before ? 'before' : 'after'}`
await mkdir(directory, { recursive: true })
const browser = await chromium.launch({ headless: true, channel: process.env.PMS_BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined) })
const results = [], errors = []
const uuid = (n) => `49000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const data = previewData()
const company = { ...data.companies[0], id: uuid(2), displayName: 'บริษัทตัวอย่างสำหรับตรวจชื่อยาวและการจัดพอร์ตโครงการ '.repeat(2) }
const project = { ...data.projects[0], id: uuid(1), companyId: company.id, company, name: 'Project ชื่อยาวสำหรับตรวจข้อมูลครบและการตัดบรรทัด '.repeat(3), summary: { ...data.projects[0].summary, total: 123456, completed: 120000, open: 3456, hours: '12345678901234567890.125' } }
const workItems = [{ ...data.workItems[0], id: uuid(3), title: 'ตรวจสอบข้อมูล Project และชื่อที่อ่านเข้าใจได้' }]
const detail = { ...project, workItems, timeEntries: [{ id: uuid(4), workItemId: workItems[0].id, date: '2026-10-03', hours: '1.005' }, { id: uuid(5), workItemId: uuid(6), date: '2026-10-04', hours: '2' }, { id: uuid(7), workItemId: null, date: '2026-10-05', hours: '0.5' }] }
const configPayload = previewResponse(new URL(`${origin}/api/projects/${project.id}/issue-sync`), 'GET').value
const config = configPayload.configs[0]
const counts = { created: 1, updated: 0, skipped: 0, failed: 1, pending: 1 }
const run = { id: uuid(9), status: 'partial', startedAt: '2026-11-13T09:00:00+07:00', finishedAt: '2026-11-13T09:00:05+07:00', configSnapshot: { sourceProject: config.sourceProject, assignees: config.assignees }, counts, runError: null, results: [
  { issueId: '73', outcome: 'pending', title: 'ตรวจสอบข้อมูล Project จากต้นทาง', sourceUrl: 'https://gitlab.example.test/group/project/-/issues/73', reason: 'confirmation_required', warnings: [], candidates: [{ id: workItems[0].id, title: workItems[0].title, similarity: 0.8, description: null }] },
  { issueId: '74', outcome: 'failed', title: 'Issue ผิดพลาดเฉพาะรายการ', sourceUrl: null, reason: 'VALIDATION_ERROR', warnings: ['ข้อมูลต้นทางไม่ครบ'] },
] }
const syncBody = [{ type: 'progress', progress: { phase: 'syncing', processed: 3, counts } }, { type: 'result', run }].map((event) => JSON.stringify(event)).join('\n') + '\n'
async function synthetic(page) {
  const requests = []
  let syncRelease, deleteRelease, saveRelease
  await page.route(`${origin}/api/**`, async (route) => {
    const request = route.request(), url = new URL(request.url()), method = request.method()
    const path = url.pathname
    requests.push({ path, method, body: request.postDataJSON() })
    const json = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) })
    if (path.endsWith('/sync')) {
      await new Promise((resolve) => { syncRelease = resolve })
      return route.fulfill({ contentType: 'application/x-ndjson', body: syncBody })
    }
    if (method === 'DELETE') {
      await new Promise((resolve) => { deleteRelease = resolve })
      return json({ error: { code: 'HISTORY_CONFLICT', message: 'Project มีประวัติ ไม่สามารถลบได้' } }, 409)
    }
    if (path.endsWith('/confirm')) return json({ error: { code: 'REVIEW_STALE', message: 'จำลองข้อผิดพลาดการยืนยัน' } }, 409)
    if (method === 'POST' || method === 'PATCH') {
      if (path.includes('/issue-sync')) return json({ config })
      await new Promise((resolve) => { saveRelease = resolve })
      return method === 'POST' ? json({ project: detail }, 201) : json({ error: { code: 'VALIDATION_ERROR', message: 'กรุณาตรวจช่วงวันที่ Project' } }, 400)
    }
    if (path === '/api/company') return json({ companies: [company], page: { nextCursor: null } })
    if (path === '/api/projects') return json({ projects: [project, { ...data.projects[1], id: uuid(10), company, companyId: company.id }], page: { nextCursor: null } })
    if (path.endsWith('/issue-sync')) return json(configPayload)
    if (path.endsWith('/runs')) return json({ runs: [run], nextBefore: null })
    if (path === `/api/projects/${project.id}`) return json({ project: detail })
    return route.continue()
  })
  return { requests, finishSync: () => syncRelease(), finishDelete: () => deleteRelease(), finishSave: () => saveRelease() }
}
async function capture(page, name) {
  // Capture the state under review, even when a long project header is above it.
  if (name.endsWith('-history')) await page.getByRole('region', { name: 'ประวัติ Issue Sync', exact: true }).scrollIntoViewIfNeeded()
  if (name.endsWith('-config')) await page.locator('#integrations form').scrollIntoViewIfNeeded()
  if (name.endsWith('-pending')) await page.getByRole('region', { name: 'ความคืบหน้า Issue Sync', exact: true }).scrollIntoViewIfNeeded()
  if (name.endsWith('-delete-rejected')) await page.getByRole('alert').filter({ hasText: 'HISTORY_CONFLICT' }).scrollIntoViewIfNeeded()
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'no document overflow')
  assert.ok(await page.locator('main').last().evaluate((node) => node.scrollWidth <= node.clientWidth + 1), 'no main overflow')
  await page.screenshot({ path: `${directory}/${name}.png` })
  results.push({ case: name, pass: true })
}
async function dialogBounds(dialog) {
  assert.ok(await dialog.evaluate((node) => {
    const box = node.getBoundingClientRect()
    return box.left >= -1 && box.right <= innerWidth + 1 && box.top >= -1 && box.bottom <= innerHeight + 1 && node.scrollWidth <= node.clientWidth + 1
  }), 'dialog fits viewport')
}
async function forms(page, mocks, name) {
  const create = page.getByRole('button', { name: 'สร้าง Project', exact: true })
  await create.focus(); await page.keyboard.press('Enter')
  let dialog = page.getByRole('dialog')
  await dialog.waitFor(); await dialogBounds(dialog)
  assert.equal(await dialog.locator('#project-name').inputValue(), '')
  assert.ok(await dialog.getByRole('button', { name: 'สร้าง Project', exact: true }).isDisabled(), 'Company required')
  await capture(page, `${name}-create`)
  await dialog.locator('#project-name').fill('สร้าง Project ผ่าน toolbar')
  await dialog.locator('#project-company').click()
  await page.getByRole('option').first().click()
  for (const id of ['project-start', 'project-due']) {
    await dialog.locator(`#${id}`).click()
    await page.getByRole('button', { name: 'วันนี้', exact: true }).click()
  }
  await dialog.getByRole('button', { name: 'สร้าง Project', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('form[aria-busy="true"]'))
  mocks.finishSave()
  await dialog.waitFor({ state: 'hidden' })
  assert.equal(mocks.requests.find((request) => request.method === 'POST').body.companyId, company.id)
  await create.click()
  await dialog.waitFor()
  await page.keyboard.press('Escape')
  await create.waitFor()
  await page.waitForFunction(() => document.activeElement?.textContent.includes('สร้าง Project'))
  const edit = page.getByRole('button', { name: 'แก้ไข', exact: true }).first()
  await edit.focus(); await page.keyboard.press('Enter')
  dialog = page.getByRole('dialog')
  await dialog.waitFor(); await dialogBounds(dialog)
  assert.equal(await dialog.locator('#project-name').inputValue(), project.name)
  for (const [id, value] of [['project-start', '01/10/2026'], ['project-due', '31/10/2026'], ['project-status', project.status], ['project-priority', project.priority]]) assert.ok((await dialog.locator(`#${id}`).innerText()).includes(value))
  await dialog.locator('#project-name').fill('แก้ไขชื่อ Project')
  await dialog.getByRole('button', { name: 'บันทึก', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('form[aria-busy="true"]'))
  assert.ok(await dialog.getByRole('button', { name: 'ยกเลิก', exact: true }).isDisabled())
  await page.keyboard.press('Escape')
  assert.ok(await dialog.isVisible(), 'pending save cannot dismiss')
  mocks.finishSave()
  await dialog.getByRole('alert').waitFor()
  assert.ok((await dialog.innerText()).includes('กรุณาตรวจช่วงวันที่'))
  const saved = mocks.requests.find((request) => request.method === 'PATCH')
  assert.equal(saved.path, `/api/projects/${project.id}`)
  assert.deepEqual(saved.body, { name: 'แก้ไขชื่อ Project', companyId: company.id, startDate: project.startDate, dueDate: project.dueDate, status: project.status, priority: project.priority })
  await capture(page, `${name}-validation`)
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => document.activeElement?.textContent === 'แก้ไข')
}
async function interactions(page, mocks, name) {
  const tab = (label) => page.getByRole('tab', { name: label, exact: true })
  // Browser hash navigation must open the mounted integration panel.
  await page.evaluate(() => { location.hash = 'integrations' })
  await page.waitForFunction(() => document.querySelector('[role="tab"][data-state="active"]')?.textContent === 'Integrations')
  assert.ok(await page.locator('#integrations').isVisible())
  await page.getByRole('button', { name: 'Sync Issues', exact: true }).first().click()
  await page.getByRole('alertdialog').waitFor()
  await capture(page, `${name}-first-approval`)
  await page.getByRole('button', { name: 'ยืนยัน Sync', exact: true }).click()
  await page.getByRole('button', { name: 'กำลังดำเนินการ…', exact: true }).waitFor()
  await capture(page, `${name}-pending`)
  await tab('ภาพรวม').click()
  await tab('Integrations').click()
  assert.ok(await page.getByRole('button', { name: 'กำลังดำเนินการ…', exact: true }).isDisabled(), 'sync remains pending across tabs')
  assert.equal(mocks.requests.filter((request) => request.path.endsWith('/sync')).length, 1)
  mocks.finishSync()
  const review = page.getByRole('alertdialog')
  await review.waitFor()
  await review.getByRole('radio').first().check()
  await dialogBounds(review)
  await capture(page, `${name}-review`)
  // Modal traps focus; an external deep link can still change the underlying tab.
  await page.evaluate(() => { document.querySelector('[role="tab"]').click() })
  assert.ok(await review.isVisible(), 'review portal survives leaving Integrations')
  assert.ok(await review.getByRole('radio').first().isChecked())
  await page.evaluate(() => { location.hash = 'integrations' })
  assert.ok(await review.getByRole('radio').first().isChecked(), 'review choice preserved')
  await review.getByRole('button', { name: 'ยืนยันทั้งหมด', exact: true }).click()
  await review.getByRole('alert').waitFor()
  assert.ok(await review.getByRole('radio').first().isChecked(), 'failed confirmation preserves choices')
  await capture(page, `${name}-review-error`)
  await review.getByRole('button', { name: 'ไว้ยืนยันภายหลัง' }).click()
  await tab('Work Items').focus(); await page.keyboard.press('ArrowRight')
  await page.waitForFunction(() => document.querySelector('[role="tab"][data-state="active"]')?.textContent === 'Daily Work')
  assert.ok((await page.getByRole('tabpanel').innerText()).includes(workItems[0].title))
  assert.ok((await page.getByRole('tabpanel').innerText()).includes('เปิด Work Item ที่บันทึกเวลา'))
  assert.ok((await page.getByRole('tabpanel').innerText()).includes('บันทึกเวลาเดิม'))
  for (const link of await page.getByRole('tabpanel').locator('a[href*="workItemId="]').all()) assert.match(await link.getAttribute('href'), /workItemId=[a-f0-9-]{36}$/)
  await tab('Integrations').click()
  await page.getByRole('button', { name: 'ประวัติ sync', exact: true }).first().click()
  const history = page.getByRole('region', { name: 'ประวัติ Issue Sync', exact: true })
  await history.locator('summary').click()
  assert.ok((await history.innerText()).includes('ข้อมูลต้นทางไม่ครบ'))
  await tab('ภาพรวม').click(); await tab('Integrations').click()
  assert.ok(await history.locator('details').getAttribute('open') !== null, 'history disclosure state preserved')
  await capture(page, `${name}-history`)
  const advanced = page.locator('summary').filter({ hasText: 'การตั้งค่าและรายละเอียดขั้นสูง' }).first()
  await advanced.focus(); await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'แก้ไข config', exact: true }).first().click()
  const configForm = page.locator('#integrations form')
  await configForm.getByRole('textbox', { name: 'Assignee usernames ที่อนุญาต *' }).fill('alice, charlie')
  await tab('ภาพรวม').click(); await tab('Integrations').click()
  assert.equal(await configForm.getByRole('textbox', { name: 'Assignee usernames ที่อนุญาต *' }).inputValue(), 'alice, charlie')
  await capture(page, `${name}-config`)
  await configForm.getByRole('button', { name: 'บันทึก config', exact: true }).click()
  await page.getByText('บันทึก config แล้ว', { exact: true }).waitFor()
  assert.deepEqual(mocks.requests.find((request) => request.method === 'PATCH' && request.path.includes('issue-sync')).body.assignees, ['alice', 'charlie'])
  await page.getByRole('button', { name: 'หยุด sync', exact: true }).first().click()
  await page.getByRole('button', { name: 'จัดการ Project', exact: true }).click()
  await page.getByRole('menuitem', { name: 'ลบ Project', exact: true }).click()
  const deletion = page.getByRole('alertdialog')
  await dialogBounds(deletion)
  await deletion.getByRole('button', { name: 'ยืนยันลบ Project', exact: true }).click()
  await page.getByRole('button', { name: 'กำลังลบ...' }).waitFor()
  assert.ok(await deletion.getByRole('button', { name: 'ยกเลิก', exact: true }).isDisabled())
  await page.keyboard.press('Escape')
  assert.ok(await deletion.isVisible())
  mocks.finishDelete()
  await page.getByRole('alert').filter({ hasText: 'HISTORY_CONFLICT' }).waitFor()
  assert.equal(new URL(page.url()).pathname, `/projects/${project.id}`)
  await capture(page, `${name}-delete-rejected`)
  await page.goto(`${origin}/projects/${project.id}?theme=${new URL(page.url()).searchParams.get('theme')}#integrations`, { waitUntil: 'networkidle' })
  assert.equal(await tab('Integrations').getAttribute('aria-selected'), 'true', 'initial deep link opens Integrations')
  assert.ok(await page.locator('#integrations').isVisible())
  await capture(page, `${name}-deep-link`)
}
async function states(page, theme, width) {
  await page.goto(`${origin}/projects?theme=${theme}&qa=slow`, { waitUntil: 'domcontentloaded' })
  await page.getByRole('status').filter({ hasText: 'กำลังโหลด Projects' }).waitFor()
  await capture(page, `loading-${theme}-${width}`)
  await page.getByRole('button', { name: 'สร้าง Project', exact: true }).waitFor()
  await page.goto(`${origin}/projects?theme=${theme}&qa=error`, { waitUntil: 'networkidle' })
  await page.getByRole('alert').waitFor()
  assert.ok(await page.getByRole('button', { name: 'ลองอีกครั้ง', exact: true }).isVisible())
  await capture(page, `load-error-${theme}-${width}`)
  await page.goto(`${origin}/projects?theme=${theme}&qa=empty`, { waitUntil: 'networkidle' })
  await page.getByText('ไม่พบ Project', { exact: true }).waitFor()
  await capture(page, `empty-${theme}-${width}`)
}
try {
  for (const theme of ['light', 'dark', 'special-dark']) {
    for (const viewport of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }]) {
      const context = await browser.newContext({ viewport, reducedMotion: 'reduce', timezoneId: 'America/Los_Angeles', hasTouch: viewport.width === 390 })
      const page = await context.newPage()
      page.on('pageerror', (error) => errors.push(error.message))
      if (!before) {
        await states(page, theme, viewport.width)
        // Comparable default fixtures, then separate long-name/large-number stress fixtures.
        for (const route of ['/projects', '/projects/project-0']) {
          await page.goto(`${origin}${route}?theme=${theme}`, { waitUntil: 'networkidle' })
          const name = `default-${route === '/projects' ? 'portfolio' : 'workspace'}-${theme}-${viewport.width}`
          await capture(page, name)
          if (route !== '/projects') for (const label of ['Work Items', 'Daily Work', 'Integrations']) {
            await page.getByRole('tab', { name: label, exact: true }).click()
            await page.getByRole('tabpanel').scrollIntoViewIfNeeded()
            await capture(page, `${name}-${label.replaceAll(' ', '-')}`)
          }
        }
      }
      const mocks = before ? null : await synthetic(page)
      for (const route of ['/projects', before ? '/projects/project-0' : `/projects/${project.id}`]) {
        await page.goto(`${origin}${route}?theme=${theme}`, { waitUntil: 'networkidle' })
        const name = `${route === '/projects' ? 'portfolio' : 'workspace'}-${theme}-${viewport.width}`
        await capture(page, name)
        if (route !== '/projects') {
          if (before) {
            await page.locator('#integrations').scrollIntoViewIfNeeded()
            await capture(page, `${name}-integrations`)
            await page.getByText('Daily Work', { exact: true }).last().scrollIntoViewIfNeeded()
            await capture(page, `${name}-daily-work`)
            await page.getByText('Work Items', { exact: true }).last().scrollIntoViewIfNeeded()
            await capture(page, `${name}-work-items`)
          } else {
            for (const tab of ['Work Items', 'Daily Work', 'Integrations', 'ภาพรวม']) {
              await page.getByRole('tab', { name: tab, exact: true }).click()
              await page.getByRole('tabpanel').scrollIntoViewIfNeeded()
              await capture(page, `${name}-${tab.replaceAll(' ', '-')}`)
            }
            const list = page.getByRole('tablist')
            if (viewport.width === 390) assert.ok(await list.evaluate((node) => { node.scrollLeft = node.scrollWidth; return node.scrollLeft > 0 }), 'tabs scroll locally')
            await interactions(page, mocks, name)
          }
        } else if (!before) {
          if (viewport.width >= 768) {
            for (const selector of ['[data-slot="card-header"] > div:last-child', '[data-slot="card-content"] > div:first-child', 'dl', '[data-slot="card-content"] > div:last-child']) {
              const tops = await page.locator('main [data-slot="card"]').evaluateAll((cards, selector) => cards.map((card) => card.querySelector(selector).getBoundingClientRect().top), selector)
              assert.ok(Math.abs(tops[0] - tops[1]) <= 1, 'portfolio progress, counts and due/actions align despite long names and numbers')
            }
          }
          await forms(page, mocks, name)
        }
      }
      await context.close()
    }
  }
  assert.deepEqual(errors, [])
} finally {
  await writeFile(`${directory}/results.json`, JSON.stringify({ results, errors }, null, 2))
  await browser.close()
}
console.log(`${results.length} project workspace browser checks PASS`)
