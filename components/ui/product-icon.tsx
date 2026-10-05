import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  iconMetrics,
  iconMotion,
  iconSizeClass,
  type IconCategory,
  type IconIntent,
} from '@/components/ui/product-identity'

type ProductIconProps = {
  icon: LucideIcon
  category: IconCategory
  intent?: IconIntent
  size?: number
  className?: string
}

export function ProductIcon({ icon: Icon, category, intent = 'idle', size, className }: Readonly<ProductIconProps>) {
  const metrics = iconMetrics(category)
  const motion = iconMotion(category, intent)
  return (
    <Icon
      aria-hidden="true"
      strokeWidth={metrics.stroke}
      data-icon-category={category}
      data-icon-motion={motion}
      className={cn(iconSizeClass(size ?? metrics.size), className)}
    />
  )
}
