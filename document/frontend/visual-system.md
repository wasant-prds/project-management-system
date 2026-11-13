# Frontend Visual System and Accessibility

## Shared premium foundation — Issue #47 (2026-11-12)

มาตรฐานส่วนนี้ต่อยอด #26–#36 และ compact tools จาก #43 ใช้กับ shared primitives เดิมใน Light, Dark และ Special Dark. ส่วนประวัติ #26 ด้านล่างยังใช้สำหรับ shell, motion และ accessibility; การเลือกพื้นผิว controls ให้ใช้ข้อกำหนด #47 นี้ก่อน

### Surface และ shadow hierarchy

- **Canvas:** `--background` / `--surface-canvas` เป็นพื้นหลังของ shell ไม่มีเงาเพิ่มบน page wrapper
- **Panel:** `--card` / `--surface-panel` ใช้ `Card` เดิมกับ `surface-soft`; `card-shadow` / `surface-raised` ใช้เน้นกลุ่มข้อมูลหลักเท่านั้น เงา soft/raised/hover ลดระยะและความเข้มในทั้งสามธีม
- **Control:** `--input` / `--surface-control` ใช้ Input, Textarea และ Select พร้อม `shadow-input` ซึ่งอ้าง `--shadow-control` เป็น inset บาง ๆ เพียงชั้นเดียว ขอบ field และ focus ring ยังคงแยกชัด
- **Inset:** `--surface-inset` และ `surface-inset` ใช้กับ tab track, selected tab หรือ icon well ไม่ใช้ทำการ์ดทุกชั้นให้เว้าพร้อมกัน
- **Floating:** `--popover`, `--surface-shadow-floating` และ `--surface-shadow-modal` ใช้เฉพาะ popup/dialog ที่ลอยเหนือเนื้อหา Dialog คงพื้น `bg-card` ทึบและ Radix focus scope เดิม

Card ที่ซ้อนใน Card เป็นกลุ่มมีขอบ ไม่มี raised shadow ขณะ idle. Interactive card ยังใช้ feedback เดิมได้ และ focus-visible ไม่ถูกลบ. ปุ่มรองเป็นพื้นเรียบมีขอบ ปุ่มหลักมีเงา soft; ไม่เพิ่ม `surface-raised` ให้ Input, Badge หรือทุก row ในรายการ ไม่วาง `surface-soft` ซ้อนกับ `shadow-lg` เพื่อชดเชย hierarchy

### Radius, spacing และ typography

- `--radius-control` = 10px ใช้ Button ทุก size, Input, Textarea, Select และ TabsTrigger. Panel = `--radius-panel` 20px; modal = `--radius-modal` 24px; Badge = `--radius-badge` pill. Compact header tools คง radius 14px จาก #43 ซึ่งเป็นกลุ่มเครื่องมือ ไม่เพิ่ม override รายหน้าให้ field เดียวกันมีหลาย radius
- จังหวะพื้นฐานคือ `--space-field` 8px, `--space-group` 16px, `--space-panel` 20px และ `--space-section` 24px. Card ใช้ panel token. `PAGE_INNER` คง padding 16/20/24px ที่ phone/tablet/desktop; ใช้ `PAGE_TOOLBAR`, `STAT_GRID`, `FILTER_ROW` และ tab scroll utilities เดิม ห้ามขยาย collapsed filters กลับเป็น toolbar เต็มหน้าหลายแถว
- หัวหน้าหลักใช้ `PAGE_HEADING` / `type-display`, ชื่อ section ใช้ `type-section`, ชื่อ Card ใช้ `CardTitle` / `type-card-title`, ข้อความอธิบายใช้ `type-body`, metadata ใช้ `type-caption`. CardDescription และ DialogDescription ใช้ body role ที่น้ำหนักเบากว่าชื่อ ห้ามเพิ่ม `font-bold` ให้ caption ทุกตัวจนอ่าน hierarchy ไม่ออก
- ตัวเลข KPI ใช้ `type-kpi-hero`, ตัวเลขข้อมูลใช้ `type-data` / `tabular-nums`. จัดเซลล์ตัวเลขให้ชิดขวาและใช้ `formatHours` เดิม ไม่เปลี่ยนค่าหรือสูตร. Badge ใช้ medium weight และ tabular numerals; status/priority ยังมีข้อความและ semantic colors เดิม

### Action hierarchy และศัพท์ร่วม

