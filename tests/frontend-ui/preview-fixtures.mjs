/** Synthetic visual QA data only. Never imported by production routes. */
export const settings = { profile: { name: 'เจ้าของระบบ', email: 'owner@example.test', phone: null, avatar: null }, preferences: { theme: 'light', locale: 'th', timezone: 'Asia/Bangkok' } }
export const companies = [{ id: 'company-preview', code: 'dhas', name: 'Example Company Ltd.', displayName: 'Example Company', location: 'Bangkok', address: null, phone: null, description: 'ข้อมูลจำลองสำหรับตรวจ UI เท่านั้น', summary: { projects: 3, workItems: 6, hours: '12.5' } }]
export const projects = ['ปรับปรุงระบบจัดการงาน', 'Customer portal', 'Infrastructure rollout'].map((name, index) => ({ id: `project-${index}`, name, description: 'วางแผน ติดตามงาน และบันทึกชั่วโมงใน Project เดียวกัน', companyId: companies[0].id, company: companies[0], status: ['In Progress', 'Planning', 'Review'][index], priority: ['High', 'Medium', 'Low'][index], startDate: '2026-10-01', dueDate: '2026-10-31', colorProject: null, summary: { total: 2, completed: 1, open: 1, progress: 50, hours: '4.5', statusCounts: { completed: 1, todo: 1 }, roles: { Developer: 1, SA: 1 } } }))
export const workItems = ['ตรวจสอบ API contract และข้อมูลต้นทาง', 'ออกแบบ shared components', 'เตรียมเอกสาร deployment', 'ตรวจ regression ทุกเมนู', 'ปรับ layout สำหรับ Mobile', 'ทบทวน acceptance criteria'].map((title, index) => ({ id: `work-${index}`, title, description: 'รายละเอียดงานสำหรับ visual QA\n\n- ตรวจข้อมูล\n- ตรวจ responsive layout', kind: ['Task', 'Issue', 'Incident'][index % 3], priority: index === 0 ? 'urgent' : 'medium', role: index % 2 ? 'SA' : 'Developer', status: ['todo', 'in-progress', 'completed', 'sa-testing', 'backlog', 'blocked'][index], types: ['task'], workDate: '2026-10-03', dueDate: index === 0 ? '2026-10-01' : '2026-10-20', submittedAt: null, createdAt: '2026-10-03T09:00:00+07:00', updatedAt: '2026-10-03T12:00:00+07:00', assignee: { id: 'owner-preview', name: settings.profile.name, avatar: null }, project: projects[index % 3], timeEntries: [] }))
export const workLogs = workItems.slice(0, 3).map((workItem, index) => ({ id: `entry-${index}`, date: '2026-10-03', hours: ['4.5', '3', '5'][index], description: 'ตรวจ implementation และทดสอบ UI', remarks: 'ตรวจครบตาม checklist', status: 'In Progress', user: { id: 'owner-preview', ...settings.profile }, project: workItem.project, workItem }))
export const meta = { period: { startDate: '2026-10-01', endDate: '2026-10-31' }, timezone: 'Asia/Bangkok', filters: { companyId: null, projectId: null, role: null, kind: null }, metricVersion: 'shared-work-v1', metricDefinitions: { completionRate: 'completed ÷ (total − cancelled)', loggedHours: 'SUM(TimeEntry.hours)' }, loggedHoursGrouping: 'day' }
export const summary = { total: 6, open: 5, completed: 1, cancelled: 0, overdue: 1, completionRate: 100 / 6, loggedHours: '12.5', recentWorkItems: workItems.slice(0, 3), urgentWorkItems: workItems.slice(0, 1), overdueWorkItems: workItems.slice(0, 1), recentProjects: projects.map((project) => ({ ...project, progress: project.summary.progress })), loggedHoursByDate: [{ date: '2026-10-01', hours: '4.5' }, { date: '2026-10-02', hours: '3' }, { date: '2026-10-03', hours: '5' }] }
export const dashboard = { meta, summary, filterOptions: { companies, projects } }
export const analysis = { ...dashboard, breakdowns: { status: ['todo', 'in-progress', 'completed', 'sa-testing', 'backlog', 'blocked'].map((value) => ({ value, count: 1 })), kind: ['Task', 'Issue', 'Incident'].map((value) => ({ value, count: 2 })), priority: [{ value: 'medium', count: 5 }, { value: 'urgent', count: 1 }] }, workItems, timeEntries: workLogs, loggedHoursByPeriod: summary.loggedHoursByDate.map((row) => ({ startDate: row.date, endDate: row.date, hours: row.hours })) }

