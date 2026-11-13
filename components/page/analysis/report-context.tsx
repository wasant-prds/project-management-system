import { formatUiDate } from '@/lib/display-date'
import type { AnalysisReport } from '@/lib/analysis-export'
import { WORK_ITEM_ROLE_LABELS } from '@/lib/work-items'

export function ReportContext({ report }: Readonly<{ report: AnalysisReport }>) {
  const { filters, period } = report.meta
  const company = report.filterOptions.companies.find((item) => item.id === filters.companyId)
  const project = report.filterOptions.projects.find((item) => item.id === filters.projectId)
  const role = filters.role === 'none' ? 'ไม่ระบุ role'
    : WORK_ITEM_ROLE_LABELS[filters.role as keyof typeof WORK_ITEM_ROLE_LABELS] ?? filters.role ?? 'ทุก role'
  const values = [
    ['Company', company?.displayName ?? company?.name ?? filters.companyId ?? 'ทุก Company'],
    ['Project', project?.name ?? filters.projectId ?? 'ทุก Project'],
    ['Functional role', role],
    ['ชนิดงาน', filters.kind ?? 'ทุกชนิดงาน'],
  ]
  return (
    <section aria-label="ช่วงเวลาและตัวกรองที่ใช้กับรายงาน" className="min-w-0 space-y-3 border-b border-border/60 pb-4">
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-2">
        <p className="font-medium">{formatUiDate(period.startDate)} – {formatUiDate(period.endDate)} <span className="text-xs font-normal text-muted-foreground">Asia/Bangkok</span></p>
        <p className="text-sm text-muted-foreground">หน่วย: รายการ · ชั่วโมง · อัตราสำเร็จ <strong className="font-semibold text-foreground tabular-nums">{report.summary.completionRate.toFixed(1)}%</strong></p>
      </div>
      <dl className="flex min-w-0 flex-wrap gap-x-5 gap-y-2 text-xs">
        {values.map(([label, value]) => <div key={label} className="min-w-0 max-w-full"><dt className="text-muted-foreground">{label}</dt><dd className="break-words font-medium">{value}</dd></div>)}
      </dl>
    </section>
  )
}
