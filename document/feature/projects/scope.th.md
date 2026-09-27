# โครงการ — ขอบเขตงาน

| รายการ | ค่า |
| --- | --- |
| ฟีเจอร์ | รายการ `/projects` และรายละเอียด `/projects/[id]` |
| เอกสาร | ขอบเขตงาน (TH) |
| English version | [scope.en.md](./scope.en.md) |
| เอกสารที่เกี่ยวข้อง | [business-requirement.th.md](./business-requirement.th.md) |
| **สถานะ** | **เสร็จ** |
| วันที่ | 2026-09-04 |

เอกสารนี้เก็บขอบเขตงาน UI เดิม; ข้อกำหนด Project-Customer และข้อมูลร่วมฉบับปัจจุบันอยู่ใน [Business Requirement รวม](../../BUSINESS_REQUIREMENT.md) และ [Scope รวม](../../SCOPE.md) ซึ่งมีผลเหนือข้อความที่ขัดกันในเอกสารนี้

---

## 1. บริการ

| รายการ | ในงานนี้ |
| --- | --- |
| รันไทม์ | Next.js **`app`** เท่านั้น (`pms-app-dev`) ไม่มีไมโครเซอร์วิสใหม่ |
| ข้อมูล | API โครงการ / Prisma ที่มีอยู่บนหน้ารายการและรายละเอียด |
| API / Docker / migration ใหม่ | **ไม่มี** |

---

## 2. ในขอบเขต

| กรณีธุรกิจ | ในขอบเขต |
| --- | --- |
| กรณีที่ 1 — เรียกดู | โฟลว์รายการ รายละเอียด สร้าง/แก้ไขและเชื่อม Customer; ไม่มี team management ใน target |
| กรณีที่ 2 — เลื่อน | โครงแถบข้างร่วม + `PAGE_MAIN` บนรายการและรายละเอียด |
| กรณีที่ 3 — คอนทราสต์ | โทเค็นปุ่ม/แบดจ์/ไดอะล็อกร่วม |
| กรณีที่ 4 — โมดัล | `DIALOG_SHELL_SCROLL_CLASS` บนไดอะล็อกสร้าง/แก้ไขและ Customer selector, พื้น `bg-card` ทึบ |
| กรณีที่ 5 — ตอบสนอง | โทเค็นโครงหน้าร่วม |

---

## 3. แยกจากงาน UI เดิมและข้อกำหนดเป้าหมาย

| รายการ | นอกขอบเขต |
| --- | --- |
| Customer relation | ไม่รวมในงาน responsive UI เดิม แต่เป็น requirement เป้าหมาย; ต้องเพิ่ม schema/API และ backfill ตามเอกสาร Scope รวม |
| คัมบังบนเส้นทางนี้ | บอร์ดอยู่ที่ `/board` |
| แพลตฟอร์ม | งาน UI เดิมไม่เปลี่ยน REST/Prisma/Docker; การเชื่อม Customer ต้องทำ API/schema เพิ่มตาม requirement รวม |

---

## 4. บันทึกทางเทคนิค

- โครงไดอะล็อก: `components/ui/responsive-dialog.ts`
- ยืนยันลบยังเป็น alert dialog (กะทัดรัด) แต่คอนทราสต์การ์ดเหมือนโมดัลอื่น
- จุดตัด: โทรศัพท์ `< 640` แท็บเล็ต `640–1023` เดสก์ท็อป `1024+`
- Target: วันเริ่มและวันครบกำหนดของ Project ใช้ Bangkok calendar date; timestamp ที่ระบบบันทึกใช้ Bangkok local wall-clock ตามข้อกำหนดกลาง

---

## 5. ไฟล์ที่คาดว่าจะเปลี่ยน

| พื้นที่ | พาธ |
| --- | --- |
| หน้า | `app/projects/page.tsx`, `app/projects/[id]/page.tsx` |
| ไดอะล็อก | `components/page/projects/project-create-modal.tsx`, `project-edit-modal.tsx`; ปรับ/แทน `project-team-modal.tsx` ด้วย Customer workflow หากยังใช้ใน implementation |
| โครง / คอนทราสต์ | `components/ui/sidebar.tsx`, `components/ui/dialog.tsx`, `components/ui/alert-dialog.tsx`, `app/globals.css` |
