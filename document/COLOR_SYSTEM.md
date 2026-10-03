# Issue #27 — ระบบสี Light / Dark แบบ iOS-inspired

วันที่ตรวจ: 2026-10-03

ปรับระบบสีของ UI เดิมทั้งโครงการ: Light ใช้พื้น off-white กับ surface สี neutral; Dark ใช้ charcoal หลายชั้นและข้อความ soft white. Accent หลักเป็นน้ำเงิน ส่วน success / warning / danger / info ใช้ตามความหมาย. เงา Neumorphism ของ Dark มี highlight เบาและเงาลึกแยกจาก Light. `special-dark` เดิมยังใช้ได้และมีพื้น OLED ที่ลึกกว่า Dark.

## การนำไปใช้

`app/globals.css` เป็นแหล่ง semantic tokens กลาง: foundation, text, border, brand, status, interaction และ shadows. Tokens เดิม เช่น `card`, `foreground`, `input` และ `surface-shadow-*` เป็น aliases ให้ shared primitives ใช้ palette เดียวกัน. Tailwind `dark:` ใช้ class ที่เลือกจริง รวม `special-dark` จึงไม่ถูก OS dark preference แทรกขณะผู้ใช้เลือก Light.

ครอบคลุม shell, Sidebar, Header, Dashboard, Projects, Project detail, Work Items, Board, Analysis, Daily Work, Company และ Settings รวมปุ่ม, input/select/textarea, Calendar, tab, badge, toast, overlay, dropdown, modal, chart, loading/empty/error states. ปุ่ม solid ใช้ foreground แยกจาก status label และมีสี hover / active ที่ไม่ลด opacity ของทั้งปุ่ม. Inputs มีขอบที่ชัดและ disabled text ใช้ token เฉพาะ.

สี Project ที่กำหนดไว้ยังอยู่ใน rail / tint; ชื่อและ initials ใช้สีข้อความตามธีมเพื่ออ่านได้เมื่อสี Project สว่างหรือมืดมาก. แก้ alpha ของ `#RGB` ให้ขยายเป็น `#RRGGBB` ก่อน และ fallback ใช้ `project-accent` กลาง. สี HEX ที่เหลือใน component มีเพียง selectors ของ Recharts (`#ccc`, `#fff`) เพื่อแปลงสีจาก library ให้เป็น tokens; chart series และ custom Project colors เป็นข้อยกเว้นที่มีหน้าที่จริง.

Theme preference ยังคง API และ storage key `project-management-theme` เดิม พร้อม Light / Dark / Special Dark. ไม่เพิ่ม System เพราะ preference contract เดิมรองรับสามค่านี้. Origin ที่เคยแก้ไว้ `http://127.0.0.1:3777` ยังคงเดิม; ผู้ใช้ยืนยันแล้วว่าบันทึกธีมได้.

Follow-up dropdown ของ Dashboard / Kanban Board: แทน native `<select>` ด้วย `components/ui/filter-select.tsx` ที่ใช้ shared Radix Select. ทั้ง trigger และรายการ options ใช้ surface, floating shadow, selected checkmark และ focus ตามธีม. Dashboard ยังส่ง GET fields เดิม รวมค่าว่างสำหรับ “ทั้งหมด”; hidden input ส่งค่าจริงโดยไม่เผย internal encoded values. Board ยังคง controlled filters, reset Project เมื่อเปลี่ยน Company และ disabled lock ระหว่างโหลด/บันทึก. Labels และ selected label มีอยู่ตั้งแต่ server render.

## Unit tests รายเคส

