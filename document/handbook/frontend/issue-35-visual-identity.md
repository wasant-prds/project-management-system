# Product visual identity — Issue #35

ยกระดับ Frontend เดิมของ #26–#30 และ #34 ให้มีภาษาภาพชุดเดียวสำหรับตัวอักษร ไอคอน chart และสถานะ. ไม่มี API, schema, Authentication, Authorization, Permission, Business Logic, routing หรือ dependency ใหม่. Timezone ยังเป็น `Asia/Bangkok`.

## ขอบเขต

| ชั้น | ไฟล์ | หน้าที่ |
|---|---|---|
| กติกา | `components/ui/product-identity.ts` | บทบาทตัวอักษร, ขนาดไอคอน, สี chart, status, visual state, `loadFailureVisual` |
| ไอคอน | `components/ui/product-icon.tsx` | stroke, ขนาด และ motion ตามหมวด |
| กราฟ | `components/ui/use-chart-dataset-key.ts` | remount series เฉพาะเมื่อ dataset key เปลี่ยน |
| สถานะหน้า | `components/layout/page-state.tsx` | `visual`, โทนจาก `VISUAL_STATES`, identity mark |
| กราฟล้ม | `components/layout/chart-load-error.tsx` | partial failure ของกราฟ โดยไม่วน dependency จาก `components/ui` ไป `layout` |
| สถานะงาน | `components/page/work-items/work-item-status-badge.tsx` | สีเดิมของ status ร่วมกับ glyph และคำ |
| ภาพ | `app/globals.css` | fluid type ใน `@layer components`, icon well, identity mark, `nav-rail`, chart chrome |

Font ยังเป็น Geist Sans สำหรับ UI และตัวเลข และ Geist Mono สำหรับ code. ไม่เพิ่ม font family ที่สาม. Fallback คือ `ui-sans-serif, system-ui, sans-serif` และ `ui-monospace, SFMono-Regular, Menlo, monospace`.

## Typography

สเกล fluid เริ่มที่ความกว้าง 22rem และเต็มที่ 80rem. ปุ่ม, label และ navigation ไม่ขยายตามจอ. Display โตมากกว่า caption.

| บทบาท | Class | ใช้ที่ |
|---|---|---|
| Display | `type-display` | หัวข้อหน้าใน `PAGE_HEADING` |
| Page title | `type-page-title` | ชื่อ Dialog และ Alert Dialog |
| Section | `type-section` | หัวข้อช่วงและ empty/error title |
| Card title | `type-card-title` | `CardTitle` และชื่อ ProjectHub |
| KPI hero | `type-kpi-hero` | ตัวเลขใน `SummaryStatCard` |
| KPI support | `type-kpi-support` | ป้าย KPI |
| Body | `type-body` | `PAGE_LEAD` และคำอธิบาย state |
| Label | `type-label` | ป้ายกลุ่มใน sidebar |
| Caption | `type-caption` | breadcrumb, คำอธิบายตัวเลข, คอลัมน์ Board ที่ว่าง |
| Navigation | `type-nav` | sidebar, header breadcrumb, tab, form label |
| Button | `type-button` | ปุ่มร่วม |
| Data | `type-data` | ตัวเลขตาราง, tooltip และตัวนับ |
| Code | `type-code` | `kbd` |

KPI และ data ใช้ `tabular-nums` กับ `lining-nums`. ถ้า `CardTitle` เป็นป้าย KPI ให้ใส่ `type-kpi-support` ด้วย และคง `leading-5` เพื่อจองสองบรรทัดตามสัญญาเดิม. กฎ `.type-*` และ `.icon-well` อยู่ใน `@layer components` จึงให้ utility อย่าง `text-danger`, `hover:text-link`, `sm:text-xl` และ `surface-inset` ชนะได้. ภายใน layer เดียวกัน `type-kpi-support` อยู่หลัง `type-card-title` เพื่อให้ป้าย KPI ใช้ขนาดและสีของบทบาทนั้น.

## Iconography

หมวดทั้งหมดใช้ stroke `1.75`. ขนาดคือ navigation 20px, action 18px, status/data 16px, decorative 24px และ feature 32px ที่เครื่องหมายแบรนด์. ปุ่มเมนู sidebar มีตัวเลือกที่เฉพาะกว่า `[&>svg]:size-4` จึงคงขนาด navigation 20px และ action 18px. `icon-well` ใช้เฉพาะ brand, state และ KPI ไม่ใส่ให้ไอคอนทุกชิ้น.

| Intent | Motion |
|---|---|
| refresh | หมุน |
| success | reveal สั้น |
| expand หรือ navigate | nudge |
| decorative | ไม่ขยับ |
| idle | ไม่ขยับ |

`prefers-reduced-motion: reduce` ปิด spin, reveal และ nudge.

## Chart

ชุดสีอ้างตัวแปรเดิมแล้วตั้งชื่อความหมาย: `--chart-primary`, `--chart-secondary`, `--chart-comparison`, `--chart-positive`, `--chart-negative`, `--chart-warning`, `--chart-neutral`, `--chart-highlight`, `--chart-muted`. Light, Dark และ `special-dark` ใช้ตัวแปรชุดเดียวกัน แต่ค่า `--chart-1` ถึง `--chart-5`, grid และ axis เปลี่ยนตามธีม.

