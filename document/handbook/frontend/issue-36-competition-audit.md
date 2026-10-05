# Final competition audit — Issue #36

ตรวจ Frontend เดิมแล้วแก้เฉพาะจุดที่ทำให้ empty, error, status และไอคอนไม่เป็นภาษาเดียวกับ Issue #35. ไม่มี API, schema, Authentication, Authorization, Permission, Business Logic, routing หรือ dependency ใหม่. Timezone ยังเป็น `Asia/Bangkok`.

คะแนนในรอบนี้มาจาก source และ component render. Owner gate ที่พอร์ต 3000 ตอบ `401` JSON `OWNER_UNAUTHENTICATED` จึงไม่ได้เปิดเมนูที่ล็อกอิน. ไม่มีหน้า permission. `/tasks` และ `/issues` เป็น redirect ไป `/work-items` จึงไม่ให้คะแนนแยก.

## ขอบเขต

| ชั้น | ไฟล์ | หน้าที่ |
|---|---|---|
| สถานะกะทัดรัด | `components/layout/page-state.tsx` | `InlineState` สำหรับ card, คอลัมน์ และกราฟ |
| ไอคอนเปิดฟอร์ม | `components/ui/product-icon.tsx` | `DisclosureGlyph` ใช้ `Plus` หมวด action |
| คำ role | `components/page/work-items/work-item-role-label.ts` | `workItemRoleLabel` |
| สถานะงาน | `components/page/work-items/work-item-status-badge.tsx` | รับ status ที่ไม่รู้จักโดยไม่พัง |
| รายการงาน | `components/page/work-items/work-item-grouped-list.tsx` | หัวข้อที่ติดขณะเลื่อนใช้พื้นทึบ |
| พื้นผิวว่าง | `app/globals.css` | `.identity-empty` เป็น inset และ radius ของ control |

## InlineState

ใช้เมื่อ `PageState` สูงเกินไปใน card, คอลัมน์ Board หรือกรอบกราฟ. มี identity mark, ไม่มีเส้นประ และไม่มี `motion-content-enter`.

| Prop | ค่า | พฤติกรรม |
|---|---|---|
| `kind` | `empty` (ค่าเริ่มต้น) หรือ `error` | error ใช้ไอคอนเตือนและโทน danger |
| `visual` | visual ของ Issue #35 | ถ้าไม่ส่ง empty ใช้ `records` และ error ใช้ `error` |
| `live` | `false` โดยค่าเริ่มต้น | empty ที่ส่ง `live` จึงมี `role="status"` |
| `action` | ไม่บังคับ | ปุ่มลองใหม่วางต่อจากข้อความ |

Error มี `role="alert"` เสมอ แม้ไม่ส่ง `live`. คอลัมน์ Board ที่ว่างไม่ส่ง `live` เพื่อไม่ให้หลายคอลัมน์ประกาศพร้อมกัน.

| จุดที่ใช้ | visual | ข้อความหลัก |
|---|---|---|
| Dashboard รายการ Work Item | `search` | ไม่มี Work Item ในตัวกรองนี้ |
| Dashboard รายการ Project | `records` | ไม่มี Project ในตัวกรองนี้ |
| Dashboard ทั้งหน้าว่าง | `search` | ไม่พบ Work Items, Daily Work หรือ Projects ในช่วงและตัวกรองนี้ |
| กราฟ Dashboard | `chart` | ไม่มี Daily Work ในช่วงนี้ |
| กราฟ Analysis | `chart` | ไม่มี Work Item ให้แสดงในกราฟนี้ / ไม่มี Daily Work ให้แสดงในกราฟนี้ |
| ตาราง Analysis | `search` หรือ `activity` | ไม่พบ Work Item หรือ Daily Work ในช่วงและตัวกรองนี้ |
| คอลัมน์ Board | `records` | ยังไม่มี Work Item ในสถานะนี้ |
| ตัวกรอง Board ล้ม | จาก `loadFailureVisual` | โหลดตัวกรองไม่สำเร็จ |

ข้อผิดพลาดทั้งหน้ายังใช้ `PageState`: Dashboard อยู่ใน shell เดิม, Board ใช้หัวข้อ `โหลด Board ไม่สำเร็จ`, Settings ใช้หัวข้อ `โหลดการตั้งค่าไม่สำเร็จ`. ทั้งสามส่ง `loadFailureVisual`. ข้อความ `Failed to fetch`, `Load failed`, `NetworkError` หรือข้อความที่มี `network request failed` ได้ visual `network`. ข้อความอื่นได้ `error`.

