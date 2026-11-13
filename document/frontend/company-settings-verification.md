# Company + Settings — Issue #52

Implementation / isolated verification วันที่ 2026-11-13 ตามใบงาน `52_dev_company-settings-and-theme-previews.md` และ parent #46. อ่าน `AGENTS.md`, identifier rule, UI rule, parent และ checklist ก่อนเริ่ม; dependency #47 completed แล้ว และ working tree เริ่มต้นสะอาด. ผู้ใช้สั่งให้ commit/push และตั้ง #52 completed/closed หลัง checks ผ่านครบ; [สถานะ remote ของ #52](https://github.com/wasant-prds/project-management-system/issues/52). Parent #46 ยังเปิดสำหรับ #53

## สิ่งที่เปลี่ยน

- Company มี primary action “เพิ่มบริษัท” บน header เปิด shared responsive dialog; create/edit ใช้กลุ่มข้อมูลบริษัท ที่ตั้ง/การติดต่อ และรายละเอียด พร้อม label ไทยและ required/optional โดยส่ง `name`, `displayName`, `location`, `address`, `phone`, `description` เดิม ไม่รับ client ID
- Dialog คง draft เมื่อ API ล้มเหลว, ล็อก fields/actions/Escape/outside dismissal ระหว่างบันทึก, ยกเลิกได้ และคืน focus ไปปุ่มแก้ไข. Default Company ยังแก้ชื่อทางการหรือลบไม่ได้; บริษัทที่มี Projects ไม่มีปุ่มลบ. Delete ใช้ alert confirmation และข้อจำกัด server เดิม
- Company cards เรียงชื่อทางการ/ชื่อที่แสดง → ติดต่อ/รายละเอียด → counts/hours → Projects/actions; ใช้ brand icon เดิม, subgrid บน desktop และ wrap ชื่อ/ที่อยู่/โทรศัพท์/รายละเอียด/ตัวเลขยาว. ลิงก์ Projects คง `companyId` public UUID รวมบริษัทที่ยังไม่มี Project
- Profile ใช้ identity summary แบบกระชับ คำอธิบายข้อมูลติดต่อ และ name/email/optional phone เดิม. คง avatar URL/fallback, email validation/conflict และ login behavior
- Appearance ใช้ native radio Light/Dark/Special Dark กับภาพ HTML/CSS จาก palette tokens เดิม. Light sample ใช้ selector ร่วมกับ `:root`; ไม่ทำสำเนาสี ไม่ใช้ภาพ/screenshot assets หรือ image generation. มี accessible names, native checked state, ข้อความ ✓ และ keyboard focus outline; label ทั้งใบเป็น touch target
- Theme/locale เป็น draft จนบันทึกสำเร็จ; cancel กลับค่าที่บันทึกล่าสุด รวมกรณีเปลี่ยนผ่าน header ขณะมี draft. Loading/error/failed save ไม่เปลี่ยน persisted theme. ข้อความภาษาแจ้งว่าปัจจุบันส่วนใหญ่ยังเป็นไทย และ timezone `Asia/Bangkok` อ่านอย่างเดียว
- แก้ shared provider defect ที่พบจาก browser จริง: `next-themes` เปลี่ยน reference ของ `setTheme` เมื่อ theme เปลี่ยน; dependency เดิมทำให้ GET/reload ซ้ำและ unmount Settings tabs. เก็บ setter ล่าสุดใน ref และให้ load effect ขึ้นกับ explicit reload เท่านั้น. ไม่เปลี่ยน persistence/API contract; regression จำลอง setter identity ที่เปลี่ยนทุก render และยืนยัน explicit reload ยังทำงาน

ไม่มี API/backend/schema/auth/authorization/status/metric changes, logo upload, security settings, multi-user หรือ fields ใหม่. ไม่มี migrate/seed/reset/cutover/deploy หรือ live DB/provider writes

## Verification

