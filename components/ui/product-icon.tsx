import { Plus, type LucideIcon } from 'lucide-react'
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

export function DisclosureGlyph() {
  return (
    <span data-slot="disclosure-glyph" aria-hidden="true" className="surface-inset flex size-8 items-center justify-center rounded-lg text-link">
      <ProductIcon icon={Plus} category="action" />
    </span>
  )
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
