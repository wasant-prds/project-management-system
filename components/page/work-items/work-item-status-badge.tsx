import { Badge } from '@/components/ui/badge'
import { STATUS_TREATMENTS, workItemStatusVisual } from '@/components/ui/product-identity'
import { WORK_ITEM_STATUS_LABELS, type WorkItemStatusValue } from '@/lib/work-items'
import { statusClass } from './work-item-presentation'

function knownStatus(status: string): WorkItemStatusValue | null {
  if (Object.hasOwn(WORK_ITEM_STATUS_LABELS, status)) return status as WorkItemStatusValue
  return null
}

export function WorkItemStatusBadge({ status }: Readonly<{ status: string }>) {
  const known = knownStatus(status)
  const visual = workItemStatusVisual(status)
  const treatment = STATUS_TREATMENTS[visual]
  const className = known ? statusClass(known) : 'bg-muted text-muted-foreground border-border'
  return (
    <Badge variant="outline" className={className} data-status={visual}>
      <span aria-hidden="true" data-slot="status-glyph" className="status-glyph">{treatment.glyph}</span>
      <span>{known ? WORK_ITEM_STATUS_LABELS[known] : status}</span>
    </Badge>
  )
}
