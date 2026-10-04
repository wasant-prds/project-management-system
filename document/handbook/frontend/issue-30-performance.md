# Frontend Performance — Issue #30

วันที่ 2026-10-04 · ระบบใช้ Asia/Bangkok เช่นเดิม

## ขอบเขตและ implementation ที่ตรวจแล้ว

เอกสารนี้ครอบคลุม Issue #30 เท่านั้น: performance ของ Dashboard (`/`), Analysis (`/analysis`), Daily Work (`/daily-work`), Company (`/company`), Projects (`/projects`) และ bundle budget ของ route หลัก. Source ที่ตรวจยืนยันว่าแอปใช้ Next.js App Router 15.2.4, React 19 และ pnpm 10.34.5; หน้า Dashboard เป็น async server-rendered page ที่อ่าน summary ผ่าน `getDashboardSummary`, ส่วน chart เป็น client chunk ที่แยกโหลดเมื่อจำเป็น. Root layout ใช้ Geist จาก `geist/font/*`, shared theme/settings providers และเปิด Vercel Analytics เฉพาะเมื่อ `VERCEL_ANALYTICS_ENABLED=true`. Issue นี้ไม่เปลี่ยน API contract, database schema, authentication หรือ business rules.

การเปลี่ยนที่เกี่ยวข้องอยู่ใน route pages, `components/layout/dashboard-charts-deferred.tsx`, `components/page/analysis/analysis-charts-deferred.tsx`, `components/page/daily-work/deferred-widgets.tsx`, shared lazy/error-boundary components, collection reader และ focused test runners. Production chart/calendar/dialog chunks ใช้ dynamic imports; test preview สร้าง Webpack runtime จาก Next ที่ติดตั้งอยู่เพื่อทดสอบ chunk recovery ให้ตรง production.

## พฤติกรรมและข้อจำกัด

Dashboard คง Server Component และ DB aggregates เดิม; KPI, filters และ source lists ใช้งานได้โดยไม่ต้องรอ Recharts. Dashboard/Analysis โหลดเฉพาะ plot chunk เมื่อ section ใกล้ viewport 240px. Header, source links และ HoursPeriodTable อยู่ภายนอก error boundary และไม่ถูก unmount ระหว่าง loading/error/retry. Plot ใช้ footprint 260px/320px เดียวกันทุก state. Empty chart ไม่โหลด visualization chunk. ถ้า chunk ล้มเหลวมี local retry โดยส่วนอื่นยังใช้งานได้.

Daily Work แยก Calendar/Dialog ด้วย React.lazy และ section error boundary ที่ retry สร้าง lazy identity ใหม่. Calendar โหลดทันทีที่ render; dialog โหลดเมื่อเปิดครั้งแรกแล้วคง controlled instance ไว้เพื่อให้ Radix จบ exit animation. Loading dialog มี feedback ที่มองเห็นได้ พร้อม Cancel/Escape; chunk ที่มาถึงหลัง Cancel ไม่เปิด dialog เอง. Calendar ใช้ footprint 336px ร่วมกันทั้ง loading/error/loaded states. Failure/retry ไม่ถอดรายการ Daily Work หรือข้อมูลฟอร์ม. การเปลี่ยนวันที่/period ยกเลิก request เก่า และ generation guard ป้องกัน stale results. Exact Decimal hours คำนวณเมื่อข้อมูล filtered เปลี่ยน.

Analysis tables แสดงครั้งละ 50 แถว; Previous/Next และช่วงแถวมี accessible labels. รายงานใหม่เริ่มหน้าแรกแม้จำนวนแถวเท่าเดิม. Filtered dataset, summaries, source links, Bangkok dates และ CSV export ยังครบทุก record. ไม่มี virtualization หรือ server pagination contract ใหม่.

Collection reader รวมเฉพาะ request ที่กำลัง pending สำหรับ same-origin URL/filters/key เดียวกัน. Company/Projects หลัง mutation ส่ง `{ fresh: true }` เพื่อเริ่ม request ใหม่แม้ GET ก่อนบันทึกยังค้าง; page generation guard ป้องกันผลเก่า overwrite ผลใหม่. Finalizer ของ request เก่าไม่ลบ pending request ใหม่. ไม่ cache ผลหลังจบหรือเก็บ user data ระยะยาว. Failed reads release pending state เพื่อ retry; malformed pagination และ repeated cursor ถูกปฏิเสธ. Cursor pages ต้องโหลดตามลำดับ เพราะหน้าถัดไปขึ้นกับ cursor จาก server.

Analysis กด “ใช้ตัวกรอง” ด้วย filters เดิมเพื่อ refresh ได้. ระหว่าง same-filter refresh ข้อมูลเดิมยังอ่านได้; error มี retry และไม่แทนค่าด้วยศูนย์. เมื่อ filters เปลี่ยนจะไม่แสดงรายงานเก่าภายใต้ labels ใหม่. Request ที่ abort แล้วไม่สามารถ overwrite รายงานใหม่.

