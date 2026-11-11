import { AppHeader } from '@/components/layout/app-header'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { PAGE_INNER, PAGE_MAIN, STAT_GRID } from '@/components/layout/page-layout'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
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
            <Card className="gap-3 py-4">
              <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                {Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-10" />)}
              </CardContent>
            </Card>
            <div className="grid min-w-0 items-start gap-4 xl:grid-cols-12">
              <Skeleton className="h-80 xl:col-span-7 2xl:col-span-6" />
              <Skeleton className="h-80 xl:col-span-5 2xl:col-span-3" />
              <Skeleton className="h-80 xl:col-span-12 2xl:col-span-3" />
              {Array.from({ length: 2 }, (_, index) => <Skeleton key={index} className="h-64 xl:col-span-6" />)}
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
