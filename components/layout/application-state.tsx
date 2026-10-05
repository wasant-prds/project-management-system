import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PageState } from './page-state'

/** Route fallback keeps the shared visual language without retrying failed data reads. */
export function ApplicationState({ kind, onRetry }: Readonly<{ kind: 'not-found' | 'error'; onRetry?: () => void }>) {
  return (
    <main className="flex h-svh min-w-0 flex-col overflow-y-auto bg-background p-4 text-foreground sm:p-6">
      <div className="mx-auto my-auto w-full max-w-lg">
        <PageState
          kind={kind === 'error' ? 'error' : 'empty'}
          visual={kind === 'error' ? 'error' : 'not-found'}
          title={kind === 'error' ? 'ไม่สามารถแสดงหน้านี้ได้' : 'ไม่พบหน้าที่ต้องการ'}
          description={kind === 'error' ? 'กรุณาลองอีกครั้ง หรือกลับไปยัง Dashboard' : 'หน้านี้อาจถูกย้ายหรือไม่มีอยู่แล้ว กลับไปยัง Dashboard เพื่อเลือกเมนู'}
          action={<div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            {kind === 'error' && onRetry && <Button type="button" onClick={onRetry}>ลองอีกครั้ง</Button>}
            <Button asChild variant="outline"><Link href="/">กลับ Dashboard</Link></Button>
          </div>}
        />
      </div>
    </main>
  )
}
