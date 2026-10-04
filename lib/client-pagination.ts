export const REPORT_PAGE_SIZE = 50

/** Bound DOM work while keeping the complete dataset available for export. */
export function paginateRows<T>(rows: readonly T[], requestedPage: number, pageSize = REPORT_PAGE_SIZE) {
  if (!Number.isInteger(pageSize) || pageSize < 1) throw new RangeError('Invalid page size')
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const page = Math.min(pageCount - 1, Math.max(0, Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : 0))
  const start = page * pageSize
  return { rows: rows.slice(start, start + pageSize), page, pageCount, start, total: rows.length }
}
