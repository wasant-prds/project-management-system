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

type Project = { id: string; name: string; summary: { total: number; hours: string } }
type Company = { id: string; code: string | null; name: string; displayName: string | null; location: string | null; address: string | null; phone: string | null; description: string | null; projects: Project[] }
type CompanyForm = Pick<Company, 'name' | 'displayName' | 'location' | 'address' | 'phone' | 'description'>
const emptyForm: CompanyForm = { name: '', displayName: '', location: '', address: '', phone: '', description: '' }

async function readJson(response: Response) {
  const data = await response.json()
  if (!response.ok) throw new Error(data.error?.message ?? 'คำขอไม่สำเร็จ')
  return data
}

export default function CompanyPage() {
  const [companies, setCompanies] = useState<Company[]>([])
  const [form, setForm] = useState<CompanyForm>(emptyForm)
  const [editing, setEditing] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const reload = useCallback(async () => {
    try {
      const result = await readJson(await fetch('/api/company'))
      setCompanies(result.companies)
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
  const remove = async (company: Company) => {
    if (!window.confirm(`ลบ Company ${company.name}?`)) return
    try {
      await readJson(await fetch(`/api/company/${company.id}`, { method: 'DELETE' }))
      await reload(); setMessage('ลบ Company แล้ว')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'ลบ Company ไม่สำเร็จ') }
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
      <div className="flex gap-2"><Button variant="outline" size="sm" onClick={() => edit(company)}>แก้ไข</Button>{company.code !== 'dhas' && company.projects.length === 0 && <Button variant="outline" size="sm" onClick={() => remove(company)}>ลบ</Button>}</div>
      <h2 className="font-semibold">Projects ({company.projects.length})</h2>
      {company.projects.length === 0 && <p className="text-muted-foreground">ยังไม่มี Project</p>}
      {company.projects.map((project) => <Link key={project.id} href={`/projects/${project.id}`} className="block rounded border p-3 text-primary underline break-words">{project.name} · {project.summary.total} Work Items · {project.summary.hours} ชั่วโมง</Link>)}
    </CardContent></Card>)}</div>}
  </div></main></SidebarInset></SidebarProvider>
}