Charts ใช้ memoization เฉพาะ dataset mapping, debounce resize 80ms และปิด animation เมื่อ hours dataset เกิน 100 points หรือใช้ reduced motion. ไม่ลดจำนวนจุด/ความแม่นยำ. Neumorphism, theme tokens, hover/focus motion และ typography เดิมคงอยู่. Recharts measured wrapper ไม่ถูก clamp ด้วย percentage max-width บน internal zero-width shim; outer responsive container และ chart frame ยังจำกัด overflow.

## คำสั่งรันซ้ำ

ต้องมี dependencies ตาม lockfile และ Node.js 22+.

```powershell
pnpm test:frontend-performance
node tests/run.mjs frontend-performance
bash scripts/test-unit.sh frontend-performance
```

Bash wrapper ใช้เมื่อมี Bash runtime. ทางเลือก PowerShell สำหรับรายงานรายเคสพร้อมรักษา exit code:

```powershell
node --test-reporter=tap tests/run.mjs frontend-performance *> document/issue-30-unit-tests.tap
if ($LASTEXITCODE -ne 0) { throw 'Unit suite failed' }
Get-Content -Raw document/issue-30-unit-tests.tap | node scripts/format-unit-tests.mjs --stdin
```

Quality gate ใช้ placeholder URL เฉพาะ process สำหรับ Prisma schema validation; ไม่ต่อ PostgreSQL:

```powershell
$env:DATABASE_URL='postgresql://placeholder:placeholder@127.0.0.1:5432/unit_only'
pnpm quality
```

Production build บน Linux Docker ใช้ standalone output และไม่มี deployment/schema/seed:

```powershell
docker build --target production -t pms-issue30-optimized:local . *> document/issue-30-build-after.txt
if ($LASTEXITCODE -ne 0) { throw 'Production build failed' }
pnpm performance:budget document/issue-30-build-after.txt
if ($LASTEXITCODE -ne 0) { throw 'Bundle budget failed' }
```

Budget runner ต้องได้รับ complete production log; missing route หรือ First Load JS เกิน budget เป็น FAIL. Budgets อยู่ใน `scripts/frontend-performance-budget.mjs`: Dashboard 185 kB, Analysis 195 kB, Daily Work/Board 185 kB, Work Items 205 kB, Projects/detail 180 kB, Company/Settings 175 kB. เป็น Next First Load JS estimate และไม่รวม lazy chunks ที่โหลดภายหลัง; ไม่ใช่จำนวน network bytes หรือคะแนน Core Web Vitals.

## Browser E2E

```powershell
pnpm performance:preview
# ในอีก terminal ที่ repo เดียวกัน:
pnpm test:frontend-performance-browser
pnpm test:frontend-performance-browser --targeted
pnpm test:frontend-performance-review
```

ต้องมี Playwright และ browser. ถ้าใช้ bundled runtime แทน dependency ของ repo ให้ตั้ง `PMS_PLAYWRIGHT_MODULE` เป็น absolute path ของ installed `playwright` package. Windows ใช้ Edge headless ตาม default; OS อื่นใช้ Playwright Chromium. เปลี่ยนผ่าน `PMS_BROWSER_CHANNEL` ได้. Preview default `http://127.0.0.1:3791`; เปลี่ยน port ด้วย `PMS_PREVIEW_PORT` และตั้ง `PMS_PREVIEW_ORIGIN` ให้ตรงกัน. Runner ปฏิเสธ origin ที่ไม่ใช่ loopback.

Preview ใช้ production TSX/CSS, esbuild module splitting แล้ว bundle ด้วย Webpack runtime ที่ติดตั้งมากับ Next เพื่อทดสอบ chunk failure/retry ให้ตรงกับ production. Native ESM import จำ failed module ไว้ จึงไม่เหมาะกับการทดสอบ Webpack retry. Build scratch อยู่ใน `.next/performance-preview-*` และลบทิ้งหลังโหลด assets เข้า memory. Preview mock Next routing, owner, DB-backed Dashboard และ API responses; writes ถูกปฏิเสธ. `themeSwitch=1` ใช้ local-only theme change stub ไม่ persist settings. จึงเป็น isolated browser E2E และไม่ใช่ Unit Test, production hydration test หรือ field CWV measurement. Runner ตรวจ 9 routes × 3 themes × 4 widths พร้อม interactions/geometry; `--targeted` ข้าม matrix. Review runner เพิ่ม 22 checks สำหรับ pending read/mutation ทั้งสอง completion orders, Calendar/Dialog local retry, Add/Details exit motion, slow Dialog cancellation/focus และ chart error geometry/table node identity ใน Light/Dark ที่ 375/1440px.

