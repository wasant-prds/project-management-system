import Link from 'next/link'
import { Suspense } from 'react'
import { AlertCircle, ArrowDownRight, CheckSquare, Clock3, ListTodo } from 'lucide-react'
import { AppHeader } from '@/components/layout/app-header'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { DashboardCharts } from '@/components/layout/dashboard-charts'
import { DashboardLoading } from '@/components/layout/dashboard-loading'
import { PAGE_HEADING, PAGE_INNER, PAGE_LEAD, PAGE_MAIN, PAGE_TOOLBAR, STAT_GRID } from '@/components/layout/page-layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { SummaryStatCard } from '@/components/layout/summary-stat-card'
import { getOwner } from '@/lib/owner'
import { DashboardQueryError, getDashboardSummary } from '@/lib/dashboard'
import { dashboardDailyWorkHref, dashboardWorkItemsHref } from '@/lib/dashboard-links'
import { formatBangkokDateLabel } from '@/lib/bangkok-datetime'
import { WORK_ITEM_ROLE_LABELS, WORK_ITEM_STATUS_LABELS } from '@/lib/work-items'
import type { DashboardFilters } from '@/lib/dashboard'

type SearchParameters = Record<string, string | string[] | undefined>
type DashboardResult = Awaited<ReturnType<typeof getDashboardSummary>>
type DashboardPageProps = { searchParams?: Promise<SearchParameters> }

function toSearchParams(values: SearchParameters) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string') params.set(key, value)
    else if (Array.isArray(value) && value[0]) params.set(key, value[0])
  }
  return params
}

