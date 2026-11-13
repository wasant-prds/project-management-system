# Login, application states และ final consistency — Issue #53

Implementation / verification วันที่ 2026-11-13 ตามใบงาน `53_dev_login-application-states-and-final-consistency.md` และ parent #46. อ่าน `AGENTS.md`, identifier rule, parent และ checklist ก่อนเริ่ม; dependencies #47–#52 completed/closed แล้ว และ working tree เริ่มต้นสะอาดที่ `fbc827a`. ผู้ใช้สั่ง commit/push และปิด #53 กับ parent #46 เป็น completed หลัง tests ผ่านครบ; สถานะ remote ดูที่ [#53](https://github.com/wasant-prds/project-management-system/issues/53)

## สิ่งที่เปลี่ยน

- **Login (presentation เท่านั้น)**: ข้อความรอง (brand caption, eyebrow, คำอธิบายใต้ heading, private label, hint ของ field, footer) ขยายเป็น 10–14px และใช้ `--text-secondary` แทน `--text-muted` ที่ 8–9px. Card/input/submit/error ใช้ `--radius-panel`/`--radius-control` ร่วมกับ shared foundation; placeholder ไม่ลด opacity. จอ ≤480px ซ่อน brand caption (เดิม 6px) และลดระยะ card/form; จอ ≤360px ลด padding/heading เพื่อให้ form และ submit อยู่ในจอ 320px; desktop สูง ≤700px ซ่อน illustration ก่อนบีบ form; 861–1050px ซ่อน spark ตกแต่ง. `login-screen.tsx` **ไม่เปลี่ยน**: endpoint, payload, `credentials`, autocomplete, redirect, error focus/role, password toggle, fieldset disabled และ `aria-busy` คงเดิม
- **PageState / InlineState**: glyph ตามเหตุผลของ state (records/search/activity/chart/network/not-found/permission/partial/success) แทน Inbox ตัวเดียว; ข้อความ transport ดิบของ browser (`Failed to fetch`, `NetworkError…`) แทนด้วยคำแนะนำไทยเมื่อ visual เป็น network ส่วนข้อความจาก server คงเดิม. เพิ่ม `density="section"` สำหรับ card/tab panel, `titleAs` สำหรับ full-page fallback, action wrapper ที่ stack บนมือถือและเรียงแถวบนจอกว้าง, InlineState ข้อความไม่ถูกบีบจาก action. Loading ยังคง `role="status" aria-busy`, error `role="alert"`, empty หลายจุดไม่ประกาศ
- **Application error / 404**: title เป็น `<h1>`; error มี “ลองอีกครั้ง” + “กลับ Dashboard” โดยไม่แสดง diagnostics; 404 มี “กลับ Dashboard” + “ไปที่ Projects” และไม่มี retry ปลอม
- **Project detail (defect จากชุด 48–52 ที่แก้ใน owner component)**: เดิม load failure แสดง “คำขอ Project ไม่สำเร็จ” โดยไม่มี action และ 404 เป็น error. ตอนนี้ 404 → not-found พร้อมลิงก์กลับ Projects; failure อื่น → error/network พร้อม “ลองโหลดอีกครั้ง” และ “กลับไปรายการ Projects”; refresh ที่ล้มเหลวหลังโหลดแล้ว (เช่นหลัง sync) คงข้อมูลเดิมพร้อม partial alert แบบกระชับ; ลบไม่สำเร็จเป็น InlineState alert ปิดได้ แทน full-page error. Empty ใน card ใช้ InlineState และใน tab ใช้ `density="section"` พร้อมคำแนะนำ; Functional roles มี empty state แล้ว
- **Board**: เมื่อไม่มี Work Item ทั้ง Board มี summary เดียว (`role="status"`) แยก “ไม่พบตามตัวกรอง” (ตัวกรองยังคงอยู่ + ปุ่มคืนค่าตัวกรองที่ผู้ใช้กดเอง) กับ “ยังไม่มี Work Item” (ลิงก์ไป Work Items); คอลัมน์ว่างยังเงียบ

ไม่มี API/backend/schema/auth/session/middleware/rate-limit/Origin/redirect changes, ไม่มี dependency ใหม่ และไม่มี migrate/seed/reset/deploy หรือ live DB writes

## Verification

