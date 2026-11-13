'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CompanyCard } from '@/components/page/company/company-card'
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
  const [formOpen, setFormOpen] = useState(false)
  const formReturnFocus = useRef<HTMLElement | null>(null)
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
    event.preventDefault(); setMessage(''); setSaving(true)
    try {
      await readJson(await fetch(editing ? `/api/company/${editing}` : '/api/company', {
        method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      }))
      setFormOpen(false); setEditing(null); setForm(emptyForm); await reload(true)
      setMessage('บันทึก Company แล้ว')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ') }
    finally { setSaving(false) }
  }
  const edit = (company: Company) => {
    formReturnFocus.current = document.activeElement as HTMLElement | null
    setEditing(company.id)
    setForm({ name: company.name, displayName: company.displayName, location: company.location, address: company.address, phone: company.phone, description: company.description })
    setMessage(''); setFormOpen(true)
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
    <Dialog open={formOpen} onOpenChange={(open) => { if (!saving) setFormOpen(open) }}>
      <div className={PAGE_TOOLBAR}><div><p className="page-eyebrow mb-2">Company registry</p><h1 className={PAGE_HEADING}>Company</h1><p className={PAGE_LEAD}>ข้อมูลบริษัท การติดต่อ และ Projects ที่ดูแล</p></div>
        <div className="page-header-actions"><DialogTrigger asChild><Button magnetic disabled={loading || Boolean(loadError)} onClick={() => { setEditing(null); setForm(emptyForm); setMessage(''); formReturnFocus.current = null }}><Plus aria-hidden="true" />เพิ่มบริษัท</Button></DialogTrigger></div>
      </div>
      {message && !formOpen && <output aria-live="polite" className="content-wrap surface-inset block rounded-xl border p-4 text-sm">{message}</output>}
      <DialogContent className={DIALOG_SHELL_SCROLL_CLASS} onCloseAutoFocus={(event) => { if (formReturnFocus.current?.isConnected) { event.preventDefault(); formReturnFocus.current.focus() } }} onInteractOutside={(event) => { if (saving) event.preventDefault() }} onEscapeKeyDown={(event) => { if (saving) event.preventDefault() }}>
        <DialogHeader><DialogTitle>{editing ? 'แก้ไขบริษัท' : 'เพิ่มบริษัท'}</DialogTitle><DialogDescription>ระบุชื่อทางการให้ครบ ช่องอื่นเว้นว่างได้</DialogDescription></DialogHeader>
        {message && <p role="alert" className="content-wrap rounded-lg border border-destructive/40 p-3 text-sm text-danger">{message}</p>}
        <form onSubmit={save} aria-busy={saving} className="min-w-0 space-y-5">
          <fieldset disabled={saving} className="min-w-0 space-y-3"><legend className="type-section mb-3">ข้อมูลบริษัท</legend>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 [&>div]:min-w-0 [&>div]:space-y-2">
              <div><Label htmlFor="company-name">ชื่อทางการ <span className="text-muted-foreground">(จำเป็น)</span></Label><Input id="company-name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required disabled={saving || (editing !== null && companies.find((item) => item.id === editing)?.code === 'dhas')} />{editing !== null && companies.find((item) => item.id === editing)?.code === 'dhas' && <p className="text-xs text-muted-foreground">ชื่อบริษัทค่าเริ่มต้นแก้ไขไม่ได้</p>}</div>
              <div><Label htmlFor="company-displayName">ชื่อที่แสดง <span className="text-muted-foreground">(ไม่บังคับ)</span></Label><Input id="company-displayName" value={form.displayName ?? ''} onChange={(event) => setForm({ ...form, displayName: event.target.value })} /><p className="text-xs text-muted-foreground">เว้นว่างเพื่อใช้ชื่อทางการ</p></div>
            </div>
          </fieldset>
          <fieldset disabled={saving} className="min-w-0 space-y-3"><legend className="type-section mb-3">ที่ตั้งและการติดต่อ <span className="text-xs font-normal text-muted-foreground">(ไม่บังคับ)</span></legend>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 [&>div]:min-w-0 [&>div]:space-y-2">
              <div><Label htmlFor="company-location">ที่ตั้ง / สาขา</Label><Input id="company-location" value={form.location ?? ''} onChange={(event) => setForm({ ...form, location: event.target.value })} /></div>
              <div><Label htmlFor="company-phone">โทรศัพท์</Label><Input id="company-phone" type="tel" autoComplete="tel" value={form.phone ?? ''} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></div>
              <div className="sm:col-span-2"><Label htmlFor="company-address">ที่อยู่</Label><Textarea id="company-address" value={form.address ?? ''} onChange={(event) => setForm({ ...form, address: event.target.value })} rows={2} /></div>
            </div>
          </fieldset>
          <div className="space-y-2"><Label htmlFor="company-description">รายละเอียด <span className="text-muted-foreground">(ไม่บังคับ)</span></Label><Textarea id="company-description" disabled={saving} value={form.description ?? ''} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} /></div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="outline" disabled={saving} onClick={() => setFormOpen(false)}>ยกเลิก</Button><Button magnetic disabled={saving}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
    <div className="flex items-center justify-between gap-2"><h2 className="type-section">บริษัทและผลงาน</h2><span className="type-data text-muted-foreground">{collectionCountLabel(loading, Boolean(loadError), companies.length, 'บริษัท')}</span></div>
    {loading ? <PageState kind="loading" loadingLayout="cards" title="กำลังโหลด Company…" /> : loadError ? <PageState kind="error" visual={loadFailureVisual(loadError)} title="โหลด Company ไม่สำเร็จ" description={loadError} action={<Button type="button" variant="outline" onClick={() => void reload()}>ลองอีกครั้ง</Button>} /> : companies.length === 0 ? <PageState visual="records" title="ยังไม่มี Company" description="เพิ่มข้อมูลบริษัทเพื่อเริ่มจัดการ Projects" /> : <div className="cinematic-beat-data motion-stagger grid min-w-0 gap-5 lg:grid-cols-2">{companies.map((company) => <CompanyCard key={company.id} company={company} onEdit={edit} onDelete={setDeleteCompany} />)}</div>}
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
