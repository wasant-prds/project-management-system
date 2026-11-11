export const DEFAULT_WORK_ITEM_SORT_MODE = 'recent-activity' as const

export const WORK_ITEM_SORT_MODES = [
  'recent-activity',
  'due-asc',
  'due-desc',
  'project-title-asc',
  'project-title-desc',
] as const
export type WorkItemSortMode = (typeof WORK_ITEM_SORT_MODES)[number]

export type WorkItemProjectSortKey = {
  publicId: string
  name: string
  recentActivity: number
  earliestDue: number | null
  latestDue: number | null
}

export function isWorkItemSortMode(value: string): value is WorkItemSortMode {
  return WORK_ITEM_SORT_MODES.some((mode) => mode === value)
}

/** Shared by project pagination and the displayed groups, including natural name sorting. */
export function compareWorkItemProjects(
  left: WorkItemProjectSortKey,
  right: WorkItemProjectSortKey,
  mode: WorkItemSortMode,
): number {
  // Fix the locale so the server and a browser with a different language select the same projects.
  const nameOrder = left.name.localeCompare(right.name, 'en', { sensitivity: 'base', numeric: true })
  const tieOrder = left.publicId.localeCompare(right.publicId)
  if (mode === 'project-title-asc') return nameOrder || tieOrder
  if (mode === 'project-title-desc') return -nameOrder || tieOrder
  if (mode === 'due-asc' || mode === 'due-desc') {
    const leftDue = mode === 'due-asc' ? left.earliestDue : left.latestDue
    const rightDue = mode === 'due-asc' ? right.earliestDue : right.latestDue
    if (leftDue === null && rightDue !== null) return 1
    if (leftDue !== null && rightDue === null) return -1
    if (leftDue !== null && rightDue !== null && leftDue !== rightDue) {
      return mode === 'due-asc' ? leftDue - rightDue : rightDue - leftDue
    }
    return nameOrder || tieOrder
  }
  return right.recentActivity - left.recentActivity || nameOrder || tieOrder
}