`.identity-empty` ใช้ `--surface-inset` และ `--radius-control`.

## Status และ role

`WorkItemStatusBadge` รับ `string`. ค่าที่อยู่ใน `WORK_ITEM_STATUS_LABELS` ใช้สีเดิมของ status พร้อม glyph และคำ. ค่าที่ไม่อยู่ในรายการแสดงข้อความเดิม, visual `info` และคลาส muted. ใช้บน Dashboard, การ์ดและหัวคอลัมน์ Board, ตาราง Analysis และ Project detail.

`workItemRoleLabel` อ่าน `WORK_ITEM_ROLE_LABELS`:

| ค่า | คำที่แสดง |
|---|---|
| `null` หรือค่าว่าง | ไม่ระบุ role |
| `Developer` | Developer |
| `infra` | Infrastructure |
| `SA` | System Analyst |
| ค่าอื่น | คืนค่าเดิม |

Project detail ใช้ฟังก์ชันนี้ทั้งในสรุป role และแถว Work Item. ไม่ได้เพิ่ม role หรือ status ใหม่.

## ไอคอนและพื้นผิว

`DisclosureGlyph` เป็น `Plus` หมวด action, stroke `1.75`, อยู่ใน well แบบ inset และ `aria-hidden`. ชื่อที่อ่านได้ยังอยู่ที่ข้อความ `เพิ่ม Company`, `แก้ไข Company`, `สร้าง Project` หรือ `แก้ไข Project`. ปุ่ม summary ของ Company และ Projects ใช้ `focus-visible:ring-2` กับ `ring-ring`.

หัวข้อกลุ่ม Work Items ที่ติดขณะเลื่อนใช้ `bg-card shadow-md`. ไม่ใช้ `backdrop-blur` หรือ ring ซ้อน. ป้าย subgroup ใช้ `type-label` และคงสี urgency เดิม. คำบรรยาย `เจ้าของระบบ` ใน header ใช้ `type-caption`.

วันที่ของตัวกรอง Dashboard ใช้ `Input` ร่วม และป้ายตัวกรองของ Dashboard กับ Board เป็น `type-label` ใน `<span>` เพื่อไม่ให้สี label ทาลงไปที่ช่อง.

## สิ่งที่ไม่ได้เปลี่ยน

ไม่มี endpoint, ตาราง, สิทธิ์, สูตร metric หรือ motif ใหม่. Daily Work ไม่ได้แก้เพราะไม่พบช่องว่างที่ขยับคะแนนได้อย่างน้อยครึ่งจุด. การย้ายสถานะบน Board ยังเป็นข้อความในเมนูเดิม. `permission` ยังเป็น `not-applicable`.

Showcase `/`, `/board` และ `/analysis` กับ major screen ที่แก้ มี overall ที่บันทึกไว้ 8.9. Originality และ Responsive คง 8.5 เพราะการขึ้น 9 ต้องมี motif ใหม่ หรือต้องวัด viewport จริงหลัง owner gate. ไม่ปัด 8.9 เป็น 9.0. รายละเอียดคะแนนก่อนและหลังอยู่ที่รายงาน implement ของ issue นี้.

## การตรวจสอบ

```powershell
pnpm test:frontend-competition
node tests/run.mjs frontend-competition
pnpm test:settings
pnpm test:company-projects
```

```bash
bash scripts/test-unit.sh frontend-competition
```

ไม่มี Makefile target. Suite นี้เป็น unit test: ไม่ใช้ PostgreSQL, Redis, Docker, network หรือ external service.

หลังแก้ review ผลล่าสุดคือ `pnpm test:frontend-competition` 11 PASS / 0 FAIL / 0 SKIP, `pnpm test:frontend-ui` 185 PASS, `pnpm test:settings` 23 PASS, `pnpm test:company-projects` 31 PASS, `pnpm lint` ไม่มี warning และ `pnpm typecheck` ผ่าน. รอบ implement ก่อน review: Dashboard 15, Analysis 17 และ Board 12 ผ่าน. `pnpm build` compile และสร้าง static pages 16/16 ผ่าน แล้วหยุดตอน copy standalone บน Windows ด้วย `EPERM`. ไม่ได้เปิดเมนูที่ล็อกอิน และไม่ได้รัน SonarQube.
