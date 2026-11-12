# Testing Commands

## ที่เก็บรายงาน

เก็บผลทดสอบ build logs และภาพจาก browser ใน `artifacts/` ที่ root ซึ่งถูก gitignore สคริปต์ `frontend-performance-*-browser.mjs` และ `frontend-performance-browser.mjs` สร้าง `artifacts/frontend-performance/` อัตโนมัติและเขียนรายงาน JSON/ภาพไว้ที่นั่น เอกสารใน `document/` เก็บเฉพาะคู่มือและข้อกำหนด

## คำสั่งหลัก

Issue #47 shared foundation: เริ่ม `pnpm performance:preview` (synthetic fixtures, writes rejected, ไม่มี `.env`/DB) แล้วรัน `pnpm test:shared-foundation-browser`. ต้องมี Playwright หรือกำหนด `PMS_PLAYWRIGHT_MODULE`; Windows ใช้ headless Edge. `node scripts/shared-foundation-browser.mjs --before` เก็บ baseline ก่อนแก้ production sources; คำสั่งปกติเก็บ after พร้อม assertions. Matrix คือ 10 หน้าจริง + shared-control gallery × 3 themes × 390×844, 768×1024, 1440×900 และ Login เพิ่ม 320px. Browser ใช้ timezone `America/Los_Angeles` เพื่อจับวันที่ที่เผลออิงเครื่อง; formatter ต้องยังแสดง Bangkok. ตรวจ bounds, local scroll, keyboard/restore focus, selected tab, focus ring, action hierarchy และ nested elevation. ภาพและ `results.json` อยู่ใน `artifacts/issue-47/{before,after}/`.

Regression คู่กันคือ `pnpm test:header-tools-browser` สำหรับ compact filters, nested Select/Calendar, apply/reset และ import/export; `pnpm test:frontend-ui` รวม color-system/date-picker/display-date, `pnpm test:filter-select`, `pnpm test:board`, `pnpm test`, lint และ typecheck. Preview ไม่จำลอง Next.js server/auth/navigation หรือ production data. ESLint ข้าม generated `artifacts/` ตาม repository ignore แล้ว; รักษา QA outputs เดิมไว้. Contract tests ตรวจ versioned API handbook/rules และไม่พึ่ง planning files ใน ignored `design/` เพื่อให้ clean-checkout CI รันได้

```sh
pnpm quality          # lint + typecheck + unit/provider/UI suites
pnpm test
node tests/run.mjs
bash scripts/test-unit.sh
```

Node.js 22+; runner รวม `.test.mjs` แต่ละไฟล์ใน process แยก. Unit tests ใช้ synthetic data, mock repositories/provider HTTP และ components จริง. SQL/API persistence ถูกตรวจผ่าน PostgreSQL จริงใน isolated suite แทน ORM mocks เดิม

```sh
docker build --target database-tools -t pms-sql-tools-check .
docker build --target production -t pms-sql-app-check .
pnpm test:database-docker
```

Database suite ตรวจ fresh initialization, SQL seeding/rollback, comments/identities/FKs, exact decimals, Bangkok dates, API ownership, pagination, CRUD/history guards, GitLab/GitHub sync, pg_dump/restore และ standalone HTTP. Containers ไม่มี production mounts หรือ host ports และถูกลบเมื่อเสร็จ. ไม่อ่าน private seed dataset หรือ token จริง. `PMS_DATABASE_TEST_IMAGE` / `PMS_APP_TEST_IMAGE` เปลี่ยนชื่อ image สำหรับ CI ได้

Focused suites (ใช้รูปแบบเดียวกัน เช่น `pnpm test:settings`, `node tests/run.mjs settings`, `bash scripts/test-unit.sh settings`):

- auth, identity, company-projects, work-items, daily-work, board, dashboard, analysis, settings
- issue-sync: provider filtering/pagination/token variables, sync state และ config endpoints
- contracts: schema และ API/document contracts (`pnpm test:api-contracts`, `node tests/run.mjs api-contracts`)
- frontend-ui, frontend-redesign, frontend-motion, frontend-cinematic, frontend-identity, frontend-competition, frontend-polish, frontend-performance
- date-picker, filter-select, color-system, runtime-security, https, runner

ตัวอย่าง: `pnpm test:analysis`, `node tests/run.mjs analysis`, `bash scripts/test-unit.sh analysis`; `pnpm test:dashboard`, `pnpm test:work-items`, `pnpm test:daily-work`. รายการทั้งหมดอยู่ใน package.json และ tests/run.mjs. Suite ชื่อ frontend-* ใช้ Node runner และ Bash reporter ชื่อเดียวกัน

Python GitHub tooling แยกจาก Node suite และใช้ HTTP จำลอง:

```sh
python -B -m unittest discover -s scripts/tests -p "test_github_*.py" -v
```

Unit tests ไม่แทน browser review หรือ deployment. การใช้ token จริง/ฐานจริงเป็นงานแยกที่ต้องได้รับอนุญาต

