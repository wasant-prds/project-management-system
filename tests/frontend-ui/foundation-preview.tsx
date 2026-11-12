import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { FilterSelect } from '@/components/ui/filter-select'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose } from '@/components/ui/dialog'
import { SearchFilterPanel, FilterField } from '@/components/layout/search-filter-panel'
import { formatUiDate } from '@/lib/display-date'

/** Synthetic control gallery; bundled only by the isolated preview. */
export function FoundationPreview() {
  const [date, setDate] = useState('2026-10-03')
  return <main className="h-svh overflow-y-auto p-4 sm:p-6">
    <div className="mx-auto max-w-3xl space-y-5">
      <h1 className="type-display">Shared visual foundation</h1>
      <div className="page-header-actions">
        <SearchFilterPanel activeCount={2} summary="Project Alpha · กำลังดำเนินการ">
          <div className="search-filter-fields">
            <FilterField label="คำค้นหา"><Input type="search" aria-label="ค้นหาตัวอย่าง" /></FilterField>
            <FilterField label="สถานะ"><FilterSelect id="qa-filter" options={[{ value: '', label: 'ทั้งหมด' }, { value: 'open', label: 'กำลังดำเนินการ' }]} /></FilterField>
            <FilterField label="วันที่"><DatePicker id="qa-filter-date" value={date} onValueChange={setDate} /></FilterField>
          </div>
        </SearchFilterPanel>
        <Button><Plus aria-hidden="true" />เพิ่ม Work Item</Button>
      </div>
      <Card><CardHeader><CardTitle>องค์ประกอบร่วม</CardTitle><CardDescription>ตรวจ focus, disabled, error และ selected states</CardDescription></CardHeader><CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button>บันทึก</Button><Button variant="outline">ยกเลิก</Button><Button variant="secondary">ดูรายละเอียด</Button>
          <Button variant="destructive"><Trash2 aria-hidden="true" />ลบ</Button><Button disabled>บันทึก</Button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2"><Label htmlFor="qa-input">ชื่อ</Label><Input id="qa-input" placeholder="ระบุชื่อ" /></div>
          <div className="space-y-2"><Label htmlFor="qa-invalid">ชื่อที่ต้องแก้ไข</Label><Input id="qa-invalid" aria-invalid="true" aria-describedby="qa-error" /><p id="qa-error" className="text-sm text-danger">กรุณาระบุชื่อ</p></div>
          <Input aria-label="ข้อมูลที่ปิดใช้งาน" value="ปิดใช้งาน" disabled />
          <FilterSelect id="qa-select" options={[{ value: '', label: 'ทั้งหมด' }, { value: 'open', label: 'กำลังดำเนินการ' }]} />
        </div>
        <div className="flex flex-wrap gap-2"><Badge>Task</Badge><Badge variant="secondary">Developer</Badge><Badge variant="outline">กำลังดำเนินการ</Badge><Badge variant="destructive">ข้อผิดพลาด</Badge></div>
        <Tabs defaultValue="overview"><TabsList><TabsTrigger value="overview">ภาพรวม</TabsTrigger><TabsTrigger value="details">รายละเอียด</TabsTrigger><TabsTrigger value="disabled" disabled>ปิดใช้งาน</TabsTrigger></TabsList><TabsContent value="overview"><p className="type-body">วันที่อ้างอิง <span data-qa-date>{formatUiDate('2026-10-03')}</span></p></TabsContent><TabsContent value="details">รายละเอียดตัวอย่าง</TabsContent></Tabs>
        <Card><CardContent>Nested panel · <span className="type-data">1,234.50</span></CardContent></Card>
        <Dialog><DialogTrigger asChild><Button variant="outline">เปิด dialog ตัวอย่าง</Button></DialogTrigger><DialogContent><DialogHeader><DialogTitle>แก้ไข Work Item</DialogTitle><DialogDescription>ตัวอย่างกรอบร่วม ไม่มีการบันทึกข้อมูล</DialogDescription></DialogHeader><Label htmlFor="qa-dialog-input">ชื่อ</Label><Input id="qa-dialog-input" /><DialogFooter><DialogClose asChild><Button variant="outline">ยกเลิก</Button></DialogClose><DialogClose asChild><Button>บันทึก</Button></DialogClose></DialogFooter></DialogContent></Dialog>
      </CardContent></Card>
    </div>
  </main>
}
