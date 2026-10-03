import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { MOTION_CLASS } from '@/components/ui/motion'
import { cn } from '@/lib/utils'

type SummaryStatCardProps = {
  label: string
  value: ReactNode
  valueClassName?: string
  icon?: ReactNode
  hint?: ReactNode
}

export function SummaryStatCard({
  label,
  value,
  valueClassName,
  icon,
  hint,
}: Readonly<SummaryStatCardProps>) {
  const valueKey = typeof value === 'string' || typeof value === 'number' ? `${label}:${value}` : undefined

  return (
    <Card className="card-shadow relative h-full gap-3 py-4 sm:py-5">
      <CardHeader className="grid-rows-1 flex flex-row items-center justify-between space-y-0 px-3 pb-0 sm:px-4">
        <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">{label}</CardTitle>
        {icon && <span className="surface-inset flex size-8 shrink-0 items-center justify-center rounded-lg">{icon}</span>}
      </CardHeader>
      <CardContent className="px-3 sm:px-4">
        <div className={cn('min-w-0 break-all text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl', valueClassName)}>
          <span key={valueKey} className={valueKey ? MOTION_CLASS.valueChange : undefined}>{value}</span>
        </div>
        {hint && <div className="mt-2 text-xs leading-relaxed text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  )
}
