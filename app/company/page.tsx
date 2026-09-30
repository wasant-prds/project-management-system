'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AppHeader } from '@/components/layout/app-header'
import { PAGE_HEADING, PAGE_INNER, PAGE_LEAD, PAGE_MAIN, PAGE_TOOLBAR } from '@/components/layout/page-layout'
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  const [saving, setSaving] = useState(false)
  const [deleteCompany, setDeleteCompany] = useState<Company | null>(null)
  const [deleting, setDeleting] = useState(false)
  const reload = useCallback(async () => {
    try {
      setCompanies(await fetchCollection<Company>('/api/company', 'companies'))
      setMessage('')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'โหลด Company ไม่สำเร็จ') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { reload() }, [reload])

  const save = async (event: React.FormEvent) => {
    event.preventDefault(); setSaving(true)
    try {
      await readJson(await fetch(editing ? `/api/company/${editing}` : '/api/company', {
        method: editing ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form),
      }))
      setEditing(null); setForm(emptyForm); await reload()
      setMessage('บันทึก Company แล้ว')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'บันทึกไม่สำเร็จ') }
    finally { setSaving(false) }
  }
  const edit = (company: Company) => {
    setEditing(company.id)
    setForm({ name: company.name, displayName: company.displayName, location: company.location, address: company.address, phone: company.phone, description: company.description })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const remove = async () => {
    if (!deleteCompany) return
    setDeleting(true)
    try {
      await readJson(await fetch(`/api/company/${deleteCompany.id}`, { method: 'DELETE' }))
      await reload(); setMessage('ลบ Company แล้ว')
      setDeleteCompany(null)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'ลบ Company ไม่สำเร็จ') }
    finally { setDeleting(false) }
  }

  return <SidebarProvider><AppSidebar /><SidebarInset><AppHeader /><main className={PAGE_MAIN}><div className={PAGE_INNER}>
    <div className={PAGE_TOOLBAR}><div><h1 className={PAGE_HEADING}>Company</h1><p className={PAGE_LEAD}>จัดการบริษัทและ Projects ที่ผูกอยู่</p></div></div>
    {message && <output className="block rounded border p-3 text-sm">{message}</output>}
    <Card><CardHeader><CardTitle>{editing ? 'แก้ไข Company' : 'เพิ่ม Company'}</CardTitle></CardHeader><CardContent><form onSubmit={save} className="grid gap-3 sm:grid-cols-2">
      {(['name', 'displayName', 'location', 'address', 'phone'] as const).map((field) => <div key={field}><Label htmlFor={`company-${field}`}>{field === 'name' ? 'ชื่อบริษัท *' : field}</Label><Input id={`company-${field}`} value={form[field] ?? ''} onChange={(event) => setForm({ ...form, [field]: event.target.value })} required={field === 'name'} disabled={editing !== null && companies.find((item) => item.id === editing)?.code === 'dhas' && field === 'name'} /></div>)}
      <div className="sm:col-span-2"><Label htmlFor="company-description">รายละเอียด</Label><Textarea id="company-description" value={form.description ?? ''} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={4} /></div>
      <div className="flex gap-2"><Button disabled={saving}>บันทึก</Button>{editing && <Button type="button" variant="outline" onClick={() => { setEditing(null); setForm(emptyForm) }}>ยกเลิก</Button>}</div>
    </form></CardContent></Card>
    {loading ? <p>กำลังโหลด...</p> : <div className="grid gap-5 lg:grid-cols-2">{companies.map((company) => <Card key={company.id}><CardHeader><CardTitle>{company.displayName ? `${company.displayName} — ${company.name}` : company.name}</CardTitle></CardHeader><CardContent className="space-y-3 text-sm">
      {company.location && <p>{company.location}</p>}{company.address && <p>{company.address}</p>}{company.phone && <p>โทร {company.phone}</p>}{company.description && <p className="whitespace-pre-wrap">{company.description}</p>}
      <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => edit(company)}>แก้ไข</Button>{company.code !== 'dhas' && company.summary.projects === 0 && <Button variant="outline" size="sm" onClick={() => setDeleteCompany(company)}>ลบ</Button>}</div>
      <h2 className="font-semibold">Projects ({company.summary.projects})</h2>
      <p>{company.summary.workItems} Work Items · {company.summary.hours} ชั่วโมง</p>
      {company.summary.projects === 0 ? <p className="text-muted-foreground">ยังไม่มี Project</p> : <Link href={`/projects?companyId=${encodeURIComponent(company.id)}`} className="text-primary underline">เปิด Projects ของ Company นี้</Link>}
    </CardContent></Card>)}</div>}
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
