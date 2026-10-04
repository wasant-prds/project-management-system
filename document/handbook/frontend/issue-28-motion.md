# Motion และ interaction — Issue #28

ระบบใช้ CSS transitions/keyframes ของ stack เดิม และ Recharts animation โดยไม่เพิ่ม dependency สำหรับ motion. ใช้ร่วมกับ Premium Neumorphism และ Light/Dark/Special Dark ที่มีอยู่

## Tokens และการใช้งาน

Timing/easing ของ CSS อยู่ใน `app/globals.css`; ค่าเดียวกันสำหรับ JavaScript อยู่ใน `components/ui/motion.ts` และมี unit test ป้องกันค่าคลาดกัน

- `instant` 100 ms; `fast` 160 ms สำหรับ controls/KPI; `standard` 260 ms สำหรับ content; `slow` 420 ms
- Route entrance 180 ms; overlay enter 190 ms / exit 160 ms; chart/progress 340 ms
- Stagger step 24 ms จำกัด delay ไว้ 5 ตำแหน่งแรก สูงสุด 96 ms; รายการที่เหลือเข้าพร้อมกัน ไม่รอคิว
- Easing: standard, enter, exit และ spring แบบ restrained cubic-bezier

ใช้ `motion-control` สำหรับ state feedback, `motion-card` กับ interactive cards, `motion-content-enter` เมื่อ content ปรากฏ, `motion-value-change` สำหรับ KPI และ `motion-stagger` ที่ container. อย่าใส่ `key` ตามค่า filter ให้ทั้งหน้าจน form/focus ถูก remount

`app/template.tsx` ใช้ opacity entrance เมื่อ App Router เปลี่ยนหน้า. Wrapper ไม่ใช้ transform เพื่อให้ fixed Sidebar/overlay อ้างอิง viewport ตามเดิม. Content/value keyframes จบด้วย `transform: none` เพื่อไม่คง transformed containing block หลัง animation

KPI จำนวนเต็มที่อยู่ใน safe integer range แสดงค่าจริงตั้งแต่ SSR/first hydration และ interpolate เฉพาะการเปลี่ยนครั้งถัดไปภายใน 260 ms. `AnimatedStatValue` อัปเดต DOM เฉพาะตัวเลขที่ซ่อนจาก accessibility tree; `sr-only` แสดง target จริงตลอด ไม่ประกาศตัวเลขระหว่างทาง. `tweenMetric` ไม่ใช้ React state ทุก frame, ยกเลิก frame เมื่อ unmount/เปลี่ยนค่า และเริ่มจากค่าที่แสดงอยู่เมื่อมี update ซ้อน. Reduced motion แสดง target ทันที. String, Decimal hours, percentage และค่าที่ไม่ใช่ safe integer คงข้อความจริงพร้อม keyed reveal โดยไม่ปัดค่า. Progress ใช้ transform transition; Dashboard/Analysis chart ใช้ timing กลางและปิด animation ตาม `usePrefersReducedMotion`

## Navigation และ keyboard

Sidebar marker อยู่ใน `SharedNavigationIndicator` เพื่อ mount ตาม lazy mobile portal. `observeNavigationIndicator` รวม resize events เป็นหนึ่ง measurement ต่อ animation frame, อ่าน geometry ก่อนเขียน CSS variable และคืน observer/listener/frame เมื่อ unmount. ไม่ใช้ React state อัปเดตทุก frame

Marker แสดงเฉพาะ active link ในกลุ่มเมนูหลัก; Settings อยู่ใน footer และใช้ selected inset state. ทุก link คง `aria-current`. Mobile drawer คืน focus ไปที่ registered `SidebarTrigger` หลังปิดด้วย Escape; หาก trigger ถูก unmount ระหว่าง navigation จะปล่อยให้ Radix จัดการตามปกติ

## Loading และ async feedback

`ApplicationLoadingShell` เป็น fallback ระดับ application. `ContentLoadingSkeleton` มี layout rows/cards/report/profile/board และเป็น `aria-hidden`; container ประกาศ loading ด้วย status/busy. Projects/Company ใช้ cards, Settings ใช้ profile และ Analysis initial load ใช้ report. Analysis refresh ที่มี report อยู่แล้วคงข้อมูลเดิมและแสดง status สั้น ๆ. Board ใช้ columns ตาม `WORK_ITEM_STATUSES` และเลื่อนแนวนอนเฉพาะ Board; Work Items/Daily Work ใช้ rows แทนข้อความโหลดทั่วไป

Daily Work แยก list loading/error ออกจาก mutation state; generation guard ยอมรับเฉพาะ request ล่าสุด รวม cleanup เมื่อ filter เปลี่ยน/unmount. Summary แสดง skeleton ระหว่างโหลดและ `—` เมื่ออ่านล้มเหลว; error มี retry และไม่แสดง empty/zero ปลอม. ชั่วโมง Decimal คง representation เดิม. รายการ Board/Work Items/Daily Work และกลุ่มที่เปิดใช้ `motion-data-enter` แบบ opacity-only 160 ms เพื่อไม่เปลี่ยน containing block ของ sticky header

PageState ใช้ content entrance สำหรับ loading/empty/error; placeholders แสดงเฉพาะ loading. Error/retry controls และข้อความ validation/save/export เดิมยังคงอยู่ ไม่แทนข้อผิดพลาดด้วยตัวเลขศูนย์

## Accessibility และ performance