ใช้ Button เดิม: `default` สำหรับงานหลักของบริบท ใช้ semibold + soft elevation; `outline` / `secondary` สำหรับงานรอง ใช้ขอบ + พื้นเรียบ; `ghost` สำหรับ utility; `destructive` สำหรับลบ ใช้ขอบ + คำกริยาที่ชัด และไอคอนถังขยะเมื่อมีพื้นที่. แยกความหมายด้วยคำ รูปทรง น้ำหนัก และไอคอนร่วมกับสี ห้ามใช้ปุ่มไอคอนล้วนที่ไม่มี accessible name. อย่าใช้ destructive เป็น action หลักของ workflow เพียงเพราะอยู่บน header

ศัพท์มาตรฐาน: **เพิ่ม** (เปิดฟอร์มเพิ่ม), **สร้าง Project / Work Item** (ยืนยันสร้าง), **บันทึก**, **ยกเลิก**, **แก้ไข**, **ลบ [ชื่อรายการ]**, **ดูรายละเอียด / เปิด [ปลายทาง]**, **ลองอีกครั้ง**, **ค้นหาและตัวกรอง**, **ล้างตัวกรอง**, **ใช้ตัวกรอง** (แบบ draft/submit), **แสดงผลลัพธ์** (ปิด panel ของตัวกรองที่เปลี่ยนทันที), **นำเข้า**, **ส่งออก CSV / Markdown / JSON**. Busy copy ใช้ “กำลังบันทึก…” / “กำลังนำเข้า…”. คงชื่อ Dashboard, Project, Work Item, Board, Daily Work, Company, GitHub, GitLab, functional role และ workflow status ตามสัญญาเดิม ไม่แปล persisted enum

Daily Work ใช้ “เพิ่มบันทึกเวลา” และ “บันทึกเวลา: [ช่วงวัน]” แล้ว งานแปล labels เฉพาะหน้าที่เหลือให้ทำต่อใน #48–#53. ปุ่ม “เปิด Work Items” ใน Project detail ใช้ primary variant เพื่อให้มีจุดไปต่อที่แยกจากลบ Project โดยคงตำแหน่งและปลายทางเดิม

### วันที่และเวลา

ข้อความวันที่แสดง **DD/MM/YYYY ปี ค.ศ.** และ datetime แสดง **DD/MM/YYYY, HH:mm** (24 ชั่วโมง) ใน `Asia/Bangkok`. ใช้ `formatUiDate` / `formatUiDateTime` จาก `lib/display-date.ts` ซึ่ง reuse `formatBangkokDateLabel`; ห้ามสร้าง `Intl.DateTimeFormat` หรือ `toLocaleDateString` รายหน้าเพื่อแสดงวันเต็ม. Timestamp ที่ข้ามเที่ยงคืนต้องตัดวันตาม Bangkok เช่น `2026-10-02T17:00:00Z` แสดง `03/10/2026`. ไม่มีวันที่ใช้ “—”; label เฉพาะบริบทเช่น “ไม่มีกำหนด” คงได้

Date picker คง `formatDatePickerDisplay` เดิมที่ให้ DD/MM/YYYY แบบ deterministic และทำงานได้แม้ Intl ไม่พร้อม. Calendar/axis ใช้วันสั้น DD/MM และช่วงเดือน MM/YYYY; tooltip ใช้วันเต็ม. Daily Work แยก display period ออกจาก export label เดิม

ใช้ formatter เหล่านี้เฉพาะข้อความ ห้ามเอาไปสร้าง `value`, query, URL หรือ API payload. ฟอร์มและวันล้วนคง `YYYY-MM-DD`; persisted Bangkok wall-clock, UUID references, CSV/Markdown export serializers และ default ของ `formatBangkokDateLabel` เดิมไม่เปลี่ยน. ค่า Date ของ calendar ที่แทนวันใน local fields ให้ผ่าน `formatDate` เดิมก่อนส่งเข้า display formatter

### Active-filter summary แบบ compact

`SearchFilterPanel` คง entry point เดียวใน heading, badge นับเงื่อนไข, panel ที่ scroll ภายใน และ grouped `DataTransferMenu` เดิม. ส่ง `activeCount` ตาม semantics ของหน้านั้น และ `summary` เป็นข้อความสั้นจาก **ตัวกรองที่ใช้จริง** เช่น `Project Alpha · กำลังดำเนินการ`. เมื่อ count > 0 summary แสดงแบบ ellipsis สูงสุด 11rem บน tablet/desktop; phone แสดง count และมีข้อความเต็มใน accessible name/title. เมื่อ count = 0 ไม่แสดง summary. ห้ามใส่ internal IDs หรือย้าย filter fields ออกมาวางใน header

