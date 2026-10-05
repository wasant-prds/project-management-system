import { WORK_ITEM_ROLE_LABELS, type WorkItemRoleValue } from '@/lib/work-items'

export function workItemRoleLabel(role: string | null): string {
  if (!role) return 'ไม่ระบุ role'
  if (Object.hasOwn(WORK_ITEM_ROLE_LABELS, role)) return WORK_ITEM_ROLE_LABELS[role as WorkItemRoleValue]
  return role
}
