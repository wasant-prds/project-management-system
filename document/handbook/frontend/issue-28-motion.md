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

KPI แสดงค่าจริงทันทีและ keyed reveal เฉพาะเมื่อ string/number เปลี่ยน; ไม่จำลองตัวเลขระหว่างทางหรือปัด Decimal. Progress ใช้ transform transition; Dashboard/Analysis chart ใช้ timing กลางและปิด animation ตาม `usePrefersReducedMotion`

## Navigation และ keyboard

Sidebar marker อยู่ใน `SharedNavigationIndicator` เพื่อ mount ตาม lazy mobile portal. `observeNavigationIndicator` รวม resize events เป็นหนึ่ง measurement ต่อ animation frame, อ่าน geometry ก่อนเขียน CSS variable และคืน observer/listener/frame เมื่อ unmount. ไม่ใช้ React state อัปเดตทุก frame

Marker แสดงเฉพาะ active link ในกลุ่มเมนูหลัก; Settings อยู่ใน footer และใช้ selected inset state. ทุก link คง `aria-current`. Mobile drawer คืน focus ไปที่ registered `SidebarTrigger` หลังปิดด้วย Escape; หาก trigger ถูก unmount ระหว่าง navigation จะปล่อยให้ Radix จัดการตามปกติ

## Loading และ async feedback

`ApplicationLoadingShell` เป็น fallback ระดับ application. `ContentLoadingSkeleton` มี layout rows/cards/report/profile และเป็น `aria-hidden`; container ประกาศ loading ด้วย status/busy เพียงจุดเดียว. Projects/Company ใช้ cards, Settings ใช้ profile และ Analysis initial load ใช้ report. Analysis refresh ที่มี report อยู่แล้วคงข้อมูลเดิมและแสดง status สั้น ๆ

PageState ใช้ content entrance สำหรับ loading/empty/error; placeholders แสดงเฉพาะ loading. Error/retry controls และข้อความ validation/save/export เดิมยังคงอยู่ ไม่แทนข้อผิดพลาดด้วยตัวเลขศูนย์

## Accessibility และ performance

- `prefers-reduced-motion: reduce` ปิด route/content/value/stagger animation และลด transitions ของ controls/overlays; Recharts ปิด animation ผ่าน preference hook
- Desktop hover จำกัดการยก card ให้ 1 px; pressed depth อยู่เหนือ surface utilities และชนะ hover state; touch ใช้ pressed/inset feedback และ target rules กลาง; focus ring ยังเห็นชัด
- Closed overlays ใช้ exit duration/easing เหนือ enter timing. Toast transitions รองรับ `translate` ขณะ swipe cancel และปิด transition ระหว่าง finger movement
- ไม่เพิ่ม scroll hijacking, animation loop, parallax หรือ dependency. Animation ของ route/content/value/progress ใช้ opacity/transform; shadow transitions ใช้เฉพาะ interactive surfaces
- Native scrolling และ Work Items sticky tree คง layout เดิม

## คำสั่งทดสอบ

```powershell
pnpm test:frontend-motion
node tests/run.mjs frontend-motion
pnpm test:frontend-ui
pnpm quality
```

Motion suite ตรวจ compiled CSS cascade ของ card depth, closed overlay exit timing และ toast swipe cancel/movement แยกใน TC-28-22 ถึง TC-28-24

Tree reporter เมื่อมี Bash/Node 22+: `bash scripts/test-unit.sh frontend-motion`. Local preview: `node scripts/frontend-preview.mjs` แล้วเปิด `http://127.0.0.1:3791`; preview ใช้ synthetic fixtures, ปฏิเสธ writes และไม่อ่าน credentials/ฐานข้อมูลจริง

หาก `prisma validate` ไม่มี `DATABASE_URL`, ใช้ placeholder เฉพาะ process สำหรับ schema validation; ห้ามแก้ `.env` ให้เป็นข้อมูลจำลองของระบบจริง:

```powershell
$env:DATABASE_URL = 'postgresql://unit:unit@127.0.0.1:1/unit?schema=public'
pnpm quality
```

Production verification: `docker build --target production --tag pms-issue-28-validation:local .` ไม่ใช่ deployment หรือ migration

ผลรายเคสอยู่ใน [issue-28-test-cases.txt](../../issue-28-test-cases.txt). SonarQube เป็น gate แยกใน `.github/workflows/quality.yml`; ต้องมี `SONAR_HOST_URL` และ `SONAR_TOKEN` ที่ CI/server. ผล lint/typecheck/unit/build ไม่ใช่ผล SonarQube scan

## ผลตรวจล่าสุด

ตรวจล่าสุดเมื่อ 2026-10-04 หลังแก้ cascade ของ card/overlay และ swipe transition ของ toast:

- `pnpm test:frontend-motion`: **24/24 ผ่าน**; TC-28-22–24 ตรวจ compiled CSS cascade โดยตรง ครอบคลุม pressed-over-hover, overlay exit timing และ toast `translate` ระหว่าง swipe cancel/move
- `pnpm quality`: **365 tests — 356 PASS / 0 FAIL / 9 SKIP**; 9 รายการเป็น opt-in integration tests. ESLint ไม่มี warning/error, TypeScript ผ่าน และ Prisma schema validation ผ่าน
- `docker build --target production --tag pms-issue-28-validation:local .`: optimized production build และ Docker image สำเร็จ. Prisma CLI ยังแสดง deprecation warning เดิมของ `package.json#prisma`
- Isolated browser preview แสดง card hover ด้วยเงา hover และ `translate: -1px`; ไม่ได้ใช้ข้อมูลจริงหรือส่ง API write
- ยังไม่มี formal profiler/physical-device trace; การตรวจ performance รอบนี้ยืนยันจาก CSS properties, frame-coalesced navigation measurement, unit tests และ browser preview
- SonarQube scan/gate ยังยืนยันไม่ได้ เนื่องจากไม่มี scanner และ `SONAR_HOST_URL`/`SONAR_TOKEN` ที่ใช้งานได้ใน environment นี้