```tsx
<SearchFilterPanel activeCount={activeCount} summary={appliedFilterLabel} onReset={resetFilters}>
  {/* FilterField + Input / FilterSelect / DatePicker เดิม */}
</SearchFilterPanel>
<Button onClick={openCreate}><Plus aria-hidden="true" />เพิ่ม Work Item</Button>
<Button variant="outline" onClick={cancel}>ยกเลิก</Button>
<Button variant="destructive" onClick={openDelete}><Trash2 aria-hidden="true" />ลบ Work Item</Button>
```

ไม่คำนวณ filters ใหม่ภายใน shared panel. ไม่เปลี่ยน controlled/uncontrolled state, Escape, portal, initial focus หรือ restore focus ของ Popover/Select/Calendar/Dialog; focus ring, selected border/weight, invalid border และ disabled surfaces ต้องคงอยู่

### การส่งต่องาน #48–#53

- **#48 Dashboard + Analysis:** นำ surface/type/action roles และวันสั้นบน chart ไปใช้เมื่อจัด KPI, reports และ applied-filter summary; ไม่เปลี่ยน metric formulas
- **#49 Projects + workspace:** ใช้ Card grouping, primary/secondary pattern, วันที่ร่วม และ local tab scroll เมื่อจัด portfolio/Integrations ต่อ
- **#50 Work Items + Board:** ใช้ medium Badge, numeric alignment, flat nested grouping และ compact active summary เมื่อปรับ density; คง statuses, drag/status handlers และ export formats
- **#51 Daily Work:** ใช้ display period ที่แยกจาก export label, shared date และ spacing เมื่อจัด journal/hours ต่อ
- **#52 Company + Settings:** ใช้ field radius, explicit errors/disabled state และ action hierarchy; theme previews ต้อง reuse สาม palette เดิม
- **#53 Login + states:** ตรวจผลรวมหลังงานรายหน้า ใช้ shared Button/Input/Dialog ที่ปรับแล้ว และเก็บ final state/visual acceptance ใหม่ ไม่ถือว่าการตรวจผลกระทบใน #47 ปิดงานนี้แทน

คำสั่งตรวจและหลักฐานของ #47 อยู่ใน [testing guide](../development/testing.md). ภาพ/JSON/logs อยู่ใน `artifacts/issue-47/` (gitignored). การตรวจ foundation ครอบคลุมผลของ shared changes บน 10 หน้า ไม่ใช่การตรวจรับ layout รายหน้าของ #48–#53 หรือ production data

ผล completion วันที่ 2026-11-12: tests 479 PASS / 0 SKIP เมื่อเปิด isolated Docker checks, matrix 120 PASS, header/import-export 68 PASS, lint/typecheck และ Linux production Docker build ผ่าน. Native Windows packaging ยังมี symlink `EPERM`; ดู [รายงาน verification และขอบเขตส่งมอบ](./shared-foundation-verification.md)

## ภาพรวม

Issue #26 ปรับ visual system และ responsive behavior ของ Dashboard (`/`), Projects (`/projects`), Work Items (`/work-items`), Board (`/board`), Analysis (`/analysis`), Daily Work (`/daily-work`), Company (`/company`) และ Settings (`/settings`). ใช้ shared theme tokens/components เพื่อให้ surfaces และ controls สอดคล้องกัน พร้อมรักษา focus, validation และสถานะเชิงความหมายให้มองเห็นได้

ขอบเขตนี้เป็น frontend presentation และ usability ไม่มี API, database schema, business rules หรือ dependency ใหม่

## Theme และ shared components

ระบบคง theme `light`, `dark` และ `special-dark` เดิม โดยกำหนด shadow tokens แยกตาม theme แล้วนำไปใช้ผ่าน utility ต่อไปนี้:

| Utility | การใช้งาน |
| --- | --- |
| `surface-soft` | พื้นผิว card/control แบบยกขึ้นเล็กน้อย |
| `surface-raised` | พื้นผิวที่เน้น เช่น chart tooltip |
| `surface-inset` | พื้นผิวเว้าสำหรับ input และ tab ที่เลือก |

ใช้กับ shared [Card](../../components/ui/card.tsx), [Button](../../components/ui/button.tsx), [Input](../../components/ui/input.tsx), [Textarea](../../components/ui/textarea.tsx), [Select](../../components/ui/select.tsx), [Tabs](../../components/ui/tabs.tsx), header และ page shell. สี/เงาไม่ใช้แทน label, semantic status, invalid state หรือ keyboard focus; controls คง visible `focus-visible` และ `aria-invalid` styles. ไม่มี Neumorphism theme toggle เพิ่ม

