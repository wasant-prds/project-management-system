'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { formatHours } from '@/lib/decimal-hours'
import { formatUiDate } from '@/lib/display-date'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { PAGE_HEADING, PAGE_INNER, PAGE_MAIN, PAGE_TOOLBAR, TAB_SCROLL_CLASS, TAB_TRIGGER_CLASS } from '@/components/layout/page-layout'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { InlineState, PageState } from '@/components/layout/page-state'
import { loadFailureVisual } from '@/components/ui/product-identity'
import { workItemRoleLabel } from '@/components/page/work-items/work-item-role-label'
import { WorkItemStatusBadge } from '@/components/page/work-items/work-item-status-badge'
import { ProjectIssueSync } from '@/components/page/projects/project-issue-sync'
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
  const [syncRevision, setSyncRevision] = useState(0)
  const [activeTab, setActiveTab] = useState('overview')
  const [loadError, setLoadError] = useState<{ message: string; missing: boolean } | null>(null)
  const [reloadRevision, setReloadRevision] = useState(0)
  const projectLoaded = project !== null
  useEffect(() => {
    const followHash = () => {
      if (window.location.hash === '#integrations') {
        setActiveTab('integrations')
        requestAnimationFrame(() => document.getElementById('integrations')?.scrollIntoView({ block: 'start' }))
      }
    }
    followHash()
    window.addEventListener('hashchange', followHash)
    return () => window.removeEventListener('hashchange', followHash)
  }, [projectLoaded])
  const changeTab = (tab: string) => {
    setActiveTab(tab)
    // Remove the deep link when leaving it, so following the same link works again.
    if (tab === 'integrations' || window.location.hash === '#integrations') {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${tab === 'integrations' ? '#integrations' : ''}`)
    }
  }
  useEffect(() => {
    async function load() {
      let missing = false
      try {
        const response = await fetch(`/api/projects/${id}`)
        missing = response.status === 404
        const result = await response.json()
        if (!response.ok) throw new Error(result.error?.message ?? 'ไม่พบ Project')
        setProject(result.project)
        setLoadError(null)
      } catch (error) { setLoadError({ message: error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ', missing }) }
      finally { setLoading(false) }
    }
    load()
  }, [id, syncRevision, reloadRevision])
  const retryLoad = () => {
    setLoadError(null)
    if (!project) setLoading(true)
    setReloadRevision((revision) => revision + 1)
  }
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
      setDeleteOpen(false)
    } finally {
      setDeleting(false)
    }
  }
  return <SidebarProvider><AppSidebar /><SidebarInset><AppHeader /><main className={PAGE_MAIN}><div className={PAGE_INNER}>
    <div className={PAGE_TOOLBAR}><div className="min-w-0"><p className="page-eyebrow mb-2">Project workspace</p><Link href="/projects" className="text-sm text-link underline">← Projects</Link><h1 id="project-detail-heading" data-shared-id={id} className={PAGE_HEADING}>{project?.name ?? 'Project detail'}</h1></div>{project && <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" disabled={deleting}>จัดการ Project</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem variant="destructive" disabled={deleting} onSelect={() => setDeleteOpen(true)}>ลบ Project</DropdownMenuItem></DropdownMenuContent></DropdownMenu>}</div>
    {loading && <PageState kind="loading" title="กำลังโหลด Project…" />}
    {!loading && !project && loadError && (loadError.missing
      ? <PageState visual="not-found" title="ไม่พบ Project นี้" description="Project อาจถูกลบไปแล้ว หรือลิงก์ไม่ถูกต้อง" action={<Button asChild><Link href="/projects">กลับไปรายการ Projects</Link></Button>} />
      : <PageState kind="error" visual={loadFailureVisual(loadError.message)} title="โหลด Project ไม่สำเร็จ" description={loadError.message} action={<><Button type="button" onClick={retryLoad}>ลองโหลดอีกครั้ง</Button><Button asChild variant="outline"><Link href="/projects">กลับไปรายการ Projects</Link></Button></>} />)}
    {project && loadError && <InlineState kind="error" visual="partial" className="mb-5" title="รีเฟรชข้อมูล Project ไม่สำเร็จ" description="ข้อมูลที่แสดงอยู่อาจยังไม่เป็นล่าสุด" action={<Button type="button" size="sm" variant="outline" onClick={retryLoad}>ลองโหลดอีกครั้ง</Button>} />}
    {project && message && <InlineState kind="error" className="mb-5" title="ลบ Project ไม่สำเร็จ" description={message} action={<Button type="button" size="sm" variant="ghost" onClick={() => setMessage('')}>ปิดข้อความ</Button>} />}
    {project && <div className="space-y-5">
      <Card className="min-w-0"><CardContent className="grid min-w-0 gap-4 pt-5 lg:grid-cols-[1fr_minmax(16rem,1fr)]">
        <div className="min-w-0 space-y-3"><p className="content-wrap font-semibold">{project.company?.displayName ?? project.company?.name ?? 'ยังไม่ผูก Company'}</p><div className="flex flex-wrap gap-2"><Badge variant="secondary">{project.status}</Badge><Badge variant="outline">{project.priority}</Badge></div><p className="text-sm text-muted-foreground">{formatUiDate(project.startDate)} → {formatUiDate(project.dueDate)} · Asia/Bangkok</p></div>
        <section aria-label="สรุป Project" className="min-w-0 space-y-3"><div className="flex flex-wrap items-baseline justify-between gap-2"><span className="type-caption">ความคืบหน้า</span><strong className="type-data">{project.summary.progress.toFixed(1)}%</strong></div><Progress value={project.summary.progress} aria-label="ความคืบหน้า Project" /><div className="flex flex-wrap justify-between gap-3 text-sm"><span className="type-data">{project.summary.completed}/{project.summary.total} Work Items</span><span className="type-data content-wrap">{formatHours(project.summary.hours)} ชั่วโมงจริง</span></div></section>
      </CardContent></Card>
      <Tabs value={activeTab} onValueChange={changeTab} className="min-w-0 gap-4">
        <div className={TAB_SCROLL_CLASS}><TabsList aria-label="พื้นที่ Project" className="w-max"><TabsTrigger className={TAB_TRIGGER_CLASS} value="overview">ภาพรวม</TabsTrigger><TabsTrigger className={TAB_TRIGGER_CLASS} value="work-items">Work Items</TabsTrigger><TabsTrigger className={TAB_TRIGGER_CLASS} value="daily-work">Daily Work</TabsTrigger><TabsTrigger className={TAB_TRIGGER_CLASS} value="integrations">Integrations</TabsTrigger></TabsList></div>
        <TabsContent value="overview" className="min-w-0 space-y-5">
          <Card><CardHeader><CardTitle>ภาพรวม Project</CardTitle></CardHeader><CardContent><p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{project.description || 'ยังไม่มีรายละเอียด Project'}</p></CardContent></Card>
      <div className="grid gap-5 md:grid-cols-2">
        <Card><CardHeader><CardTitle>สถานะ Work Items</CardTitle></CardHeader><CardContent>{Object.entries(project.summary.statusCounts).length ? Object.entries(project.summary.statusCounts).map(([status, count]) => <div key={status} className="data-row flex items-center justify-between gap-3 text-sm"><WorkItemStatusBadge status={status} /><Badge variant="secondary" className="tabular-nums">{count}</Badge></div>) : <InlineState title="ยังไม่มี Work Items" description="สถานะจะสรุปที่นี่เมื่อมี Work Item ใน Project" />}</CardContent></Card>
        <Card><CardHeader><CardTitle>Functional roles</CardTitle></CardHeader><CardContent>{Object.entries(project.summary.roles).length ? Object.entries(project.summary.roles).map(([role, count]) => <div key={role} className="data-row flex items-center justify-between gap-3 text-sm"><span>{workItemRoleLabel(role)}</span><Badge variant="outline" className="tabular-nums">{count}</Badge></div>) : <InlineState title="ยังไม่มี functional role" description="role จะสรุปจาก Work Items ของ Project" />}</CardContent></Card>
      </div>
      </TabsContent><TabsContent value="work-items" className="min-w-0"><Card><CardHeader><CardTitle>Work Items</CardTitle></CardHeader><CardContent className="space-y-4">{project.workItems.length ? project.workItems.map((item) => <div key={item.id} className="data-row flex min-w-0 flex-wrap justify-between gap-2 text-sm"><div className="min-w-0"><Link href={`/work-items?workItemId=${item.id}`} className="content-wrap font-medium text-link underline">{item.title}</Link><p className="mt-1 text-xs text-muted-foreground">{item.kind} · {workItemRoleLabel(item.role)}</p></div><div className="flex items-center gap-2"><WorkItemStatusBadge status={item.status} /><span className="text-xs text-muted-foreground">{item.dueDate ? formatUiDate(item.dueDate) : 'ไม่มีกำหนด'}</span></div></div>) : <PageState density="section" title="ยังไม่มี Work Items ใน Project นี้" description="เปิดหน้า Work Items เพื่อสร้างหรือผูกงานกับ Project" />}<Button asChild><Link href={`/work-items?projectId=${project.id}`}>เปิด Work Items</Link></Button></CardContent></Card>
      </TabsContent><TabsContent value="daily-work" className="min-w-0"><Card><CardHeader><CardTitle>Daily Work</CardTitle></CardHeader><CardContent className="space-y-4">{project.timeEntries.length ? project.timeEntries.map((entry) => <div key={entry.id} className="data-row flex flex-wrap items-center justify-between gap-2 text-sm"><div className="min-w-0 flex-1"><p className="content-wrap font-medium">{entry.workItemId ? <Link href={`/work-items?workItemId=${entry.workItemId}`} className="text-link underline">{project.workItems.find((item) => item.id === entry.workItemId)?.title || 'เปิด Work Item ที่บันทึกเวลา'}</Link> : 'บันทึกเวลาเดิมที่ไม่ได้ผูก Work Item'}</p><p className="mt-1 text-xs text-muted-foreground">{formatUiDate(entry.date)}</p></div><Badge variant="secondary">{formatHours(entry.hours)} ชั่วโมง</Badge></div>) : <PageState density="section" visual="activity" title="ยังไม่มีบันทึกเวลา" description="เวลาที่บันทึกใน Daily Work ของ Project นี้จะแสดงที่นี่" />}<Button variant="outline" asChild><Link href={`/daily-work?projectId=${project.id}`}>เปิด Daily Work</Link></Button></CardContent></Card>
      </TabsContent>
        {/* Keep sync mounted: changing tabs must not abort streams or discard review/history/form state. */}
        <TabsContent value="integrations" forceMount hidden={activeTab !== 'integrations'} className="min-w-0"><ProjectIssueSync projectId={id} onSynced={() => setSyncRevision((revision) => revision + 1)} /></TabsContent>
      </Tabs>
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
