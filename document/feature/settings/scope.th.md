# การตั้งค่า — ขอบเขตงาน

| รายการ | ค่า |
| --- | --- |
| ฟีเจอร์ | บัญชีและการตั้งค่า `/settings` |
| เอกสาร | ขอบเขตงาน (TH) |
| English version | [scope.en.md](./scope.en.md) |
| เอกสารที่เกี่ยวข้อง | [business-requirement.th.md](./business-requirement.th.md) |
| **สถานะ** | **#25 implement ใน source; schema rollout ยัง pending** |
| วันที่ | 2026-09-04 |

เอกสารนี้บอก **สิ่งที่อยู่ใน/นอกงานนี้** และบริการใดที่ทำ ลักษณะผลิตภัณฑ์อยู่ใน [ข้อกำหนดทางธุรกิจ](./business-requirement.th.md)

---

## 1. บริการ

| รายการ | ในงานนี้ |
| --- | --- |
| รันไทม์ | Next.js **`app`** เท่านั้น (`pms-app-dev`) ไม่มีไมโครเซอร์วิสใหม่ |
| หน้า | `app/settings/page.tsx` |
| ธีม | `ThemeProvider` ที่มีอยู่ (`storageKey="project-management-theme"`); ใช้ Neumorphism shared tokens ของระบบกับ light/dark/special-dark โดยหน้านี้ไม่เพิ่ม style toggle |
| API / database | `GET/PATCH /api/settings/me`; เพิ่ม `User.theme` และ `User.locale`; rollout ใช้ schema gate เดิม |

---

## 2. ในขอบเขต

| กรณีธุรกิจ | ในขอบเขต |
| --- | --- |
| กรณีที่ 1 — การตั้งค่า | owner profile, theme, locale และ timezone แบบอ่านอย่างเดียวที่อ่าน/บันทึกจริง |
| กรณีที่ 2 — เลื่อน | โครงแถบข้างร่วม + `PAGE_MAIN` |
| กรณีที่ 3 — คอนทราสต์ | โทเค็นปุ่มร่วมและตัวแปร CSS ของธีม |
| กรณีที่ 4 — ตอบสนอง | แท็บเลื่อนและฟอร์มเรียงซ้อน |
| กรณีที่ 5 — รูปแบบภาพรวม | ใช้ surface/shadow tokens แบบ Neumorphism ร่วมกับเมนูอื่นและทุก theme โดยรักษา contrast และ keyboard focus |

---

## 3. นอกขอบเขต

| รายการ | นอกขอบเขต |
| --- | --- |
| Security provider | ไม่เปลี่ยนล็อกอิน/SSO; ไม่มี password/2FA controls จนกว่าจะมี provider action ที่ปลอดภัย |
| Notifications | ไม่มี preference controls จนกว่าจะเชื่อม notification channel |
| แพลตฟอร์ม | ไม่มี Docker service ใหม่; schema rollout ต้องผ่าน verified backup/restore และ approval gate |

---

## 4. บันทึกทางเทคนิค

- จุดตัด: โทรศัพท์ `< 640` แท็บเล็ต `640–1023` เดสก์ท็อป `1024+`
- Target: timezone ของระบบคงที่เป็น `Asia/Bangkok`; แสดงค่านี้ใน Settings และไม่มีตัวเลือก override
- light/dark/special-dark ตามกฎคอนทราสต์เดียวกันบนปุ่มทึบ
- Neumorphism เป็นรูปแบบภาพรวมร่วมของระบบ ไม่ใช่ preference ใหม่; เงาไม่ทดแทนข้อความ, contrast, selected/error state หรือ visible focus

---

## 5. ไฟล์ที่คาดว่าจะเปลี่ยน

| พื้นที่ | พาธ |
| --- | --- |
| หน้า | `app/settings/page.tsx` |
| โครง / คอนทราสต์ | `components/ui/sidebar.tsx`, `components/ui/button.tsx`, `app/globals.css` |
