import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('surface-inset bg-muted motion-safe:animate-pulse rounded-lg', className)}
      {...props}
    />
  )
}

export { Skeleton }
