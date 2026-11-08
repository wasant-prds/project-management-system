import { calendarDate, bangkokTimestamp, projectSummary } from './project-management'

function decimalText(value: { toString(): string } | null | undefined) {
  return value ? value.toString() : null
}

export function serializeProject(project: {
  publicId: string
  name: string
  description: string | null
  status: string
  priority: string
  startDate: Date
  dueDate: Date
  budget?: { toString(): string } | null
  spent?: { toString(): string } | null
  colorProject: string | null
  createdAt: Date
  updatedAt: Date
  company: { publicId: string; name: string; displayName: string | null } | null
  workItems: Array<{
    status: import('@/lib/database/types').WorkItemStatus
    role: import('@/lib/database/types').WorkItemRole | null
  }>
  timeEntries: Array<{ hours: { toString(): string } }>
}) {
  const summary = projectSummary(project.workItems, project.timeEntries)
  return {
    id: project.publicId,
    name: project.name,
    description: project.description,
    status: project.status,
    priority: project.priority,
    startDate: calendarDate(project.startDate),
    dueDate: calendarDate(project.dueDate),
    budget: decimalText(project.budget),
    spent: decimalText(project.spent),
    colorProject: project.colorProject,
    createdAt: bangkokTimestamp(project.createdAt),
    updatedAt: bangkokTimestamp(project.updatedAt),
    companyId: project.company?.publicId ?? null,
    company: project.company
      ? {
          id: project.company.publicId,
          name: project.company.name,
          displayName: project.company.displayName,
        }
      : null,
    progress: summary.progress,
    summary,
  }
}

export function serializeProjectOption(project: {
  publicId: string
  name: string
  colorProject: string | null
}) {
  return { id: project.publicId, name: project.name, colorProject: project.colorProject }
}
