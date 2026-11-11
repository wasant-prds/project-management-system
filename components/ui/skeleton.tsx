import { cn } from '@/lib/utils'

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      className={cn('motion-skeleton surface-inset bg-muted rounded-lg', className)}
      {...props}
    />
  )
}

export { Skeleton }