export function previewData(mode) {
  const data = structuredClone({ settings, companies, projects, workItems, workLogs, dashboard, analysis })
  if (mode === 'edge') {
    // Unbroken identifiers and exact Decimals expose clipping that ordinary Thai prose hides.
    const visited = new WeakSet()
    const expand = (value) => {
      if (!value || typeof value !== 'object' || visited.has(value)) return
      visited.add(value)
      for (const [key, child] of Object.entries(value)) {
        if (['name', 'displayName', 'title', 'description', 'remarks', 'phone', 'address'].includes(key) && typeof child === 'string') value[key] = `${child} ${'LongIdentifier'.repeat(12)}`
        else if (['hours', 'loggedHours'].includes(key) && typeof child === 'string') value[key] = '12345678901234567890123456789012345.123456789012345678901234567890'
        else expand(child)
      }
    }
    expand(data)
  }
  if (mode === 'empty') {
    data.companies = []; data.projects = []; data.workItems = []; data.workLogs = []
    for (const report of [data.dashboard, data.analysis]) {
      report.filterOptions = { companies: [], projects: [] }
      Object.assign(report.summary, { total: 0, open: 0, completed: 0, cancelled: 0, overdue: 0, completionRate: 0, loggedHours: '0', recentWorkItems: [], urgentWorkItems: [], overdueWorkItems: [], recentProjects: [], loggedHoursByDate: [] })
    }
    Object.assign(data.analysis, { workItems: [], timeEntries: [], loggedHoursByPeriod: [], breakdowns: { status: [], kind: [], priority: [] } })
  }
  return data
}

export function previewResponse(url, method = 'GET', mode) {
  const path = url.pathname
  if (method !== 'GET') return { status: 405, value: { error: { code: 'PREVIEW_READ_ONLY', message: 'Preview นี้ใช้ข้อมูลจำลองและไม่บันทึกข้อมูล' } } }
  const { settings, companies, projects, workItems, workLogs, dashboard, analysis } = previewData(mode)
  const summary = dashboard.summary
  let value
  if (path === '/api/settings/me') value = settings
  else if (path === '/api/company') value = { companies, page: { nextCursor: null } }
  else if (path === '/api/projects') value = { projects, page: { nextCursor: null } }
  else if (path.startsWith('/api/projects/')) {
    const project = projects.find((item) => item.id === path.split('/').at(-1))
    if (!project) return { status: 404, value: { error: { code: 'NOT_FOUND', message: 'ไม่พบ Project' } } }
    value = { project: { ...project, workItems: workItems.filter((item) => item.project.id === project?.id), timeEntries: workLogs.filter((item) => item.project.id === project?.id) } }
  } else if (path === '/api/work-items') value = { workItems, summary: { ...summary, kinds: { Task: mode === 'empty' ? 0 : 2, Issue: mode === 'empty' ? 0 : 2, Incident: mode === 'empty' ? 0 : 2 } }, years: ['2026'], page: { nextCursor: null } }
  else if (path.startsWith('/api/work-items/')) value = { workItem: workItems.find((item) => item.id === path.split('/').at(-1)) }
  else if (path === '/api/work-logs') value = { workLogs }
  else if (path === '/api/work-logs/summary') value = { summary: { hours: summary.loggedHours, total: workLogs.length } }
  else if (path === '/api/analysis/summary') value = analysis
  else if (path === '/api/integrations/gitlab/status') value = { configured: false, instanceUrl: null }
  else if (path === '/api/integrations/gitlab/projects') value = { mappings: [] }
  else return { status: 404, value: { error: { code: 'NOT_FOUND', message: 'ไม่มี fixture สำหรับ route นี้' } } }
  return { status: 200, value }
}
