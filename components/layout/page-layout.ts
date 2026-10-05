/** Shared responsive page chrome: phone < 640px, tablet 640–1023px, desktop 1024px+. */

export const PAGE_MAIN =
  'min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain'

export const PAGE_INNER = 'min-w-0 mx-auto w-full max-w-[1600px] space-y-5 p-4 sm:space-y-6 sm:p-6 lg:space-y-7 lg:p-8 cinematic-settle'

export const PAGE_TOOLBAR =
  'page-toolbar flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between'

export const PAGE_HEADING = 'page-heading type-display content-wrap min-w-0 text-balance'

export const PAGE_LEAD = 'type-body text-muted-foreground mt-2 max-w-2xl'

export function collectionCountLabel(loading: boolean, failed: boolean, count: number, noun: string) {
  if (loading) return 'กำลังโหลด…'
  if (failed) return 'โหลดไม่สำเร็จ'
  return `${count} ${noun}`
}

export const STAT_GRID = 'grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4'

export const FILTER_ROW = 'flex flex-col gap-3 lg:flex-row lg:items-center'

export const ACTION_LABEL_CLASS = 'hidden sm:inline'

export const TAB_SCROLL_CLASS = '-mx-1 overflow-x-auto overscroll-x-contain px-1'

export const TAB_TRIGGER_CLASS = 'flex-none shrink-0'
