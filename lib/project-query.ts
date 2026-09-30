import { calendarDate, bangkokTimestamp, projectSummary } from './project-management'

export const projectListInclude = {
  company: { select: { id: true, name: true, displayName: true } },
  workItems: { select: { status: true, role: true } },
  timeEntries: { select: { hours: true } },
} as const

export function serializeProject(project: {
  id: string; name: string; description: string | null; status: string; priority: string;
  startDate: Date; dueDate: Date; createdAt: Date; updatedAt: Date; companyId: string | null;
  company: { id: string; name: string; displayName: string | null } | null;
  workItems: Array<{ status: import('@prisma/client').WorkItemStatus; role: import('@prisma/client').WorkItemRole | null }>;
  timeEntries: Array<{ hours: { toString(): string } }>;
}) {
  const { workItems, timeEntries, ...fields } = project
  const summary = projectSummary(workItems, timeEntries)
  return {
    ...fields,
    startDate: calendarDate(project.startDate),
    dueDate: calendarDate(project.dueDate),
    createdAt: bangkokTimestamp(project.createdAt),
    updatedAt: bangkokTimestamp(project.updatedAt),
    progress: summary.progress,
    summary,
  }
}
