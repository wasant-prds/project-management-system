import type { getAnalysisSummary } from '@/lib/analysis'

export type AnalysisReport = Awaited<ReturnType<typeof getAnalysisSummary>>

type CsvField = string | number | boolean | null | undefined

function csvField(value: CsvField) {
  let text = ''
  if (typeof value === 'string') text = value
  else if (typeof value === 'number' || typeof value === 'boolean') text = value.toString()
  if (/^[\u0000-\u0020\uFEFF]*[=+\-@]/.test(text)) text = `'${text}`
  return `"${text.replaceAll('"', '""')}"`
}

function csvRow(values: CsvField[]) {
  return values.map(csvField).join(',')
}

export function generateAnalysisCsv(report: AnalysisReport) {
  const rows: CsvField[][] = [[
    'recordType', 'date', 'id', 'title', 'company', 'project', 'kind', 'role', 'status', 'priority', 'hours', 'details',
  ]]
  const { summary, breakdowns, workItems, timeEntries, loggedHoursByPeriod, meta } = report
  rows.push(
    ['period', meta.period.startDate, '', 'Report period', '', '', '', '', '', '', '', meta.period.endDate],
    ['metric', '', '', 'Total Work Items', '', '', '', '', '', '', summary.total, ''],
    ['metric', '', '', 'Open Work Items', '', '', '', '', '', '', summary.open, ''],
    ['metric', '', '', 'Completed Work Items', '', '', '', '', '', '', summary.completed, ''],
    ['metric', '', '', 'Overdue Work Items', '', '', '', '', '', '', summary.overdue, ''],
    ['metric', '', '', 'Completion rate (%)', '', '', '', '', '', '', summary.completionRate, ''],
    ['metric', '', '', 'Logged hours', '', '', '', '', '', '', summary.loggedHours, ''],
  )
  for (const [category, values] of Object.entries(breakdowns)) {
    for (const row of values) rows.push(['breakdown', '', '', row.value, '', '', category, '', '', '', row.count, ''])
  }
  for (const point of loggedHoursByPeriod) {
    rows.push(['hours-period', point.startDate, '', '', '', '', '', '', '', '', point.hours, point.endDate])
  }
  for (const item of workItems) {
    rows.push([
      'work-item', item.workDate ?? item.dueDate ?? item.createdAt.slice(0, 10), item.id, item.title,
      item.project.company?.displayName ?? item.project.company?.name ?? '', item.project.name,
      item.kind, item.role ?? '', item.status, item.priority, '', '',
    ])
  }
  for (const entry of timeEntries) {
    rows.push([
      'daily-work', entry.date, entry.id, entry.workItem?.title ?? '',
      entry.workItem?.project.company?.displayName ?? entry.workItem?.project.company?.name ?? '',
      entry.workItem?.project.name ?? '', '', '', '', '', entry.hours,
      [entry.description, entry.remarks].filter(Boolean).join(' · '),
    ])
  }
  return `\uFEFF${rows.map(csvRow).join('\r\n')}`
}