| Case | Category | Expected Behavior | Result |
|---|---|---|---|
| COLOR-01 × 3 themes | Accessibility / Foundation | surface hierarchy ต่างระดับ; text / muted / selection / status tint / disabled มี contrast ≥4.5:1 | PASS |
| COLOR-02 × 3 themes | Accessibility / Interaction | solid actions default / hover / pressed ≥4.5:1; focus และ control border ≥3:1 | PASS |
| COLOR-03 | Visual Contract | Dark / OLED มี surface luminance ไล่ระดับและ neutral shadows ต่างจาก Light | PASS |
| COLOR-04 | Component / Loading / Disabled | ปุ่มจริงใช้ semantic states; disabled / busy / invalid native semantics คงอยู่ | PASS |
| COLOR-05 | Edge / Custom Data | สีขาว/ดำ/เหลือง, RGB และ null ไม่เปลี่ยนสีชื่อ Project; shorthand hex และ CSS variable tint ถูกต้อง | PASS |
| COLOR-06 | Business Presentation | status / priority ใช้ semantic role แยกจาก chart series | PASS |
| COLOR-07 | Theme Regression | Tailwind ที่ compile จริงใช้ explicit theme class และสร้าง hover / active colors | PASS |
| COLOR-08 | Color Migration | app/components ไม่มี arbitrary palette หรือ HEX ที่ไม่จำเป็นนอก Recharts adapter | PASS |
| COLOR-09 | Persistence / Regression | Dark → Light ส่งเฉพาะ preference, คง profile/timezone และ provider ใหม่คืนค่าที่ server ยืนยัน | PASS |

## Review Follow-up — Collection Errors and Calendar Selectors

Calendar year/month choices now use `.MuiYearCalendar-button` and `.MuiMonthCalendar-button` from the installed MUI X Date Pickers v8 utility classes. Regression checks bind the production `sx` rules to the exported utility class names, selected color/font tokens and removal of the obsolete selectors.

Company and Projects distinguish fetch errors from a successfully loaded empty collection. Errors render a retryable alert and suppress zero counts/empty guidance; successful retry renders the actual list or a true empty state. `pnpm test:company-projects` covers both fail-and-retry flows.

Theme contrast test names use literal titles so the shared source index maps each dynamically themed case to `tests/frontend-ui/color-system.test.mjs`; no cases fall into `unmapped.test.mjs`.

เพิ่ม **13 unit cases** ใช้ PostCSS/Tailwind, React render และ mocked API; ไม่ต่อ network, PostgreSQL, Docker หรือ external services. `test:color-system` รวม 3 provider regressions เดิมสำหรับ Light → Dark, loading lock/reload และ origin-denied save/retry: **16 PASS / 0 FAIL / 0 SKIP**. ไม่มีการลด contrast threshold หรือแก้ timeout assertion เพื่อให้ผ่าน; test shadow เดิมปรับจาก green highlight เป็น neutral shadow ตาม requirement ใหม่.

Dropdown เพิ่ม 4 unit cases ใน `tests/frontend-ui/filter-select.test.mjs`:

- SELECT-01: ค่า “ทั้งหมด” และ Project ID ถูกส่งผ่าน hidden GET field ตามเดิม; encoded option values ไม่ชนกันและไม่หลุดเข้า form payload.
- SELECT-02: Board callback ส่งค่าจริง, selection ตาม parent reset และยัง disabled ระหว่าง loading.
- SELECT-03: SSR มี combobox ที่เชื่อม label, default GET value และ selected label ก่อน hydration.
- SELECT-04: ทั้ง Dashboard และ Board ใช้ shared themed filter และไม่มี native option popup.

`pnpm test:filter-select` รวม Dashboard summary/filter และ Board workflow regressions: **31 PASS / 0 FAIL / 0 SKIP**. Unit suite ใช้ React SSR และ mocks ไม่เชื่อม network/DB/Docker.

## คำสั่งใช้ซ้ำ

```powershell
pnpm test:color-system
node tests/run.mjs color-system
pnpm test:filter-select
node tests/run.mjs filter-select
pnpm test:frontend-redesign
pnpm test:company-projects
pnpm test:runner
pnpm test:frontend-ui
pnpm test:settings
pnpm quality
docker build --target production -t pms-issue27-validation .
```

รายงานแบบ tree ใช้ `bash scripts/test-unit.sh color-system` หรือ `bash scripts/test-unit.sh filter-select` เมื่อมี Bash และ Node 22+. Preview แยกข้อมูลใช้ `node scripts/frontend-preview.mjs` แล้วเปิด `http://127.0.0.1:3791/?theme=light` หรือ `?theme=dark`; preview ปฏิเสธ writes และไม่ใช้ credentials/DB จริง.

