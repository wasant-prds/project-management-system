'use client'

import { useState, type ComponentProps } from 'react'
import { RetryableLazy } from '@/components/ui/retryable-lazy'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { CALENDAR_HEIGHT_CLASS } from '@/components/ui/calendar-layout'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DIALOG_SHELL_WIDE_CLASS } from '@/components/ui/responsive-dialog'
import type { Calendar } from '@/components/ui/calendar'
import type { WorkLogDialog } from './work-log-dialog'

const loadCalendar = () => import('@/components/ui/calendar').then((module) => ({ default: module.Calendar }))
const loadWorkLogDialog = () => import('./work-log-dialog').then((module) => ({ default: module.WorkLogDialog }))

export function DeferredCalendar(props: ComponentProps<typeof Calendar>) {
  return <RetryableLazy loader={loadCalendar} componentProps={props}
    loading={<Skeleton className={`${CALENDAR_HEIGHT_CLASS} w-full`} />}
    error={(retry) => <div role="alert" className={`${CALENDAR_HEIGHT_CLASS} flex flex-col items-center justify-center gap-3 rounded-md p-5 text-center text-sm`}>
      <p>โหลดปฏิทินไม่สำเร็จ รายการ Daily Work ยังใช้งานได้</p>
      <Button variant="outline" onClick={retry}>ลองโหลดปฏิทินอีกครั้ง</Button>
    </div>} />
}

function DialogFeedback({ open, onOpenChange, retry }: Readonly<{
  open: boolean; onOpenChange: (open: boolean) => void; retry?: () => void
}>) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className={DIALOG_SHELL_WIDE_CLASS}>
      <DialogHeader className="px-6 pt-6">
        <DialogTitle>{retry ? 'โหลดแบบฟอร์มไม่สำเร็จ' : 'กำลังโหลดแบบฟอร์ม…'}</DialogTitle>
        <DialogDescription>รายการ Daily Work และข้อมูลที่กรอกไว้ยังคงอยู่</DialogDescription>
      </DialogHeader>
      <div className="flex min-h-0 flex-1 items-center justify-center px-6 py-8" role={retry ? 'alert' : 'status'} aria-busy={!retry}>
        {retry ? <p>กรุณาลองโหลดแบบฟอร์มอีกครั้ง</p> : <Skeleton className="h-32 w-full" />}
      </div>
      <DialogFooter className="border-t border-border/60 px-6 py-4">
        <Button variant="outline" onClick={() => onOpenChange(false)}>ยกเลิก</Button>
        {retry && <Button onClick={retry}>ลองโหลดแบบฟอร์มอีกครั้ง</Button>}
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

export function DeferredWorkLogDialog(props: ComponentProps<typeof WorkLogDialog>) {
  const [hasOpened, setHasOpened] = useState(props.open)
  if (props.open && !hasOpened) setHasOpened(true)
  // Load on first open, then retain the controlled Dialog so Radix can finish its exit animation.
  if (!hasOpened && !props.open) return null
  return <RetryableLazy loader={loadWorkLogDialog} componentProps={props}
    loading={<DialogFeedback open={props.open} onOpenChange={props.onOpenChange} />}
    error={(retry) => <DialogFeedback open={props.open} onOpenChange={props.onOpenChange} retry={retry} />} />
}
