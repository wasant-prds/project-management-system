import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MOTION_CLASS } from '@/components/ui/motion'
import { AnimatedStatValue } from '@/components/ui/animated-stat-value'
import { kpiMarker } from '@/components/ui/cinematic-motion'
import { canTweenMetric } from '@/components/ui/metric-motion'
import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'

type SummaryStatCardProps = {
  label: string
  value: ReactNode
  valueClassName?: string
  icon?: ReactNode
  hint?: ReactNode
  isLoading?: boolean
  unavailable?: boolean
  emphasis?: 'primary' | 'support'
  interactive?: boolean
}

export function SummaryStatCard({
  label,
  value,
  valueClassName,
  icon,
  hint,
  isLoading = false,
  unavailable = false,
  emphasis = 'support',
  interactive = false,
}: Readonly<SummaryStatCardProps>) {
  const valueKey = typeof value === 'string' || typeof value === 'number' ? `${label}:${value}` : undefined
  let metric: ReactNode
  if (isLoading) {
    metric = <><Skeleton aria-hidden="true" className="h-8 w-16 sm:h-9" /><span className="sr-only">กำลังโหลดค่า</span></>
  } else if (unavailable) {
    metric = <span aria-label="ไม่สามารถอ่านค่าได้">—</span>
  } else if (canTweenMetric(value)) {
    metric = <AnimatedStatValue value={value} />
  } else {
    metric = <span key={valueKey} className={valueKey ? MOTION_CLASS.valueChange : undefined}>{value}</span>
  }

  return (
    <Card
      data-cinematic={kpiMarker(emphasis)}
      data-spatial={interactive ? 'pointer' : undefined}
      className={cn('card-shadow relative h-full gap-3 py-4 sm:py-5', interactive && 'cinematic-pointer motion-card')}
    >
      <CardHeader className="grid-rows-1 flex min-h-10 flex-row items-center justify-between gap-2 space-y-0 px-3 pb-0 sm:px-4">
        <CardTitle className="type-kpi-support content-wrap min-w-0 leading-5 text-muted-foreground">{label}</CardTitle>
        {icon && <span className="surface-inset flex size-8 shrink-0 items-center justify-center rounded-lg">{icon}</span>}
      </CardHeader>
      <CardContent className="px-3 sm:px-4">
        <div className={cn('type-kpi-hero min-w-0 break-all tabular-nums', valueClassName)}>
          {metric}
        </div>
        {hint && <div className="mt-2 text-xs leading-relaxed text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  )
}
