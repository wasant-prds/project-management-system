'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { IssueReviewDecision, IssueReviewGroup } from '@/lib/integrations/issue-review'

export function IssueSyncReviewDialog({
  groups,
  busy,
  error,
  onClose,
  onConfirm,
}: Readonly<{
  groups: IssueReviewGroup[]
  busy: boolean
  error: string
  onClose: () => void
  onConfirm: (answers: Array<{ runId: string; decisions: IssueReviewDecision[] }>) => void
}>) {
  const [choices, setChoices] = useState<Record<string, string>>({})
  const keyOf = (runId: string, issueId: string) => `${runId}:${issueId}`
  const remaining = groups.reduce(
    (total, group) =>
      total + group.issues.filter((issue) => choices[keyOf(group.runId, issue.issueId)] === undefined).length,
    0,
  )
  const targets = groups.flatMap((group) =>
    group.issues.flatMap((issue) =>
      choices[keyOf(group.runId, issue.issueId)] ? [choices[keyOf(group.runId, issue.issueId)]] : [],
    ),
  )
  const duplicateTarget = new Set(targets).size !== targets.length
  function confirm() {
    if (remaining || busy || duplicateTarget) return
    onConfirm(
      groups.map((group) => ({
        runId: group.runId,
        decisions: group.issues.map((issue) => ({
          issueId: issue.issueId,
          workItemId: choices[keyOf(group.runId, issue.issueId)] || null,
        })),
      })),
    )
  }
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose()
      }}
    >
      <AlertDialogContent className="flex max-h-[90dvh] min-w-0 flex-col sm:max-w-4xl">
        <AlertDialogHeader>
          <AlertDialogTitle>ยืนยัน Issues ที่อาจเป็นรายการเดียวกัน</AlertDialogTitle>
          <AlertDialogDescription>
            พบชื่อคล้ายกันเกิน 60% โดยยังยืนยัน Issue ไม่ได้
            กรุณาเทียบกับรายการเดิมและเลือกคำตอบให้ครบก่อนบันทึก
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="min-h-0 space-y-5 overflow-y-auto overscroll-contain pr-1">
          {groups.map((group) => (
            <section key={group.runId} className="space-y-3" aria-label={`รอยืนยัน ${group.sourceProject}`}>
              <h3 className="break-words font-semibold">{group.sourceProject}</h3>
              {group.issues.map((issue, index) => {
                const name = keyOf(group.runId, issue.issueId)
                return (
                  <fieldset
                    key={issue.issueId}
                    disabled={busy}
                    className="min-w-0 space-y-3 rounded-xl border p-4"
                  >
                    <legend className="max-w-full break-words px-1 text-sm font-semibold">
                      {index + 1}. {issue.title}
                    </legend>
                    <a
                      href={issue.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-link underline"
                    >
                      เปิด Issue ต้นทาง
                    </a>
                    <p className="text-sm text-muted-foreground">เทียบกับ Work Items เดิมใน Project นี้</p>
                    {issue.candidates.map((candidate) => (
                      <label
                        key={candidate.id}
                        className="flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border bg-muted/20 p-3"
                      >
                        <input
                          className="mt-1 shrink-0 accent-primary"
                          type="radio"
                          name={name}
                          value={candidate.id}
                          checked={choices[name] === candidate.id}
                          onChange={() => setChoices((current) => ({ ...current, [name]: candidate.id }))}
                        />
                        <span className="min-w-0 space-y-1 text-sm">
                          <span className="block break-words font-medium">
                            เป็น Issue เดียวกับ: {candidate.title}
                          </span>
                          <span className="block text-muted-foreground">
                            คล้ายกัน {(candidate.similarity * 100).toFixed(1)}% — อัปเดตรายการเดิม
                          </span>
                          {candidate.description && (
                            <span className="block whitespace-pre-wrap break-words text-xs text-muted-foreground">
                              {candidate.description}
                            </span>
                          )}
                          <a
                            href={`/work-items?workItemId=${candidate.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block text-link underline"
                            onClick={(event) => event.stopPropagation()}
                          >
                            ดู Work Item เดิม
                          </a>
                        </span>
                      </label>
                    ))}
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm">
                      <input
                        className="mt-1 shrink-0 accent-primary"
                        type="radio"
                        name={name}
                        value=""
                        checked={choices[name] === ''}
                        onChange={() => setChoices((current) => ({ ...current, [name]: '' }))}
                      />
                      <span>เป็นคนละ Issue กับทุกรายการข้างต้น — สร้างรายการใหม่</span>
                    </label>
                  </fieldset>
                )
              })}
            </section>
          ))}
        </div>
        {error && (
          <p role="alert" className="break-words text-sm text-destructive">
            {error}
          </p>
        )}
        {duplicateTarget && (
          <p role="alert" className="text-sm text-destructive">
            เลือก Work Item เดิมซ้ำกันหลาย Issues กรุณาเลือกปลายทางให้ไม่ซ้ำ
          </p>
        )}
        <AlertDialogFooter className="shrink-0">
          <span role="status" className="self-center text-sm text-muted-foreground">
            รอเลือก {remaining} Issues
          </span>
          <AlertDialogCancel disabled={busy}>ไว้ยืนยันภายหลัง</AlertDialogCancel>
          <Button type="button" disabled={busy || remaining > 0 || duplicateTarget} onClick={confirm}>
            {busy ? 'กำลังบันทึก…' : 'ยืนยันทั้งหมด'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
