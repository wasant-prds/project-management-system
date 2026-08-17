'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ScrollablePanel } from '@/components/ui/scrollable-panel'

export type SearchSelectOption = {
  id: string
  label: string
  hint?: string
}

type SearchSelectProps = {
  value: string
  options: SearchSelectOption[]
  onSelect: (id: string) => void
  placeholder: string
  searchPlaceholder: string
  emptyText: string
  disabled?: boolean
  disabledHint?: string
}

export function SearchSelect({
  value,
  options,
  onSelect,
  placeholder,
  searchPlaceholder,
  emptyText,
  disabled = false,
  disabledHint,
}: Readonly<SearchSelectProps>) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const selected = options.find((option) => option.id === value)
  const triggerLabel = selected?.label || (disabled ? disabledHint : undefined) || placeholder
  const filtered = search.trim()
    ? options.filter((option) =>
        `${option.label} ${option.hint ?? ''}`.toLowerCase().includes(search.toLowerCase()),
      )
    : options

  return (
    <Popover
      modal
      open={open}
      onOpenChange={(next) => {
        if (disabled) return
        setOpen(next)
        if (!next) setSearch('')
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-expanded={open}
          disabled={disabled}
          className="h-auto min-h-10 w-full justify-between px-3 py-2 text-left font-normal"
        >
          <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-muted-foreground')}>
            {triggerLabel}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        collisionPadding={16}
        className="z-[100] w-[var(--radix-popover-trigger-width)] pointer-events-auto p-0"
        onOpenAutoFocus={(event) => event.preventDefault()}
        onWheel={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="border-b p-2">
          <Input
            placeholder={searchPlaceholder}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-8"
            autoFocus
          />
        </div>
        <ScrollablePanel className="max-h-[240px]">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
          ) : (
            filtered.map((option) => (
              <button
                key={option.id}
                type="button"
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-accent"
                onClick={() => {
                  onSelect(option.id)
                  setOpen(false)
                  setSearch('')
                }}
              >
                <Check className={cn('mt-0.5 h-4 w-4 shrink-0', value === option.id ? 'opacity-100' : 'opacity-0')} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{option.label}</span>
                  {option.hint && (
                    <span className="block text-xs text-muted-foreground">{option.hint}</span>
                  )}
                </span>
              </button>
            ))
          )}
        </ScrollablePanel>
      </PopoverContent>
    </Popover>
  )
}
