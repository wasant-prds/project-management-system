# Work Items และ Kanban Board — Issue #50

Implementation และ isolated verification เสร็จวันที่ 2026-11-13 สำหรับ `/work-items`, `/board` และ dialogs ที่เกี่ยวข้อง. Dependency #47 completed และใช้ compact header/filter/import-export จาก #43 ต่อ. ผู้ใช้สั่ง commit/push และอัปเดต completed/close หลัง tests ผ่านครบ; รอบส่งมอบผ่าน 485 tests โดยไม่มี failures หรือ skips. สถานะ remote ตรวจสอบได้ที่ [GitHub #50](https://github.com/wasant-prds/project-management-system/issues/50); parent #46 ยังมีงาน #51–#53

- Work Items ลดกรอบและพื้นหลังซ้อนของ Project → urgency subgroup → cards โดยคง Radix collapsible, CSS tree, ลำดับ Overdue → Near due → On track → Complete และการนับ cancelled ใน Complete. Project header เล็กลง; sticky observer, offset จากความสูงจริง และ expansion/reset handlers เดิมคงอยู่
- Cards เน้นชื่อสองบรรทัด สถานะ และกำหนดส่ง. รวม kind/priority/owner/role/types เป็น metadata รองที่กระชับ; เปิดชื่อด้วย keyboard เพื่อดูข้อมูลเต็มได้. Detail ยังมีข้อมูลเดิมครบ และ labels ประเภทงานยาวห่อข้อความได้. ปุ่มจัดการมี accessible name, พื้นที่ 36px และไม่ต้อง hover
- Work Items และ Board ส่ง named active summary เข้า `SearchFilterPanel` ของ #47; คง debounce, live apply, reset, sort-only reset, URL/calendar filters และ grouped import/export เดิม. บน phone ใช้ accessible name/title ของ trigger ตาม shared pattern; summary ข้อความบน trigger ซ่อนตาม breakpoint เดิม
- Board cards ใช้ padding/gap เล็กลง ชื่อสองบรรทัดเต็มความกว้าง และย้าย control 36px ไปแถว due date. แสดงสถานะที่ column heading เพื่อลด badge ซ้ำ; คง shared statuses ครบแปด column, counts และ local horizontal/vertical scroll. Empty column เป็นข้อความกระชับ. Pending มี busy state/spinner/ข้อความสำหรับ assistive technology; ไม่เปลี่ยน server-authorized PATCH, optimistic update, locks, feedback หรือ rollback handlers
- Create/edit/view ใช้ภาษาไทยและจัดกลุ่มรายละเอียด/หมวดหมู่/กำหนดการ; เชื่อม labels กับ controls และแสดง `aria-pressed` สำหรับ types. คง shell เดิม, optional dates, custom imported types, Markdown/GFM, view field row แบบ 4 columns / 2×2 บน phone และ payload เดิม. Board detail เพิ่มการแสดง types ที่อยู่ใน DTO แล้ว

หลักฐาน density จาก synthetic dataset เดียวกัน (15 Work Items, ชื่อยาวและ types หลายค่า), fixed Bangkok date 2026-11-13, browser timezone America/Los_Angeles. วัด leaf cards เท่านั้น ไม่รวม column containers. ค่าตรงกันทั้ง Light/Dark/Special Dark:

- Work Items, 390×844: 257 → 148px ต่อ card (ลด 42.4%)
- Work Items, 768×1024: 154 → 148px (ลด 3.9%)
- Work Items, 1440×900: 134 → 128px (ลด 4.5%)
- Board, 390×844: เฉลี่ย 314.75 → 189.5px (ลด 39.8%)
- Board, 768×1024 และ 1440×900: เฉลี่ย 342 → 189.5px (ลด 44.6%)

ตัวเลขนี้ยืนยันความสูง card ลดลงในทุกคู่ viewport/theme; ไม่อ้างว่ามี card ที่มองเห็นเต็มใบเพิ่มขึ้นทุก viewport โดยเฉพาะ phone ที่ toolbar/stats ยังอยู่ก่อนรายการ

ผลตรวจที่รันจริง:

