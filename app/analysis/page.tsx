'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
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
import { ChartContainer, ChartTooltipContent } from '@/components/ui/chart'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { bangkokCalendarPeriodRange, currentBangkokCalendarDate } from '@/lib/bangkok-datetime'
import { analysisDailyWorkHref, analysisWorkItemsHref } from '@/lib/analysis-links'
import { generateAnalysisCsv, type AnalysisReport } from '@/lib/analysis-export'
import { downloadTextFile } from '@/components/page/work-items/work-item-export'
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
type StatusChartPoint = { href: string; accessibleName: string }
type StatusBarShapeProps = {
  x?: number
  y?: number
  width?: number
  height?: number
  fill?: string
  payload?: StatusChartPoint
}
type HoursChartPoint = { href: string; accessibleName: string }

function StatusChartLinkBar({ x = 0, y = 0, width = 0, height = 0, fill = 'var(--chart-1)', payload }: StatusBarShapeProps) {
  if (!payload) return <g />
  return (
    <Link href={payload.href} aria-label={payload.accessibleName}>
      <rect x={x} y={y} width={width} height={height} rx={4} fill={fill} />
    </Link>
  )
}

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

function displayRole(role: string | null) {
  if (!role) return 'ไม่ระบุ'
  return WORK_ITEM_ROLE_LABELS[role as keyof typeof WORK_ITEM_ROLE_LABELS] ?? role
}

