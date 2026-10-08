'use client'

import Link from 'next/link'
import { AnalysisChartsDeferred } from '@/components/page/analysis/analysis-charts-deferred'
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'

import { Download, RefreshCw } from 'lucide-react'
import { AppHeader } from '@/components/layout/app-header'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { SummaryStatCard } from '@/components/layout/summary-stat-card'
import {
  ACTION_LABEL_CLASS,
  FILTER_ROW,
  PAGE_HEADING,
  PAGE_INNER,
  PAGE_LEAD,
  PAGE_MAIN,
  PAGE_TOOLBAR,
  TAB_SCROLL_CLASS,
  TAB_TRIGGER_CLASS,
} from '@/components/layout/page-layout'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DatePicker } from '@/components/ui/date-picker'
import { WorkItemsTable, DailyWorkTable, displayRole, displayStatus } from '@/components/page/analysis/report-tables'
import { PageState } from '@/components/layout/page-state'
import { loadFailureVisual } from '@/components/ui/product-identity'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { bangkokCalendarPeriodRange, currentBangkokCalendarDate } from '@/lib/bangkok-datetime'
import { analysisWorkItemsHref } from '@/lib/analysis-links'
import { generateAnalysisCsv, type AnalysisReport } from '@/lib/analysis-export'
import { downloadTextFile } from '@/components/page/work-items/work-item-export'
import { ContentLoadingSkeleton } from '@/components/layout/content-loading-skeleton'
import {
  WORK_ITEM_KINDS,
  WORK_ITEM_PRIORITY_LABELS,
  WORK_ITEM_ROLES,
  WORK_ITEM_ROLE_LABELS,
  WORK_ITEM_STATUS_LABELS,
} from '@/lib/work-items'

type AnalysisFilters = {
  startDate: string
  endDate: string
  companyId: string
  projectId: string
  role: string
  kind: string
}

type BreakdownRow = { value: string; count: number }
type FilterOptions = AnalysisReport['filterOptions']
function defaultDateRange() {
  const today = currentBangkokCalendarDate()
  return bangkokCalendarPeriodRange(today, 'month') ?? { startDate: today, endDate: today }
}

function defaultFilters(): AnalysisFilters {
  return { ...defaultDateRange(), companyId: 'all', projectId: 'all', role: 'all', kind: 'all' }
}

function analysisQuery(filters: AnalysisFilters) {
  const params = new URLSearchParams({ startDate: filters.startDate, endDate: filters.endDate })
  for (const [name, value] of [
    ['companyId', filters.companyId],
    ['projectId', filters.projectId],
    ['role', filters.role],
    ['kind', filters.kind],
  ]) {
    if (value !== 'all') params.set(name, value)
  }
  return params.toString()
}

function activeFilterDescription(report: AnalysisReport) {
  const company = report.meta.filters.companyId
    ? report.filterOptions.companies.find((item) => item.id === report.meta.filters.companyId)?.displayName
      ?? report.filterOptions.companies.find((item) => item.id === report.meta.filters.companyId)?.name
      ?? report.meta.filters.companyId
    : 'ทุก Company'
  const project = report.meta.filters.projectId
    ? report.filterOptions.projects.find((item) => item.id === report.meta.filters.projectId)?.name
      ?? report.meta.filters.projectId
    : 'ทุก Project'
  let role = 'ทุก role'
  if (report.meta.filters.role === 'none') role = 'ไม่ระบุ role'
  else if (report.meta.filters.role) role = displayRole(report.meta.filters.role)
  const kind = report.meta.filters.kind ?? 'ทุกชนิดงาน'
  return `Company: ${company} · Project: ${project} · Functional role: ${role} · ชนิดงาน: ${kind}`
}

function BreakdownCard({
  title,
  rows,
  hrefForValue,
}: Readonly<{
  title: string
  rows: BreakdownRow[]
  hrefForValue: (value: string) => string
}>) {
  return (
    <Card className="min-w-0 card-shadow">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>จำนวน Work Item ตามตัวกรองปัจจุบัน</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y divide-border/60">
          {rows.map((row) => (
            <li key={row.value}>
              <Link
                href={hrefForValue(row.value)}
                className="flex min-w-0 items-center justify-between gap-3 py-2 text-sm hover:text-link focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0 break-words">{row.value}</span>
                <span className="shrink-0 font-semibold tabular-nums">{row.count}</span>
              </Link>
            </li>
          ))}
        </ul>
        {rows.length === 0 && <p className="text-sm leading-relaxed text-muted-foreground">ไม่พบ Work Item ในช่วงและตัวกรองนี้</p>}
      </CardContent>
    </Card>
  )
}

