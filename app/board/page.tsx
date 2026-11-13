'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRightLeft, CalendarDays, Loader2 } from 'lucide-react'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { ContentLoadingSkeleton } from '@/components/layout/content-loading-skeleton'
import { InlineState, PageState } from '@/components/layout/page-state'
import {
  PAGE_HEADING,
  PAGE_INNER,
  PAGE_LEAD,
  PAGE_TOOLBAR,
} from '@/components/layout/page-layout'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { SearchFilterPanel } from '@/components/layout/search-filter-panel'
import { FilterSelect, type FilterSelectOption } from '@/components/ui/filter-select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BoardWorkItemDialog } from '@/components/page/board/board-work-item-dialog'
import {
  canApplyBoardLoad,
  formatBoardCalendarDate,
  fetchBoardWorkItems,
  fetchPagedCollection,
  getSelectedBoardWorkItem,
  groupBoardWorkItems,
  patchBoardWorkItemStatus,
  transitionBoardWorkItemStatus,
  type BoardFilters,
  type BoardFetch,
} from '@/components/page/board/board-workflow'
import type { WorkItem } from '@/components/page/work-items/types'
import {
  WORK_ITEM_PRIORITY_LABELS,
  WORK_ITEM_ROLES,
  WORK_ITEM_ROLE_LABELS,
  WORK_ITEM_STATUSES,
  WORK_ITEM_STATUS_LABELS,
  type WorkItemStatusValue,
} from '@/lib/work-items'
import { descriptionPreview } from '@/components/page/work-items/work-item-presentation'
import { WorkItemStatusBadge } from '@/components/page/work-items/work-item-status-badge'
import { ICON_STROKE, loadFailureVisual } from '@/components/ui/product-identity'

type CompanyOption = { id: string; name: string; displayName: string | null }
type ProjectOption = { id: string; name: string; companyId: string | null }

const INITIAL_FILTERS: BoardFilters = { companyId: 'all', projectId: 'all', role: 'all' }

function filterLabel(company: CompanyOption) {
  return company.displayName?.trim() || company.name
}

function BoardFilter({
  id,
  label,
  value,
  disabled,
  onChange,
  options,
}: Readonly<{
  id: string
  label: string
  value: string
  disabled: boolean
  onChange: (value: string) => void
  options: readonly FilterSelectOption[]
}>) {
  return (
    <label htmlFor={id} className="flex min-w-0 flex-col gap-1.5">
      <span className="type-label">{label}</span>
      <FilterSelect id={id} value={value} disabled={disabled} onValueChange={onChange} options={options} />
    </label>
  )
}