function displayStatus(status: string) {
  return WORK_ITEM_STATUS_LABELS[status as keyof typeof WORK_ITEM_STATUS_LABELS] ?? status
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

function shortPeriodLabel(startDate: string, endDate: string, grouping: string) {
  if (grouping === 'month') return startDate.slice(0, 7)
  if (startDate === endDate) return startDate.slice(5)
  return `${startDate.slice(5)}–${endDate.slice(5)}`
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
                className="flex min-w-0 items-center justify-between gap-3 py-2 text-sm hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0 break-words">{row.value}</span>
                <span className="shrink-0 font-semibold tabular-nums">{row.count}</span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function WorkItemsTable({ report }: Readonly<{ report: AnalysisReport }>) {
  if (report.workItems.length === 0) {
    return <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">ไม่พบ Work Item ในช่วงและตัวกรองนี้</p>
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border">
      <table className="w-full table-fixed text-left text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="w-[48%] px-3 py-2 font-medium">Work Item / Project</th>
            <th className="w-[28%] px-3 py-2 font-medium">สถานะ</th>
            <th className="hidden w-[14%] px-3 py-2 font-medium sm:table-cell">ความสำคัญ</th>
            <th className="hidden w-[14%] px-3 py-2 font-medium md:table-cell">Functional role</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {report.workItems.map((item) => (
            <tr key={item.id} className="align-top">
              <td className="min-w-0 px-3 py-2">
                <Link
                  href={analysisWorkItemsHref(report.meta.filters, report.meta.period, { workItemId: item.id })}
                  className="block break-words font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`เปิด Work Item ${item.title}`}
                >
                  {item.title}
                </Link>
                <span className="mt-1 block break-words text-xs text-muted-foreground">
                  {item.project.company?.displayName ?? item.project.company?.name ?? 'ไม่ระบุ Company'} · {item.project.name}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">วันที่อ้างอิง {item.workDate ?? item.dueDate ?? item.createdAt.slice(0, 10)}</span>
              </td>
              <td className="break-words px-3 py-2">{displayStatus(item.status)}</td>
              <td className="hidden break-words px-3 py-2 sm:table-cell">{WORK_ITEM_PRIORITY_LABELS[item.priority as keyof typeof WORK_ITEM_PRIORITY_LABELS] ?? item.priority}</td>
              <td className="hidden break-words px-3 py-2 md:table-cell">{displayRole(item.role)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function DailyWorkTable({ report }: Readonly<{ report: AnalysisReport }>) {
  if (report.timeEntries.length === 0) {
    return <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">ไม่พบ Daily Work ในช่วงและตัวกรองนี้</p>
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border">
      <table className="w-full table-fixed text-left text-sm">
        <thead className="bg-muted/50 text-xs text-muted-foreground">
          <tr>
            <th className="w-[27%] px-3 py-2 font-medium">วันที่</th>
            <th className="w-[53%] px-3 py-2 font-medium">รายละเอียดต้นทาง</th>
            <th className="w-[20%] px-3 py-2 text-right font-medium">ชั่วโมง</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {report.timeEntries.map((entry) => {
            const dayHref = analysisDailyWorkHref(report.meta.filters, { startDate: entry.date, endDate: entry.date })
            return (
              <tr key={entry.id} className="align-top">
                <td className="px-3 py-2">
                  <Link href={dayHref} className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {entry.date}
                  </Link>
                </td>
                <td className="min-w-0 px-3 py-2">
                  <span className="block break-words">{entry.description || entry.workItem?.title || 'ไม่มีรายละเอียด'}</span>
                  {entry.workItem && (
                    <span className="mt-1 block break-words text-xs text-muted-foreground">
                      {entry.workItem.project.company?.displayName ?? entry.workItem.project.company?.name ?? 'ไม่ระบุ Company'} · {entry.workItem.project.name} · {entry.workItem.title}
                    </span>
                  )}
                  {entry.remarks && <span className="mt-1 block break-words text-xs text-muted-foreground">หมายเหตุ: {entry.remarks}</span>}
                  <span className="mt-1 block text-[11px] text-muted-foreground">TimeEntry {entry.id}</span>
                </td>
                <td className="px-3 py-2 text-right font-medium tabular-nums">{entry.hours}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function HoursPeriodTable({ report }: Readonly<{ report: AnalysisReport }>) {
  if (report.loggedHoursByPeriod.length === 0) return null

  return (
    <div className="mt-3 overflow-hidden rounded-md border">
      <table className="w-full table-fixed text-left text-xs">
        <thead className="bg-muted/50 text-muted-foreground">
          <tr>
            <th className="w-[58%] px-3 py-2 font-medium">ช่วงวันที่</th>
            <th className="w-[20%] px-3 py-2 text-right font-medium">ชั่วโมง</th>
            <th className="w-[22%] px-3 py-2 text-right font-medium">ต้นทาง</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {report.loggedHoursByPeriod.map((row) => (
            <tr key={row.startDate}>
              <td className="break-words px-3 py-2">{row.startDate} – {row.endDate}</td>
              <td className="px-3 py-2 text-right font-medium tabular-nums">{row.hours}</td>
              <td className="px-3 py-2 text-right">
                <Link
                  href={analysisDailyWorkHref(report.meta.filters, { startDate: row.startDate, endDate: row.endDate })}
                  className="text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Daily Work
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
    setReport(null)

    fetch(`/api/analysis/summary?${requestQuery}`, { signal: controller.signal })
      .then(async (response) => {
        const body = await response.json()
        if (!response.ok) throw new Error(body.error?.message ?? 'ไม่สามารถอ่านข้อมูล Analysis ได้')
        return body as AnalysisReport
      })
      .then(setReport)
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
  const statusChartData = report?.breakdowns.status.map((row) => ({
    name: displayStatus(row.value),
    value: row.count,
    href: analysisWorkItemsHref(sourceFilters, period, { status: row.value }),
    accessibleName: `เปิด Work Items สถานะ ${displayStatus(row.value)} จำนวน ${row.count} รายการ`,
  })) ?? []
  const hoursChartData = report?.loggedHoursByPeriod.map((row) => ({
    ...row,
    label: shortPeriodLabel(row.startDate, row.endDate, report.meta.loggedHoursGrouping),
    plottedHours: Number(row.hours),
    href: analysisDailyWorkHref(sourceFilters, { startDate: row.startDate, endDate: row.endDate }),
    accessibleName: `เปิด Daily Work ช่วง ${row.startDate} ถึง ${row.endDate} รวม ${row.hours} ชั่วโมง`,
  })) ?? []

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <AppHeader />
        <main className={PAGE_MAIN}>
          <div className={`${PAGE_INNER} min-w-0`}>
            <div className={PAGE_TOOLBAR}>
              <div className="min-w-0">
                <h1 className={PAGE_HEADING}>วิเคราะห์รายงาน</h1>
                <p className={PAGE_LEAD}>สรุป Work Item และชั่วโมงจากข้อมูลจริงตามช่วงเวลาและตัวกรอง</p>
              </div>
              <Button type="button" onClick={exportReport} disabled={!report || isLoading || filtersDirty} className="w-full text-white sm:w-auto">
                <Download className="h-4 w-4" />
                <span className={ACTION_LABEL_CLASS}>ส่งออก CSV</span>
                <span className="sm:hidden">ส่งออก CSV</span>
              </Button>
            </div>
            {exportMessage && (
              exportMessage.kind === 'error'
                ? <p className="text-sm text-destructive" role="alert">{exportMessage.text}</p>
                : <output className="block text-sm text-muted-foreground" aria-live="polite">{exportMessage.text}</output>
            )}

            <Card className="card-shadow">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">ตัวกรองรายงาน</CardTitle>
                <CardDescription>ช่วงวันที่รวมวันเริ่มต้นและวันสิ้นสุด โดยใช้ปฏิทิน Asia/Bangkok</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={applyFilters} className="space-y-4">
                  <div className={`${FILTER_ROW} min-w-0`}>
                    <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium">
                      ตั้งแต่
                      <Input type="date" required value={draftFilters.startDate} onChange={(event) => setDraftFilters((current) => ({ ...current, startDate: event.target.value }))} />
                    </label>
                    <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium">
                      ถึง
                      <Input type="date" required value={draftFilters.endDate} onChange={(event) => setDraftFilters((current) => ({ ...current, endDate: event.target.value }))} />
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
                  {dateError && <p className="text-sm text-destructive" role="alert">{dateError}</p>}
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <Button type="button" variant="outline" onClick={resetFilters}>คืนค่าเริ่มต้น</Button>
                    <Button type="submit" disabled={isLoading} className="text-white">ใช้ตัวกรอง</Button>
                  </div>
                </form>
              </CardContent>
            </Card>

            {report && (
              <>
                <div className="grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
                  <SummaryStatCard label="Work Items ทั้งหมด" value={report.summary.total} />
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
                {filtersDirty && <p className="text-xs text-amber-700 dark:text-amber-300">มีการเปลี่ยนตัวกรองที่ยังไม่ถูกใช้กับรายงาน กด “ใช้ตัวกรอง” ก่อนส่งออก</p>}

                <Tabs defaultValue="overview" className="min-w-0 space-y-4">
                  <div className={TAB_SCROLL_CLASS}>
                    <TabsList>
                      <TabsTrigger className={TAB_TRIGGER_CLASS} value="overview">ภาพรวม</TabsTrigger>
                      <TabsTrigger className={TAB_TRIGGER_CLASS} value="work-items">Work Items ({report.workItems.length})</TabsTrigger>
                      <TabsTrigger className={TAB_TRIGGER_CLASS} value="daily-work">Daily Work ({report.timeEntries.length})</TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent value="overview" className="min-w-0 space-y-4">
                    <div className="grid min-w-0 gap-4 xl:grid-cols-2">
                      <Card className="min-w-0 overflow-hidden card-shadow">
                        <CardHeader>
                          <CardTitle>สถานะ Work Items</CardTitle>
                          <CardDescription>สถานะปัจจุบันของรายการที่ตรงกับช่วงและตัวกรอง</CardDescription>
                        </CardHeader>
                        <CardContent className="min-w-0 overflow-hidden">
                          {report.summary.total === 0 ? (
                            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">ไม่มี Work Item ให้แสดงในกราฟนี้</p>
                          ) : (
                            <ChartContainer config={{ value: { label: 'Work Items', color: 'var(--chart-1)' } }} className="h-[320px] min-w-0 w-full">
                              <BarChart data={statusChartData} layout="vertical" margin={{ top: 4, right: 12, bottom: 4, left: 4 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.35} />
                                <XAxis type="number" allowDecimals={false} stroke="var(--muted-foreground)" fontSize={11} />
                                <YAxis dataKey="name" type="category" width={104} stroke="var(--muted-foreground)" fontSize={10} />
                                <Tooltip content={<ChartTooltipContent />} />
                                <Bar
                                  dataKey="value"
                                  fill="var(--chart-1)"
                                  radius={[0, 4, 4, 0]}
                                  maxBarSize={24}
                                  shape={(props: unknown) => <StatusChartLinkBar {...props as StatusBarShapeProps} />}
                                />
                              </BarChart>
                            </ChartContainer>
                          )}
                        </CardContent>
                      </Card>

                      <Card className="min-w-0 overflow-hidden card-shadow">
                        <CardHeader>
                          <CardTitle>Logged hours ตามช่วงเวลา</CardTitle>
                          <CardDescription>รวมจาก TimeEntry.date ด้วย grouping แบบ {report.meta.loggedHoursGrouping} ตาม Asia/Bangkok</CardDescription>
                        </CardHeader>
                        <CardContent className="min-w-0 overflow-hidden">
                          {hoursChartData.length === 0 ? (
                            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">ไม่มี Daily Work ให้แสดงในกราฟนี้</p>
                          ) : (
                            <ChartContainer config={{ plottedHours: { label: 'ชั่วโมง', color: 'var(--chart-2)' } }} className="h-[320px] min-w-0 w-full">
                              <LineChart data={hoursChartData} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.35} />
                                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={10} minTickGap={16} />
                                <YAxis stroke="var(--muted-foreground)" fontSize={11} width={42} />
                                <Tooltip content={<ChartTooltipContent labelFormatter={(_label, payload) => {
                                  const point = payload?.[0]?.payload as { startDate?: string; endDate?: string } | undefined
                                  return point ? `${point.startDate} – ${point.endDate}` : ''
                                }} />} />
                                <Line
                                  type="monotone"
                                  dataKey="plottedHours"
                                  stroke="var(--chart-2)"
                                  strokeWidth={2}
                                  dot={(props) => {
                                    const point = props.payload as HoursChartPoint
                                    return (
                                      <Link href={point.href} aria-label={point.accessibleName}>
                                        <circle cx={props.cx} cy={props.cy} r={props.r} fill="var(--chart-2)" stroke="var(--background)" strokeWidth={2} />
                                      </Link>
                                    )
                                  }}
                                />
                              </LineChart>
                            </ChartContainer>
                          )}
                          <HoursPeriodTable report={report} />
                        </CardContent>
                      </Card>
                    </div>

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
              <output className="block rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground" aria-live="polite" aria-busy="true">
                <RefreshCw className="mx-auto mb-2 h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                กำลังโหลดรายงานจากข้อมูลจริง...
              </output>
            )}
            {!isLoading && loadError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm" role="alert">
                <p className="font-medium">โหลด Analysis ไม่สำเร็จ</p>
                <p className="mt-1 text-muted-foreground">{loadError}</p>
                <Button type="button" variant="outline" className="mt-3" onClick={() => setReloadKey((current) => current + 1)}>
                  <RefreshCw className="h-4 w-4" /> ลองอีกครั้ง
                </Button>
              </div>
            )}
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
