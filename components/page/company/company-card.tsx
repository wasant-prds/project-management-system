import Link from 'next/link'
import { formatHours } from '@/lib/decimal-hours'
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
    <Card data-company-card className="surface-raised motion-card min-w-0 lg:row-span-3 lg:grid lg:grid-rows-subgrid lg:gap-0">
      <CardHeader>
        <div className="flex min-w-0 items-start gap-3">
          <span className="surface-inset flex size-11 shrink-0 items-center justify-center rounded-xl text-link"><Building2 aria-hidden="true" className="size-5" /></span>
          <div className="min-w-0 flex-1"><CardTitle className="content-wrap">{company.displayName ?? company.name}</CardTitle>{company.displayName && <p className="content-wrap mt-1 text-xs text-muted-foreground">{company.name}</p>}</div>
          {company.code === 'dhas' && <Badge variant="secondary">ค่าเริ่มต้น</Badge>}
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-3 text-sm">
        {(company.location || company.address) && <p className="flex min-w-0 items-start gap-2 text-muted-foreground"><MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" /><span className="content-wrap min-w-0">{company.location}{company.location && company.address && ' · '}{company.address}</span></p>}
        {company.phone && <p className="flex min-w-0 items-start gap-2"><Phone aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span className="content-wrap min-w-0">{company.phone}</span></p>}
        {company.description && <p className="content-wrap whitespace-pre-wrap text-muted-foreground">{company.description}</p>}
      </CardContent>
      <CardContent className="min-w-0 space-y-4 text-sm">
        <dl className="grid min-w-0 grid-cols-3 gap-3 border-y border-border/60 py-3">
          <div className="min-w-0"><dt className="text-xs text-muted-foreground">Projects</dt><dd className="mt-1 break-all text-lg font-semibold tabular-nums">{company.summary.projects}</dd></div>
          <div className="min-w-0"><dt className="text-xs text-muted-foreground">Work Items</dt><dd className="mt-1 break-all text-lg font-semibold tabular-nums">{company.summary.workItems}</dd></div>
          <div className="min-w-0"><dt className="text-xs text-muted-foreground">ชั่วโมงจริง</dt><dd className="mt-1 break-all text-lg font-semibold tabular-nums">{formatHours(company.summary.hours)}</dd></div>
        </dl>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href={`/projects?companyId=${encodeURIComponent(company.id)}`} className="text-xs font-semibold text-link underline underline-offset-4">{company.summary.projects === 0 ? 'เปิด Projects · ยังไม่มี Project' : 'เปิด Projects ของบริษัท →'}</Link>
          <div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => onEdit(company)}>แก้ไข</Button>{company.code !== 'dhas' && company.summary.projects === 0 && <Button type="button" variant="outline" size="sm" onClick={() => onDelete(company)}>ลบ</Button>}</div>
        </div>
        {(company.code === 'dhas' || company.summary.projects > 0) && <p className="text-xs text-muted-foreground">{company.code === 'dhas' ? 'บริษัทค่าเริ่มต้น · ลบไม่ได้' : 'มี Project อ้างอิง · ลบไม่ได้'}</p>}
      </CardContent>
    </Card>
  )
}