- `prefers-reduced-motion: reduce` ปิด route/content/value/stagger animation และลด transitions ของ controls/overlays; Recharts ปิด animation ผ่าน preference hook
- Desktop hover จำกัดการยก card ให้ 1 px; pressed depth อยู่เหนือ surface utilities และชนะ hover state; touch ใช้ pressed/inset feedback และ target rules กลาง; focus ring ยังเห็นชัด
- Closed overlays ใช้ exit duration/easing เหนือ enter timing. Toast transitions รองรับ `translate` ขณะ swipe cancel และปิด transition ระหว่าง finger movement
- ไม่เพิ่ม scroll hijacking, continuous animation loop, parallax หรือ dependency. Route/content/progress ใช้ opacity/transform; shadow transitions ใช้เฉพาะ interactive surfaces. Counter ใช้ RAF เฉพาะช่วง update สั้น ๆ และหยุดเมื่อจบ
- Native scrolling และ Work Items sticky tree คง layout เดิม. `observeStickyHeader` รวม scroll/resize/ResizeObserver เป็น measurement เดียวต่อ frame, อ่าน geometry ก่อน callback, ใช้ passive scroll และคืน listener/observer/frame เมื่อ cleanup
- Tooltip/Toast closed state และ Accordion ใช้ timing/easing กลาง; closed tooltip/toast exit 160 ms ไม่รับ enter timing 190 ms

## คำสั่งทดสอบ

```powershell
pnpm test:frontend-motion
node tests/run.mjs frontend-motion
pnpm test:frontend-ui
pnpm quality
```

Motion suite มี 35 cases; ตรวจ compiled CSS cascade, loading layouts, integer interpolation/cancellation/reduced motion/accessibility, sticky frame coalescing และ Daily Work latest-request/error/retry behavior ด้วย mocks โดยไม่ต่อฐานข้อมูล

Tree reporter เมื่อมี Bash/Node 22+: `bash scripts/test-unit.sh frontend-motion`. Local preview: `node scripts/frontend-preview.mjs` แล้วเปิด `http://127.0.0.1:3791`; preview ใช้ synthetic fixtures, ปฏิเสธ writes และไม่อ่าน credentials/ฐานข้อมูลจริง. API-backed pages ตรวจ slow/error ได้ด้วย `/board?qa=slow`, `/work-items?qa=slow`, `/daily-work?qa=error`; `qa=slow` หน่วง synthetic GET 1500 ms และ `qa=error` ส่ง synthetic GET 503. เลือก theme ด้วย `&theme=dark` หรือ `&theme=special-dark`; หยุดด้วย Ctrl+C. ไม่ใช่ production E2E/auth test

หาก `prisma validate` ไม่มี `DATABASE_URL`, ใช้ placeholder เฉพาะ process สำหรับ schema validation; ห้ามแก้ `.env` ให้เป็นข้อมูลจำลองของระบบจริง:

```powershell
$env:DATABASE_URL = 'postgresql://unit:unit@127.0.0.1:1/unit?schema=public'
pnpm quality
```

Production verification: `docker build --target production --tag pms-issue-28-recheck:local .` ไม่ใช่ deployment หรือ migration

ผลรายเคสอยู่ใน [issue-28-test-cases.txt](../../issue-28-test-cases.txt). SonarQube เป็น gate แยกใน `.github/workflows/quality.yml`; workflow ยังต้องมี `SONAR_HOST_URL` และ `SONAR_TOKEN` ที่ CI/server. สำหรับ checklist #28 ผู้ใช้ยกเว้น gate นี้เมื่อ 2026-10-04; ผล lint/typecheck/unit/build ไม่ใช่ผล SonarQube scan และ scan ไม่ได้รัน.

## ผลตรวจล่าสุด

ตรวจล่าสุดเมื่อ 2026-10-04 ตาม prompt ทั้ง 27 หมวด; ดู [รายงาน recheck](../../../design/projects/project-management-system/after_implementation/issue-28-competition-grade-recheck.md):

- `pnpm test:frontend-motion`: **35/35 ผ่าน**; TC-28-01–35 รวม 11 cases เพิ่มจาก recheck
- `pnpm quality`: **376 tests — 367 PASS / 0 FAIL / 9 SKIP**; 9 รายการเป็น opt-in integration tests. ESLint ไม่มี warning/error, TypeScript ผ่าน และ Prisma schema validation ผ่าน
- `docker build --target production --tag pms-issue-28-recheck:local .`: optimized production build, static generation 16/16 และ Docker image สำเร็จ. Prisma CLI ยังแสดง deprecation warning เดิมของ `package.json#prisma`
- Isolated browser preview: **108 checks** = 9 routes × 3 themes × 4 sizes (1280×900, 1024×768, 768×1024, 390×844). หลังโหลดเสร็จมี heading, ไม่มี page overflow/error alert/skeleton ค้าง; ตรวจ screenshots, slow/error และ drawer Escape/focus เพิ่ม. Console errors ระหว่าง injected failures เป็นข้อผิดพลาดจำลองที่ตั้งใจ; normal matrix ไม่พบ error/warning ใหม่. ไม่ใช้ข้อมูลจริงหรือส่ง API write
- ยังไม่มี formal profiler/physical-device trace, OS reduced-motion emulation หรือ screen-reader certification; ตรวจ reduced motion ด้วย compiled CSS และ hook/runtime mocks. Visual quality เป็น judgment จาก screenshots ไม่ใช่คะแนนอัตโนมัติ
- SonarQube scan/gate ไม่ได้รันเนื่องจากไม่มี scanner และ `SONAR_HOST_URL`/`SONAR_TOKEN` ที่ใช้งานได้; ผู้ใช้ยกเว้น gate นี้สำหรับการปิด checklist #28 โดยไม่มีการอ้างว่าไม่มี findings