Root layout โหลด `GeistSans` และ `GeistMono`; Tailwind `font-sans`, `font-heading` และ `font-mono` อ้างถึง font variables เหล่านั้น ดู [root layout](../../app/layout.tsx) และ [global styles](../../app/globals.css).

## Responsive layout และ charts

Dashboard จัด summary → งานเร่งด่วน/เกินกำหนด → รายการล่าสุด/Projects → กราฟชั่วโมง ตามลำดับ DOM เดียวกันทุก viewport. ความคืบหน้า Project ใช้งานทั้งหมดของเจ้าของใน Project ตามสัญญาเดิม ไม่ใช่เฉพาะช่วงรายงาน

Analysis แสดงช่วงวัน Asia/Bangkok, ชื่อ Company/Project/role/kind ที่ใช้จริง หน่วย และอัตราสำเร็จก่อน KPI โดยอ่านจาก metadata ของ report ที่โหลดสำเร็จ. ตัวกรองใน compact panel ยังเป็น draft จนกดใช้ตัวกรอง; draft ไม่เปลี่ยน summary และปิดการส่งออกไว้. กราฟคง bar/line และ series เดิม พร้อมคำอธิบายหน่วยและสีประจำ series

Dashboard/Analysis เปิดอ่าน “วิธีคำนวณและขอบเขตข้อมูล” ด้วย native disclosure (`details`/`summary`) บนหน้าเดิมได้ทั้ง keyboard/touch. ตารางชั่วโมงรายช่วงอยู่ใน disclosure ใต้กราฟ ส่วน source tables อยู่ใน tabs เดิม. ใช้คำว่า “ชั่วโมงที่บันทึก” และ “อ้างอิงบันทึก” ใน UI แทนศัพท์ storage. Hour axes ใช้ scientific notation เฉพาะค่าที่ใหญ่มาก/เล็กมากเพื่อรักษาพื้นที่ โดย KPI, tables, tooltip และ CSV จัดรูปแบบจาก decimal string เดิมเป็น 2 ตำแหน่ง ไม่ปัดก่อนรวม. จุด hours chart ยังคงเป็น source link โดยไม่มี decorative active dot ทับลิงก์

[Shared page layout](../../components/layout/page-layout.ts) ใช้ขนาด phone ต่ำกว่า 640 px, tablet 640–1023 px และ desktop ตั้งแต่ 1024 px พร้อม `min-w-0` และ page-level horizontal overflow handling. ทั้งแปดเมนูใช้ shared shell; tabs ที่มีเนื้อหากว้างเลื่อนได้ภายใน tab list. Dialog shells จำกัดขนาดตาม viewport และ form dialog เลื่อนได้ภายในตัวเอง ดู [responsive dialog](../../components/ui/responsive-dialog.ts).

[ChartContainer](../../components/ui/chart.tsx) เป็นเจ้าของ `ResponsiveContainer` เพียงชั้นเดียว และกำหนดความกว้างขั้นต่ำ/สูงสุดให้ยุบตาม parent. Dashboard และ Analysis ใช้ chart component นี้; legend ห่อบรรทัดได้ ส่วน tooltip และข้อความยาวถูกจำกัดให้อยู่ใน chart frame. ไม่ควรเพิ่ม `ResponsiveContainer` ซ้อนในหน้าที่ใช้ `ChartContainer`.

## Motion และ keyboard

การเปิดหน้าใช้จังหวะเดียวบนเนื้อหา `main` ภายใน shell: opacity 0.96 → 1 ใน 240 ms โดยไม่เลื่อนหรือย่อหน้า ส่วน sidebar และ header คงที่ ไม่มีการจับภาพทั้งหน้าด้วย View Transition API. ส่วนหัว การ์ด รายการข้อมูล และกรอบกราฟไม่เล่น entrance ซ้อนหรือไล่ stagger เมื่อโหลดข้อมูลสำเร็จ; skeleton เป็นพื้นผิวคงที่ ไม่ pulse

Dialog และ AlertDialog ใช้กรอบทึบที่เลื่อนเข้าระยะ 4 px โดยไม่ zoom หรือเฟดข้อความ และปล่อย transform เมื่อจบ ฉากหลังเป็น scrim ที่เฟดครั้งเดียว ไม่มี backdrop blur เต็มจอหรือการหรี่ header/sidebar ซ้ำอีกชั้น. Daily Work คง Dialog, portal, overlay และ focus scope เดิมขณะ lazy-load ฟอร์ม แสดง error และ retry โดยเปลี่ยนเฉพาะเนื้อหาภายใน; ไม่สร้าง modal ใหม่แทนกรอบรอโหลด. Reduced motion ปิด entrance/exit ของ dialog, overlay และ sheet

