import { Badge } from '@/components/ui/badge'
import { STATUS_TREATMENTS, workItemStatusVisual } from '@/components/ui/product-identity'
import { WORK_ITEM_STATUS_LABELS, type WorkItemStatusValue } from '@/lib/work-items'
import { statusClass } from './work-item-presentation'

export function WorkItemStatusBadge({ status }: Readonly<{ status: WorkItemStatusValue }>) {
  const visual = workItemStatusVisual(status)
  const treatment = STATUS_TREATMENTS[visual]
  return (
    <Badge variant="outline" className={statusClass(status)} data-status={visual}>
      <span aria-hidden="true" data-slot="status-glyph" className="status-glyph">{treatment.glyph}</span>
      <span>{WORK_ITEM_STATUS_LABELS[status]}</span>
    </Badge>
  )
}
