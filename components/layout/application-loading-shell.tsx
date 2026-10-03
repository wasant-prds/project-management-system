import { Skeleton } from '@/components/ui/skeleton'

const statSkeletons = ['total', 'open', 'completed', 'hours']

export function ApplicationLoadingShell() {
  return (
    <div className="flex min-h-svh bg-background text-foreground" role="status" aria-busy="true">
      <span className="sr-only">กำลังโหลดหน้าที่เลือก</span>
      <aside aria-hidden="true" className="hidden w-64 shrink-0 border-r border-border/60 p-5 lg:block">
        <Skeleton className="mb-9 h-11 w-44" />
        <div className="space-y-3">
          {statSkeletons.map((item) => <Skeleton key={item} className="h-10 w-full" />)}
        </div>
      </aside>
      <div aria-hidden="true" className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-border/60 px-4 sm:px-6">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="size-9 rounded-full" />
        </header>
        <main className="min-h-0 flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto w-full max-w-[1600px] space-y-6">
            <Skeleton className="h-9 w-56" />
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {statSkeletons.map((item) => <Skeleton key={item} className="h-28 rounded-[var(--radius-panel)]" />)}
            </div>
            <div className="grid min-w-0 gap-5 lg:grid-cols-3">
              <Skeleton className="min-h-64 rounded-[var(--radius-panel)] lg:col-span-2" />
              <Skeleton className="min-h-64 rounded-[var(--radius-panel)]" />
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