## ผลตรวจและขอบเขต

- Lint ไม่มี ESLint warnings/errors; TypeScript และ Prisma schema validation ผ่าน. Prisma CLI ยังมี deprecation ของ `package.json#prisma` ที่มีอยู่ก่อนงานนี้.
- Production build หลัง dropdown follow-up ผ่านบน Linux Docker รวม compile, lint/typecheck, prerender และ standalone image: `sha256:d84363efe2c48fc6d90b402d37eb608e6ad7e87693046a13e96687421984fc9d`. ไม่ deploy และไม่เปลี่ยนฐานข้อมูล; build นี้เกิดก่อน review follow-up.
- Browser QA ของ production components กับ fixtures: 9 routes × 3 themes × 390×844 / 768×1024 / 1280×900 = **81 checks**, ไม่มี document horizontal overflow และทุกหน้ามี heading จริง. ดู screenshots ทุกหน้าหลักใน Light/Dark เพิ่มเติม; Board scroll อยู่ใน column area.
- ตรวจ Dialog, keyboard Tab/Escape, theme dropdown, selected states, Calendar, disabled controls และ error Toast ใน Light/Dark. Error Toast มาจาก preview boundary ที่ตั้งใจปฏิเสธ writes ไม่ใช่ runtime save failure. Browser console ของ preview ไม่มี warnings/errors.
- Dropdown follow-up ตรวจ popup จริง 2 routes × 3 themes × 3 viewport sizes = **18 checks**: options ใช้ surface/shadow ตามธีมและอยู่ใน viewport. ทดลองเลือก Dashboard Project แล้ว submit GET ได้ `projectId=project-1` พร้อม empty fields เดิม; fixture summary ไม่คำนวณผลกรองจาก DB. Board เลือก Project แล้วเปลี่ยน Company คืนค่า “ทุก Project”; Space/ArrowDown/Enter เลือก role และ Escape ปิด popup คืน focus. Console ไม่มี warnings/errors. ภาพและผล QA บันทึกใน `.next/filter-select-qa/`.
- Hover/pressed palette ตรวจผ่าน contrast tests และ CSS ที่ compile จริง; ไม่อ้างว่าเป็น automated pixel audit ของทุก state. สีและเงาตรวจด้วย visual review เพิ่มเติม.
- Theme persistence ตรวจด้วย provider unit tests และการยืนยัน runtime จากผู้ใช้ก่อนหน้านี้. Preview ล็อก theme ด้วย URL จึงไม่ใช้เป็นหลักฐาน API persistence หรือ SSR hydration.
- Review follow-up: `pnpm test:frontend-redesign` **22/22**, `pnpm test:company-projects` **29/29**, `pnpm test:color-system` **16/16**, `pnpm test:runner` **6/6**; full `pnpm quality` ผ่าน **341 tests: 332 PASS / 0 FAIL / 9 SKIP**. TC-27-21 ครอบคลุม GitLab PMS Project accessible trigger และ themed option popup; TC-27-22 ตรวจ Board detail modal กับ Work Items create/edit/view ใช้ responsive shell เดียวกัน. Linux Docker production build ผ่านหลัง UI follow-up (manifest `sha256:7622855f5fee14be806ef6d4afa08d9cebc9a63b1c9fbf4f0ccd22615d97d7ff`); ไม่ deploy. ผลรายเคสอยู่ใน `issue-27-test-cases.txt`. Opt-in infrastructure tests ที่ SKIP ต้องรันแยกเมื่อมี environment พร้อม. ไม่จัด browser QA, Docker build หรือ runtime HTTP checks เป็น unit tests ของระบบสี.
- SonarQube ยังตรวจไม่ได้: recheck พบว่า `sonar-scanner` ไม่มีใน PATH และ `SONAR_HOST_URL` / `SONAR_TOKEN` ไม่ตั้งค่า. ต้องยืนยัน quality gate ผ่าน CI/server ก่อนปิด checklist #27 ทั้งหมด.

**UNIT TESTS COMPLETE**
