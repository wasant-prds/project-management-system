# Cinematic motion — Issue #34

ยกระดับ Frontend เดิมของ #26–#30 ให้มีลำดับการปรากฏ, ความลึก และ interaction ต่อเนื่อง. ไม่มี API, schema, Authentication, Authorization, Permission, Business Logic หรือ dependency ใหม่. Timezone ยังเป็น `Asia/Bangkok` และไม่มี preference ให้เปลี่ยน.

## ขอบเขต

| ชั้น | ไฟล์ | หน้าที่ |
|---|---|---|
| การตัดสินใจ | `components/ui/cinematic-motion.ts` | profile, effect budget, จังหวะ, pointer, magnetic, route decision |
| Runtime | `components/layout/cinematic-runtime.tsx` | listener ชุดเดียวใน `app/layout.tsx`; ไม่ render node |
| ภาพ | `app/globals.css` | พื้นหลัง, choreography, reduced motion, `@supports` |
| Route shell | `app/template.tsx` | `data-cinematic="route"` และ `motion-page-enter` แบบ opacity |
| โหลด `/` | `app/loading.tsx` | แสดง `DashboardLoading` ทันที เพื่อไม่ให้ view transition รอ query |

`CinematicRuntime` ตั้ง `data-motion-profile` บน `<html>` หลัง mount.

## Motion profile

`resolveMotionProfile` ใช้ `prefers-reduced-motion`, `(pointer: fine)`, `(hover: hover)` และ `window.innerWidth`.

| Profile | เงื่อนไข | pointer | magnetic | blur | route transition |
|---|---|---|---|---|---|
| `reduced` | เปิด reduced motion | ปิด | ปิด | ปิด | ปิด |
| `touch` | ไม่มี fine pointer/hover หรือกว้างไม่ถึง 640px | ปิด | ปิด | ปิด | ปิด |
| `tablet` | 640–1023px และชี้ด้วยเมาส์ได้ | ปิด | ปิด | ปิด | ปิด |
| `desktop` | กว้างตั้งแต่ 1024px และชี้ด้วยเมาส์ได้ | เปิด | เปิด | เปิด | เปิดเมื่อมี View Transitions API |

Touch ย่น stagger และ cinematic entrance ให้ใช้ `--motion-fast` และ delay 0. Tablet ย่น stagger. Reduced motion ปิด entrance, chart reveal, magnetic transition และ view-transition animation.

## จังหวะ

ค่าใน `CHOREOGRAPHY_DELAY_MS` ถูกเขียนเป็น CSS variables `--choreography-*` และมี fallback เดียวกันใน stylesheet.

| Beat | Delay | พื้นผิว |
|---|---:|---|
| header | 0ms | `.page-toolbar` |
| primary | 40ms | หัว Dialog / Alert Dialog |
| support | 100ms | ตัวกรองและฟอร์มหลัก |
| data | 170ms | chart และบล็อกข้อมูล |
| actions | 230ms | รายการกิจกรรมบน Dashboard |

Topbar ไม่มี entrance ตอนเปลี่ยนหน้า. ตัวหุ้ม route ยัง fade ด้วย opacity อย่างเดียว เพื่อไม่ให้ `transform` ดึง sticky header ของ Work Items ออกจาก scrollport.

## สิ่งที่ผู้ใช้เห็น

- พื้นหลัง Light / Dark / `special-dark` มีชั้นแสงนุ่ม. KPI แรกบน Dashboard มีเส้นเน้นและเงา floating และอยู่ในลิงก์จึงรับ pointer highlight กับ hover lift. KPI ที่เป็นข้อมูลอย่างเดียวบน Analysis, Project detail และ Work Items ไม่ยกตัว.
- Desktop: ไฮไลต์ตาม pointer บน Project card และ Work Item card. Magnetic ไม่เกิน 4px และใช้เฉพาะโลโก้ sidebar กับปุ่มที่ส่ง `magnetic` ได้แก่ ใช้ตัวกรอง, สร้าง/บันทึก Project, บันทึก Company, New Work Item, Add Work Log, ส่งออก CSV และบันทึก Settings. Transition ของสี พื้นหลัง ขอบ เงา และ `translate` ยังอยู่.
- ชื่อ Project ใน card กับหัวข้อ Project detail ใช้ shared element `pms-project` เมื่อ public id เป็น UUIDv4 ตรงกัน. โลโก้, แถบเมนู active และ `.page-heading` ใช้ชื่อ `pms-workspace`, `pms-nav-indicator` และ `pms-page-heading` เฉพาะ desktop ที่รองรับ `view-transition-name`.
- เลื่อน `main` เกิน 12px แล้ว topbar เพิ่มเงา. เปิด Dialog, Alert Dialog หรือ Sheet แล้ว topbar กับ sidebar จางลง. ไม่ใส่ `transform` หรือ `opacity` ให้ตัวหุ้มของ sticky content.
- ตัวเลข KPI ที่เพิ่มขึ้นเป็นสี success และที่ลดลงเป็นสี danger. Progress ของ Projects ล่าสุดขยับด้วย `translateX` ไม่เปลี่ยน `width`.
- Toast `default` มีแถบ success และ `destructive` มีแถบ danger. Overlay blur 8px ใช้บน desktop เมื่อ `@supports` ผ่าน และถูกปิดเมื่อ reduced motion.

