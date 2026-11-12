# Issue #47 — Shared premium visual foundation

วันที่ตรวจ: 2026-11-12 (Asia/Bangkok)

**Status:** Completed — implementation และ verification ผ่าน; ผู้ใช้สั่ง commit/push และปิด #47 หลัง tests ผ่านครบ

## ขอบเขตที่ส่งมอบ

อ่าน `AGENTS.md`, identifier rule, UI rule, ใบงาน #47, parent #46 และ `00_checklist.md` แล้ว. #47 ไม่มี dependency ภายในชุด; เป็น foundation ให้ #48–#53. Working tree ของ tracked files สะอาดก่อนเริ่ม และรักษา ignored QA artifacts เดิมไว้

- ลดระยะ/ความเข้มของ soft, raised, hover และ inset shadows ในสามธีม. Editable controls ใช้ inset บางชั้นเดียว; nested Card ไม่มี raised shadow ขณะ idle
- ปรับ Button, Card, Input, Textarea, Select, Tabs, Badge และ Dialog/AlertDialog shell จาก components เดิม. Primary ใช้ semibold/elevation; secondary ใช้ขอบและพื้นเรียบ; destructive แยกด้วยขอบ/คำกริยาและ semantic colors. Focus, disabled, invalid และ selected states คงอยู่
- กำหนด radius/spacing/type/numeric roles และตัวอย่างควรใช้/ไม่ควรใช้ใน `visual-system.md`. ไม่สร้างระบบ component, theme, animation หรือ identity อีกชุด
- คง compact SearchFilterPanel และ DataTransferMenu จาก #43. เพิ่ม optional active-filter summary แบบ ellipsis/count/accessible name โดยไม่คำนวณ filter semantics ใหม่
- เพิ่ม `formatUiDate` / `formatUiDateTime` ที่ reuse Bangkok formatter: DD/MM/YYYY ปี ค.ศ. และเวลา 24 ชั่วโมง. ใช้ใน Dashboard, Projects, Project detail, Work Items/Board, Analysis, Daily Work และ sync history; แยก Daily Work display period ออกจาก export label
- คงค่า form/query/URL/API, timestamps, export serializers, UUID boundary, CRUD/auth/owner handlers และ metric formulas เดิม. ไม่มี migrate, seed, reset, deploy หรือ live database cutover

## ผลตรวจ

- `pnpm test` พร้อมเปิด PostgreSQL/Docker checks: **479 tests — 479 PASS, 0 FAIL, 0 SKIP**. รวม frontend UI 214 tests, date picker, display dates, colors, filter selects, CRUD/auth/runtime, exports, isolated PostgreSQL repositories/API, backup/restore/production HTTP และ `nginx -t`. Log: `artifacts/issue-47/full-tests-completion.log`
- Focused `node tests/run.mjs frontend-ui`: **214/214 PASS**; `node tests/run.mjs board`: **12/12 PASS**. Full suite รอบสุดท้ายครอบคลุมการเปลี่ยน copy/date เพิ่มเติมหลัง focused run ด้วย
- `pnpm typecheck`: **PASS**. Log: `artifacts/issue-47/typecheck-final.log`
- `pnpm lint`: **PASS, 0 warnings**. เพิ่ม `artifacts/` ใน ESLint ignore ให้ตรงกับ generated/ignored QA outputs; รักษา QA script เดิมไว้. Log: `artifacts/issue-47/lint-completion.log`
- `pnpm test:api-contracts`: **11/11 PASS** หลังแก้ clean-checkout CI: ตรวจ versioned API handbook และ rules แทนการอ่าน issue/checklist จาก ignored `design/`. Assertions เรื่อง request/response `+07:00`, validation, Bangkok persistence และ settings timezone ยังครบ. ไม่ใช้สถานะปิดของ planning issue เป็น API test. Log: `artifacts/issue-47/api-contracts-completion.log`
- `node scripts/header-tools-browser.mjs`: **68/68 PASS**. ตรวจ collapsed heading tools, nested Select/Calendar, Escape/restore focus, apply/reset, GET date values, role filters, grouped CSV/Markdown exports และ synthetic reviewed import. Log: `artifacts/issue-47/header-tools.log`; JSON: `artifacts/header-tools/results.json`
- Shared foundation browser matrix: **120/120 PASS** รวม sync-history datetime 9 cases. ผลรอบสุดท้ายใน `artifacts/issue-47/after/results.json` เป็น `completed: true`, `failure: null`, `errors: []`; log คือ `shared-foundation-browser.log`. JSON ที่เขียนจากการรันไม่สำเร็จเป็นผลบางส่วนเท่านั้น
- `git diff --check`: **PASS**

