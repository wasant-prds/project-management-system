import Link from 'next/link'
import { ArrowUpRight, CalendarDays, FolderKanban } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'

type PortfolioProject = {
  id: string
  name: string
  status: string
  priority: string
  dueDate: string
  company: { name: string; displayName: string | null } | null
  summary: { total: number; completed: number; open: number; progress: number; hours: string }
}

export function PortfolioCard({ project, onEdit }: Readonly<{ project: PortfolioProject; onEdit: (id: string) => void }>) {
  return (
    <Card className="surface-raised motion-card gap-4 hover:border-primary/40">
      <CardHeader>
        <div className="flex min-w-0 items-start gap-3">
          <span className="surface-inset flex size-10 shrink-0 items-center justify-center rounded-xl text-link"><FolderKanban aria-hidden="true" className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="mb-1 truncate text-xs text-muted-foreground">{project.company?.displayName ?? project.company?.name ?? 'ยังไม่ผูก Company'}</p>
            <CardTitle><Link href={`/projects/${encodeURIComponent(project.id)}`} className="content-wrap hover:text-link">{project.name}</Link></CardTitle>
          </div>
          <Button asChild size="icon-sm" variant="ghost"><Link href={`/projects/${encodeURIComponent(project.id)}`} aria-label={`เปิด Project ${project.name}`}><ArrowUpRight aria-hidden="true" /></Link></Button>
        </div>
        <div className="mt-2 flex flex-wrap gap-2"><Badge variant="secondary">{project.status}</Badge><Badge variant="outline">{project.priority}</Badge></div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 text-xs"><span className="text-muted-foreground">ความคืบหน้า</span><span className="font-semibold tabular-nums">{project.summary.progress.toFixed(1)}%</span></div>
          <Progress value={project.summary.progress} aria-label="ความคืบหน้า Project" className="h-2" />
        </div>
        <dl className="grid grid-cols-3 gap-3 border-y border-border/60 py-3">
          <div><dt className="text-xs text-muted-foreground">เสร็จ / ทั้งหมด</dt><dd className="mt-1 font-semibold tabular-nums">{project.summary.completed}/{project.summary.total}</dd></div>
          <div><dt className="text-xs text-muted-foreground">งานที่เปิด</dt><dd className="mt-1 font-semibold tabular-nums">{project.summary.open}</dd></div>
          <div className="min-w-0"><dt className="text-xs text-muted-foreground">ชั่วโมงจริง</dt><dd className="mt-1 break-all font-semibold tabular-nums">{project.summary.hours}</dd></div>
        </dl>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><CalendarDays aria-hidden="true" className="size-3.5" />กำหนด {project.dueDate}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => onEdit(project.id)}>แก้ไข</Button>
        </div>
      </CardContent>
    </Card>
  )
}
