'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { PAGE_HEADING, PAGE_INNER, PAGE_MAIN, PAGE_TOOLBAR } from '@/components/layout/page-layout'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
    <div className={PAGE_TOOLBAR}><div><Link href="/projects" className="text-sm text-primary underline">← Projects</Link><h1 className={PAGE_HEADING}>{project?.name ?? 'Project detail'}</h1></div>{project && <Button variant="destructive" onClick={() => setDeleteOpen(true)}>ลบ Project</Button>}</div>
    {loading && <p>กำลังโหลด...</p>}
    {message && <output className="block rounded border p-3 text-sm">{message}</output>}
    {project && <div className="space-y-5">
      <Card><CardHeader><CardTitle>Project overview</CardTitle></CardHeader><CardContent className="grid gap-2 text-sm sm:grid-cols-2"><p>Company: {project.company?.displayName ?? project.company?.name ?? 'ยังไม่ผูก Company'}</p><p>สถานะ: {project.status} · {project.priority}</p><p>วันที่: {project.startDate} ถึง {project.dueDate} (Asia/Bangkok)</p><p>Progress: {project.summary.progress.toFixed(1)}% ({project.summary.completed}/{project.summary.total})</p><p>ชั่วโมงจริง: {project.summary.hours}</p><p>{project.description}</p></CardContent></Card>
      <div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle>Status counts</CardTitle></CardHeader><CardContent>{Object.entries(project.summary.statusCounts).length ? Object.entries(project.summary.statusCounts).map(([status, count]) => <p key={status}>{status}: {count}</p>) : <p>ยังไม่มี Work Items</p>}</CardContent></Card><Card><CardHeader><CardTitle>Functional roles</CardTitle></CardHeader><CardContent>{Object.entries(project.summary.roles).map(([role, count]) => <p key={role}>{role}: {count}</p>)}</CardContent></Card></div>
      <Card><CardHeader><CardTitle>Work Items</CardTitle></CardHeader><CardContent className="space-y-2">{project.workItems.length ? project.workItems.map((item) => <div key={item.id} className="flex flex-wrap justify-between gap-2 rounded border p-2 text-sm"><span>{item.title} · {item.kind} · {item.role ?? 'ไม่ระบุ role'}</span><span>{item.status} · {item.dueDate ?? 'ไม่มีกำหนด'}</span></div>) : <p>ยังไม่มี Work Items</p>}<Button variant="outline" asChild><Link href={`/work-items?projectId=${project.id}`}>เปิด Work Items</Link></Button></CardContent></Card>
      <Card><CardHeader><CardTitle>Daily Work</CardTitle></CardHeader><CardContent className="space-y-2">{project.timeEntries.length ? project.timeEntries.map((entry) => <p key={entry.id} className="rounded border p-2 text-sm">{entry.date} · {entry.hours} ชั่วโมง · WorkItem {entry.workItemId ?? 'legacy: ไม่ผูกงาน'}</p>) : <p>ยังไม่มี TimeEntries</p>}<Button variant="outline" asChild><Link href="/daily-work">เปิด Daily Work</Link></Button></CardContent></Card>
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