Feedback transitions ของ controls ใช้เวลา 160 ms; dialog/dropdown ใช้ 190 ms. แท็บเปลี่ยนเนื้อหาด้วย opacity 0.96 → 1 ใน 160 ms และ KPI แสดงค่าจริงตั้งแต่แรก โดยจำนวนเต็ม interpolate เฉพาะเมื่อค่าเปลี่ยน. Active translate ทำงานเฉพาะเมื่อระบบไม่ได้เปิด reduced motion. Global CSS ปิด transition/animation ที่ไม่จำเป็นเมื่อ `prefers-reduced-motion: reduce`. Dashboard และ Analysis อ่าน preference ผ่าน [usePrefersReducedMotion](../../hooks/use-prefers-reduced-motion.ts) แล้วปิด Recharts animation เมื่อผู้ใช้ร้องขอ

Actions บน Daily Work card สำหรับเปิดรายละเอียดและ Remarks ใช้ native `<button>` จึงรองรับ keyboard activation ตาม semantics ของ HTML. ปุ่มและ controls ส่วนกลางยังคง focus ring ที่มองเห็นได้; state ของ validation และ selected tab ยังคงระบุด้วย border/color ร่วมกับพื้นผิว ดู [Daily Work card](../../components/page/daily-work/work-log-card.tsx).

## Work Items loading state

หน้า `/work-items` ใช้ [createWorkItemFilterKey](../../components/page/work-items/work-item-presentation.ts) ตัวเดียวกันทั้งตอนเริ่ม fetch และตอน render. Key รวม year, month, Project, Company, date range, status, priority, role, kind, open/overdue flags และ search ที่ trim whitespace แล้ว; loading จึงสิ้นสุดเมื่อผลลัพธ์ตรงกับ filters ปัจจุบัน หรือแสดง error เมื่อ request ล้มเหลว. ข้อความ loading เป็น block เต็มความกว้างและประกาศผ่าน `aria-live="polite"` ดู [Work Items page](../../app/work-items/page.tsx).

## Browser assets และ Analytics

- Font utilities ใช้ Geist variables ที่ root layout โหลดไว้. Static font requests ยังผ่าน origin/security gate; หากได้ `403`, ตรวจว่า browser origin ตรงกับ `APP_ORIGIN` ที่ตั้งไว้ตาม [Runtime Security](../operations/runtime-security.md).
- Vercel Analytics ไม่ render โดยปริยาย; root layout render `<Analytics />` เมื่อ `VERCEL_ANALYTICS_ENABLED` มีค่าเป็น string `true` เท่านั้น. เปิดค่านี้เฉพาะเมื่อ deployment บน Vercel เปิด Web Analytics แล้ว มิฉะนั้น browser อาจร้องขอ script ที่ deployment ไม่ได้ให้บริการ.
- ข้อความ console `Pep:1` ยังระบุ source ไม่ได้จาก implementation; ต้องใช้ request URL ใน Network panel เพื่อผูกกับ route หรือ asset ที่ถูกต้อง.

## Verification

| คำสั่ง | ตรวจสอบ |
| --- | --- |
| `pnpm test:frontend-ui` | Theme tokens, shared components, responsive shell/dialog/chart bounds, font mapping, Analytics opt-in, keyboard buttons และ reduced-motion contracts |
| `node tests/run.mjs frontend-ui` | รัน focused frontend UI suite ผ่าน shared Node runner โดยตรง |
| `pnpm test:work-items` | Work Items filter key และ loading transitions |
| `pnpm test:runtime-security` | Origin handling ของ static font requests และ runtime security behavior |
| `pnpm lint` / `pnpm typecheck` | ตรวจ lint และ TypeScript |

รายงาน #26 บันทึก isolated responsive preview ที่ 360, 760 และ 1080 CSS px โดยไม่พบ horizontal overflow. Focused unit tests ไม่ได้ยืนยัน live data, runtime composition ของทุก route หรือการโต้ตอบ keyboard/dialog/tooltip ใน browser; ควรตรวจสิ่งเหล่านี้กับ non-production environment ที่ปลอดภัยก่อน release. Actual application routes ไม่ได้เปิดใน browser ระหว่างการ review.

## Source และ test references

- [Global styles and theme tokens](../../app/globals.css)
- [Dashboard charts](../../components/layout/dashboard-charts.tsx) และ [Analysis page](../../app/analysis/page.tsx)
- [Frontend UI tests](../../tests/frontend-ui/visual-system.test.mjs)
- [Work Items loading regression tests](../../tests/work-items/management.test.mjs)
