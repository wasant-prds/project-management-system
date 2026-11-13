# ผล implementation และ verification — #48

วันที่ทำงาน: 2026-11-13 (Asia/Bangkok)

**Status:** Completed — implementation และ verification ผ่าน; ผู้ใช้สั่ง commit/push และปิด #48 หลัง tests ผ่านครบ

อ่าน `AGENTS.md`, identifier rule, ใบงาน #48, parent #46, `00_checklist.md` และกฎ Dashboard/Analysis/UI แล้ว. Dependency #47 completed/closed ตาม checklist และรายงานเดิม. Tracked working tree สะอาดก่อนเริ่ม; รักษา ignored planning files และ artifacts เดิม. งานนี้ปรับเฉพาะ Dashboard/Analysis และเครื่องมือ QA ที่เกี่ยวข้อง

## สิ่งที่ส่งมอบ

- Dashboard ใช้ลำดับ DOM summary → urgent/overdue → recent work/Projects → hours chart ทั้ง desktop/mobile. Risk queues ใช้รายการ/เงื่อนไข open/urgent/overdue เดิม; empty state ระบุว่ารายการใดว่าง. Status แยกจาก title, กำหนดส่งแยกจาก Company/Project และ role. กราฟได้พื้นที่เต็มแถวโดยไม่เปลี่ยน bar series
- Analysis มี summary ช่วงวัน/Asia/Bangkok, Company/Project/role/kind ที่นำไปใช้จริง, หน่วยรายการ/ชั่วโมง และ completion rate ก่อน KPI. อ่านค่าจาก report metadata; draft ใน compact filter panel ไม่เปลี่ยน summary จนกด apply และยังปิด export เมื่อ draft ไม่ตรงกับ applied
- แสดงชื่อ/หน่วย/สี series ที่หัวกราฟ และคง status bar / hours line, grouping, status/kind/priority breakdowns, source tabs และ pagination. ตารางชั่วโมงรายช่วงเปิดจาก disclosure ใต้กราฟ; ลดข้อความและกรอบที่ซ้ำ
- “วิธีคำนวณและขอบเขตข้อมูล” อยู่บนหน้าเดิมผ่าน native `details`/`summary` รองรับ keyboard/touch. คงสูตร completed ÷ (total − cancelled) × 100, zero-denominator, open/overdue/date-anchor/precision definitions และคำอธิบาย current status. ชี้ชัดว่า Project progress ใช้งานทั้งหมดของเจ้าของใน Project ตาม API เดิม
- เปลี่ยนศัพท์ TimeEntry/Decimal ในข้อความหลักเป็นชั่วโมง/บันทึกจริง. แกนชั่วโมงที่มีค่ามาก/เล็กมากย่อด้วย scientific notation; KPI, table, tooltip และ CSV ยังคงใช้ raw decimal strings จัดรูปแบบ 2 ตำแหน่ง. ปิด decorative active dot ที่บัง source link ของ hours chart
- ไม่เปลี่ยน backend queries/calculations, API/DTO, public UUIDs, auth, timestamps, schema, imports หรือชุดข้อมูลส่งออก. ไม่มี historical completion trend, mock KPI ใน production หรือข้อมูลคาดการณ์เพิ่ม

## ผลตรวจ

