'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { PortfolioCard } from '@/components/page/projects/portfolio-card'
import { PageState } from '@/components/layout/page-state'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { PAGE_HEADING, PAGE_INNER, PAGE_LEAD, PAGE_MAIN, PAGE_TOOLBAR } from '@/components/layout/page-layout'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { fetchCollection } from '@/lib/fetch-collection'

type Project = { id: string; name: string; status: string; priority: string; dueDate: string; companyId: string | null; company: { id: string; name: string; displayName: string | null } | null; summary: { total: number; completed: number; open: number; progress: number; hours: string } }
type Company = { id: string; name: string; displayName: string | null }
const initialForm = { name: '', companyId: '', startDate: '', dueDate: '', status: 'Planning', priority: 'Medium' }

async function apiResponse(response: Response) {
  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message ?? 'คำขอไม่สำเร็จ')
  return data
}

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [companies, setCompanies] = useState<Company[]>([])
  const [form, setForm] = useState(initialForm)
  const [editing, setEditing] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [companyFilter, setCompanyFilter] = useState('all')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const loadGeneration = useRef(0)
  const reload = useCallback(async (fresh = false) => {
    const generation = ++loadGeneration.current
    setLoading(true)
    setLoadError('')
    try {
      const [projectData, companyData] = await Promise.all([
        fetchCollection<Project>('/api/projects', 'projects', { fresh }),
        fetchCollection<Company>('/api/company', 'companies', { fresh }),
      ])
      if (generation !== loadGeneration.current) return
      setProjects(projectData); setCompanies(companyData); setMessage('')
    } catch (error) { if (generation === loadGeneration.current) setLoadError(error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ') }
    finally { if (generation === loadGeneration.current) setLoading(false) }
  }, [])
  useEffect(() => {
    const companyId = new URLSearchParams(window.location.search).get('companyId')
    if (companyId) setCompanyFilter(companyId)
    void reload()
    return () => { loadGeneration.current += 1 }
  }, [reload])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true)
    try {
      await apiResponse(await fetch(editing ? `/api/projects/${editing}` : '/api/projects', {
        method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      }))
      setEditing(null); setForm(initialForm); await reload(true)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ') }
    finally { setSaving(false) }
  }
  const editProject = async (id: string) => {
    try {
      const data = await apiResponse(await fetch(`/api/projects/${id}`))
      const item = data.project
      setEditing(item.id)
      setForm({ name: item.name, companyId: item.companyId ?? '', startDate: item.startDate, dueDate: item.dueDate, status: item.status, priority: item.priority })
      document.getElementById('project-form')?.scrollIntoView({ block: 'start' })
    } catch (error) { setMessage(error instanceof Error ? error.message : 'โหลด Project ไม่สำเร็จ') }
  }
  const filtered = projects.filter((project) =>
    (statusFilter === 'all' || project.status === statusFilter) &&
    (companyFilter === 'all' || project.company?.id === companyFilter) &&
    (project.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) || project.company?.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())),
  )
  let projectList: React.ReactNode
  if (loading) {
    projectList = <PageState kind="loading" loadingLayout="cards" title="กำลังโหลด Projects…" />
  } else if (loadError) {
    projectList = <PageState kind="error" title="โหลดข้อมูลไม่สำเร็จ" description={loadError} action={<Button type="button" variant="outline" onClick={() => void reload()}>ลองอีกครั้ง</Button>} />
  } else if (filtered.length === 0) {
    projectList = <PageState title="ไม่พบ Project" description="ลองปรับตัวกรอง หรือสร้าง Project โดยเลือก Company ที่ต้องการ" />
  } else {
    projectList = <div className="cinematic-beat-data motion-stagger grid min-w-0 gap-5 md:grid-cols-2 xl:grid-cols-3">{filtered.map((project) => <PortfolioCard key={project.id} project={project} onEdit={editProject} />)}</div>
  }
  return <SidebarProvider><AppSidebar /><SidebarInset><AppHeader /><main className={PAGE_MAIN}><div className={PAGE_INNER}>
    <div className={PAGE_TOOLBAR}><div><p className="page-eyebrow mb-2">Project portfolio</p><h1 className={PAGE_HEADING}>Projects</h1><p className={PAGE_LEAD}>แต่ละ Project ผูก Company ที่เลือก พร้อมงานจริง</p></div></div>
    {message && <output aria-live="polite" className="surface-inset block rounded-xl border p-4 text-sm">{message}</output>}
    <details id="project-form" open={editing !== null || undefined} className="cinematic-beat-support surface-raised scroll-mt-4 rounded-[var(--radius-panel)] border border-border/60 bg-card py-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 text-sm font-semibold focus-visible:outline-2 sm:px-5"><span>{editing ? 'แก้ไข Project' : 'สร้าง Project'}</span><span aria-hidden="true" className="surface-inset flex size-8 items-center justify-center rounded-lg text-link">+</span></summary><div className="mt-5 px-4 sm:px-5"><form onSubmit={submit} className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3 [&>div]:min-w-0 [&>div]:space-y-2">
      <div><Label htmlFor="project-name">ชื่อ Project *</Label><Input id="project-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></div>
      <div><Label htmlFor="project-company">Company *</Label><Select value={form.companyId} onValueChange={(value) => setForm({ ...form, companyId: value })}><SelectTrigger id="project-company"><SelectValue placeholder="เลือก Company" /></SelectTrigger><SelectContent>{companies.map((company) => <SelectItem key={company.id} value={company.id}>{company.displayName ?? company.name}</SelectItem>)}</SelectContent></Select></div>
      <div><Label htmlFor="project-start">วันเริ่ม *</Label><Input id="project-start" type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} required /></div>
      <div><Label htmlFor="project-due">วันกำหนดเสร็จ *</Label><Input id="project-due" type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} required /></div>
      <div><Label htmlFor="project-status">สถานะ</Label><Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value })}><SelectTrigger id="project-status"><SelectValue /></SelectTrigger><SelectContent>{['Planning', 'In Progress', 'Review', 'Completed', 'On Hold'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
      <div><Label htmlFor="project-priority">Priority</Label><Select value={form.priority} onValueChange={(value) => setForm({ ...form, priority: value })}><SelectTrigger id="project-priority"><SelectValue /></SelectTrigger><SelectContent>{['Low', 'Medium', 'High', 'Critical'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
      <div className="flex items-end gap-2"><Button magnetic disabled={saving || !form.companyId}>{editing ? 'บันทึก' : 'สร้าง Project'}</Button>{editing && <Button type="button" variant="outline" onClick={() => { setEditing(null); setForm(initialForm) }}>ยกเลิก</Button>}</div>
    </form></div></details>
    <section aria-label="ตัวกรอง Projects" className="filter-panel grid gap-3 sm:grid-cols-3"><Input aria-label="ค้นหา Project" placeholder="ค้นหา Project" value={search} onChange={(event) => setSearch(event.target.value)} /><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger aria-label="กรองสถานะ"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">ทุกสถานะ</SelectItem>{['Planning', 'In Progress', 'Review', 'Completed', 'On Hold'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select><Select value={companyFilter} onValueChange={setCompanyFilter}><SelectTrigger aria-label="กรอง Company"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">ทุก Company</SelectItem>{companies.map((company) => <SelectItem key={company.id} value={company.id}>{company.displayName ?? company.name}</SelectItem>)}</SelectContent></Select></section>
    <div className="flex items-center justify-between gap-2"><h2 className="text-base font-semibold">Projects ของคุณ</h2><span className="text-xs text-muted-foreground">{loading ? 'กำลังโหลด…' : loadError ? 'โหลดไม่สำเร็จ' : `${filtered.length} รายการ`}</span></div>
    {projectList}
  </div></main></SidebarInset></SidebarProvider>
}
