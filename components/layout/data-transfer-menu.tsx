'use client'

import { ArrowDownUp, ChevronDown, Download, FileJson, FileSpreadsheet, FileText, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

type TransferAction = { label: string; onSelect: () => void; disabled?: boolean }
type ExportAction = TransferAction & { format: 'CSV' | 'Markdown' | 'JSON' }

export function DataTransferMenu({ exports, importAction, busy = false }: Readonly<{
  exports: readonly ExportAction[]
  importAction?: TransferAction
  busy?: boolean
}>) {
  const Icon = importAction ? ArrowDownUp : Download
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button type="button" variant="outline" className="data-transfer-trigger h-10 rounded-[0.875rem] shadow-none" disabled={busy || (!importAction && exports.every((action) => action.disabled))}>
        <Icon className="size-4" aria-hidden="true" />
        <span>{busy ? 'กำลังนำเข้า…' : importAction ? 'นำเข้า / ส่งออก' : 'ส่งออก'}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={8} collisionPadding={16} className="data-transfer-menu w-64 p-2">
      {importAction && <>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground">นำเข้าข้อมูล</DropdownMenuLabel>
          <DropdownMenuItem onSelect={importAction.onSelect} disabled={importAction.disabled} aria-label={importAction.label} className="gap-3 rounded-lg p-3">
            <Upload className="size-4" /><span className="flex-1">Import JSON</span><span className="text-[10px] text-muted-foreground">JSON</span>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
      </>}
      <DropdownMenuGroup>
        <DropdownMenuLabel className="text-xs text-muted-foreground">ส่งออกข้อมูล</DropdownMenuLabel>
        <p className="px-2 pb-2 text-[11px] text-muted-foreground">เฉพาะรายการตามตัวกรองปัจจุบัน</p>
        {exports.map((action) => {
          const FormatIcon = action.format === 'CSV' ? FileSpreadsheet : action.format === 'JSON' ? FileJson : FileText
          return <DropdownMenuItem key={action.format} disabled={action.disabled} onSelect={action.onSelect} aria-label={action.label} className="gap-3 rounded-lg p-3">
            <FormatIcon className="size-4" /><span className="flex-1">Export {action.format}</span><Download className="size-3.5 text-muted-foreground" />
          </DropdownMenuItem>
        })}
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
}
