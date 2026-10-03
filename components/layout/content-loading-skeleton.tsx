import { Skeleton } from '@/components/ui/skeleton'

type LoadingLayout = 'rows' | 'cards' | 'report' | 'profile'
const placeholders = ['first', 'second', 'third', 'fourth']

/** Decorative placeholders; the containing page announces loading once. */
export function ContentLoadingSkeleton({ layout = 'rows' }: Readonly<{ layout?: LoadingLayout }>) {
  return (
    <div aria-hidden="true" data-slot="content-loading-skeleton" data-layout={layout} className="w-full min-w-0 space-y-4 text-left">
      {layout === 'report' && <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{placeholders.map((key) => <Skeleton key={key} className="h-24 rounded-xl" />)}</div>}
      {layout === 'report' ? <Skeleton className="h-64 w-full rounded-xl" /> : (
        <div className={layout === 'cards' ? 'grid gap-4 md:grid-cols-2 xl:grid-cols-3' : 'space-y-4'}>
          {placeholders.map((key) => (
            <div key={key} className={layout === 'cards' ? 'surface-inset space-y-4 rounded-xl border border-border/60 p-5' : 'space-y-2'}>
              <Skeleton className="h-4 w-32 max-w-full" />
              <Skeleton className={layout === 'profile' ? 'h-10 w-full' : 'h-5 w-3/4'} />
              {layout === 'cards' && <Skeleton className="h-3 w-full" />}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
