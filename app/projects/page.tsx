'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { PortfolioCard } from '@/components/page/projects/portfolio-card'
import { PageState } from '@/components/layout/page-state'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { PAGE_HEADING, PAGE_INNER, PAGE_LEAD, PAGE_MAIN, PAGE_TOOLBAR, collectionCountLabel } from '@/components/layout/page-layout'
import { Plus } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DIALOG_SHELL_SCROLL_CLASS } from '@/components/ui/responsive-dialog'
import { loadFailureVisual } from '@/components/ui/product-identity'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/lazy-date-picker'
import { Input } from '@/components/ui/input'
import { SearchFilterPanel, FilterField } from '@/components/layout/search-filter-panel'
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
  const [formOpen, setFormOpen] = useState(false)
  const formReturnFocus = useRef<HTMLElement | null>(null)
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
    event.preventDefault(); if (saving) return; setSaving(true); setMessage('')
    try {
      await apiResponse(await fetch(editing ? `/api/projects/${editing}` : '/api/projects', {
        method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      }))
      setEditing(null); setForm(initialForm); setFormOpen(false); await reload(true)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ') }
    finally { setSaving(false) }
  }
  const editProject = async (id: string) => {
    formReturnFocus.current = document.activeElement as HTMLElement | null
    try {
      const data = await apiResponse(await fetch(`/api/projects/${id}`))
      const item = data.project
      setEditing(item.id)
      setForm({ name: item.name, companyId: item.companyId ?? '', startDate: item.startDate, dueDate: item.dueDate, status: item.status, priority: item.priority })
      setMessage(''); setFormOpen(true)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'โหลด Project ไม่สำเร็จ') }
  }
  const projectFiltersNarrow = search !== '' || statusFilter !== 'all' || companyFilter !== 'all'
  const projectVisual = projects.length > 0 && projectFiltersNarrow ? 'search' : 'records'
  const filtered = projects.filter((project) =>
    (statusFilter === 'all' || project.status === statusFilter) &&
    (companyFilter === 'all' || project.company?.id === companyFilter) &&
    (project.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) || project.company?.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())),
  )
  let projectList: React.ReactNode
  if (loading) {
    projectList = <PageState kind="loading" loadingLayout="cards" title="กำลังโหลด Projects…" />
  } else if (loadError) {
    projectList = <PageState kind="error" visual={loadFailureVisual(loadError)} title="โหลดข้อมูลไม่สำเร็จ" description={loadError} action={<Button type="button" variant="outline" onClick={() => void reload()}>ลองอีกครั้ง</Button>} />
  } else if (filtered.length === 0) {
    projectList = <PageState visual={projectVisual} title="ไม่พบ Project" description="ลองปรับตัวกรอง หรือสร้าง Project โดยเลือก Company ที่ต้องการ" />
  } else {
    projectList = <div className="cinematic-beat-data motion-stagger grid min-w-0 gap-5 md:grid-cols-2 xl:grid-cols-3">{filtered.map((project) => <PortfolioCard key={project.id} project={project} onEdit={editProject} />)}</div>
  }
  return <SidebarProvider><AppSidebar /><SidebarInset><AppHeader /><main className={PAGE_MAIN}><div className={PAGE_INNER}><Dialog open={formOpen} onOpenChange={(open) => { if (!saving) setFormOpen(open) }}>
    <div className={PAGE_TOOLBAR}><div><p className="page-eyebrow mb-2">Project portfolio</p><h1 className={PAGE_HEADING}>Projects</h1><p className={PAGE_LEAD}>แต่ละ Project ผูก Company ที่เลือก พร้อมงานจริง</p></div>
      <div className="page-header-actions"><SearchFilterPanel summary={[search.trim(), statusFilter !== 'all' ? statusFilter : '', companies.find((company) => company.id === companyFilter)?.displayName ?? companies.find((company) => company.id === companyFilter)?.name].filter(Boolean).join(' · ')} activeCount={[search.trim() !== '', statusFilter !== 'all', companyFilter !== 'all'].filter(Boolean).length} onReset={() => { setSearch(''); setStatusFilter('all'); setCompanyFilter('all') }}>
        <div className="search-filter-fields">
          <FilterField label="คำค้นหา" className="sm:col-span-2"><Input type="search" aria-label="ค้นหา Project" placeholder="ค้นหา Project" value={search} onChange={(event) => setSearch(event.target.value)} /></FilterField>
          <FilterField label="สถานะ"><Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger aria-label="กรองสถานะ"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">ทุกสถานะ</SelectItem>{['Planning', 'In Progress', 'Review', 'Completed', 'On Hold'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></FilterField>
          <FilterField label="Company"><Select value={companyFilter} onValueChange={setCompanyFilter}><SelectTrigger aria-label="กรอง Company"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">ทุก Company</SelectItem>{companies.map((company) => <SelectItem key={company.id} value={company.id}>{company.displayName ?? company.name}</SelectItem>)}</SelectContent></Select></FilterField>
        </div>
      </SearchFilterPanel><DialogTrigger asChild><Button magnetic disabled={loading || Boolean(loadError)} onClick={() => { setEditing(null); setForm(initialForm); setMessage(''); formReturnFocus.current = null }}><Plus aria-hidden="true" />สร้าง Project</Button></DialogTrigger></div>
    </div>
    {message && !formOpen && <output aria-live="polite" className="surface-inset block rounded-xl border p-4 text-sm">{message}</output>}
    <DialogContent onCloseAutoFocus={(event) => { if (formReturnFocus.current?.isConnected) { event.preventDefault(); formReturnFocus.current.focus() } }} className={DIALOG_SHELL_SCROLL_CLASS} onInteractOutside={(event) => { if (saving) event.preventDefault() }} onEscapeKeyDown={(event) => { if (saving) event.preventDefault() }}><DialogHeader><DialogTitle>{editing ? 'แก้ไข Project' : 'สร้าง Project'}</DialogTitle><DialogDescription>เลือก Company และกำหนดช่วงเวลา สถานะ และ Priority ของ Project</DialogDescription></DialogHeader>
    {message && <p role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm">{message}</p>}
    <form onSubmit={submit} aria-busy={saving} className="grid min-w-0 gap-4 sm:grid-cols-2 [&>div]:min-w-0 [&>div]:space-y-2">
      <div><Label htmlFor="project-name">ชื่อ Project *</Label><Input disabled={saving} id="project-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></div>
      <div><Label htmlFor="project-company">Company *</Label><Select disabled={saving} value={form.companyId} onValueChange={(value) => setForm({ ...form, companyId: value })}><SelectTrigger id="project-company"><SelectValue placeholder="เลือก Company" /></SelectTrigger><SelectContent>{companies.map((company) => <SelectItem key={company.id} value={company.id}>{company.displayName ?? company.name}</SelectItem>)}</SelectContent></Select></div>
      <div><Label htmlFor="project-start">วันเริ่ม *</Label><DatePicker disabled={saving} id="project-start" required value={form.startDate} onValueChange={(startDate) => setForm({ ...form, startDate })} /></div>
      <div><Label htmlFor="project-due">วันกำหนดเสร็จ *</Label><DatePicker disabled={saving} id="project-due" required value={form.dueDate} onValueChange={(dueDate) => setForm({ ...form, dueDate })} /></div>
      <div><Label htmlFor="project-status">สถานะ</Label><Select disabled={saving} value={form.status} onValueChange={(value) => setForm({ ...form, status: value })}><SelectTrigger id="project-status"><SelectValue /></SelectTrigger><SelectContent>{['Planning', 'In Progress', 'Review', 'Completed', 'On Hold'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
      <div><Label htmlFor="project-priority">Priority</Label><Select disabled={saving} value={form.priority} onValueChange={(value) => setForm({ ...form, priority: value })}><SelectTrigger id="project-priority"><SelectValue /></SelectTrigger><SelectContent>{['Low', 'Medium', 'High', 'Critical'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
      <div className="flex flex-wrap items-end gap-2 sm:col-span-2"><Button disabled={saving || !form.companyId}>{saving ? 'กำลังบันทึก…' : editing ? 'บันทึก' : 'สร้าง Project'}</Button><Button type="button" variant="outline" disabled={saving} onClick={() => setFormOpen(false)}>ยกเลิก</Button></div>
    </form></DialogContent></Dialog>
    <div className="flex items-center justify-between gap-2"><h2 className="type-section">Projects ของคุณ</h2><span className="type-data text-muted-foreground">{collectionCountLabel(loading, Boolean(loadError), filtered.length, 'รายการ')}</span></div>
    {projectList}
  </div></main></SidebarInset></SidebarProvider>
}