Comparison และ muted ใช้เส้นประ, neutral ใช้จุด, ชุดหลักใช้เส้นทึบ. Grid เป็น `--chart-grid` และไม่แสดงเส้นตั้ง. Tooltip เป็น `chart-tooltip` และแสดงค่า `0`. คีย์ของ series เปลี่ยนเมื่อชุดข้อมูลเปลี่ยน จึงไม่ remount กราฟจาก hover หรือ tooltip. Animation เดิมยังปิดเมื่อ reduced motion หรือจุดมากกว่า 100 จุด.

## State และ status

`PageState` ยังเป็น `empty`, `error`, `loading`. เพิ่ม `visual` สำหรับ `records`, `activity`, `search`, `chart`, `error`, `network`, `not-found`, `partial` และ `success`. รายการว่างจากตัวกรองของ Projects, Work Items และ Daily Work ใช้ `search`. วันที่ไม่มี Daily Work ใช้ `activity`. กราฟที่ไม่มีจุดใช้ `chart`. ข้อผิดพลาด `Failed to fetch`, `Load failed` หรือ `NetworkError` ใช้ `network`. `permission` ไม่มีหน้า เพราะระบบมี owner คนเดียวและไม่มี permission-denied route. Error ยังเป็น `role="alert"` พร้อม `text-danger`. Loading ยังหมุนด้วย `motion-safe:animate-spin` และมี skeleton. ข้อความยาวยังใช้ `content-wrap`.

Work Item status ไม่ได้เพิ่มค่าใหม่. `completed` เป็น success, `blocked` เป็น error, `cancelled` เป็น disabled เพื่อให้ glyph `–` ไม่ซ้ำกับ `×` ของ blocked. สถานะที่เหลือเป็น processing, pending, active, inactive หรือ info. Badge แสดง glyph ที่ซ่อนจาก screen reader และคำสถานะเดิม.

Toast ห่อ glyph กับข้อความไว้ใน `toast-body` จึงไม่ถูก `justify-between` ดันคนละด้าน. Toast ที่ไม่ใช่ destructive ใช้ glyph สำเร็จพร้อม motion reveal. Toast destructive ใช้ glyph ผิดพลาด. กราฟที่โหลดไม่สำเร็จอยู่ที่ `components/layout/chart-load-error.tsx` ยังบอกว่าข้อมูลส่วนอื่นใช้งานได้ และมีปุ่มลองใหม่.

## Signature

ใช้ซ้ำทั้งผลิตภัณฑ์ ไม่ได้แยกสไตล์รายหน้า:

- `identity-mark` ที่ empty, error และ partial
- `type-display` ที่หัวหน้า
- `type-kpi-hero` ที่ตัวเลข KPI
- `icon-well` ที่โลโก้ sidebar, state และไอคอนโปรไฟล์
- `chart-tooltip`
- `nav-rail` ที่เมนู active มีแถบสั้นสี primary ด้านซ้าย

## สิ่งที่ไม่ได้เปลี่ยน

ไม่มี endpoint, ตาราง, สิทธิ์ หรือสูตร metric ใหม่. Owner gate และ `Asia/Bangkok` ยังทำงานเดิม.

ไม่พบ API, Job, Worker, Scheduler หรือตารางใหม่ของ issue นี้ใน implementation ปัจจุบัน. `permission` มีข้อความใน `VISUAL_STATES` แต่ `VISUAL_STATE_APPLICABILITY.permission` เป็น `not-applicable` เพราะไม่มี permission-denied route.

## การตรวจสอบ

```powershell
pnpm test:frontend-identity
node tests/run.mjs frontend-identity
```

```bash
bash scripts/test-unit.sh frontend-identity
```

ไม่มี Makefile target. Suite นี้เป็น unit test: ไม่ใช้ PostgreSQL, Redis, Docker, network หรือ external service. หลังแก้ review ผลล่าสุดคือ 9 PASS / 0 FAIL / 0 SKIP รวม TC-35-09. Regression `pnpm test:frontend-ui` ได้ 174 PASS. `pnpm lint` และ `pnpm typecheck` ผ่าน.

ตรวจ computed style จาก CSS ที่ compile แล้ว: KPI ที่ใส่ `text-danger` ได้สี `rgb(179, 38, 50)`, หัวข้อที่ใส่ `text-lg` ได้ 18px, และ avatar ที่ใส่ `surface-inset` ได้เงาบุ๋ม. `pnpm build` รอบก่อนหน้า compile และสร้าง static pages 16/16 ผ่าน แล้วหยุดตอน copy standalone บน Windows ด้วย `EPERM` ขณะสร้าง symlink และยังไม่ได้รันซ้ำ. ไม่ได้เปิด browser matrix ของแอปจริง: middleware ตอบ `401` เป็นข้อความล้วนเมื่อไม่มี owner proof. ไม่ได้รัน SonarQube.
