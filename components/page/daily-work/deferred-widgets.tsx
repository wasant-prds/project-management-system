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
const loadWorkLogDialog = () => import('./work-log-dialog').then((module) => ({ default: module.WorkLogDialogBody }))

export function DeferredCalendar(props: ComponentProps<typeof Calendar>) {
  return <RetryableLazy loader={loadCalendar} componentProps={props}
    loading={<Skeleton className={`${CALENDAR_HEIGHT_CLASS} w-full`} />}
    error={(retry) => <div role="alert" className={`${CALENDAR_HEIGHT_CLASS} flex flex-col items-center justify-center gap-3 rounded-md p-5 text-center text-sm`}>
      <p>โหลดปฏิทินไม่สำเร็จ รายการ Daily Work ยังใช้งานได้</p>
      <Button variant="outline" onClick={retry}>ลองโหลดปฏิทินอีกครั้ง</Button>
    </div>} />
}

function DialogFeedback({ onOpenChange, retry }: Readonly<{
  onOpenChange: (open: boolean) => void; retry?: () => void
}>) {
  return <>
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
  </>
}

export function DeferredWorkLogDialog(props: ComponentProps<typeof WorkLogDialog>) {
  const [hasOpened, setHasOpened] = useState(props.open)
  if (props.open && !hasOpened) setHasOpened(true)
  // One portal, scrim and focus scope across loading, errors, retries and the form.
  if (!hasOpened && !props.open) return null
  if (props.mode === 'view' && !props.workLog) return null
  return <Dialog open={props.open} onOpenChange={props.onOpenChange}>
    <DialogContent className={DIALOG_SHELL_WIDE_CLASS}>
      <RetryableLazy loader={loadWorkLogDialog} componentProps={props}
        loading={<DialogFeedback onOpenChange={props.onOpenChange} />}
        error={(retry) => <DialogFeedback onOpenChange={props.onOpenChange} retry={retry} />} />
    </DialogContent>
  </Dialog>
}