- `node tests/run.mjs work-items`: 7 PASS; `node tests/run.mjs board`: 12 PASS; `node tests/run.mjs frontend-ui`: 218 PASS. ปรับ assertions ของ spacing/empty column/status badge ให้ตรง hierarchy ใหม่ และเติม types ใน Board dialog fixture
- `node scripts/work-items-board-browser.mjs`: **129 PASS**, 18 density measurements, 0 page errors, `completed: true`. ครบ 3 themes × 390×844, 768×1024, 1440×900; keyboard/touch move, pending lock, failure/rollback/success, GFM/detail/edit/create, draft หลัง failure, public UUID PATCH/POST/import/export, summary/reopen/reset/sort-only reset และ expansion reset. เพิ่ม geometry test สำหรับ sticky สองแถว, title ที่ไม่ pin และการหลุดเมื่อพ้น Project ด้วยข้อมูลเพิ่มใน Project ถัดไป
- `node scripts/header-tools-browser.mjs`: **68 PASS** สำหรับ compact panel/nested controls/apply/reset/focus และ grouped import/export
- `node scripts/frontend-modal-browser.mjs --work-items-board-only`: **16 PASS** สำหรับ Work Item/Board detail, Light/Dark/Special Dark, 375/1440px และ reduced motion. แก้ selector เดิมที่เปิด filter popover แทน Board detail โดยเจาะ `[data-work-item-card]`. Full modal script เคยหยุดที่ Daily Work toolbar selector ภาษาอังกฤษซึ่งเก่ากว่า UI ปัจจุบัน; ไม่เปลี่ยน Daily Work นอก scope และไม่อ้างว่าทั้ง full modal suite ผ่าน
- ESLint ทั้ง repository (`--max-warnings=0 --report-unused-disable-directives`), `tsc --noEmit` และ `git diff --check`: PASS. เรียก binaries/shared Node runner จาก dependencies ที่ติดตั้งโดยตรง; ไม่เปลี่ยน package manager หรือ dependencies
- Full suite รอบส่งมอบ `node tests/run.mjs`: **485 total / 485 PASS / 0 FAIL / 0 SKIP** เมื่อเปิด `PMS_RUN_POSTGRES_TESTS=1`, `PMS_RUN_HTTPS_DOCKER_TESTS=1`, `PMS_APP_TEST_IMAGE=pms-issue50-check` และ `PMS_DATABASE_TEST_IMAGE=pms-issue49-tools-check`. รวม PostgreSQL repository/API (76 contract checks ใน fixture), pg_dump/restore/production HTTP และ nginx ใน disposable containers ที่แยกจาก live environment. ผลสุดท้ายอยู่ใน `artifacts/issue-50/full-tests-all-final.log` แทนรอบเดิม 482 PASS / 3 SKIP. รอบแรกใน Windows sandbox มี HTTP/child-process failures; รอบส่งมอบรันนอก sandbox
- `docker build --target production -t pms-issue50-check .`: PASS จาก final source. สร้าง local Linux production image สำหรับตรวจเท่านั้น ไม่ deploy; Next compile/lint/type/static generation ผ่าน. หยุด preview servers ที่เริ่มสำหรับงานนี้หลัง browser verification

ภาพ before 18 / after 92 พร้อม JSON/logs อยู่ใน `artifacts/issue-50/` (gitignored). ภาพหลาย viewport/theme และ create/detail dialogs เปิดตรวจด้วยภาพจริงแล้ว. ใช้ `node scripts/frontend-preview.mjs`; ตั้ง `PMS_PREVIEW_ORIGIN` เป็น loopback และ `PMS_PLAYWRIGHT_MODULE` ตาม runtime ที่ติดตั้ง. `--before` ต้องรันก่อนแก้ UI; after เปรียบเทียบ baseline เดิมและจงใจ fail หาก baseline หายหรือ card ไม่เตี้ยลง. Preview และ tests ไม่อ่าน `.env` เพื่อเชื่อม application DB; writes ใน acceptance suite ถูก intercept ใน browser เท่านั้น

ข้อจำกัด: synthetic browser preview แทน Next navigation/owner/data boundaries จึงไม่ใช่ live DB/provider หรือ Next server/auth browser acceptance. Database/restore/HTTP/nginx integrations รอบส่งมอบใช้ disposable containers เท่านั้น; ไม่มี schema/API/auth/status/metric change, numeric lookup fallback, live database rollout/migrate/seed/reset, provider writes หรือ deploy. ผล SonarQube/remote CI แยกจากผล local tests และตรวจได้ที่ GitHub Actions; ไม่อ้างว่า scan ผ่านจากการปิด issue. `design/` และ `artifacts/` คง gitignore เดิม; รายงานนี้และ browser scripts เป็นหลักฐาน versioned
