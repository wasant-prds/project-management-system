'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { paginateRows } from '@/lib/client-pagination'

export function useReportPage<T>(rows: readonly T[]) {
  const [selection, setSelection] = useState({ rows, page: 0 })
  // A new report always starts on its first page, even if row counts match.
  const result = paginateRows(rows, selection.rows === rows ? selection.page : 0)
  return { ...result, onPageChange: (page: number) => setSelection({ rows, page }) }
}

export function ReportPagination({ page, pageCount, start, total, rows, onPageChange }: Readonly<ReturnType<typeof useReportPage>>) {
  if (pageCount <= 1) return null
  return (
    <nav aria-label="หน้าตารางรายงาน" className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-3">
      <output className="text-xs text-muted-foreground" aria-live="polite">{start + 1}–{start + rows.length} จาก {total} รายการ</output>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => onPageChange(page - 1)}>ก่อนหน้า</Button>
        <span className="text-xs tabular-nums">{page + 1} / {pageCount}</span>
        <Button type="button" variant="outline" size="sm" disabled={page === pageCount - 1} onClick={() => onPageChange(page + 1)}>ถัดไป</Button>
      </div>
    </nav>
  )
}
