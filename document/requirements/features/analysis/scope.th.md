# วิเคราะห์ — ขอบเขตงาน

| รายการ | ค่า |
| --- | --- |
| ฟีเจอร์ | รายงานและกราฟ `/analysis` |
| เอกสาร | ขอบเขตงาน (TH) |
| English version | [scope.en.md](./scope.en.md) |
| เอกสารที่เกี่ยวข้อง | [business-requirement.th.md](./business-requirement.th.md) |
| **สถานะ** | **ส่งมอบข้อมูลจริงใน Issue #24** |
| วันที่ | 2026-10-03 |

เอกสารนี้บอก **สิ่งที่อยู่ใน/นอกงานนี้** และบริการใดที่ทำ ลักษณะผลิตภัณฑ์อยู่ใน [ข้อกำหนดทางธุรกิจ](./business-requirement.th.md)

---

## 1. บริการ

| รายการ | ในงานนี้ |
| --- | --- |
| รันไทม์ | Next.js **`app`** เท่านั้น (`pms-app-dev`) ไม่มีไมโครเซอร์วิสใหม่ |
| หน้า | `app/analysis/page.tsx` |
| API / Docker / migration ใหม่ | มี owner-only `GET /api/analysis/summary`; ไม่มี Docker service หรือ schema/migration ใหม่ |

---

## 2. ในขอบเขต

| กรณีธุรกิจ | ในขอบเขต |
| --- | --- |
| กรณีที่ 1 — ดูผล | KPI, breakdown, charts, filtered source tables และ CSV จาก WorkItem/TimeEntry จริง |
| กรณีที่ 2 — เลื่อน | โครงแถบข้างร่วม + `PAGE_MAIN` |
| กรณีที่ 3 — คอนทราสต์ | โทเค็นปุ่มร่วม |
| กรณีที่ 4 — ตอบสนอง | `STAT_GRID` แท็บเลื่อน แถบเครื่องมือร่วม |

---

## 3. นอกขอบเขต

| รายการ | นอกขอบเขต |
| --- | --- |
| Historical throughput | ไม่แสดงก่อนมี status history หรือ completion timestamp ที่เชื่อถือได้ |
| คลังข้อมูลสด | ไม่เพิ่มบริการรายงาน |
| แพลตฟอร์ม | ไม่มี service ใหม่หรือเปลี่ยน Prisma schema; เพิ่ม summary Route Handler ใน Next.js app |

---

## 4. บันทึกทางเทคนิค

- จุดตัด: โทรศัพท์ `< 640` แท็บเล็ต `640–1023` เดสก์ท็อป `1024+`
- Target: ช่วงรายงานและการจัดกลุ่ม time series ของ Analysis ใช้ default time zone `Asia/Bangkok` ทุก environment
- กราฟปรับขนาดตาม container; แกน, legend, tooltip และ label ต้องอยู่ในกรอบ chart component บนทุก breakpoint โดยไม่สร้าง page-level horizontal overflow
- เส้นกริดกราฟใช้ตัวแปร CSS ใน `app/globals.css` อยู่แล้ว
- Shared parser/query definitions และสูตร metric ใช้ร่วมกับ Dashboard; period, filters, breakdowns, detail rows และ export ใช้เงื่อนไขเดียวกัน

---

## 5. ไฟล์ที่คาดว่าจะเปลี่ยน

| พื้นที่ | พาธ |
| --- | --- |
| หน้า | `app/analysis/page.tsx` |
| โครง / คอนทราสต์ | `components/ui/sidebar.tsx`, `components/ui/button.tsx`, `app/globals.css` |