ตรวจ motion ใน browser ด้วย `pnpm performance:preview` แล้วรัน `pnpm test:frontend-motion-browser` ในอีก terminal (ต้องมี Playwright หรือกำหนด `PMS_PLAYWRIGHT_MODULE`). ใช้ synthetic preview บน loopback เท่านั้น; `PMS_PREVIEW_ORIGIN` เปลี่ยน origin ได้. ตรวจทุกเมนู สามธีม มือถือ/desktop, reduced motion, โหลดช้า, refresh/แท็บ และ dialog; รายงานกับภาพอยู่ใน `artifacts/frontend-motion/`. Preview นี้ใช้ components จริง แต่ไม่จำลอง Next.js client navigation หรือเชื่อมฐานข้อมูล

`pnpm test:frontend-modal-browser` ตรวจ modal ต่อเนื่องทีละเฟรม: หน่วง chunk ของ Daily Work, เปรียบเทียบตัวกรอบ/overlay ก่อนและหลังโหลด, พิมพ์ฟอร์ม เปิด Project/Status/ปฏิทิน และเปิดซ้ำ รวมถึง Work Item, Board detail, Company alert และ mobile sidebar. ตรวจว่าไม่มี remount, ช่วงที่กรอบหาย, opacity ตกซ้ำ, backdrop blur หรือกรอบขยับหลังจังหวะเปิดจบ. ใช้ preview และตัวแปร Playwright/origin เดียวกัน; ผลอยู่ใน `artifacts/frontend-modal/`

## คำสั่งเฉพาะ suite

- `pnpm test:contracts` / `node tests/run.mjs contracts` / `bash scripts/test-unit.sh contracts`
- `pnpm test:api-contracts` / `node tests/run.mjs api-contracts` / `bash scripts/test-unit.sh api-contracts`
- `pnpm test:issue-sync` / `node tests/run.mjs issue-sync` / `bash scripts/test-unit.sh issue-sync`
- `pnpm test:auth` / `node tests/run.mjs auth` / `bash scripts/test-unit.sh auth`
- `pnpm test:company-projects` / `node tests/run.mjs company-projects` / `bash scripts/test-unit.sh company-projects`
- `pnpm test:board` / `node tests/run.mjs board` / `bash scripts/test-unit.sh board`
- `pnpm test:dashboard` / `node tests/run.mjs dashboard` / `bash scripts/test-unit.sh dashboard`
- `pnpm test:analysis` / `node tests/run.mjs analysis` / `bash scripts/test-unit.sh analysis`
- `pnpm test:settings` / `node tests/run.mjs settings` / `bash scripts/test-unit.sh settings`
- `pnpm test:frontend-ui` / `node tests/run.mjs frontend-ui` / `bash scripts/test-unit.sh frontend-ui`
- `pnpm test:frontend-redesign` / `node tests/run.mjs frontend-redesign` / `bash scripts/test-unit.sh frontend-redesign`
- `pnpm test:frontend-motion` / `node tests/run.mjs frontend-motion` / `bash scripts/test-unit.sh frontend-motion`
- `pnpm test:frontend-cinematic` / `node tests/run.mjs frontend-cinematic` / `bash scripts/test-unit.sh frontend-cinematic`
- `pnpm test:frontend-identity` / `node tests/run.mjs frontend-identity` / `bash scripts/test-unit.sh frontend-identity`
- `pnpm test:frontend-competition` / `node tests/run.mjs frontend-competition` / `bash scripts/test-unit.sh frontend-competition`
- `pnpm test:frontend-polish` / `node tests/run.mjs frontend-polish` / `bash scripts/test-unit.sh frontend-polish`
- `pnpm test:frontend-performance` / `node tests/run.mjs frontend-performance` / `bash scripts/test-unit.sh frontend-performance`
- `pnpm test:color-system` / `node tests/run.mjs color-system` / `bash scripts/test-unit.sh color-system`
- `pnpm test:date-picker` / `node tests/run.mjs date-picker` / `bash scripts/test-unit.sh date-picker`
- `pnpm test:filter-select` / `node tests/run.mjs filter-select` / `bash scripts/test-unit.sh filter-select`
- `pnpm test:work-items` / `node tests/run.mjs work-items` / `bash scripts/test-unit.sh work-items`
- `pnpm test:daily-work` / `node tests/run.mjs daily-work` / `bash scripts/test-unit.sh daily-work`
- `pnpm test:runner` / `node tests/run.mjs runner` / `bash scripts/test-unit.sh runner`
- `pnpm test:runtime-security` / `node tests/run.mjs runtime-security` / `bash scripts/test-unit.sh runtime-security`
- `pnpm test:https` / `node tests/run.mjs https` / `bash scripts/test-unit.sh https`
- `pnpm test:https-docker` / `node tests/run.mjs https-docker`
- `pnpm test:identity` / `node tests/run.mjs identity` / `bash scripts/test-unit.sh identity`
- `pnpm test:database` / `node tests/run.mjs database` / `bash scripts/test-unit.sh database`
- `pnpm test:database-docker` / `node tests/run.mjs database-docker`

ทุก suite ใช้ runner ร่วมกัน ไม่มี Makefile target. Docker suites ให้เรียก pnpm โดยตรง; Bash unit reporter ปฏิเสธ database-docker และ https-docker
