import Link from 'next/link'
import { Building2, MapPin, Phone } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

type RegistryCompany = {
  id: string; code: string | null; name: string; displayName: string | null
  location: string | null; address: string | null; phone: string | null; description: string | null
  summary: { projects: number; workItems: number; hours: string }
}

export function CompanyCard({ company, onEdit, onDelete }: Readonly<{ company: RegistryCompany; onEdit: (company: RegistryCompany) => void; onDelete: (company: RegistryCompany) => void }>) {
  return (
    <Card className="surface-raised">
      <CardHeader>
        <div className="flex min-w-0 items-start gap-3">
          <span className="surface-inset flex size-11 shrink-0 items-center justify-center rounded-xl text-link"><Building2 aria-hidden="true" className="size-5" /></span>
          <div className="min-w-0 flex-1"><CardTitle>{company.displayName ?? company.name}</CardTitle>{company.displayName && <p className="mt-1 break-words text-xs text-muted-foreground">{company.name}</p>}</div>
          {company.code === 'dhas' && <Badge variant="secondary">ค่าเริ่มต้น</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {(company.location || company.address) && <p className="flex items-start gap-2 break-words text-muted-foreground"><MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span>{company.location}{company.location && company.address && ' · '}{company.address}</span></p>}
        {company.phone && <p className="flex items-center gap-2"><Phone aria-hidden="true" className="size-4 text-muted-foreground" />{company.phone}</p>}
        {company.description && <p className="whitespace-pre-wrap break-words text-muted-foreground">{company.description}</p>}
        <dl className="grid grid-cols-3 gap-3 border-y border-border/60 py-3">
          <div><dt className="text-xs text-muted-foreground">Projects</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{company.summary.projects}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Work Items</dt><dd className="mt-1 text-lg font-semibold tabular-nums">{company.summary.workItems}</dd></div>
          <div className="min-w-0"><dt className="text-xs text-muted-foreground">ชั่วโมงจริง</dt><dd className="mt-1 break-all text-lg font-semibold tabular-nums">{company.summary.hours}</dd></div>
        </dl>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {company.summary.projects === 0 ? <p className="text-xs text-muted-foreground">ยังไม่มี Project</p> : <Link href={`/projects?companyId=${encodeURIComponent(company.id)}`} className="text-xs font-semibold text-link underline underline-offset-4">เปิด Projects ของ Company นี้ →</Link>}
          <div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => onEdit(company)}>แก้ไข</Button>{company.code !== 'dhas' && company.summary.projects === 0 && <Button type="button" variant="outline" size="sm" onClick={() => onDelete(company)}>ลบ</Button>}</div>
        </div>
      </CardContent>
    </Card>
  )
}
