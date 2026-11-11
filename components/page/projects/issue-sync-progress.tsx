'use client'

import { Check, CircleAlert, Loader2 } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import type { IssueSyncProgress } from '@/lib/integrations/issue-sync-stream'

export type IssueSyncProgressState = {
  sourceProject: string
  sourceIndex: number
  totalSources: number
  completedSources: number
  progress: IssueSyncProgress
  status: 'running' | 'success' | 'partial' | 'failed' | 'review'
}
const stages = [
  { phase: 'connecting', label: 'เชื่อมต่อต้นทาง' },
  { phase: 'syncing', label: 'อ่านและบันทึก Issues' },
  { phase: 'checking', label: 'ตรวจประวัติเดิม' },
  { phase: 'finalizing', label: 'สรุปผล' },
] as const

export function IssueSyncProgressPanel({ state }: Readonly<{ state: IssueSyncProgressState }>) {
  const stage =
    state.progress.phase === 'complete'
      ? stages.length
      : stages.findIndex((entry) => entry.phase === state.progress.phase)
  const completed = Math.max(
    state.completedSources,
    state.sourceIndex - 1 + Math.max(0, stage) / stages.length,
  )
  const labels = {
    running: 'กำลัง Sync Issues',
    success: 'Sync เสร็จแล้ว',
    partial: 'Sync จบพร้อมข้อผิดพลาดบางรายการ',
    failed: 'Sync ไม่สำเร็จ',
    review: 'Sync เสร็จแล้ว มีรายการรอยืนยัน',
  }
  const counts = state.progress.counts
  return (
    <section
      aria-label="ความคืบหน้า Issue Sync"
      aria-busy={state.status === 'running'}
      className="min-w-0 space-y-4 rounded-xl border border-primary/20 bg-card p-4 shadow-sm"
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p role="status" aria-live="polite" className="flex items-center gap-2 text-sm font-semibold">
            {state.status === 'running' ? (
              <Loader2 aria-hidden className="h-4 w-4 shrink-0 motion-safe:animate-spin" />
            ) : state.status === 'failed' || state.status === 'partial' ? (
              <CircleAlert aria-hidden className="h-4 w-4 shrink-0 text-destructive" />
            ) : (
              <Check aria-hidden className="h-4 w-4 shrink-0 text-primary" />
            )}
            {labels[state.status]}
          </p>
          <p className="break-words text-xs text-muted-foreground">
            {state.sourceProject} · แหล่งที่ {state.sourceIndex} / {state.totalSources}
          </p>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          เสร็จแล้ว {state.completedSources} / {state.totalSources} แหล่ง
        </span>
      </div>
      <Progress
        aria-label="ความคืบหน้าตามขั้นตอนของ Project"
        value={Math.min(100, (100 * completed) / Math.max(1, state.totalSources))}
      />
      <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="ขั้นตอน Sync ของแหล่งปัจจุบัน">
        {stages.map((entry, index) => (
          <li
            key={entry.phase}
            aria-current={state.status === 'running' && index === stage ? 'step' : undefined}
            className={`min-w-0 rounded-lg border p-2.5 text-xs ${index < stage ? 'border-primary/30 bg-primary/10 text-primary' : index === stage && state.status === 'running' ? 'border-primary/40 bg-accent text-accent-foreground' : 'border-border bg-muted/30 text-muted-foreground'}`}
          >
            <div
              aria-hidden
              className={`mb-2 h-1 rounded-full ${index <= stage ? 'bg-primary' : 'bg-muted'} ${index === stage && state.status === 'running' ? 'motion-safe:animate-pulse' : ''}`}
            />
            <span className="flex items-center gap-1.5">
              {index < stage ? (
                <Check aria-hidden className="h-3 w-3 shrink-0" />
              ) : (
                <span className="tabular-nums">{index + 1}.</span>
              )}
              {entry.label}
            </span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          ประมวลผล{' '}
          <strong className="font-medium tabular-nums text-foreground">{state.progress.processed}</strong>{' '}
          รายการ
        </span>
        <span>เพิ่ม {counts.created}</span>
        <span>อัปเดต {counts.updated}</span>
        <span>ข้าม {counts.skipped}</span>
        <span className={counts.failed ? 'text-destructive' : undefined}>ผิดพลาด {counts.failed}</span>
        <span>รอยืนยัน {counts.pending}</span>
      </div>
    </section>
  )
}
