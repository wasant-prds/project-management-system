# Daily Work Journal — Issue #51

Implementation วันที่ 2026-11-13 ตามใบงาน `design/projects/project-management-system/work_items/51_dev_daily-work-journal-polish.md` และ parent #46. Dependency #47 completed แล้วก่อนเริ่ม; working tree เริ่มต้นสะอาด. ผู้ใช้สั่ง commit/push และ completed/close เมื่อ tests ผ่านครบ. สถานะ remote ตรวจได้ที่ [GitHub #51](https://github.com/wasant-prds/project-management-system/issues/51); parent #46 ยังมีงาน #52–#53

ปรับเฉพาะหน้า Daily Work และ components/tests ที่เกี่ยวข้อง:

- Desktop ใช้ calendar/summary column กว้าง 17–20rem และให้พื้นที่ที่เหลือกับ journal; tablet วาง calendar/summary คู่กัน; phone เรียงตามแนวตั้ง. คง calendar เดิมและ main scroll เดิม ไม่เพิ่ม scroll container
- แสดงวันหรือช่วง Bangkok ใต้หัวหน้า, ใน summary และหัวรายการ โดยช่วงจาก Dashboard ใช้ start/end จริง. วัน/สัปดาห์/เดือน/ปีใช้ศัพท์ไทย แต่ query และค่า day/week/month/year เดิม. Primary action ใช้ “เพิ่มบันทึกงาน” (phone แสดง “เพิ่ม” พร้อม accessible name เต็ม), คง compact search/filter และ export menu
- Work-log cards ลด padding และกรอบซ้อน; Project เป็น context, งานสองบรรทัด, วันที่และรายละเอียดสองบรรทัด, ชั่วโมงอยู่ด้านขวาแนวเดียวกันพร้อม “ชม.”. ปุ่มรายละเอียดเปิดข้อมูลเต็ม/GFM เดิม. หมายเหตุขยายได้ด้วย native button พร้อม expanded/controls และ unique DOM ID; หมายเหตุว่างไม่สร้างปุ่ม
- Dashboard context ใช้ชื่อ Project/Company จาก Project DTO/options ที่โหลดอยู่แล้ว; ถ้าไม่มีใช้ “Project ที่เลือก”/“Company ที่เลือก”. ไม่เพิ่ม API หรือ lookup
- Add/edit/view ใช้ศัพท์ไทย, labels เชื่อมกับ date/hours/Project/work item/status controls, คง linked selection, field validation, view-to-edit และ delete confirmation. Delete มี pending lock; API failure คง record/dialog/draft และไม่แสดง success
- คง exact Decimal sum ก่อน format, precise stored hours เมื่อ edit เฉพาะข้อความ, filtered CSV/Markdown content/columns/filename semantics, public UUID request boundary, API/auth/schema/statuses เดิม. ไม่มี target 8 ชั่วโมง, overtime, stopwatch หรือ approval workflow ใหม่

Browser acceptance ใช้ production components ที่ bundle ด้วย `node scripts/frontend-preview.mjs` บน loopback; ไม่อ่าน `.env` ไม่ใช้ database. ชุด `node scripts/daily-work-browser.mjs` intercept CRUD ด้วย synthetic UUIDv4 fixtures เท่านั้น. Browser timezone America/Los_Angeles ตรวจว่า Bangkok date-only ไม่เลื่อนวัน. ครบ Light/Dark/Special Dark × 390×844, 768×1024, 1440×900

Fixtures มีหลายวัน ชื่อยาวต่อกัน หมายเหตุว่าง/ยาว Markdown table และชั่วโมง 1.005 + 1.005 (ยอดรวม 2.01), 0.125 และ Decimal(65,30) ขนาดใหญ่. ตรวจ requests day/week/month/year/calendar/Dashboard, named/fallback context, exact edit payload, create โดยไม่ส่ง id, linked Project reset, client validation, delayed API/failed save/delete/success/cancel, selected filtered CSV/Markdown, loading/empty/error/retry, keyboard/Escape/focus return และ no horizontal overflow. Extreme fixture ใช้ layout audit เดิมที่ปรับหน่วยแล้ว และตรวจ full detail dialog

Density จาก dataset เดียวกันก่อน/หลัง (เฉลี่ย cards วันที่เลือก, เท่ากันทั้งสามธีม):

- 390px: 526 → 220.5px (ลด 58.1%)
- 768px: 316 → 212.5px (ลด 32.8%)
- 1440px: 306 → 212.5px (ลด 30.6%)

ผล verification รอบส่งมอบ:

