import { AppHeader } from '@/components/layout/app-header'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { PAGE_INNER, PAGE_MAIN, STAT_GRID } from '@/components/layout/page-layout'
import { Skeleton } from '@/components/ui/skeleton'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'

export function DashboardLoading() {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className={PAGE_MAIN} aria-busy="true" aria-label="กำลังโหลด Dashboard">
          <div className={PAGE_INNER}>
            <Skeleton className="h-10 w-56" />
            <div className={`${STAT_GRID} lg:grid-cols-5`}>{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-32" />)}</div>
            <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
              {Array.from({ length: 2 }, (_, index) => <Skeleton key={index} className="h-64" />)}
            </div>
            <div className="grid min-w-0 items-start gap-4 lg:grid-cols-2">
              <Skeleton className="h-80" />
              <Skeleton className="h-80" />
              <Skeleton className="h-80 lg:col-span-2" />
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
