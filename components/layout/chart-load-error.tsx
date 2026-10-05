'use client'

import { Button } from '@/components/ui/button'
import { PageState } from './page-state'

export function ChartLoadError({ heightClass, onRetry }: Readonly<{ heightClass: string; onRetry: () => void }>) {
  return (
    <PageState
      kind="error"
      visual="partial"
      className={heightClass}
      title="โหลดกราฟไม่สำเร็จ"
      description="ข้อมูลส่วนอื่นยังใช้งานได้"
      action={<Button variant="outline" onClick={onRetry}>ลองโหลดกราฟอีกครั้ง</Button>}
    />
  )
}
