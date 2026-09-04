import type { ReactNode } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  return (
    <Card className="card-shadow gap-0.5 py-2.5 sm:gap-1 sm:py-3">
      <CardHeader className="grid-rows-1 flex flex-row items-center justify-between space-y-0 px-3 pb-0 sm:px-4">
        <CardTitle className="text-xs font-medium text-muted-foreground sm:text-sm">{label}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent className="px-3 sm:px-4">
        <div className={cn('text-xl font-bold tabular-nums sm:text-2xl', valueClassName)}>{value}</div>
        {hint}
      </CardContent>
    </Card>
  )
}