- `node tests/run.mjs daily-work`: 11 PASS; `node tests/run.mjs frontend-ui`: 218 PASS. Full suite รอบส่งมอบ: **485 total / 485 PASS / 0 FAIL / 0 SKIP**, รวม PostgreSQL/API, pg_dump/restore/production HTTP และ nginx Docker integrations ใน disposable containers. เปิด `PMS_RUN_POSTGRES_TESTS=1`, `PMS_RUN_HTTPS_DOCKER_TESTS=1`, `PMS_APP_TEST_IMAGE=pms-issue51-check`, `PMS_DATABASE_TEST_IMAGE=pms-issue51-tools-check` แล้วเรียก `node tests/run.mjs`; ผลอยู่ใน `artifacts/issue-51/full-tests-all-final.log` แทนรอบเดิมที่ข้าม 3 รายการ
- `node scripts/daily-work-browser.mjs`: **198 PASS**, `completed: true`, 0 page errors, 9 density measurements. ภาพ before 18 / after 162. หลังปรับ summary บน tablet ไม่ให้ยืดตาม calendar รัน `--layout-only` อีก **18 PASS** ครบ 9 คู่ พร้อมภาพ final layout 18 ภาพ และตรวจ selected-period label
- `node scripts/frontend-modal-browser.mjs --daily-work-only`: **9 PASS**, รวม cold load, typing, picker, close/reopen, single modal surface/backdrop, focus return, normal/reduced motion และ failed chunk/retry. ใช้ 375/1440px ในสามธีม; เก็บภาพ modal เพิ่ม 8 ภาพ รวม `after/` 170 ภาพ
- `node scripts/header-tools-browser.mjs`: **68 PASS**, รวม compact panels, nested controls, keyboard/focus, search/reset และ grouped import/export. คัดลอก result JSON มาใน issue artifacts แล้ว
- ESLint ทั้ง repository (`--max-warnings=0 --report-unused-disable-directives`), `tsc --noEmit` และ `git diff --check`: PASS. เรียก installed binaries/shared Node runner โดยตรง; ไม่เปลี่ยน dependencies
- Final Linux production build: **PASS**, `docker build --target production -t pms-issue51-check .`; Next compile/lint/type/static generation และ standalone packaging ผ่าน. Docker กลับมาตอบสนองในรอบส่งมอบตามคำสั่ง commit/push ของผู้ใช้ จึงตรวจซ้ำสำเร็จโดยไม่ restart infrastructure ของผู้ใช้. สร้าง `pms-issue51-tools-check` สำหรับ disposable SQL tests แยกต่างหาก; ไม่ deploy

รอบแรกที่รัน Docker/browser/full tests พร้อมกันมี Docker daemon EOF, Node out-of-memory และ screenshot failure จึงแยกรัน. Full suite รอบถัดมามี HTTPS mocked `ruleset-create` failure; focused HTTPS 4 PASS, full suite 482/0/3 และเมื่อ Docker กลับมาพร้อม รอบส่งมอบเปิด integrations ครบผ่าน **485/0/0** ตามด้านบน. เก็บ diagnostic logs แยก ไม่ใช้ผลรอบที่สะดุดแทนผลสุดท้าย และไม่เปลี่ยน runtime/provider code นอก scope

ภาพ/JSON และ command logs อยู่ใน `artifacts/issue-51/` (gitignored); browser script และรายงานนี้อยู่ใน version control. ตรวจภาพจริงของ Light/Dark/Special Dark, phone/tablet/desktop, create/detail/grouped/edge dialogs แล้ว. คง ignore ของ `design/` และ `artifacts/`; หยุด preview servers ที่เริ่มสำหรับงานนี้หลังตรวจเสร็จ

ใช้ซ้ำ: เริ่ม isolated preview, กำหนด `PMS_PLAYWRIGHT_MODULE` หาก Playwright ไม่อยู่ใน local dependencies แล้วเรียก `pnpm test:daily-work-browser` (หรือ shared Node command). `--before` ต้องรันก่อนแก้ source และ after จะ fail ถ้า baseline หายหรือ cards ไม่เตี้ยลง. `--layout-only` ตรวจภาพ/geometry ทุกคู่โดยไม่ทำ CRUD interactions ซ้ำ. Modal stability ใช้ `node scripts/frontend-modal-browser.mjs --daily-work-only`; header regression ใช้ `node scripts/header-tools-browser.mjs`

ข้อจำกัด: synthetic preview แทน Next navigation/owner/data boundaries จึงไม่ใช่ browser acceptance กับ Next server/auth/live database/provider. Database/restore/HTTP/nginx tests ใช้ disposable containers เท่านั้น; ไม่มีการแก้ API/auth/schema หรือ live DB/migration/seed/reset/cutover/deploy/provider write. SonarQube/CI และ remote issue status แยกจาก local tests และตรวจได้ที่ GitHub; ไม่อ้างว่า SonarQube ผ่านจากการปิด issue
