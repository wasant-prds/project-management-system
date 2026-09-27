# บริษัท — ขอบเขตงาน

| รายการ | ค่า |
| --- | --- |
| ฟีเจอร์ | ข้อมูลบริษัทและ Customer registry `/company` |
| เอกสาร | ขอบเขตงาน (TH) |
| English version | [scope.en.md](./scope.en.md) |
| เอกสารที่เกี่ยวข้อง | [business-requirement.th.md](./business-requirement.th.md) |
| **สถานะ** | **เสร็จ** |
| วันที่ | 2026-09-04 |

เอกสารนี้เก็บขอบเขต UI เดิม; ข้อกำหนด Company/Customer และ single-owner ฉบับปัจจุบันอยู่ใน [Business Requirement รวม](../../BUSINESS_REQUIREMENT.md) และ [Scope รวม](../../SCOPE.md) ซึ่งมีผลเหนือข้อความที่ขัดกันในเอกสารนี้

---

## 1. บริการ

| รายการ | ในงานนี้ |
| --- | --- |
| รันไทม์ | Next.js **`app`** เท่านั้น (`pms-app-dev`) ไม่มีไมโครเซอร์วิสใหม่ |
| ข้อมูล | การอ่าน Prisma ที่มีอยู่บน `app/company/page.tsx` |
| API / Docker / migration ใหม่ | **ไม่มี** |

---

## 2. ในขอบเขต

| กรณีธุรกิจ | ในขอบเขต |
| --- | --- |
| กรณีที่ 1 — ดู | company profile, ทะเบียน Customers และ summary Projects/Work Items/ชั่วโมง |
| กรณีที่ 2 — เลื่อน | โครงแถบข้างร่วม + `PAGE_MAIN` |
| กรณีที่ 3 — คอนทราสต์ | โทเค็นปุ่ม/แบดจ์ร่วม |
| กรณีที่ 4 — ตอบสนอง | `STAT_GRID` แท็บเลื่อน แถบเครื่องมือร่วม |

---

## 3. แยกจากงาน UI เดิมและข้อกำหนดเป้าหมาย

| รายการ | นอกขอบเขต |
| --- | --- |
| Team management | ไม่มีสมาชิกหลายคน, Add Member, invites หรือ Project team permissions ใน single-owner scope |
| งาน HR | ไม่มีออนบอร์ด เงินเดือน หรือซิงก์ไดเรกทอรี |
| แพลตฟอร์ม | งาน UI เดิมไม่เปลี่ยน REST/Prisma/Docker; Customer registry และ company persistence ต้องเพิ่มตาม requirement รวม |

---

## 4. บันทึกทางเทคนิค

- จุดตัด: โทรศัพท์ `< 640` แท็บเล็ต `640–1023` เดสก์ท็อป `1024+`
- ไดอะล็อกที่เพิ่มภายหลังต้องใช้ `components/ui/responsive-dialog.ts`

---

## 5. ไฟล์ที่คาดว่าจะเปลี่ยน

| พื้นที่ | พาธ |
| --- | --- |
| หน้า | `app/company/page.tsx` |
| โครง / คอนทราสต์ | `components/ui/sidebar.tsx`, `components/ui/button.tsx`, `app/globals.css` |
