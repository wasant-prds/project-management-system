# Frontend Design System, Themes and Responsive Dialogs — Issue #27

## ขอบเขต

Issue #27 ปรับ Frontend หลักของ PMS ให้ใช้ visual system แบบ Premium Modern Neumorphism ที่คง contrast, semantic states และ keyboard access. เอกสารนี้ครอบคลุม theme, shared controls, responsive layout และ verification ที่ยืนยันจาก implementation ปัจจุบัน.

งานนี้ไม่มี API route, Prisma model/table, background job, queue, worker หรือ scheduler ใหม่. Settings ยังคงใช้ API และ owner access gate เดิม; follow-up theme save แก้การตั้ง `APP_ORIGIN` ให้ตรงกับ browser origin และเพิ่มข้อมูล audit ที่ไม่เปิดเผย credentials. ดู [Owner settings API](../api/settings/me.md), [Owner access gate](../operations/owner-access.md) และ [Runtime operations](../operations/runtime.md).

## หน้าที่ใช้ visual system

| หน้าจอ | Route | Implementation |
| --- | --- | --- |
| Dashboard | `/` | [Dashboard page](../../../app/page.tsx) |
| Projects | `/projects` | [Projects page](../../../app/projects/page.tsx) |
| Project detail | `/projects/[id]` | [Project detail page](../../../app/projects/[id]/page.tsx) |
| Work Items | `/work-items` | [Work Items page](../../../app/work-items/page.tsx) |
| Kanban Board | `/board` | [Board page](../../../app/board/page.tsx) |
| Analysis | `/analysis` | [Analysis page](../../../app/analysis/page.tsx) |
| Daily Work | `/daily-work` | [Daily Work page](../../../app/daily-work/page.tsx) |
| Company | `/company` | [Company page](../../../app/company/page.tsx) |
| Settings | `/settings` | [Settings page](../../../app/settings/page.tsx) |

## Theme และ design tokens

Root `ThemeProvider` ใช้ `attribute="class"`, `defaultTheme="light"`, และ storage key `project-management-theme`. ธีมที่รองรับคือ `light`, `dark` และ `special-dark`; ไม่มี system preference หรือ Neumorphism toggle เพิ่ม. `OwnerSettingsProvider` โหลด preference ของ owner จาก Settings API แล้ว sync ค่า theme และ `document.documentElement.lang` หลังโหลดหรือบันทึกสำเร็จ.

`app/globals.css` เป็นแหล่ง semantic tokens กลาง. Light ใช้พื้นหลัง `#f2f2f7`, surface `#f8f8fb`, inset `#eaeaef` และ blue accent. Dark ใช้พื้นหลัง `#141416`, surface `#202022`, elevated surface `#2c2c30`; `special-dark` ใช้ neutral surfaces ที่ลึกกว่า. สีข้อความ, border, focus, status, disabled state และ shadow แยกตามหน้าที่เพื่อไม่ใช้เงาหรือสีพื้นแทนความหมายของข้อมูล.

| Utility / token group | ความหมาย |
| --- | --- |
| `surface-soft`, `surface-raised` | แยกพื้นผิว card และพื้นที่ยกขึ้น |
| `surface-inset` | พื้นผิว input และ selected control |
| `surface-hover`, `surface-pressed` | interaction states ของ control |
| `surface-shadow-*` | เงาตามระดับ soft, raised, hover, inset, pressed, floating และ modal |
| `--motion-interaction`, `--motion-overlay` | ระยะเวลา transition ของ controls และ overlays |
| `prefers-reduced-motion` | ลดหรือปิด transition/animation ตาม preference ของระบบ |

Shared primitives เช่น [Button](../../../components/ui/button.tsx), [Input](../../../components/ui/input.tsx), [Select](../../../components/ui/select.tsx), Card, Tabs, Dialog และ Toast ใช้ tokens เดียวกัน. ปุ่ม, selected/error states, form labels และ visible keyboard focus ยังคงแสดงชัดเจนแม้ใช้ surface shadows.

## Select controls และ filter behavior

`SelectContent` ใช้ `bg-popover`/`text-popover-foreground`, option ที่ focus ใช้ `focus:bg-accent`/`focus:text-accent-foreground`; รายการใช้ Radix Select แทน native option popup.

- Dashboard ใช้ [FilterSelect](../../../components/ui/filter-select.tsx) กับ Company, Project, functional role และ Work Item kind. ค่าว่าง “ทั้งหมด” ยังคงถูกส่งเป็น GET field จริงผ่าน hidden input; prefix ภายใน Radix option จะถูกถอดออกก่อน serialize จึงไม่ปรากฏใน URL.
- Board ใช้ FilterSelect แบบ controlled สำหรับ Company, Project และ role. เปลี่ยน Company แล้ว Project reset เป็น “ทุก Project”; filter controls ถูก lock ระหว่างโหลด, error หรือมี status write ค้าง. ดู [Board filter implementation](../../../app/board/page.tsx).
- GitLab Import ใน Work Items ใช้ shared Select สำหรับ PMS Project และ label-to-Work Item type. PMS Project มี accessible label/required state; ถ้ายังไม่เลือก Project การ save จะแสดง validation error. Project list ว่างหรือกำลัง save จะ disable control. Mapping requests ยังใช้ API เดิมตาม [GitLab Project mappings](../api/integrations/gitlab-projects.md).

