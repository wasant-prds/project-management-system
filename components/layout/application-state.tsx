import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { PageState } from './page-state'

/** Route fallback keeps the shared visual language without retrying failed data reads or exposing diagnostics. */
export function ApplicationState({ kind, onRetry }: Readonly<{ kind: 'not-found' | 'error'; onRetry?: () => void }>) {
  const failed = kind === 'error'
  return (
    <main className="flex h-svh min-w-0 flex-col overflow-y-auto bg-background p-4 text-foreground sm:p-6">
      <div className="mx-auto my-auto w-full max-w-lg">
        <PageState
          kind={failed ? 'error' : 'empty'}
          visual={failed ? 'error' : 'not-found'}
          titleAs="h1"
          title={failed ? 'ไม่สามารถแสดงหน้านี้ได้' : 'ไม่พบหน้าที่ต้องการ'}
          description={failed ? 'เกิดข้อผิดพลาดระหว่างแสดงหน้า ลองโหลดหน้านี้อีกครั้ง หรือกลับไปยัง Dashboard' : 'ลิงก์อาจไม่ถูกต้อง หรือหน้านี้ถูกย้ายแล้ว เลือกเมนูจาก Dashboard หรือเปิดรายการ Projects'}
          action={<>
            {failed && onRetry && <Button type="button" onClick={onRetry}>ลองอีกครั้ง</Button>}
            <Button asChild variant={failed ? 'outline' : 'default'}><Link href="/">กลับ Dashboard</Link></Button>
            {!failed && <Button asChild variant="outline"><Link href="/projects">ไปที่ Projects</Link></Button>}
          </>}
        />
      </div>
    </main>
  )
}