รอบก่อนเปิด Docker ได้ 476 PASS / 3 SKIP (`full-tests-final.log`). รอบ completion เปิด `PMS_RUN_POSTGRES_TESTS=1` และ `PMS_RUN_HTTPS_DOCKER_TESTS=1` โดยใช้ images `pms-issue47-app-check:verification` / `pms-issue47-sql-tools-check:verification`; ทุก database เป็น disposable container ชื่อสุ่มและถูกลบโดย test teardown. ไม่มี used/live database operation. Runtime localhost tests รันนอก sandbox เพราะ sandbox ปฏิเสธ loopback

## Browser evidence และขอบเขตการยืนยัน

ใช้ isolated preview บน loopback, production components/CSS และ synthetic fixtures เท่านั้น. Preview ไม่โหลด `.env`, ไม่เชื่อมฐานข้อมูล และปฏิเสธ writes. ตรวจ Light/Dark/Special Dark × 390×844, 768×1024, 1440×900 บน 8 เมนูหลัก, Project detail, Login และ control gallery; Login เพิ่ม 320px. Browser ใช้ `America/Los_Angeles` เพื่อจับข้อความวันที่ที่เผลออิง timezone ของเครื่อง

Before อยู่ใน `artifacts/issue-47/before/`: **120 ภาพ**, baseline runner จบสำเร็จ. After อยู่ใน `artifacts/issue-47/after/`: **120 ภาพ** ของหน้า, filter และ dialog. ตัวอย่างเปรียบเทียบคือ `qa-foundation-light-1440.png`, `filter-special-dark-390.png`, `dialog-dark-768.png`, `projects-project-0-special-dark-768.png`, `analysis-dark-1440.png` และ `login-light-320.png`

Matrix ตรวจ page/main bounds, overlay bounds หลัง Radix วางตำแหน่งเสร็จ, Board/tab local scroll, toolbar geometry ก่อน/หลังเปิด panel, keyboard/Arrow keys/Escape/restore focus, visible focus ring, invalid/disabled/selected states, non-color action cues, flat nested cards, date-picker/display agreement และ Bangkok datetime ใน read-only sync history. Browser ไม่มี uncaught page errors ในรอบที่จบสำเร็จ

ไม่ใช่ browser acceptance ของข้อมูลจริงหรือ Next.js server navigation/auth/font-asset loading. ใช้ reduced motion สำหรับภาพ matrix; motion/reduced-motion contracts ตรวจโดย regression suite เดิม. #48–#53 ยังต้องตรวจ layout, states และ acceptance เฉพาะหน้าของตัวเอง ไม่ใช้หลักฐาน #47 ไปปิดงานเหล่านั้น

## Build และขอบเขตส่งมอบ

**Production Docker build PASS** รวม lint, type validation, static generation และ standalone packaging บน Linux. คำสั่ง `docker build --target production --tag pms-issue47-app-check:verification .`; tools image สร้างจาก target `database-tools` แยกต่างหาก. Logs: `artifacts/issue-47/docker-build.log`, `docker-tools-build.log`. Test image ไม่ทับ production image และไม่มี deploy

Native Windows packaging ยังติด symlink `EPERM` ตาม logs เดิม `build.log` / `build-host.log`; Linux production build และ isolated production HTTP tests ผ่านแล้ว. ไม่เปลี่ยน OS policy หรือ Next config. ข้อจำกัด preview/font/navigation ตามด้านบนยังคงอยู่

ผู้ใช้อนุมัติให้ publish และปิด #47 เมื่อ tests ผ่านครบ. อัปเดต issue เป็น `status::completed` / closed หลัง push สำเร็จ และอัปเดตเฉพาะ checkbox #47 ของ parent #46; #46 และ #48–#53 ยังเป็นงานแยก. Design work-item/checklist files และ artifacts คง gitignore เดิม ไม่ force-add planning tree; รายงานนี้เป็นบันทึกที่ versioned สำหรับการส่งมอบ
