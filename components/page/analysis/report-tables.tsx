'use client'

import { useReportPage, ReportPagination } from '@/components/ui/report-pagination'
import Link from 'next/link'
import type { AnalysisReport } from '@/lib/analysis-export'
import { analysisDailyWorkHref, analysisWorkItemsHref } from '@/lib/analysis-links'
import { WORK_ITEM_PRIORITY_LABELS, WORK_ITEM_ROLE_LABELS, WORK_ITEM_STATUS_LABELS } from '@/lib/work-items'
import { InlineState } from '@/components/layout/page-state'
import { WorkItemStatusBadge } from '@/components/page/work-items/work-item-status-badge'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'

export function displayRole(role: string | null) {
  if (!role) return 'ไม่ระบุ'
  return WORK_ITEM_ROLE_LABELS[role as keyof typeof WORK_ITEM_ROLE_LABELS] ?? role
}

export function displayStatus(status: string) {
  return WORK_ITEM_STATUS_LABELS[status as keyof typeof WORK_ITEM_STATUS_LABELS] ?? status
}

export function WorkItemsTable({ report }: Readonly<{ report: AnalysisReport }>) {
  const pagination = useReportPage(report.workItems)
  if (report.workItems.length === 0) {
    return <InlineState visual="search" title="ไม่พบ Work Item ในช่วงและตัวกรองนี้" description="ลองปรับช่วงวันหรือตัวกรองเพื่อดูรายการจริง" />
  }

  return (
    <>
    <Table className="w-full table-fixed text-left text-sm [&_th]:whitespace-normal [&_td]:whitespace-normal [&_td]:align-top">
      <TableHeader className="bg-muted/50 text-xs text-muted-foreground">
        <TableRow>
          <TableHead className="w-[44%] px-3 py-3 font-medium">Work Item / Project</TableHead>
          <TableHead className="w-[28%] px-3 py-3 font-medium">สถานะ</TableHead>
          <TableHead className="hidden w-[14%] px-3 py-3 font-medium sm:table-cell">ความสำคัญ</TableHead>
          <TableHead className="hidden w-[14%] px-3 py-3 font-medium md:table-cell">Functional role</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="divide-y divide-border/60">
        {pagination.rows.map((item) => (
          <TableRow key={item.id} className="align-top">
            <TableCell className="min-w-0 px-3 py-3">
              <Link
                href={analysisWorkItemsHref(report.meta.filters, report.meta.period, { workItemId: item.id })}
                className="content-wrap block font-medium text-link underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`เปิด Work Item ${item.title}`}
              >
                {item.title}
              </Link>
              <span className="mt-1 content-wrap block text-xs text-muted-foreground">
                {item.project.company?.displayName ?? item.project.company?.name ?? 'ไม่ระบุ Company'} · {item.project.name}
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">วันที่อ้างอิง {item.workDate ?? item.dueDate ?? item.createdAt.slice(0, 10)}</span>
            </TableCell>
            <TableCell className="content-wrap px-3 py-3"><WorkItemStatusBadge status={item.status} /></TableCell>
            <TableCell className="content-wrap hidden px-3 py-3 sm:table-cell">{WORK_ITEM_PRIORITY_LABELS[item.priority as keyof typeof WORK_ITEM_PRIORITY_LABELS] ?? item.priority}</TableCell>
            <TableCell className="content-wrap hidden px-3 py-3 md:table-cell">{displayRole(item.role)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    <ReportPagination {...pagination} />
    </>
  )
}

export function DailyWorkTable({ report }: Readonly<{ report: AnalysisReport }>) {
  const pagination = useReportPage(report.timeEntries)
  if (report.timeEntries.length === 0) {
    return <InlineState visual="activity" title="ไม่พบ Daily Work ในช่วงและตัวกรองนี้" description="ลองปรับช่วงวันหรือตัวกรองเพื่อดูชั่วโมงจริง" />
  }

  return (
    <>
    <Table className="w-full table-fixed text-left text-sm [&_th]:whitespace-normal [&_td]:whitespace-normal [&_td]:align-top">
      <TableHeader className="bg-muted/50 text-xs text-muted-foreground">
        <TableRow>
          <TableHead className="w-[27%] px-3 py-3 font-medium">วันที่</TableHead>
          <TableHead className="w-[53%] px-3 py-3 font-medium">รายละเอียดต้นทาง</TableHead>
          <TableHead className="w-[20%] px-3 py-3 text-right font-medium">ชั่วโมง</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="divide-y divide-border/60">
        {pagination.rows.map((entry) => {
          const dayHref = analysisDailyWorkHref(report.meta.filters, { startDate: entry.date, endDate: entry.date })
          return (
            <TableRow key={entry.id} className="align-top">
              <TableCell className="px-3 py-3">
                <Link href={dayHref} className="text-link underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {entry.date}
                </Link>
              </TableCell>
              <TableCell className="min-w-0 px-3 py-3">
                <span className="content-wrap block">{entry.description || entry.workItem?.title || 'ไม่มีรายละเอียด'}</span>
                {entry.workItem && (
                  <span className="mt-1 content-wrap block text-xs text-muted-foreground">
                    {entry.workItem.project.company?.displayName ?? entry.workItem.project.company?.name ?? 'ไม่ระบุ Company'} · {entry.workItem.project.name} · {entry.workItem.title}
                  </span>
                )}
                {entry.remarks && <span className="mt-1 content-wrap block text-xs text-muted-foreground">หมายเหตุ: {entry.remarks}</span>}
                <span className="content-wrap mt-1 block text-xs text-muted-foreground">TimeEntry {entry.id}</span>
              </TableCell>
              <TableCell className="px-3 py-3 content-wrap text-right font-medium tabular-nums">{entry.hours}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
    <ReportPagination {...pagination} />
    </>
  )
}

export function HoursPeriodTable({ report }: Readonly<{ report: AnalysisReport }>) {
  const pagination = useReportPage(report.loggedHoursByPeriod)
  if (report.loggedHoursByPeriod.length === 0) return null

  return (
    <>
    <Table className="w-full table-fixed text-left text-xs [&_th]:whitespace-normal [&_td]:whitespace-normal [&_td]:align-top">
      <TableHeader className="bg-muted/50 text-muted-foreground">
        <TableRow>
          <TableHead className="w-[58%] px-3 py-3 font-medium">ช่วงวันที่</TableHead>
          <TableHead className="w-[20%] px-3 py-3 text-right font-medium">ชั่วโมง</TableHead>
          <TableHead className="w-[22%] px-3 py-3 text-right font-medium">ต้นทาง</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="divide-y divide-border/60">
        {pagination.rows.map((row) => (
          <TableRow key={row.startDate}>
            <TableCell className="content-wrap px-3 py-3">{row.startDate} – {row.endDate}</TableCell>
            <TableCell className="px-3 py-3 content-wrap text-right font-medium tabular-nums">{row.hours}</TableCell>
            <TableCell className="px-3 py-3 text-right">
              <Link
                href={analysisDailyWorkHref(report.meta.filters, { startDate: row.startDate, endDate: row.endDate })}
                className="text-link underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Daily Work
              </Link>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    <ReportPagination {...pagination} />
    </>
  )
}