## Dialog sizing

`DIALOG_SHELL_CLASS` ใช้ขนาด responsive ร่วมกัน: phone มีขอบรอบ viewport 1rem, tablet มีขอบ 2rem และ desktop จำกัดความกว้างสูงสุด `54.6rem` พร้อมความสูง `90dvh`. Shell ใช้ flex column กับ `overflow-hidden`; เนื้อหาเลื่อนภายในส่วน body.

Board Work Item detail ใช้ shell ตัวเดียวกับ Work Items create/edit/view dialogs จึงคงขนาดเดียวกันทุก breakpoint. Daily Work form ใช้ wide shell แยกต่างหากตามปริมาณข้อมูล. ดู [responsive dialog shells](../../../components/ui/responsive-dialog.ts), [Board detail dialog](../../../components/page/board/board-work-item-dialog.tsx) และ [Work Items create/edit dialog](../../../components/page/work-items/work-item-dialog.tsx).

## Theme persistence และ owner origin

การโหลดและบันทึก preference ใช้ `GET`/`PATCH /api/settings/me` เดิม; API จำกัด owner ผ่าน gate และข้อมูล theme ที่บันทึกอยู่ใน `User.theme`. Provider ใช้ PATCH ก่อนอัปเดต canonical state และเปลี่ยน theme ที่ render; ถ้าบันทึกล้มเหลวจะคงค่าที่ server ยืนยันไว้และปลด save lock เพื่อ retry.

Browser origin ของ write request ต้องตรงกับ `APP_ORIGIN` แบบ scheme/host/port รวมทั้งยังต้องผ่าน owner credentials. `Origin` ที่ขาดหรือไม่ตรงถูกปฏิเสธ; ห้ามแก้ปัญหาด้วยการ bypass owner/origin checks. Owner access audit ระบุ event, outcome, method, status, normalized origin marker และ Bangkok timestamp แต่ไม่บันทึก username/password, Authorization header, path, query หรือ request body. ตรวจ troubleshooting เพิ่มเติมที่ [Owner access gate](../operations/owner-access.md).

## การตรวจสอบ

คำสั่งที่ใช้ซ้ำได้จาก root ของ repository:

```powershell
pnpm test:frontend-redesign
pnpm test:filter-select
pnpm test:color-system
pnpm test:settings
pnpm test:runtime-security
pnpm quality
docker build --target production -t pms-issue27-validation .
```

`pnpm test:frontend-redesign` รวม TC-27-21 สำหรับ GitLab PMS Project themed Select และ TC-27-22 สำหรับ Board/Work Items dialog shell. `pnpm test:filter-select` ตรวจ GET serialization และ Board reset/loading behavior; `test:color-system` ตรวจ palette/contrast; Settings และ runtime-security suites ตรวจ persistence/origin gate. Full `pnpm quality` รัน lint, typecheck, Prisma validation และ shared test runner; infrastructure integration cases ที่ไม่มี environment จะรายงานเป็น `SKIP`.

Visual fixture ใช้ `node scripts/frontend-preview.mjs` ที่ `http://127.0.0.1:3791` และเลือก theme ผ่าน `?theme=light`, `?theme=dark` หรือ `?theme=special-dark`. Preview ใช้ synthetic fixtures, ไม่อ่าน `.env`/ฐานข้อมูล และปฏิเสธ API writes; ใช้ตรวจ presentation เท่านั้น ไม่ใช่หลักฐาน production authentication, database persistence หรือ E2E.

ณ วันที่ 2026-10-03, `pnpm test:frontend-redesign` ผ่าน **22/22** และ `pnpm quality` ผ่าน **341 tests: 332 PASS / 0 FAIL / 9 SKIP**; Linux Docker production build ผ่าน. Prisma CLI ยังพิมพ์ deprecation warning เดิมของ `package.json#prisma`. SonarQube ไม่ได้รันเพราะ environment ไม่มี scanner หรือ `SONAR_HOST_URL`/`SONAR_TOKEN`. เมื่อ 2026-10-04 ผู้ใช้ยกเว้น gate และปิด checklist #27; ไม่มีการอ้างว่า SonarQube ไม่มี findings.

ผล test รายเคส: [Issue #27 test report](../../issue-27-test-cases.txt). เงื่อนไขและผล implementation: [Issue #27 work item](../../../design/projects/project-management-system/work_items/27_dev_redesign-frontend-premium-neumorphism.md).

## ขอบเขตที่ยังไม่ยืนยัน

- ไม่มี SonarQube quality-gate result จาก server/CI; gate นี้ถูกยกเว้นตามคำสั่งผู้ใช้เพื่อปิด checklist #27.
- Unit/browser fixture checks ไม่แทน screen-reader certification, pixel audit ของทุก state หรือ production E2E.
- Issue #27 ไม่เปลี่ยน API contract หรือ database schema; ข้อมูล runtime จริงต้องตรวจผ่าน environment ที่มีสิทธิ์เข้าถึงตาม runbook.
