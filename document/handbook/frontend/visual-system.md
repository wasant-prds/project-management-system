# Frontend Visual System and Accessibility — Issue #26

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

ใช้กับ shared [Card](../../../components/ui/card.tsx), [Button](../../../components/ui/button.tsx), [Input](../../../components/ui/input.tsx), [Textarea](../../../components/ui/textarea.tsx), [Select](../../../components/ui/select.tsx), [Tabs](../../../components/ui/tabs.tsx), header และ page shell. สี/เงาไม่ใช้แทน label, semantic status, invalid state หรือ keyboard focus; controls คง visible `focus-visible` และ `aria-invalid` styles. ไม่มี Neumorphism theme toggle เพิ่ม

Root layout โหลด `GeistSans` และ `GeistMono`; Tailwind `font-sans`, `font-heading` และ `font-mono` อ้างถึง font variables เหล่านั้น ดู [root layout](../../../app/layout.tsx) และ [global styles](../../../app/globals.css).

## Responsive layout และ charts

[Shared page layout](../../../components/layout/page-layout.ts) ใช้ขนาด phone ต่ำกว่า 640 px, tablet 640–1023 px และ desktop ตั้งแต่ 1024 px พร้อม `min-w-0` และ page-level horizontal overflow handling. ทั้งแปดเมนูใช้ shared shell; tabs ที่มีเนื้อหากว้างเลื่อนได้ภายใน tab list. Dialog shells จำกัดขนาดตาม viewport และ form dialog เลื่อนได้ภายในตัวเอง ดู [responsive dialog](../../../components/ui/responsive-dialog.ts).

[ChartContainer](../../../components/ui/chart.tsx) เป็นเจ้าของ `ResponsiveContainer` เพียงชั้นเดียว และกำหนดความกว้างขั้นต่ำ/สูงสุดให้ยุบตาม parent. Dashboard และ Analysis ใช้ chart component นี้; legend ห่อบรรทัดได้ ส่วน tooltip และข้อความยาวถูกจำกัดให้อยู่ใน chart frame. ไม่ควรเพิ่ม `ResponsiveContainer` ซ้อนในหน้าที่ใช้ `ChartContainer`.

## Motion และ keyboard

Feedback transitions ของ controls ใช้เวลาสั้น (เช่น button/card 150 ms); active translate ทำงานเฉพาะเมื่อระบบไม่ได้เปิด reduced motion. Global CSS ปิด transition/animation ที่ไม่จำเป็นเมื่อ `prefers-reduced-motion: reduce`. Dashboard และ Analysis อ่าน preference ผ่าน [usePrefersReducedMotion](../../../hooks/use-prefers-reduced-motion.ts) แล้วปิด Recharts animation เมื่อผู้ใช้ร้องขอ

Actions บน Daily Work card สำหรับเปิดรายละเอียดและ Remarks ใช้ native `<button>` จึงรองรับ keyboard activation ตาม semantics ของ HTML. ปุ่มและ controls ส่วนกลางยังคง focus ring ที่มองเห็นได้; state ของ validation และ selected tab ยังคงระบุด้วย border/color ร่วมกับพื้นผิว ดู [Daily Work card](../../../components/page/daily-work/work-log-card.tsx).

## Work Items loading state

หน้า `/work-items` ใช้ [createWorkItemFilterKey](../../../components/page/work-items/work-item-presentation.ts) ตัวเดียวกันทั้งตอนเริ่ม fetch และตอน render. Key รวม year, month, Project, Company, date range, status, priority, role, kind, open/overdue flags และ search ที่ trim whitespace แล้ว; loading จึงสิ้นสุดเมื่อผลลัพธ์ตรงกับ filters ปัจจุบัน หรือแสดง error เมื่อ request ล้มเหลว. ข้อความ loading เป็น block เต็มความกว้างและประกาศผ่าน `aria-live="polite"` ดู [Work Items page](../../../app/work-items/page.tsx).

## Browser assets และ Analytics

- Font utilities ใช้ Geist variables ที่ root layout โหลดไว้. Static font requests ยังผ่าน origin/security gate; หากได้ `403`, ตรวจว่า browser origin ตรงกับ `APP_ORIGIN` ที่ตั้งไว้ตาม [Runtime Security](../../RUNTIME_SECURITY.md).
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

- [Final visual audit — Issue #29](./issue-29-polish.md) — ข้อมูลยาว, exact hours, shared feedback/table, modal focus และผล browser matrix ล่าสุด; ข้อจำกัด browser ของ #26 ด้านบนเป็นประวัติของรอบนั้น.
- [Global styles and theme tokens](../../../app/globals.css)
- [Dashboard charts](../../../components/layout/dashboard-charts.tsx) และ [Analysis page](../../../app/analysis/page.tsx)
- [Frontend UI tests](../../../tests/frontend-ui/visual-system.test.mjs)
- [Work Items loading regression tests](../../../tests/work-items/management.test.mjs)
