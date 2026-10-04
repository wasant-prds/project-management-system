'use client'

import { Button } from './button'

export function ChartLoadError({ heightClass, onRetry }: Readonly<{ heightClass: string; onRetry: () => void }>) {
  return <div role="alert" className={`${heightClass} flex flex-col items-center justify-center gap-3 rounded-xl border border-border p-5 text-center text-sm`}>
    <p>โหลดกราฟไม่สำเร็จ ข้อมูลส่วนอื่นยังใช้งานได้</p>
    <Button variant="outline" onClick={onRetry}>ลองโหลดกราฟอีกครั้ง</Button>
  </div>
}