- Lint ทั้ง repository (`--max-warnings=0 --report-unused-disable-directives`), `tsc --noEmit`, `git diff --check`: **PASS**
- Frontend UI **224 PASS** (รวม TC-53-04…09 ใหม่ใน `tests/frontend-ui/application-states.test.mjs`); Company/Projects **19 PASS** (รวม TC-53-01…03 Project detail retry/404/section states); Settings **26 PASS**; Board **12 PASS**; Auth (#45) **22 PASS**; Runtime security **13 PASS**
- Full suite: **496 total / 496 PASS / 0 FAIL / 0 SKIP** รวม isolated PostgreSQL/API, pg_dump/restore/production HTTP และ nginx Docker integrations. เปิด `PMS_RUN_POSTGRES_TESTS=1`, `PMS_RUN_HTTPS_DOCKER_TESTS=1`, `PMS_APP_TEST_IMAGE=pms-issue-53-qa`, `PMS_DATABASE_TEST_IMAGE=pms-issue-53-tools-qa` (`docker build --target database-tools`). รอบแรกที่ไม่เปิด flags ได้ 492 PASS / 1 FAIL / 3 SKIP: FAIL มาจาก Git Bash ที่ resolve `python3` เป็น Windows Store alias สำหรับ `tests/runtime/https-certificate-behavior.sh`; รอบส่งมอบใส่ shim `python3` → Python 3.11 ที่ติดตั้งไว้ใน PATH ของ process เท่านั้น ไม่เปลี่ยน test หรือ script
- Linux production Docker build `docker build --target production -t pms-issue-53-qa .`: **PASS** (image ในเครื่องเท่านั้น ไม่ได้ deploy)
- Browser acceptance (`node scripts/application-states-browser.mjs`): **completed=true, 396 checkpoints, 387 ภาพ, 0 page errors**. Light/Dark/Special Dark × 320×640 (Login), 390×844, 768×1024, 1440×900; ≤390px ใช้ touch และทุกคู่ใช้ reduced motion. ครอบคลุม Login + 8 เมนูหลัก + Project detail (normal/empty/error/loading), 404, route error, Project ที่ไม่มีอยู่ และ dialogs สร้าง Project/เพิ่มบันทึกงาน/เพิ่มบริษัท. ตรวจ document/state/dialog horizontal bounds, Login focus ring/password toggle/autocomplete/submitting lock/401/429/network error focus และ payload keys ด้วย synthetic credentials ที่ intercept ใน browser, error states มี alert + action, Board summary เดียว, และ heading ไม่กระโดดระหว่าง loading → loaded (**สูงสุด 0px จาก 72 กรณี**)
- Baseline ก่อนแก้: **282 ภาพ** จาก `HEAD` worktree ชั่วคราว (`--before`) ที่ลบแล้ว
- Regression เดิม: header/import-export **68 PASS**; modal Work Items/Board **16 PASS**, Daily Work **9 PASS**; motion browser **56 checks PASS** แล้วหยุดที่ selector “ใช้ตัวกรอง” ของ Analysis ซึ่งถูกย้ายเข้า compact filter panel ใน #43 — fail แบบเดียวกันบน baseline ที่ยังไม่แก้ จึงเป็น stale script เดิม ไม่ใช่ regression ของ #53

ภาพ/logs/JSON อยู่ใน `artifacts/issue-53/` (gitignored)

## ตรวจซ้ำ

เริ่ม `node scripts/frontend-preview.mjs` แล้ว `pnpm test:application-states-browser` (หรือ `node scripts/application-states-browser.mjs`); กำหนด `PMS_PLAYWRIGHT_MODULE` ถ้า Playwright ไม่อยู่ใน local dependencies; Windows ใช้ headless Edge. `--before` ใช้กับ preview ของ source ก่อนแก้. Origin ต้องเป็น loopback และควรหยุด preview หลังตรวจ

## ข้อจำกัด

- Isolated preview แทน Next navigation/owner/server boundaries: ไม่ใช่ Next server/auth/live database browser acceptance. Login ทดสอบด้วย response ที่ intercept เท่านั้น ไม่มีการเข้าสู่ระบบจริง
- Settings ใน preview ปกติใช้ provider จำลอง จึง `qa=error/slow` ไปไม่ถึง; บันทึกเป็น not covered 9 รายการ (ครอบคลุมแล้วใน #52 ด้วย real provider)
- Permission denied ไม่มีหน้าจอ เพราะระบบเป็น single owner และ middleware ปฏิเสธก่อนถึง UI (`VISUAL_STATE_APPLICABILITY.permission = 'not-applicable'`); มีเพียง visual/glyph ที่ทดสอบระดับ component
- ผล remote CI/SonarQube บันทึกแยกใน GitHub #53; การตรวจในเครื่องไม่ใช่การยืนยันว่า SonarQube ผ่าน
