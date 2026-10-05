'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CompanyCard } from '@/components/page/company/company-card'
import { PageState } from '@/components/layout/page-state'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { PAGE_HEADING, PAGE_INNER, PAGE_LEAD, PAGE_MAIN, PAGE_TOOLBAR } from '@/components/layout/page-layout'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { fetchCollection } from '@/lib/fetch-collection'

type Company = {
  id: string; code: string | null; name: string; displayName: string | null; location: string | null;
  address: string | null; phone: string | null; description: string | null;
  summary: { projects: number; workItems: number; hours: string }
}
type CompanyForm = Pick<Company, 'name' | 'displayName' | 'location' | 'address' | 'phone' | 'description'>
const emptyForm: CompanyForm = { name: '', displayName: '', location: '', address: '', phone: '', description: '' }

async function readJson(response: Response) {
  const data = await response.json()
  if (!response.ok) throw new Error([data.error?.code, data.error?.message].filter(Boolean).join(': ') || 'คำขอไม่สำเร็จ')
  return data
}

export default function CompanyPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [form, setForm] = useState<CompanyForm>(emptyForm)
  const [editing, setEditing] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteCompany, setDeleteCompany] = useState<Company | null>(null)
  const [deleting, setDeleting] = useState(false)
  const loadGeneration = useRef(0)
  const reload = useCallback(async (fresh = false) => {
    const generation = ++loadGeneration.current
    setLoading(true)
    setLoadError('')
    try {
      const rows = await fetchCollection<Company>('/api/company', 'companies', { fresh })
      if (generation !== loadGeneration.current) return
      setCompanies(rows)
      setMessage('')
    } catch (error) { if (generation === loadGeneration.current) setLoadError(error instanceof Error ? error.message : 'โหลด Company ไม่สำเร็จ') }
    finally { if (generation === loadGeneration.current) setLoading(false) }
  }, [])
  useEffect(() => { void reload(); return () => { loadGeneration.current += 1 } }, [reload])

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true)
    try {
      await readJson(await fetch(editing ? `/api/company/${editing}` : '/api/company', {
        method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      }))
      setEditing(null); setForm(emptyForm); await reload(true)
      setMessage('บันทึก Company แล้ว')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ') }
    finally { setSaving(false) }
  }
  const edit = (company: Company) => {
    setEditing(company.id)
    setForm({ name: company.name, displayName: company.displayName, location: company.location, address: company.address, phone: company.phone, description: company.description })
    document.getElementById('company-form')?.scrollIntoView({ block: 'start' })
  }
  const remove = async () => {
    if (!deleteCompany) return
    setDeleting(true)
    try {
      await readJson(await fetch(`/api/company/${deleteCompany.id}`, { method: 'DELETE' }))
      await reload(true); setMessage('ลบ Company แล้ว')
      setDeleteCompany(null)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'ลบ Company ไม่สำเร็จ') }
    finally { setDeleting(false) }
  }

  return <SidebarProvider><AppSidebar /><SidebarInset><AppHeader /><main className={PAGE_MAIN}><div className={PAGE_INNER}>
    <div className={PAGE_TOOLBAR}><div><p className="page-eyebrow mb-2">Company registry</p><h1 className={PAGE_HEADING}>Company</h1><p className={PAGE_LEAD}>จัดการบริษัทและ Projects ที่ผูกอยู่</p></div></div>
    {message && <output aria-live="polite" className="surface-inset block rounded-xl border p-4 text-sm">{message}</output>}
    <details id="company-form" open={editing !== null || undefined} className="cinematic-beat-support surface-raised scroll-mt-4 rounded-[var(--radius-panel)] border border-border/60 bg-card py-4"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-lg px-4 text-sm font-semibold focus-visible:outline-2 sm:px-5"><span>{editing ? 'แก้ไข Company' : 'เพิ่ม Company'}</span><span aria-hidden="true" className="surface-inset flex size-8 items-center justify-center rounded-lg text-link">+</span></summary><div className="mt-5 px-4 sm:px-5"><form onSubmit={save} className="grid min-w-0 gap-4 sm:grid-cols-2 [&>div]:min-w-0 [&>div]:space-y-2">
      {(['name', 'displayName', 'location', 'address', 'phone'] as const).map((field) => <div key={field}><Label htmlFor={`company-${field}`}>{field === 'name' ? 'ชื่อบริษัท *' : field}</Label><Input id={`company-${field}`} value={form[field] ?? ''} onChange={(event) => setForm({ ...form, [field]: event.target.value })} required={field === 'name'} disabled={editing !== null && companies.find((item) => item.id === editing)?.code === 'dhas' && field === 'name'} /></div>)}
      <div className="sm:col-span-2"><Label htmlFor="company-description">รายละเอียด</Label><Textarea id="company-description" value={form.description ?? ''} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={4} /></div>
      <div className="flex gap-2"><Button magnetic disabled={saving}>บันทึก</Button>{editing && <Button type="button" variant="outline" onClick={() => { setEditing(null); setForm(emptyForm) }}>ยกเลิก</Button>}</div>
    </form></div></details>
    <div className="flex items-center justify-between gap-2"><h2 className="text-base font-semibold">บริษัทและผลงาน</h2><span className="text-xs text-muted-foreground">{loading ? 'กำลังโหลด…' : loadError ? 'โหลดไม่สำเร็จ' : `${companies.length} บริษัท`}</span></div>
    {loading ? <PageState kind="loading" loadingLayout="cards" title="กำลังโหลด Company…" /> : loadError ? <PageState kind="error" title="โหลด Company ไม่สำเร็จ" description={loadError} action={<Button type="button" variant="outline" onClick={() => void reload()}>ลองอีกครั้ง</Button>} /> : companies.length === 0 ? <PageState title="ยังไม่มี Company" description="เพิ่มข้อมูลบริษัทเพื่อเริ่มจัดการ Projects" /> : <div className="cinematic-beat-data motion-stagger grid min-w-0 gap-5 lg:grid-cols-2">{companies.map((company) => <CompanyCard key={company.id} company={company} onEdit={edit} onDelete={setDeleteCompany} />)}</div>}
    <AlertDialog open={deleteCompany !== null} onOpenChange={(open) => { if (!open && !deleting) setDeleteCompany(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>ยืนยันการลบ Company</AlertDialogTitle>
          <AlertDialogDescription>ลบ {deleteCompany?.name} ใช่หรือไม่? Company ที่มี Project อ้างอิงจะถูกปฏิเสธ</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>ยกเลิก</AlertDialogCancel>
          <AlertDialogAction disabled={deleting} onClick={(event) => { event.preventDefault(); return remove() }}>{deleting ? 'กำลังลบ...' : 'ยืนยันลบ Company'}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div></main></SidebarInset></SidebarProvider>
}
