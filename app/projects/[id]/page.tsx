'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { PAGE_HEADING, PAGE_INNER, PAGE_MAIN, PAGE_TOOLBAR } from '@/components/layout/page-layout'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { SummaryStatCard } from '@/components/layout/summary-stat-card'
import { PageState } from '@/components/layout/page-state'
import { useRouter } from 'next/navigation'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type Project = {
  id: string; name: string; description: string | null; status: string; priority: string; startDate: string; dueDate: string;
  company: { id: string; name: string; displayName: string | null } | null;
  summary: { statusCounts: Record<string, number>; roles: Record<string, number>; total: number; completed: number; progress: number; hours: string };
  workItems: Array<{ id: string; title: string; kind: string; status: string; role: string | null; dueDate: string | null }>;
  timeEntries: Array<{ id: string; workItemId: string | null; date: string; hours: string }>;
}

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`/api/projects/${id}`)
        const result = await response.json()
        if (!response.ok) throw new Error(result.error?.message ?? 'ไม่พบ Project')
        setProject(result.project)
      } catch (error) { setMessage(error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ') }
      finally { setLoading(false) }
    }
    load()
  }, [id])
  const deleteProject = async () => {
    setDeleting(true)
    setMessage('')
    try {
      const response = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
      const result = await response.json()
      if (!response.ok) {
        const code = result.error?.code
        throw new Error([code, result.error?.message].filter(Boolean).join(': ') || 'ลบ Project ไม่สำเร็จ')
      }
      router.push('/projects')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'ลบ Project ไม่สำเร็จ')
    } finally {
      setDeleting(false)
    }
  }
  return <SidebarProvider><AppSidebar /><SidebarInset><AppHeader /><main className={PAGE_MAIN}><div className={PAGE_INNER}>
    <div className={PAGE_TOOLBAR}><div className="min-w-0"><p className="page-eyebrow mb-2">Project workspace</p><Link href="/projects" className="text-sm text-link underline">← Projects</Link><h1 className={PAGE_HEADING}>{project?.name ?? 'Project detail'}</h1></div>{project && <Button variant="destructive" onClick={() => setDeleteOpen(true)}>ลบ Project</Button>}</div>
    {loading && <PageState kind="loading" title="กำลังโหลด Project…" />}
    {message && <PageState kind="error" title="คำขอ Project ไม่สำเร็จ" description={message} />}
    {project && <div className="space-y-5">
      <section aria-label="สรุป Project" className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <SummaryStatCard label="ความคืบหน้า" value={`${project.summary.progress.toFixed(1)}%`} hint={`${project.summary.completed}/${project.summary.total} Work Items`} />
        <SummaryStatCard label="Work Items ทั้งหมด" value={project.summary.total} />
        <SummaryStatCard label="ชั่วโมงจริง" value={project.summary.hours} />
      </section>
      <Card className="surface-raised"><CardHeader><CardTitle>ภาพรวม Project</CardTitle></CardHeader><CardContent className="grid min-w-0 gap-5 text-sm sm:grid-cols-2">
        <div><p className="mb-2 text-xs text-muted-foreground">Company</p><p className="font-semibold">{project.company?.displayName ?? project.company?.name ?? 'ยังไม่ผูก Company'}</p></div>
        <div><p className="mb-2 text-xs text-muted-foreground">สถานะและ Priority</p><div className="flex flex-wrap gap-2"><Badge variant="secondary">{project.status}</Badge><Badge variant="outline">{project.priority}</Badge></div></div>
        <div><p className="mb-2 text-xs text-muted-foreground">ช่วงเวลา · Asia/Bangkok</p><p>{project.startDate} → {project.dueDate}</p></div>
        <p className="whitespace-pre-wrap break-words text-muted-foreground">{project.description}</p>
      </CardContent></Card>
      <div className="grid gap-5 md:grid-cols-2">
        <Card><CardHeader><CardTitle>สถานะ Work Items</CardTitle></CardHeader><CardContent>{Object.entries(project.summary.statusCounts).length ? Object.entries(project.summary.statusCounts).map(([status, count]) => <div key={status} className="data-row flex items-center justify-between gap-3 text-sm"><span>{status}</span><Badge variant="secondary">{count}</Badge></div>) : <PageState title="ยังไม่มี Work Items" />}</CardContent></Card>
        <Card><CardHeader><CardTitle>Functional roles</CardTitle></CardHeader><CardContent>{Object.entries(project.summary.roles).map(([role, count]) => <div key={role} className="data-row flex items-center justify-between gap-3 text-sm"><span>{role}</span><Badge variant="outline">{count}</Badge></div>)}</CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Work Items</CardTitle></CardHeader><CardContent className="space-y-4">{project.workItems.length ? project.workItems.map((item) => <div key={item.id} className="data-row flex min-w-0 flex-wrap justify-between gap-2 text-sm"><div className="min-w-0"><p className="break-words font-medium">{item.title}</p><p className="mt-1 text-xs text-muted-foreground">{item.kind} · {item.role ?? 'ไม่ระบุ role'}</p></div><div className="flex items-center gap-2"><Badge variant="outline">{item.status}</Badge><span className="text-xs text-muted-foreground">{item.dueDate ?? 'ไม่มีกำหนด'}</span></div></div>) : <PageState title="ยังไม่มี Work Items" />}<Button variant="outline" asChild><Link href={`/work-items?projectId=${project.id}`}>เปิด Work Items</Link></Button></CardContent></Card>
      <Card><CardHeader><CardTitle>Daily Work</CardTitle></CardHeader><CardContent className="space-y-4">{project.timeEntries.length ? project.timeEntries.map((entry) => <div key={entry.id} className="data-row flex flex-wrap items-center justify-between gap-2 text-sm"><div><p className="font-medium">{entry.date}</p><p className="mt-1 break-all text-xs text-muted-foreground">WorkItem {entry.workItemId ?? 'legacy: ไม่ผูกงาน'}</p></div><Badge variant="secondary">{entry.hours} ชั่วโมง</Badge></div>) : <PageState title="ยังไม่มี TimeEntries" />}<Button variant="outline" asChild><Link href="/daily-work">เปิด Daily Work</Link></Button></CardContent></Card>
    </div>}
    <AlertDialog open={deleteOpen} onOpenChange={(open) => { if (!deleting) setDeleteOpen(open) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>ยืนยันการลบ Project</AlertDialogTitle>
          <AlertDialogDescription>ลบ {project?.name} ใช่หรือไม่? Project ที่มี Work Items, Daily Work หรือประวัติจะถูกปฏิเสธ</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>ยกเลิก</AlertDialogCancel>
          <AlertDialogAction disabled={deleting} onClick={(event) => { event.preventDefault(); return deleteProject() }}>{deleting ? 'กำลังลบ...' : 'ยืนยันลบ Project'}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div></main></SidebarInset></SidebarProvider>
}