- Company/Projects: **16 PASS**; Settings: **26 PASS**; color-system: **18 PASS**
- Frontend UI: **218 PASS**. ปรับ stale source assertion ที่เคยคาด Company disclosure ให้ตรวจ shared toolbar dialog ตาม scope ใหม่; behavior ยืนยันผ่าน browser ด้วย
- Full suite: **487 total / 487 PASS / 0 FAIL / 0 SKIP** รวม isolated PostgreSQL/API, pg_dump/restore/production HTTP และ nginx Docker integrations. เปิด `PMS_RUN_POSTGRES_TESTS=1`, `PMS_RUN_HTTPS_DOCKER_TESTS=1`, `PMS_APP_TEST_IMAGE=pms-issue-52-qa`, `PMS_DATABASE_TEST_IMAGE=pms-issue-52-tools-qa` แล้วเรียก `node tests/run.mjs`; ผลรอบส่งมอบอยู่ใน `artifacts/issue-52/full-tests-all-final.log` แทนรอบแรกที่ข้าม 3 รายการ. Auth/runtime isolated HTTP child-process tests รันนอก Windows sandbox
- Repository ESLint (`--max-warnings=0 --report-unused-disable-directives`), `tsc --noEmit`, browser-script lint และ `git diff --check`: **PASS**. ใช้ installed binaries/shared Node runner โดยตรง เพราะ pnpm auto-bootstrap ใน sandbox ติด `EPERM` ขณะ rename ไฟล์ cache; ไม่เปลี่ยน dependencies
- Final Linux production Docker build: **PASS**, `docker build --target production -t pms-issue-52-qa .`; compile, lint/types, static generation และ standalone packaging ผ่าน. สร้าง tooling image `pms-issue-52-tools-qa` เพิ่มสำหรับ isolated SQL tests; การเริ่ม PostgreSQL/HTTP/nginx ในการทดสอบใช้ disposable containers เท่านั้น ไม่มี live environment หรือ deploy
- Browser acceptance: **9/9 theme/viewport pairs**, **144 screenshot checkpoints**, **0 page errors**, `completed: true`. Light/Dark/Special Dark × 390×844, 768×1024, 1440×900; phone ใช้ touch, ทุกคู่ใช้ reduced motion. Baseline ก่อนแก้ **27 ภาพ**
- Final layout/focus matrix เก็บแยกใน `artifacts/issue-52/layout-final/`: Company, create dialog, Profile, Appearance และ keyboard focus ทุกคู่ รวม **45 checkpoints / ภาพ**, `completed: true`, **0 page errors**

Browser ใช้ production Company/Settings/shared components และ **OwnerSettingsProvider จริง** ใน isolated preview. Intercept GET/POST/PATCH/DELETE ด้วย synthetic UUIDv4 fixtures; server preview ไม่อ่าน `.env` และปฏิเสธ writes ที่ไม่ intercept. ตรวจ create payload ทั้งหก fields, required validation, default lock, delete restriction/confirm/cancel, edit error/retry, save locks/Escape, restore focus, load/empty/error/retry, email format/conflict, optional phone clear, profile cancel/reload, native radio arrows/touch, theme draft/cancel/save failure/success/reload, localStorage, header theme menu และ locale-only payload/timezone. Header save ต้องไม่ทำ GET ใหม่หรือทำ dirty draft/active tab หาย

Fixtures รวมชื่อ/ที่อยู่/รายละเอียดต่อกันยาว, email/phone ยาว, counts และ Decimal hours ขนาดใหญ่. ตรวจ document/main/card/panel/dialog horizontal bounds และ dialog vertical bounds พร้อมเปิดดูภาพจริงของ 3 ธีมใน phone/tablet/desktop. ภาพ/logs/JSON อยู่ใน `artifacts/issue-52/` (gitignored); diagnostic รอบที่ไม่ผ่านแยกจากผลสุดท้าย. รายงานนี้และ browser script อยู่ใน version control; `design/` คง ignored ตามเดิม

## ตรวจซ้ำ

เริ่ม preview ด้วย `PMS_PREVIEW_REAL_SETTINGS=1` แล้ว `node scripts/frontend-preview.mjs` (PowerShell: `$env:PMS_PREVIEW_REAL_SETTINGS='1'`). กำหนด `PMS_PLAYWRIGHT_MODULE` ไปยัง Playwright ที่ติดตั้งถ้าไม่มี local dependency; Windows ใช้ headless Edge. รัน `pnpm test:company-settings-browser` หรือ `node scripts/company-settings-browser.mjs`; `--layout-only` เก็บภาพ/geometry/focus ใหม่โดยไม่รัน CRUD ซ้ำ. `--before` ใช้ preview ปกติก่อนแก้ production sources เพื่อเก็บ baseline. Origin ต้องเป็น loopback เท่านั้น และควรหยุด preview server หลังตรวจ

ข้อจำกัด: isolated browser preview แทน Next navigation/owner/server boundaries จึงไม่ใช่ Next server/auth/live database browser acceptance. Reload persistence ใน browser ใช้ mocked API ร่วมกับ provider/localStorage จริง; server persistence/validation ตรวจด้วย existing suites และ isolated PostgreSQL/API/restore/production HTTP integrations. ผล remote CI/SonarQube และสถานะปิดงานบันทึกแยกใน GitHub #52; การตรวจในเครื่องไม่ใช่การยืนยันว่า SonarQube ผ่าน
