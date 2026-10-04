# Issue #29 — Final Visual Audit & Pixel-Perfect Polish

ตรวจและปรับรายละเอียดทั้ง 8 เมนูและ Project detail โดยใช้ Neumorphism, palette และ motion tokens เดิม. วันและเวลาของระบบคง `Asia/Bangkok`; timestamps ที่บันทึกเป็น Bangkok wall-clock และไม่เปลี่ยนเป็น UTC.

## Shared presentation contracts

- `SummaryStatCard`: label รองรับสองบรรทัดโดยค่า KPI อยู่แนวเดียวกัน; `isLoading` แสดง skeleton, `unavailable` แสดง `—`, ผลสำเร็จที่ไม่มีข้อมูลแสดง 0 ตามจริง. ไม่แสดงค่าที่เก่าหรือ 0 ปลอมระหว่าง failed/pending reads. Work Items ใช้สถานะเดียวกันกับ tab counts.
- `content-wrap`: `overflow-wrap: anywhere` สำหรับชื่อ/identifier/ข้อความยาว; ใช้กับ page/card/modal titles, Company contact, Work Item preview, Daily Work description/remarks และ exact hours. ไม่ปัด Decimal เพื่อแก้ layout.
- Analysis ใช้ `report-tables.tsx` และ shared Table primitives: local overflow, cell wrapping, top alignment, numeric alignment, responsive fields และ source links ที่มี filters/ช่วงวันเดิม. Width ของ Work Item columns รวม 100%.
- Input/Textarea ใช้ font breakpoint เดียวกัน (`text-base` บน phone, `sm:text-sm`); invalid/disabled/label/change contracts คงเดิม.
- Dialog มีพื้นที่ข้าง title สำหรับ close control, multi-line leading, Thai close label และ touch target 44px เมื่อ `pointer: coarse`. คืน focus ไป control ที่เปิดหลังปิด; เคารพ consumer autofocus ที่ preventDefault และไม่ focus element ที่ถูกถอดจาก DOM.
- Daily Work identity มี preferred basis 16rem ตั้งแต่ tablet; badges ลงอีกแถวเมื่อพื้นที่ไม่พอ เพื่อไม่ให้ชื่อ Project ยุบเหลือ 0px เมื่อ exact hours ยาว.
- Work Items/Daily Work ใช้ shared PageState สำหรับ empty/error/search feedback. Route `error.tsx` และ `not-found.tsx` ใช้ ApplicationState: themed surface, retry/dashboard recovery และไม่เปิดเผย error diagnostics.

## Reusable verification commands

```powershell
pnpm test:frontend-polish
node tests/run.mjs frontend-polish
pnpm test:frontend-ui
pnpm test:company-projects
```

เมื่อมี Bash และ Node 22+ ใช้ shared tree reporter เดิม:

```bash
bash scripts/test-unit.sh frontend-polish
```

PowerShell ใช้ formatter เดียวกันและรักษา test exit code:

```powershell
$tapPath = Join-Path $env:TEMP 'pms-frontend-polish.tap'
node --test-reporter=tap tests/run.mjs frontend-polish > $tapPath
$unitExitCode = $LASTEXITCODE
Get-Content -LiteralPath $tapPath | node scripts/format-unit-tests.mjs --stdin
if ($unitExitCode -ne 0) { throw "Unit tests failed: $unitExitCode" }
```

`pnpm quality` ต้องการ `DATABASE_URL` สำหรับ Prisma schema validation แต่ไม่เชื่อม DB. PowerShell block นี้คืนค่าเดิมหลังจบ quality run; URL placeholder ใช้เฉพาะคำสั่งนี้:

```powershell
$previousDatabaseUrl = $env:DATABASE_URL
try {
  $env:DATABASE_URL = 'postgresql://unit:unit@127.0.0.1:1/unit?schema=public'
  pnpm quality
  $qualityExitCode = $LASTEXITCODE
} finally {
  if ($null -eq $previousDatabaseUrl) {
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  } else {
    $env:DATABASE_URL = $previousDatabaseUrl
  }
}
if ($qualityExitCode -ne 0) { throw "Quality checks failed: $qualityExitCode" }

docker build --target production --tag pms-issue-29:local .
docker build --target migrate --tag pms-issue29-tooling:local .
docker run --rm --network none --entrypoint pnpm pms-issue29-tooling:local exec prisma validate
```

คำสั่ง build สร้าง image แยก; การ deploy/restart และ database rollout เป็นงานแยกตาม runtime gates.