- Full suite `node tests/run.mjs`: **483/483 PASS**, 0 FAIL / 0 SKIP (`full-tests-completion.log`). เปิด `PMS_RUN_POSTGRES_TESTS=1` และ `PMS_RUN_HTTPS_DOCKER_TESTS=1`; disposable PostgreSQL/repository/API, pg_dump/restore, production HTTP และ nginx checks ผ่าน. ใช้ app image `pms-issue48-app-check:verification` กับ tools image `pms-issue47-sql-tools-check:verification` (mount current lib/app/tests/scripts/schema แบบ read-only); ทุก database เป็น container ใหม่แยก network และลบด้วย teardown ไม่ใช้ฐานข้อมูลจริง
- `node tests/run.mjs dashboard`: **7/7 PASS** (`dashboard.log`)
- `node tests/run.mjs analysis`: **6/6 PASS** (`analysis.log`)
- `node tests/run.mjs frontend-ui`: **218/218 PASS**, 0 FAIL / 0 SKIP (`frontend-ui.log`). หลังแก้ decorative dot รัน focused hours-formatting ซ้ำ **3/3 PASS** (`hours-formatting.log`); ตรวจ raw-decimal tooltip, compact axis และการคง source marker
- ESLint ด้วย arguments เดียวกับ `pnpm lint` และ TypeScript `--noEmit`: **PASS** (`lint.log`, `typecheck.log`)
- Dashboard/Analysis browser: **153/153 PASS**, `completed: true`, `failure: null`, `errors: []` (`after/results.json`, `browser.log`). รวม reading order, chart frames/ticks/tooltips, source tables, keyboard/touch disclosures, returned filter context, draft/apply, filtered CSV/public UUID links และ 6 states: filtered, closed/cancelled, empty, error, delayed loading, edge text/decimal
- Header/filter/import-export browser เดิม: **68/68 PASS** (`header-tools.log`, `header-results.json`). เพิ่มการรอ filter trigger หลัง hydration ก่อนตรวจ heading เพื่อไม่ให้ทดสอบช่วงที่ React ยังไม่ render
- Before: **45 ภาพ**, baseline **18/18 PASS**; after: **270 ภาพ**. ทั้งคู่ครอบคลุม Light/Dark/Special Dark × 390×844, 768×1024, 1440×900. Before เก็บ summary/charts; after เพิ่ม period/source tables, definitions, tooltip, filters และ states. Paths อยู่ใน `artifacts/issue-48/before/` และ `after/`
- Production Linux Docker build: **PASS** รวม compile, lint/type validation, static generation และ standalone packaging (`docker-build.log`). คำสั่ง `docker build --target production --tag pms-issue48-app-check:verification .`; `.dockerignore` ตัด `.env*` และ persisted data. ใช้ image ใน isolated HTTP test เท่านั้น ไม่มี deploy หรือเชื่อม database ที่ใช้งานจริง
- `git diff --check`: **PASS**

พบและแก้ระหว่าง verification: tests เก่ายืนยันตำแหน่ง recent grid ก่อน risk queues จึงแทนด้วย test ลำดับ DOM/source conditions ที่ใช้ runtime components จริง; labels แกนชั่วโมงยาวล้น frame จึงใช้ bounded axis formatter; decorative active dot ของ Recharts บัง marker จึงปิด overlay โดยคง source link. Browser harness ปรับให้ตรวจว่า export trigger ถูก disable เมื่อมี draft ตาม behavior เดิม

ตัวอย่างภาพสำหรับ review: `dashboard-light-390-top.png`, `analysis-light-1440-top.png`, `analysis-dark-768-period-table.png`, `dashboard-light-390-edge-tooltip.png`, `analysis-special-dark-1440-applied.png`, `dashboard-special-dark-390-slow-loading.png`, `analysis-dark-390-error.png` และ `analysis-light-390-empty.png` ภายใต้ `after/`

## ขอบเขตของหลักฐาน

Browser ใช้ production components/CSS กับ isolated synthetic preview บน loopback และ timezone `America/Los_Angeles` เพื่อจับการแสดงวันที่ที่เผลออิงเครื่อง. มี fixtures แบบ filtered/closed/cancelled/exact-hours, edge text, empty, failure และ delayed loading แยกจาก production; fixture ไม่ใช่การทดสอบ SQL aggregation. Dashboard loading ใน preview ใช้ Suspense fixture เพื่อแสดง component เดิม ไม่ใช่ Next.js server streaming

Browser preview ไม่ใช่ live-data/Next.js navigation/auth acceptance. ไม่ migrate, seed, reset, deploy หรือ cutover ฐานข้อมูลที่ใช้งานจริง. Host pnpm launcher ติด `EPERM` ระหว่างจัดเตรียมตัวเอง จึงใช้ Node เรียก ESLint/TypeScript/test runner ด้วย arguments เดียวกับ package scripts. Browser/localhost และ Docker ต้องรันนอก sandbox จึงเข้าถึง process/pipe ได้

รายงานนี้ติดตามด้วย Git; `design/` และ `artifacts/` คงอยู่ใน gitignore ตามเดิม. ผู้ใช้สั่ง commit/push และเปลี่ยน #48 เป็น completed/closed หลัง tests ผ่านครบ. การปิดครั้งนี้อ้างอิง implementation และ isolated verification ไม่ใช่การอนุญาต live rollout; ตรวจสถานะการปิดและ commit จาก [GitHub #48](https://github.com/wasant-prds/project-management-system/issues/48). Parent #46 และงาน #49–#53 ยังเป็นงานแยก