export default function AnalysisPage() {
  const [draftFilters, setDraftFilters] = useState<AnalysisFilters>(defaultFilters)
  const [appliedFilters, setAppliedFilters] = useState<AnalysisFilters>(defaultFilters)
  const [report, setReport] = useState<AnalysisReport | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [dateError, setDateError] = useState<string | null>(null)
  const [exportMessage, setExportMessage] = useState<{ kind: 'success' | 'error'; text: string } | null>(null)
  const [reloadKey, setReloadKey] = useState(0)
  const loadedQuery = useRef<string | null>(null)
  const requestQuery = useMemo(() => analysisQuery(appliedFilters), [appliedFilters])
  const filtersDirty = useMemo(
    () => analysisQuery(draftFilters) !== analysisQuery(appliedFilters),
    [draftFilters, appliedFilters],
  )

  useEffect(() => {
    const controller = new AbortController()
    setIsLoading(true)
    setLoadError(null)
    setExportMessage(null)
    // Keep usable content on refresh, but never label old data with new filters.
    if (loadedQuery.current !== requestQuery) setReport(null)

    fetch(`/api/analysis/summary?${requestQuery}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error?.message ?? 'ไม่สามารถอ่านข้อมูล Analysis ได้')
        return body as AnalysisReport
      })
      .then((data) => {
        if (controller.signal.aborted) return
        loadedQuery.current = requestQuery
        setReport(data)
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        const message = error instanceof Error ? error.message : 'ไม่สามารถอ่านข้อมูล Analysis ได้'
        setLoadError(message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false)
      })

    return () => controller.abort()
  }, [requestQuery, reloadKey])

  const projectOptions = useMemo(() => {
    const projects = report?.filterOptions.projects ?? []
    if (draftFilters.companyId === 'all') return projects
    return projects.filter((project) => project.companyId === draftFilters.companyId)
  }, [draftFilters.companyId, report?.filterOptions.projects])

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (draftFilters.startDate > draftFilters.endDate) {
      setDateError('วันที่เริ่มต้นต้องไม่อยู่หลังวันที่สิ้นสุด')
      return
    }
    setDateError(null)
    if (analysisQuery(draftFilters) === requestQuery) setReloadKey((current) => current + 1)
    setAppliedFilters({ ...draftFilters })
  }

  const resetFilters = () => {
    const filters = defaultFilters()
    setDraftFilters(filters)
    setAppliedFilters(filters)
    setDateError(null)
  }

  const exportReport = useCallback(() => {
    if (!report) return
    try {
      const csv = generateAnalysisCsv(report)
      downloadTextFile(csv, `analysis-${report.meta.period.startDate}-${report.meta.period.endDate}.csv`, 'text/csv;charset=utf-8')
      setExportMessage({ kind: 'success', text: 'ส่งออก CSV สำเร็จ' })
    } catch {
      setExportMessage({ kind: 'error', text: 'ส่งออก CSV ไม่สำเร็จ กรุณาลองอีกครั้ง' })
    }
  }, [report])

  const filterOptions: FilterOptions = report?.filterOptions ?? { companies: [], projects: [] }
  const period = report?.meta.period ?? { startDate: appliedFilters.startDate, endDate: appliedFilters.endDate }
  const sourceFilters = report?.meta.filters ?? {
    companyId: appliedFilters.companyId === 'all' ? null : appliedFilters.companyId,
    projectId: appliedFilters.projectId === 'all' ? null : appliedFilters.projectId,
    role: appliedFilters.role === 'all' ? null : appliedFilters.role,
    kind: appliedFilters.kind === 'all' ? null : appliedFilters.kind,
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <AppHeader />
        <main className={PAGE_MAIN}>
          <div className={`${PAGE_INNER} min-w-0`}>
            <div className={PAGE_TOOLBAR}>
              <div className="min-w-0">
                <p className="page-eyebrow mb-2">Insights & reports</p>
                <h1 className={PAGE_HEADING}>วิเคราะห์รายงาน</h1>
                <p className={PAGE_LEAD}>สรุป Work Item และชั่วโมงจากข้อมูลจริงตามช่วงเวลาและตัวกรอง</p>
              </div>
              <Button type="button" magnetic onClick={exportReport} disabled={!report || isLoading || filtersDirty} className="w-full text-primary-foreground sm:w-auto">
                <Download className="h-4 w-4" />
                <span className={ACTION_LABEL_CLASS}>ส่งออก CSV</span>
                <span className="sm:hidden">ส่งออก CSV</span>
              </Button>
            </div>
            {exportMessage && (
              exportMessage.kind === 'error'
                ? <p className="text-sm text-danger" role="alert">{exportMessage.text}</p>
                : <output className="block text-sm text-muted-foreground" aria-live="polite">{exportMessage.text}</output>
            )}

            <Card className="cinematic-beat-support surface-inset bg-muted/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">ตัวกรองรายงาน</CardTitle>
                <CardDescription>ช่วงวันที่รวมวันเริ่มต้นและวันสิ้นสุด โดยใช้ปฏิทิน Asia/Bangkok</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={applyFilters} className="space-y-4">
                  <div className={`${FILTER_ROW} min-w-0`}>
                    <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium">
                      ตั้งแต่
                      <DatePicker id="analysis-start-date" required value={draftFilters.startDate} onValueChange={(startDate) => setDraftFilters((current) => ({ ...current, startDate }))} />
                    </label>
                    <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium">
                      ถึง
                      <DatePicker id="analysis-end-date" required value={draftFilters.endDate} onValueChange={(endDate) => setDraftFilters((current) => ({ ...current, endDate }))} />
                    </label>
                    <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium">
                      Company
                      <Select value={draftFilters.companyId} onValueChange={(companyId) => setDraftFilters((current) => ({ ...current, companyId, projectId: 'all' }))}>
                        <SelectTrigger className="w-full bg-background" aria-label="กรองตาม Company"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">ทุก Company</SelectItem>
                          {filterOptions.companies.map((company) => <SelectItem key={company.id} value={company.id}>{company.displayName ?? company.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium">
                      Project
                      <Select value={draftFilters.projectId} onValueChange={(projectId) => setDraftFilters((current) => ({ ...current, projectId }))}>
                        <SelectTrigger className="w-full bg-background" aria-label="กรองตาม Project"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">ทุก Project</SelectItem>
                          {projectOptions.map((project) => <SelectItem key={project.id} value={project.id}>{project.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium">
                      Functional role
                      <Select value={draftFilters.role} onValueChange={(role) => setDraftFilters((current) => ({ ...current, role }))}>
                        <SelectTrigger className="w-full bg-background" aria-label="กรองตาม Functional role"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">ทุก role</SelectItem>
                          <SelectItem value="none">ไม่ระบุ role</SelectItem>
                          {WORK_ITEM_ROLES.map((role) => <SelectItem key={role} value={role}>{WORK_ITEM_ROLE_LABELS[role]}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </label>
                    <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium">
                      ชนิดงาน
                      <Select value={draftFilters.kind} onValueChange={(kind) => setDraftFilters((current) => ({ ...current, kind }))}>
                        <SelectTrigger className="w-full bg-background" aria-label="กรองตามชนิดงาน"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">ทุกชนิด</SelectItem>
                          {WORK_ITEM_KINDS.map((kind) => <SelectItem key={kind} value={kind}>{kind}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </label>
                  </div>
                  {dateError && <p className="text-sm text-danger" role="alert">{dateError}</p>}
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" onClick={resetFilters}>คืนค่าเริ่มต้น</Button>
                    <Button type="submit" magnetic disabled={isLoading} className="text-primary-foreground">ใช้ตัวกรอง</Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {report && (
              <>
                <div className="cinematic-beat-data motion-stagger grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
                  <SummaryStatCard emphasis="primary" label="Work Items ทั้งหมด" value={report.summary.total} />
                  <SummaryStatCard label="Open" value={report.summary.open} />
                  <SummaryStatCard label="Completed" value={report.summary.completed} hint={<span className="text-xs text-muted-foreground">ไม่นับ Cancelled</span>} />
                  <SummaryStatCard label="Overdue" value={report.summary.overdue} />
                  <SummaryStatCard label="Logged hours" value={<span className="break-all">{report.summary.loggedHours}</span>} hint={<span className="text-xs text-muted-foreground">ชั่วโมงจาก Daily Work</span>} />
                </div>

                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                  <p>ช่วง {period.startDate} ถึง {period.endDate} · Asia/Bangkok</p>
                  <p>Completion rate {report.summary.completionRate.toFixed(1)}% = Completed ÷ (ทั้งหมด − Cancelled) · ชั่วโมงรวมเป็น Decimal แบบไม่ปัดก่อนรวม</p>
                </div>
                <p className="break-words text-xs text-muted-foreground">ตัวกรองที่ใช้กับรายงาน: {activeFilterDescription(report)}</p>
                {filtersDirty && <p className="text-xs text-warning">มีการเปลี่ยนตัวกรองที่ยังไม่ถูกใช้กับรายงาน กด “ใช้ตัวกรอง” ก่อนส่งออก</p>}

                <Tabs defaultValue="overview" className="min-w-0 space-y-4">
                  <div className={TAB_SCROLL_CLASS}>
                    <TabsList>
                      <TabsTrigger className={TAB_TRIGGER_CLASS} value="overview">ภาพรวม</TabsTrigger>
                      <TabsTrigger className={TAB_TRIGGER_CLASS} value="work-items">Work Items ({report.workItems.length})</TabsTrigger>
                      <TabsTrigger className={TAB_TRIGGER_CLASS} value="daily-work">Daily Work ({report.timeEntries.length})</TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="overview" className="min-w-0 space-y-4">
                    <AnalysisChartsDeferred report={report} />

                    <div className="grid min-w-0 gap-4 md:grid-cols-3">
                      <BreakdownCard
                        title="สถานะ"
                        rows={report.breakdowns.status.map((row) => ({ value: displayStatus(row.value), count: row.count }))}
                        hrefForValue={(value) => analysisWorkItemsHref(sourceFilters, period, { status: Object.entries(WORK_ITEM_STATUS_LABELS).find(([, label]) => label === value)?.[0] ?? value })}
                      />
                      <BreakdownCard
                        title="ความสำคัญ"
                        rows={report.breakdowns.priority.map((row) => ({ value: WORK_ITEM_PRIORITY_LABELS[row.value as keyof typeof WORK_ITEM_PRIORITY_LABELS] ?? row.value, count: row.count }))}
                        hrefForValue={(value) => analysisWorkItemsHref(sourceFilters, period, { priority: Object.entries(WORK_ITEM_PRIORITY_LABELS).find(([, label]) => label === value)?.[0] ?? value })}
                      />
                      <BreakdownCard
                        title="ชนิดงาน"
                        rows={report.breakdowns.kind}
                        hrefForValue={(value) => analysisWorkItemsHref(sourceFilters, period, { kind: value })}
                      />
                    </div>
                    <p className="rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">สถานะในรายงานเป็นสถานะปัจจุบันของ Work Item; ยังไม่แสดง throughput หรือกราฟการเปลี่ยนสถานะย้อนหลัง เพราะระบบยังไม่มี status history หรือ completedAt</p>
                  </TabsContent>

                  <TabsContent value="work-items" className="min-w-0 space-y-3">
                    <Card className="min-w-0 card-shadow">
                      <CardHeader>
                        <CardTitle>Work Items ต้นทาง</CardTitle>
                        <CardDescription>วันที่อ้างอิงใช้ workDate → dueDate → createdAt; เลือกชื่อเพื่อเปิด Work Item รายการนั้น</CardDescription>
                      </CardHeader>
                      <CardContent className="min-w-0"><WorkItemsTable report={report} /></CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="daily-work" className="min-w-0 space-y-3">
                    <Card className="min-w-0 card-shadow">
                      <CardHeader>
                        <CardTitle>Daily Work ต้นทาง</CardTitle>
                        <CardDescription>แสดง TimeEntry จริง ชั่วโมงยังเป็น Decimal และเลือกวันที่เพื่อเปิด Daily Work ของวันนั้น</CardDescription>
                      </CardHeader>
                      <CardContent className="min-w-0"><DailyWorkTable report={report} /></CardContent>
                    </Card>
                  </TabsContent>
                </Tabs>
              </>
            )}

            {isLoading && (
              <div role="status" className="space-y-4 rounded-xl border border-border/60 p-6 text-sm text-muted-foreground" aria-busy="true">
                <p>{report ? 'กำลังอัปเดตรายงาน…' : 'กำลังโหลดรายงานจากข้อมูลจริง...'}</p>
                {!report && <ContentLoadingSkeleton layout="report" />}
              </div>
            )}
            {!isLoading && loadError && (
              <PageState kind="error" visual={loadFailureVisual(loadError)} title="โหลด Analysis ไม่สำเร็จ" description={loadError} action={
                <Button type="button" variant="outline" onClick={() => setReloadKey((current) => current + 1)}>
                  <RefreshCw className="h-4 w-4" /> ลองอีกครั้ง
                </Button>
              } />
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