## Next production hydration และ chunk recovery

รันบน standalone test container ชั่วคราวที่ bind เฉพาะ loopback; ใช้ synthetic middleware proof และ browser-intercepted API fixtures. ไม่มี real credentials/DB, ไม่มี volumes และไม่เรียก deployment/migration/seed entrypoint. คำสั่งนี้ใช้สำหรับ isolated test เท่านั้น:

```powershell
docker build --target production -t pms-issue30-reviewed:local . *> document/issue-30-review-build.txt
if ($LASTEXITCODE -ne 0) { throw 'Production build failed' }
pnpm performance:budget document/issue-30-review-build.txt
if ($LASTEXITCODE -ne 0) { throw 'Bundle budget failed' }
docker run --detach --rm --name pms-issue30-browser-review --publish 127.0.0.1:3798:3000 --env DATABASE_URL=postgresql://placeholder:placeholder@127.0.0.1:5432/unit_only --env PMS_INTERNAL_OWNER_PROOF=pms-issue30-isolated-test-proof --entrypoint node pms-issue30-reviewed:local server.js
if ($LASTEXITCODE -ne 0) { throw 'Test container failed' }
try {
  $env:PMS_PRODUCTION_TEST_ORIGIN='http://127.0.0.1:3798'
  $env:PMS_PRODUCTION_TEST_PROOF='pms-issue30-isolated-test-proof'
  pnpm test:frontend-performance-production
  if ($LASTEXITCODE -ne 0) { throw 'Production browser tests failed' }
} finally { docker stop pms-issue30-browser-review }
```

ตั้ง `PMS_PLAYWRIGHT_MODULE` ตาม runtime ที่ติดตั้ง เช่นเดียวกับ preview runner. ตรวจ actual Next SSR/hydration ของ Daily Work, Analysis, Company, Projects × Light/Dark × 375/1440px รวม 16 checks และ failed production Calendar/Dialog/Analysis chunks + local retry อีก 3 checks. Nominal cases ตรวจ console warnings/errors และทุกเคสตรวจ unhandled/hydration errors. Negative cases inject network errors ที่คาดไว้. ไม่ใช่ real owner/database integration หรือ field p75 CWV.

## ผล recheck หลัง independent review

วันที่ 2026-10-04: แก้ทั้ง 4 findings; focused unit 29 PASS / 0 FAIL / 0 SKIP, quality 433 total / 424 PASS / 0 FAIL / 9 opt-in integration SKIP, lint/typecheck/schema validation ไม่มี warnings/errors. Review browser 22/22, full preview matrix/interactions 148/148, actual Next production hydration/chunk recovery 19/19. Production Docker build และ bundle budgets 9/9 ผ่าน; First Load JS Dashboard/Analysis/Daily Work ยังคง 166/179/174 kB. Field CWV และ real device/network measurements ยังไม่อ้างผล.

รายงาน: [unit by case](../../issue-30-review-test-cases.txt), [coverage](../../issue-30-coverage.csv), [quality](../../issue-30-review-quality-results.txt), [review browser](../../issue-30-review-browser-results.json), [production browser](../../issue-30-production-browser-results.json), [production build](../../issue-30-review-build.txt), [budget](../../issue-30-review-budget-results.txt).

## ขอบเขต handbook

Issue #30 ปรับ frontend loading/rendering และ test tooling โดยไม่เพิ่ม API, background job, worker, scheduler หรือตารางใหม่ จึงบันทึกเฉพาะ frontend behavior, configuration ที่เกี่ยวกับ performance และ verification; รายละเอียด API/Jobs และ data model ใช้เอกสารส่วนอื่นใน [Project Handbook](../README.md). ไม่พบการเปลี่ยน contract หรือ operational job ที่ควรสร้างเอกสารเฉพาะเพิ่มจาก implementation ของ issue นี้.

## Observability

ตั้ง server environment `FRONTEND_PERFORMANCE_METRICS_ENABLED=true` เพื่อเปิด Next `useReportWebVitals`. ใน Docker ต้องส่ง flag ผ่าน `app.environment` ของ Compose override หรือ container environment ด้วย. Default ปิด. Browser ส่งเฉพาะ local `pms:performance` CustomEvent ซึ่งมี `name`, `value`, `rating`, `route`; ตัด query strings/metric IDs และ normalize `/projects/[id]`. ไม่มี HTTP collector, persistent storage หรือ monitoring dependency ใหม่. Approved collector สามารถ subscribe ภายหลังได้.

LCP/INP/CLS เป้าหมาย 2.5s/200ms/0.1 ต้องประเมินด้วย staging/production ที่ใช้ authentication และข้อมูลจริง รวม device/network conditions และ field p75. Production build/isolated preview ไม่สามารถแทนหลักฐานนี้ได้. ผล bundle และ geometry ที่วัดได้อยู่ใน implementation report.