แต่ละเมนูได้จังหวะเฉพาะส่วน: Board มีตัวกรองแล้วคอลัมน์, Analysis มีตัวกรองแล้ว KPI, Projects/Company มีฟอร์มแล้วรายการ, Daily Work มีพื้นที่บันทึก, Settings มีแท็บ, Work Items มีตัวกรองและ KPI โดยไม่หุ้มรายการ sticky.

## View transition

เกิดเฉพาะคลิกซ้ายธรรมดาจาก `<a href>` ไป origin เดียวกันคนละ path หรือ search บน desktop ที่มี `document.startViewTransition`. ไม่เกิดเมื่อกดปุ่มเสริม, เปิดแท็บใหม่, download, อยู่หน้าเดิม, เป็น touch/tablet/reduced หรือ transition ก่อนหน้ายังไม่จบ.

Capture-phase listener ไม่ได้ใช้ `defaultPrevented` เพราะ React ยังไม่ตั้งค่านี้ในจังหวะนั้น. ระหว่าง transition ระบบปิด CSS entrance. หลังจบจะใส่ inline `animation: none` ที่โหนดที่แสดงอยู่แล้ว แล้วลบ `data-route-transition` เพื่อไม่ให้ entrance เล่นซ้ำและไม่ปิด entrance ของการนำทางครั้งถัดไป. ถ้า DOM ยังไม่ถึงปลายทางภายใน `ROUTE_TRANSITION_TIMEOUT_MS` (240ms) จะปล่อยภาพค้าง. `popstate` จบ transition ที่ค้างอยู่.

## คำสั่งทดสอบ

ไม่มี Makefile.

```powershell
pnpm test:frontend-cinematic
node tests/run.mjs frontend-cinematic
pnpm test:frontend-motion
pnpm test:frontend-ui
pnpm test:company-projects
```

```bash
bash scripts/test-unit.sh frontend-cinematic
```

Suite อยู่ใน process เดียว. ไม่ใช้ PostgreSQL, Redis, Docker, network หรือ external service. CSS ถูก compile ด้วย Tailwind ในเทสต์. TC-34-20 และ TC-34-21 จำลอง window/document เพื่อตรวจ lifecycle ของ runtime.

ผลล่าสุด 2026-10-05:

- `pnpm test:frontend-cinematic`: 21 PASS / 0 FAIL / 0 SKIP
- `pnpm test:frontend-ui`: 165 PASS / 0 FAIL / 0 SKIP
- `pnpm test:frontend-motion`: 35 PASS / 0 FAIL / 0 SKIP
- `pnpm test:company-projects`: 30 PASS / 0 FAIL / 0 SKIP
- `pnpm lint`: ไม่มี warning หรือ error
- `pnpm typecheck`: ผ่าน

รายละเอียดการปิดงานอยู่ที่ [รายงาน Issue #34](../../../design/projects/project-management-system/after_implementation/issue-34-project-handbook-report-2026-10-05.md).

## ข้อจำกัด

- ยังไม่ได้เปิด Chrome, Edge, Safari และ Firefox จริง และไม่ได้วัด frame บนอุปกรณ์. เซิร์ฟเวอร์ที่พอร์ต 3000 ตอบ 401 จึงไม่ได้คลิกผ่านหน้าจอ.
- `pnpm build` บน Windows ในรอบ implement แรก compile และสร้าง static pages 16/16 ได้ แต่ standalone trace หยุดที่ symlink `EPERM`. รอบ handbook ไม่ได้ build ซ้ำ.
- `docker build --target production` ยังไม่สำเร็จเพราะ Docker Linux engine ไม่พร้อม.
- ไม่พบ `sonar-scanner`. การปิด checklist #34 ไม่ใช้ SonarQube เป็นเงื่อนไข และไม่ได้แปลว่าไม่มี findings.
- ถ้าการนำทางช้ากว่า 240ms ผู้ใช้จะเห็น crossfade สั้นๆ แล้วหน้าจริงเข้าด้วย CSS entrance.