## Browser review

```powershell
node scripts/frontend-preview.mjs
```

เปิด `http://127.0.0.1:3791` แล้วเลือก route เดิมกับ `?theme=light`, `dark`, `special-dark`. เพิ่ม `&qa=slow`, `error`, `empty`, `edge` สำหรับ client read states และข้อมูลยาว. `/qa/not-found` กับ `/qa/route-error` render production fallback components เพื่อ review; ไม่ใช่ Next.js routing integration test. หยุดด้วย Ctrl+C.

Preview ใช้ synthetic fixtures, mock owner/Next navigation/settings/dashboard boundaries, ปฏิเสธ writes และไม่อ่าน credentials/database. `slow/error` จำลอง client GET; ไม่จำลอง real server Dashboard/Suspense หรือ Settings provider lifecycle. Settings provider/route auth failures มี unit regressions เดิมใน full suite. Authentication ของระบบใช้ native Basic challenge ไม่ใช่ custom login screen จึงคงเดิม.

Final matrix: 9 routes × 3 themes × 4 viewports (1536×960, 1024×768, 768×1024, 390×844) = 108 checks; error/404 fallback อีก 24 combinations. ตรวจเพิ่มเติม long text/exact Decimal, slow/empty/error, Analysis tabs/tables, modal keyboard/ESC focus และ mobile navigation. ไม่มี known major visual regression ในชุดที่ตรวจ; ไม่ใช่ exhaustive pixel-diff ทุกข้อมูลหรือ physical-device/screen-reader certification.

Independent review พบ Daily Work tablet edge regression หลัง matrix เดิม จึงแก้และเพิ่ม browser geometry runner ใน preview. เปิด `/daily-work?theme=light&qa=edge&layoutCheck=1` และ `/daily-work?theme=light&layoutCheck=1`; เปลี่ยน theme เป็น `dark`/`special-dark` และ resize เป็น 320×844, 390×844, 639×844, 640×1024, 768×1024, 1024×768, 1536×960. ต้องแสดง `Daily Work layout PASS — 3 cards`; ตรวจ title width ≥120px, title height ≤320px, header height ≤480px, local overflow และ exact hours ของทุก record. ไม่มี cards เป็น PENDING. Bounds ใช้กับ fixed fixture นี้ ไม่ใช่ข้อจำกัดข้อมูล production. รันจริงล่าสุด 42/42 PASS; ที่ tablet 768px title เป็น 617×72px แทน 0×4464px. [หลักฐาน](../../issue-29-browser-regression.json). ตัว auditor เปิดเฉพาะ isolated preview; ไม่ถูก import ใน production route.

## Results and limits

- Focused unit: 28 PASS / 0 FAIL / 0 SKIP — ไม่ใช้ PostgreSQL, Redis, Docker หรือ external services.
- Full quality: 404 total / 395 PASS / 0 FAIL / 9 opt-in integration SKIP; lint ไม่มี errors/warnings, typecheck และ schema validation ผ่าน.
- Final Linux production Docker image build: PASS.
- Migration tooling image build และ network-none Prisma validate: PASS; ไม่รัน migration/seed จริง. [ผล](../../issue-29-tooling-results.txt).
- Additional tooling smoke: generate โดยไม่มี `.env`/`DATABASE_URL` ผ่าน และ actual Prisma CLI ส่ง seed command เดิมเข้า stub tsx ใน ephemeral container ผ่าน; ไม่มี DB operation. Probe seed ครั้งแรกติด stdin CRLF จาก PowerShell แล้ว normalize LF/rerun ผ่าน; ดู raw output ทั้งสองรอบ.
- Prisma baseline deprecation แก้แล้วด้วย `prisma.config.ts`; schema/seed command เดิม, root `.env` โหลดด้วย Node และ shell/container values มี precedence. ไม่เพิ่ม dependency หรือเปลี่ยน database data/seed logic. Docker tooling stages copy config ก่อน generate.
- SonarQube ไม่ได้รันเพราะ scanner/server configuration ไม่พร้อม; การยกเว้น #27/#28 ไม่ถูกนำมาใช้กับ #29 และไม่อ้างว่า scan ผ่าน.

ดู [Implementation/coverage report](../../ISSUE_29_IMPLEMENTATION.md), [ทุก unit case](../../issue-29-test-cases.txt), [full quality output](../../issue-29-quality-results.txt) และ [production build output](../../issue-29-build-results.txt).
