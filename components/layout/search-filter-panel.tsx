'use client'

import { useId, useRef, useState, type ReactNode } from 'react'
import { Search, SlidersHorizontal, X, RotateCcw, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

type SearchFilterPanelProps = {
  children: ReactNode
  activeCount?: number
  summary?: string
  description?: string
  onReset?: () => void
  showActions?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  disabled?: boolean
}

/** One compact header entry point; portalled controls stay usable above scroll containers. */
export function SearchFilterPanel({
  children, activeCount = 0, summary, onReset, showActions = true,
  description = 'ปรับคำค้นหาและตัวกรองเพื่ออัปเดตรายการทันที',
  open: controlledOpen, onOpenChange, disabled,
}: Readonly<SearchFilterPanelProps>) {
  const [localOpen, setLocalOpen] = useState(false)
  const titleId = useId()
  const descriptionId = useId()
  const contentRef = useRef<HTMLDivElement>(null)
  const open = controlledOpen ?? localOpen
  const setOpen = (value: boolean) => { setLocalOpen(value); onOpenChange?.(value) }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="search-filter-trigger h-10 rounded-[0.875rem] bg-[var(--surface-inset)] shadow-none" disabled={disabled}
          aria-label={`ค้นหาและตัวกรอง${activeCount ? ` · ใช้อยู่ ${activeCount}` : ''}`} title={summary}>
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-left">ค้นหาและตัวกรอง</span>
          {activeCount > 0 && <b className="search-filter-count" aria-hidden="true">{activeCount}</b>}
          <span className="search-filter-divider" aria-hidden="true" />
          <SlidersHorizontal className="size-4 shrink-0" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={10} collisionPadding={16} className="search-filter-panel w-[min(42rem,calc(100vw-2rem))] rounded-[1.25rem] p-0"
        ref={contentRef}
        onOpenAutoFocus={(event) => {
          const field = contentRef.current?.querySelector<HTMLElement>('.search-filter-body input:not([type="hidden"]):not([disabled]), .search-filter-body button:not([disabled])')
          if (field) { event.preventDefault(); field.focus() }
        }}
        aria-labelledby={titleId} aria-describedby={descriptionId}>
        <div className="search-filter-heading">
          <div className="min-w-0 space-y-1">
            <h2 id={titleId} className="text-base font-semibold tracking-tight">ค้นหาและตัวกรอง</h2>
            <p id={descriptionId} className="text-xs leading-relaxed text-muted-foreground">{description}</p>
          </div>
          <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 rounded-full" aria-label="ปิดแผงค้นหาและตัวกรอง" onClick={() => setOpen(false)}><X className="size-4" /></Button>
        </div>
        <div className="search-filter-body">{children}</div>
        {showActions && <div className="search-filter-footer">
          {onReset && <Button type="button" variant="ghost" size="sm" onClick={onReset}><RotateCcw className="size-3.5" />ล้างตัวกรอง</Button>}
          <Button type="button" size="sm" className="ml-auto" onClick={() => setOpen(false)}>แสดงผลลัพธ์<ArrowRight className="size-3.5" /></Button>
        </div>}
      </PopoverContent>
    </Popover>
  )
}

export function FilterField({ label, children, className }: Readonly<{ label: string; children: ReactNode; className?: string }>) {
  return <label className={cn('grid min-w-0 content-start gap-2 text-xs font-medium text-muted-foreground [&_button]:text-foreground [&_input]:text-foreground', className)}><span>{label}</span>{children}</label>
}