function DashboardFiltersForm({ data }: Readonly<{ data: DashboardResult }>) {
  const filters = data.meta.filters
  return (
    <Card className="min-w-0 card-shadow">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">ตัวกรองรายงาน</CardTitle>
        <CardDescription>ช่วงวันใช้ปฏิทิน Asia/Bangkok รวมวันเริ่มต้นและวันสิ้นสุด</CardDescription>
      </CardHeader>
      <CardContent>
        <form action="/" method="get" className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <label className="grid min-w-0 gap-1 text-sm font-medium" htmlFor="dashboard-start-date">
            วันเริ่มต้น
            <input id="dashboard-start-date" name="startDate" type="date" required defaultValue={data.meta.period.startDate} className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
          <label className="grid min-w-0 gap-1 text-sm font-medium" htmlFor="dashboard-end-date">
            วันสิ้นสุด
            <input id="dashboard-end-date" name="endDate" type="date" required defaultValue={data.meta.period.endDate} className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          </label>
          <label className="grid min-w-0 gap-1 text-sm font-medium" htmlFor="dashboard-company">
            Company
            <select id="dashboard-company" name="companyId" defaultValue={filters.companyId ?? ''} className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">ทุก Company</option>
              {data.filterOptions.companies.map((company) => <option key={company.id} value={company.id}>{company.displayName ?? company.name}</option>)}
            </select>
          </label>
          <label className="grid min-w-0 gap-1 text-sm font-medium" htmlFor="dashboard-project">
            Project
            <select id="dashboard-project" name="projectId" defaultValue={filters.projectId ?? ''} className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">ทุก Project</option>
              {data.filterOptions.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
            </select>
          </label>
          <label className="grid min-w-0 gap-1 text-sm font-medium" htmlFor="dashboard-role">
            Functional role
            <select id="dashboard-role" name="role" defaultValue={filters.role ?? ''} className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">ทุก role</option>
              <option value="none">ไม่ระบุ role</option>
              <option value="Developer">Developer</option>
              <option value="infra">Infrastructure</option>
              <option value="SA">System Analyst</option>
            </select>
          </label>
          <label className="grid min-w-0 gap-1 text-sm font-medium" htmlFor="dashboard-kind">
            Work Item kind
            <select id="dashboard-kind" name="kind" defaultValue={filters.kind ?? ''} className="h-9 min-w-0 rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <option value="">ทุกชนิด</option>
              <option value="Incident">Incident</option>
              <option value="Issue">Issue</option>
              <option value="Task">Task</option>
            </select>
          </label>
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-3 xl:col-span-6">
            <Button type="submit">ใช้ตัวกรอง</Button>
            <Link href="/" className="inline-flex h-9 items-center rounded-md px-3 text-sm text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">คืนค่าเริ่มต้น</Link>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function WorkItemList({
  title,
  description,
  items,
  href,
}: Readonly<{
  title: string
  description: string
  items: DashboardResult['summary']['recentWorkItems']
  href: string
}>) {
  return (
    <Card className="min-w-0 card-shadow">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
        <Button asChild variant="outline" size="sm"><Link href={href}>ดูรายการ</Link></Button>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">ไม่มี Work Item ในตัวกรองนี้</p>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id} className="min-w-0 rounded-lg border p-3">
                <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                  <Link href={href} className="min-w-0 flex-1 break-words font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{item.title}</Link>
                  <Badge variant={item.priority === 'urgent' ? 'destructive' : 'secondary'}>{item.priority === 'urgent' ? 'เร่งด่วน' : item.kind}</Badge>
                </div>
                <p className="mt-2 break-words text-sm text-muted-foreground">
                  Project: {item.project.name} · Company: {item.project.company?.displayName ?? item.project.company?.name ?? '—'}
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant="outline">{item.role ? WORK_ITEM_ROLE_LABELS[item.role as keyof typeof WORK_ITEM_ROLE_LABELS] : 'ไม่ระบุ role'}</Badge>
                  <Badge variant="outline">{WORK_ITEM_STATUS_LABELS[item.status as keyof typeof WORK_ITEM_STATUS_LABELS]}</Badge>
                  <span>กำหนด: {item.dueDate ? formatBangkokDateLabel(item.dueDate) : 'ไม่กำหนด'}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function RecentProjects({ data, filters }: Readonly<{ data: DashboardResult; filters: DashboardFilters }>) {
  const projects = data.summary.recentProjects
  return (
    <Card className="min-w-0 card-shadow">
      <CardHeader>
        <CardTitle>Projects ล่าสุด</CardTitle>
        <CardDescription>ความคืบหน้า = completed ÷ (total − cancelled)</CardDescription>
      </CardHeader>
      <CardContent>
        {projects.length === 0 ? (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">ไม่มี Project ในตัวกรองนี้</p>
        ) : (
          <ul className="space-y-3">
            {projects.map((project) => (
              <li key={project.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link href={`/projects/${encodeURIComponent(project.id)}`} className="break-words font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{project.name}</Link>
                    <p className="mt-1 break-words text-sm text-muted-foreground">Company: {project.company?.displayName ?? project.company?.name ?? '—'}</p>
                  </div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{project.progress.toFixed(1)}%</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted" aria-label={`ความคืบหน้า ${project.progress.toFixed(1)}%`}>
                  <div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, project.progress))}%` }} />
                </div>
                <p className="mt-2 text-xs text-muted-foreground">กำหนด: {formatBangkokDateLabel(project.dueDate)} · <Link href={dashboardWorkItemsHref(filters)} className="underline underline-offset-4">Work Items ที่กรองแล้ว</Link></p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function DashboardError({ message }: Readonly<{ message: string }>) {
  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <div role="alert" className="rounded-lg border border-destructive/40 bg-card p-5 text-card-foreground">
        <h1 className="font-semibold">โหลด Dashboard ไม่สำเร็จ</h1>
        <p className="mt-1 text-sm text-muted-foreground">{message}</p>
        <Button asChild className="mt-4"><Link href="/">ลองอีกครั้ง</Link></Button>
      </div>
    </div>
  )
}

async function DashboardContent({ searchParams }: DashboardPageProps) {
  let data: DashboardResult
  try {
    const params = toSearchParams(searchParams ? await searchParams : {})
    const owner = await getOwner()
    data = await getDashboardSummary(owner.id, params)
  } catch (error) {
    const message = error instanceof DashboardQueryError
      ? error.message
      : 'ไม่สามารถเชื่อมต่อเพื่ออ่านข้อมูลจริงได้ กรุณาลองใหม่อีกครั้ง'
    return <DashboardError message={message} />
  }

  const filters: DashboardFilters = {
    ...data.meta.period,
    ...data.meta.filters,
  }
  const summary = data.summary
  const allRowsEmpty = summary.total === 0 && summary.loggedHours === '0' && data.filterOptions.projects.length === 0

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className={PAGE_MAIN}>
          <div className={`${PAGE_INNER} min-w-0`}>
            <div className={PAGE_TOOLBAR}>
              <div className="min-w-0">
                <h1 className={PAGE_HEADING}>Dashboard</h1>
                <p className={PAGE_LEAD}>ภาพรวม Work Items, Projects และ Daily Work จากข้อมูลจริง</p>
              </div>
            </div>

            <DashboardFiltersForm data={data} />

            <section aria-label="สรุป Dashboard" className="space-y-2">
              <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <p>ช่วง {formatBangkokDateLabel(data.meta.period.startDate)} – {formatBangkokDateLabel(data.meta.period.endDate)} · {data.meta.timezone}</p>
                <p>Completed นับเฉพาะ completed; Open ตัด completed และ cancelled</p>
              </div>
              <div className={STAT_GRID}>
                <Link href={dashboardWorkItemsHref(filters)} className="min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <SummaryStatCard label="Work Items ทั้งหมด" value={summary.total} icon={<ListTodo className="h-4 w-4 text-chart-1" />} hint={<span className="text-sm text-muted-foreground">ตามช่วงและตัวกรองที่เลือก</span>} />
                </Link>
                <Link href={dashboardWorkItemsHref(filters, { openOnly: true })} className="min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <SummaryStatCard label="Open Work Items" value={summary.open} icon={<AlertCircle className="h-4 w-4 text-chart-3" />} hint={<span className="text-sm text-muted-foreground">ไม่นับ completed และ cancelled</span>} />
                </Link>
                <Link href={dashboardWorkItemsHref(filters, { status: 'completed' })} className="min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <SummaryStatCard label="Completed" value={summary.completed} icon={<CheckSquare className="h-4 w-4 text-chart-4" />} hint={<span className="text-sm text-muted-foreground">status = completed เท่านั้น</span>} />
                </Link>
                <Link href={dashboardWorkItemsHref(filters, { overdue: true })} className="min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <SummaryStatCard label="Overdue" value={summary.overdue} valueClassName="text-destructive" icon={<ArrowDownRight className="h-4 w-4 text-destructive" />} hint={<span className="text-sm text-muted-foreground">ก่อนวันปัจจุบัน Bangkok</span>} />
                </Link>
                <Link href={dashboardDailyWorkHref(filters)} className="min-w-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <SummaryStatCard label="Logged hours" value={<output aria-label={`Logged hours: ${summary.loggedHours}`}>{summary.loggedHours}</output>} icon={<Clock3 className="h-4 w-4 text-chart-2" />} hint={<span className="text-sm text-muted-foreground">ผลรวม TimeEntry แบบ Decimal</span>} />
                </Link>
              </div>
            </section>

            {allRowsEmpty && (
              <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">ไม่พบ Work Items, Daily Work หรือ Projects ในช่วงและตัวกรองนี้</p>
            )}

            <DashboardCharts data={summary.loggedHoursByDate} filters={filters} />

            <div className="grid min-w-0 gap-4 xl:grid-cols-2">
              <WorkItemList title="Work Items ล่าสุด" description="เรียงตามเวลาที่แก้ไขล่าสุด" items={summary.recentWorkItems} href={dashboardWorkItemsHref(filters)} />
              <RecentProjects data={data} filters={filters} />
              <WorkItemList title="Work Items เร่งด่วน" description="priority urgent ที่ยังเปิดอยู่" items={summary.urgentWorkItems} href={dashboardWorkItemsHref(filters, { priority: 'urgent', openOnly: true })} />
              <WorkItemList title="Work Items เกินกำหนด" description="dueDate ก่อนวันปัจจุบันและยังไม่ปิด" items={summary.overdueWorkItems} href={dashboardWorkItemsHref(filters, { overdue: true })} />
            </div>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

export default function DashboardPage(props: DashboardPageProps) {
  return (
    <Suspense fallback={<DashboardLoading />}>
      <DashboardContent searchParams={props.searchParams} />
    </Suspense>
  )
}
