# แดชบอร์ด — ขอบเขตงาน

| รายการ | ค่า |
| --- | --- |
| ฟีเจอร์ | หน้าภาพรวม `/` |
| เอกสาร | ขอบเขตงาน (TH) |
| English version | [scope.en.md](./scope.en.md) |
| เอกสารที่เกี่ยวข้อง | [business-requirement.th.md](./business-requirement.th.md) |
| **สถานะ** | **เสร็จ** |
| วันที่ | 2026-09-04 |

เอกสารนี้บอก **สิ่งที่อยู่ใน/นอกงานนี้** และบริการใดที่ทำ ลักษณะผลิตภัณฑ์อยู่ใน [ข้อกำหนดทางธุรกิจ](./business-requirement.th.md)

---

## 1. บริการ

| รายการ | ในงานนี้ |
| --- | --- |
| รันไทม์ | Next.js **`app`** เท่านั้น (`pms-app-dev`) ไม่มีไมโครเซอร์วิสใหม่ |
| หน้า | `app/page.tsx` |
| โครงร่วม | `components/layout/page-layout.ts`, `SidebarProvider` / `SidebarInset` |
| API / Docker / migration ใหม่ | `GET /api/dashboard/summary` เพิ่มใน #23; ไม่มี Docker service หรือ schema migration ใหม่ |

---

## 2. ในขอบเขต

| กรณีธุรกิจ | ในขอบเขต |
| --- | --- |
| กรณีที่ 1 — ภาพรวม | KPI/lists จาก WorkItem และ TimeEntry จริง, Project ล่าสุด, ช่วงวันที่และ Company/Project/role/kind filters, source links และกราฟชั่วโมงตามวัน |
| กรณีที่ 2 — เลื่อน | โครงแอป `h-svh overflow-hidden`; ส่วนหลักใช้ `PAGE_MAIN` (`overflow-y-auto`) เนื้อหาแถบข้างมี `overflow-auto` อยู่แล้ว |
| กรณีที่ 3 — คอนทราสต์ | โทเค็นปุ่ม/แบดจ์/ไดอะล็อกทั่วแอป ไม่บังคับ `text-foreground` บนทุก `button` / `span` / `div` |
| กรณีที่ 4 — ตอบสนอง | `STAT_GRID`, `PAGE_TOOLBAR`, หัวข้อกระชับ |

---

## 3. นอกขอบเขต

| รายการ | นอกขอบเขต |
| --- | --- |
| การวิเคราะห์เพิ่มเติม | Forecasting, configurable widgets และ cross-company BI warehouse; live aggregates อยู่ใน scope ของ #23 แล้ว |
| วิดเจ็ตใหม่ | ไม่เพิ่มการ์ดหรือชนิดกราฟในรอบนี้ |
| แพลตฟอร์ม | ไม่มี REST ใหม่ ไม่เปลี่ยนสคีมา Prisma ไม่มีบริการ Docker ใหม่ |

---

## 4. บันทึกทางเทคนิค

- จุดตัด: โทรศัพท์ `< sm` (640px) แท็บเล็ต `sm`–`lg` (640–1023px) เดสก์ท็อป `lg+` (1024px)
- Target: ช่วงรายงานและการจัดกลุ่มวันที่ของ Dashboard ใช้ default time zone `Asia/Bangkok` ทุก environment
- กราฟปรับขนาดตาม container; แกน, legend, tooltip และ label ต้องอยู่ในกรอบ chart component บนทุก breakpoint โดยไม่สร้าง page-level horizontal overflow
- กฎคอนทราสต์อยู่ที่ CSS/คอมโพเนนต์ จึงใช้ได้ทุกเมนู ไม่เฉพาะ `/`
- `html, body { overflow: hidden }` เพื่อให้ `PAGE_MAIN` เป็นตัวเลื่อน
- #23 ใช้ `lib/dashboard.ts` ร่วมกันระหว่างหน้าและ API; metrics อ่านจาก PostgreSQL โดยไม่สร้าง schema/cache ใหม่

---

## 5. ไฟล์ที่คาดว่าจะเปลี่ยน

| พื้นที่ | พาธ |
| --- | --- |
| หน้า | `app/page.tsx` |
| โครง | `components/ui/sidebar.tsx`, `app/globals.css` |
| คอนทราสต์ | `components/ui/button.tsx`, `components/ui/badge.tsx` |