function BoardWorkItemCard({
  item,
  saving,
  onOpen,
  onMove,
}: Readonly<{
  item: WorkItem
  saving: boolean
  onOpen: (item: WorkItem) => void
  onMove: (item: WorkItem, status: WorkItemStatusValue) => void
}>) {
  const company = item.project.company?.displayName || item.project.company?.name
  return (
    <Card data-work-item-card={item.id} aria-busy={saving} className="motion-card min-w-0 gap-0 border-border-strong bg-card py-0 shadow-none hover:border-primary/30">
      <CardContent className="min-w-0 space-y-2 p-3">
          <button
            type="button"
            className="content-wrap line-clamp-2 w-full min-w-0 rounded-sm text-left text-sm font-semibold leading-snug text-foreground underline-offset-4 hover:text-link hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-haspopup="dialog"
            onClick={() => onOpen(item)}
          >
            {item.title}
          </button>
        {item.description && <p className="content-wrap line-clamp-1 text-xs text-muted-foreground">{descriptionPreview(item.description, 120)}</p>}
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs font-medium">
            <CalendarDays aria-hidden strokeWidth={ICON_STROKE} className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            {item.dueDate
              ? <time dateTime={item.dueDate}>กำหนดส่ง {formatBoardCalendarDate(item.dueDate)}</time>
              : <span>ไม่กำหนดวันส่ง</span>}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-9 shrink-0"
                disabled={saving}
                aria-label={`เปลี่ยนสถานะ ${item.title}`}
              >
                {saving ? <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" /> : <ArrowRightLeft aria-hidden strokeWidth={ICON_STROKE} className="size-4" />}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-h-72 overflow-y-auto">
              <DropdownMenuLabel>ย้ายไปสถานะ</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {WORK_ITEM_STATUSES.map((status) => (
                <DropdownMenuItem
                  key={status}
                  disabled={saving || status === item.status}
                  onSelect={() => onMove(item, status)}
                >
                  {WORK_ITEM_STATUS_LABELS[status]}
                  {status === item.status && <span className="ml-auto text-xs text-muted-foreground">ปัจจุบัน</span>}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
          <span className="shrink-0">{item.kind} · {WORK_ITEM_PRIORITY_LABELS[item.priority]}</span>
          {item.role && <span className="truncate" title={WORK_ITEM_ROLE_LABELS[item.role]}>{WORK_ITEM_ROLE_LABELS[item.role]}</span>}
        </div>
        <div className="min-w-0 border-t border-border/60 pt-2 text-xs text-muted-foreground">
          <p className="truncate" title={[item.project.name, company].filter(Boolean).join(' · ')}>{item.project.name}{company ? ` · ${company}` : ''}</p>
        </div>
        {saving && <span role="status" className="sr-only">กำลังบันทึกสถานะ {item.title}</span>}
      </CardContent>
    </Card>
  )
}

function BoardStatusColumn({
  status,
  items,
  pendingIds,
  onOpen,
  onMove,
}: Readonly<{
  status: WorkItemStatusValue
  items: WorkItem[]
  pendingIds: ReadonlySet<string>
  onOpen: (item: WorkItem) => void
  onMove: (item: WorkItem, nextStatus: WorkItemStatusValue) => void
}>) {
  return (
    <Card data-board-status={status} className="flex w-[18rem] shrink-0 flex-col gap-0 border-border-strong bg-muted/30 py-0 shadow-none sm:w-80">
      <CardHeader className="grid-rows-1 shrink-0 border-b border-border/60 px-3 py-2 [.border-b]:pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle><h2><WorkItemStatusBadge status={status} /></h2></CardTitle>
          <Badge variant="secondary" aria-label={`${items.length} Work Items`} className="tabular-nums">{items.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="min-h-0 flex-1 space-y-2 p-2">
        {items.length === 0
          ? <p className="px-2 py-4 text-center text-xs text-muted-foreground">ยังไม่มี Work Item ในสถานะนี้</p>
          : items.map((item) => (
            <BoardWorkItemCard
              key={item.id}
              item={item}
              saving={pendingIds.has(item.id)}
              onOpen={onOpen}
              onMove={onMove}
            />
          ))}
      </CardContent>
    </Card>
  )
}

export default function BoardPage() {
  const [workItems, setWorkItems] = useState<WorkItem[]>([])
  const [companies, setCompanies] = useState<CompanyOption[]>([])
  const [projects, setProjects] = useState<ProjectOption[]>([])
  const [filters, setFilters] = useState<BoardFilters>(INITIAL_FILTERS)
  const [filtersLoading, setFiltersLoading] = useState(true)
  const [filtersError, setFiltersError] = useState<string | null>(null)
  const [filtersRetry, setFiltersRetry] = useState(0)
  const [boardLoading, setBoardLoading] = useState(true)
  const [boardError, setBoardError] = useState<string | null>(null)
  const [boardRetry, setBoardRetry] = useState(0)
  const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set())
  const pendingIdsRef = useRef(new Set<string>())
  const boardRequestControllerRef = useRef<AbortController | null>(null)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    const request: BoardFetch = (url, init) => fetch(url, { ...init, signal: controller.signal })
    setFiltersLoading(true)
    setFiltersError(null)
    Promise.all([
      fetchPagedCollection<CompanyOption>(request, '/api/company', 'companies'),
      fetchPagedCollection<ProjectOption>(request, '/api/projects', 'projects'),
    ]).then(
      ([companyRows, projectRows]) => {
        if (!active) return
        setCompanies(companyRows)
        setProjects(projectRows)
        setFiltersLoading(false)
      },
      (error: unknown) => {
        if (!active) return
        setFiltersError(error instanceof Error ? error.message : 'โหลดตัวกรองไม่สำเร็จ')
        setFiltersLoading(false)
      },
    )
    return () => {
      active = false
      controller.abort()
    }
  }, [filtersRetry])

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    boardRequestControllerRef.current = controller
    const request: BoardFetch = (url, init) => fetch(url, { ...init, signal: controller.signal })
    setBoardLoading(true)
    setBoardError(null)
    fetchBoardWorkItems(request, filters).then(
      (items) => {
        if (!active || !canApplyBoardLoad(controller.signal, pendingIdsRef.current.size)) return
        setWorkItems(items)
        setSelectedItemId((currentId) => getSelectedBoardWorkItem(items, currentId)?.id ?? null)
        setBoardLoading(false)
      },
      (error: unknown) => {
        if (!active || !canApplyBoardLoad(controller.signal, pendingIdsRef.current.size)) return
        setBoardError(error instanceof Error ? error.message : 'โหลด Board ไม่สำเร็จ')
        setBoardLoading(false)
      },
    )
    return () => {
      active = false
      controller.abort()
      if (boardRequestControllerRef.current === controller) boardRequestControllerRef.current = null
    }
  }, [filters, boardRetry])

  const groupedWorkItems = useMemo(() => groupBoardWorkItems(workItems), [workItems])
  const selectedItem = useMemo(
    () => getSelectedBoardWorkItem(workItems, selectedItemId),
    [selectedItemId, workItems],
  )
  const visibleProjects = useMemo(
    () => filters.companyId === 'all'
      ? projects
      : projects.filter((project) => project.companyId === filters.companyId),
    [filters.companyId, projects],
  )

  const handleStatusChange = (item: WorkItem, status: WorkItemStatusValue) => {
    if (pendingIdsRef.current.has(item.id) || item.status === status) return
    boardRequestControllerRef.current?.abort()
    pendingIdsRef.current.add(item.id)
    setPendingIds((current) => new Set(current).add(item.id))
    setStatusError(null)
    setStatusMessage(null)

    transitionBoardWorkItemStatus(
      workItems,
      item.id,
      status,
      () => patchBoardWorkItemStatus(fetch, item.id, status),
      setWorkItems,
    ).then(
      (result) => {
        if (result.ok) setStatusMessage(`บันทึกสถานะ ${WORK_ITEM_STATUS_LABELS[status]} แล้ว`)
        else setStatusError(`บันทึกสถานะไม่สำเร็จ: ${result.message}`)
        pendingIdsRef.current.delete(item.id)
        setPendingIds((current) => {
          const next = new Set(current)
          next.delete(item.id)
          return next
        })
        if (pendingIdsRef.current.size === 0) setBoardRetry((value) => value + 1)
      },
      () => {
        setWorkItems((current) => current.map((workItem) => (
          workItem.id === item.id ? { ...workItem, status: item.status } : workItem
        )))
        setStatusError('บันทึกสถานะไม่สำเร็จ กรุณาลองอีกครั้ง')
        pendingIdsRef.current.delete(item.id)
        setPendingIds((current) => {
          const next = new Set(current)
          next.delete(item.id)
          return next
        })
        if (pendingIdsRef.current.size === 0) setBoardRetry((value) => value + 1)
      },
    )
  }

  const updateFilter = (key: keyof BoardFilters, value: string) => {
    setFilters((current) => ({
      ...current,
      [key]: value,
      ...(key === 'companyId' ? { projectId: 'all' } : {}),
    }))
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
          <div className={`${PAGE_INNER} flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden`}>
            <div className={`${PAGE_TOOLBAR} shrink-0 flex-col items-stretch sm:flex-row sm:items-center`}>
              <div className="min-w-0">
                <p className="page-eyebrow mb-2">Workflow board</p>
                <h1 className={PAGE_HEADING}>Kanban Board</h1>
                <p className={PAGE_LEAD}>ดูและเปลี่ยนสถานะของ Work Item จากระบบหลัก</p>
              </div>
              <div className="page-header-actions">
                <SearchFilterPanel summary={[
                  filters.companyId !== 'all' ? companies.find((company) => company.id === filters.companyId)?.displayName || companies.find((company) => company.id === filters.companyId)?.name || 'Company ที่เลือก' : '',
                  filters.projectId !== 'all' ? projects.find((project) => project.id === filters.projectId)?.name || 'Project ที่เลือก' : '',
                  filters.role === 'none' ? 'ไม่ระบุบทบาท' : filters.role !== 'all' ? WORK_ITEM_ROLE_LABELS[filters.role as keyof typeof WORK_ITEM_ROLE_LABELS] : '',
                ].filter(Boolean).join(' · ')} activeCount={Object.values(filters).filter((value) => value !== 'all').length} disabled={pendingIds.size > 0} onReset={() => setFilters(INITIAL_FILTERS)}>
                  <section aria-label="ตัวกรอง Board" className="search-filter-fields">
                    <BoardFilter
                      id="board-company-filter"
                      label="Company"
                      value={filters.companyId}
                      disabled={filtersLoading || Boolean(filtersError) || pendingIds.size > 0}
                      onChange={(value) => updateFilter('companyId', value)}
                      options={[{ value: 'all', label: 'ทุก Company' }, ...companies.map((company) => ({ value: company.id, label: filterLabel(company) }))]}
                    />
                    <BoardFilter
                      id="board-project-filter"
                      label="Project"
                      value={filters.projectId}
                      disabled={filtersLoading || Boolean(filtersError) || pendingIds.size > 0}
                      onChange={(value) => updateFilter('projectId', value)}
                      options={[{ value: 'all', label: 'ทุก Project' }, ...visibleProjects.map((project) => ({ value: project.id, label: project.name }))]}
                    />
                    <BoardFilter
                      id="board-role-filter"
                      label="Functional role"
                      value={filters.role}
                      disabled={filtersLoading || Boolean(filtersError) || pendingIds.size > 0}
                      onChange={(value) => updateFilter('role', value)}
                      options={[{ value: 'all', label: 'ทุกบทบาท' }, ...WORK_ITEM_ROLES.map((role) => ({ value: role, label: WORK_ITEM_ROLE_LABELS[role] })), { value: 'none', label: 'ไม่ระบุบทบาท' }]}
                    />
                  </section>
                </SearchFilterPanel>
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  disabled={pendingIds.size > 0}
                  onClick={() => setBoardRetry((value) => value + 1)}
                >
                  โหลด Board ใหม่
                </Button>
              </div>
            </div>

            {filtersError && (
              <InlineState className="shrink-0" kind="error" visual={loadFailureVisual(filtersError)} title="โหลดตัวกรองไม่สำเร็จ" description={filtersError} action={<Button type="button" variant="outline" size="sm" onClick={() => setFiltersRetry((value) => value + 1)}>ลองโหลดตัวกรองอีกครั้ง</Button>} />
            )}
            {statusError && <p role="alert" className="shrink-0 py-2 text-sm text-danger">{statusError}</p>}
            {statusMessage && <output className="shrink-0 py-2 text-sm text-muted-foreground" aria-live="polite">{statusMessage}</output>}

            <section aria-label="Work Items by status" aria-busy={boardLoading} className="cinematic-beat-data flex min-h-0 min-w-0 flex-1 flex-col pt-3">
              {boardLoading && <div role="status" aria-busy="true" className="min-h-0 space-y-3 overflow-hidden"><p className="text-sm text-muted-foreground">กำลังโหลด Work Items…</p><ContentLoadingSkeleton layout="board" /></div>}
              {!boardLoading && boardError && (
                <PageState kind="error" visual={loadFailureVisual(boardError)} title="โหลด Board ไม่สำเร็จ" description={boardError} action={<Button type="button" variant="outline" onClick={() => setBoardRetry((value) => value + 1)}>ลองอีกครั้ง</Button>} />
              )}
              {!boardLoading && !boardError && (
                <div className="motion-data-enter min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain">
                  <div className="flex min-h-full min-w-max items-start gap-3 pb-4 sm:gap-4">
                    {WORK_ITEM_STATUSES.map((status) => (
                      <BoardStatusColumn
                        key={status}
                        status={status}
                        items={groupedWorkItems[status]}
                        pendingIds={pendingIds}
                        onOpen={(selected) => setSelectedItemId(selected.id)}
                        onMove={handleStatusChange}
                      />
                    ))}
                  </div>
                </div>
              )}
            </section>
          </div>
        </main>
      </SidebarInset>
      <BoardWorkItemDialog item={selectedItem} onOpenChange={(open) => { if (!open) setSelectedItemId(null) }} />
    </SidebarProvider>
  )
}
