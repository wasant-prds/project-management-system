# Issue #27 — Premium Modern Neumorphism Frontend

Follow-up ระบบสี iOS-inspired และ review fixes (2026-10-03): Light/Dark semantic tokens, themed Dashboard/Board dropdowns, MUI Calendar year/month selectors ที่ตรงกับ installed classes, retryable Company/Projects collection errors, themed PMS Project option popup และ Board detail modal ที่ใช้ shell width เดียวกับ Work Items. `pnpm quality` ล่าสุดผ่าน **341 tests: 332 PASS / 0 FAIL / 9 SKIP**; ESLint ไม่มี warnings/errors, typecheck/Prisma validation ผ่าน. Linux Docker production build หลัง UI follow-up ผ่าน; SonarQube ไม่ได้รันเพราะไม่มี scanner/server configuration. เมื่อ 2026-10-04 ผู้ใช้ยกเว้น gate และปิด checklist #27; ไม่ได้อ้างว่าไม่มี SonarQube findings. รายละเอียดอยู่ใน [COLOR_SYSTEM.md](./COLOR_SYSTEM.md). ผลด้านล่างเป็นประวัติ redesign และ origin fix ก่อนเปลี่ยน palette.

วันที่ตรวจ: 2026-10-03 (Asia/Bangkok)

## ผล implementation

ปรับทั้ง Application Shell และหน้าหลัก Dashboard, Projects, Project detail, Work Items, Board, Analysis, Daily Work, Company และ Settings ให้ใช้ visual system เดียวกัน: พื้น slate ใน light, navy ใน dark และ teal ใน special-dark; card แบบยกนูน, filter/input แบบ inset, floating Sidebar และ modal depth. ใช้ typography, spacing, radius และ motion tokens กลางใน `app/globals.css` และ shared UI primitives เดิม. แยกสีข้อความ link/danger ออกจากสีพื้นปุ่ม เพื่อให้ธีมมืดอ่านได้โดยไม่เปลี่ยนสี destructive button.

Sidebar ใช้ route registry ร่วมกับ Breadcrumb, แสดง active route รวม Project detail และปิด mobile drawer เมื่อเลือกหน้า. Header อ่านโปรไฟล์จริงจาก Owner Settings. Project/Company cards แสดง summary จาก API, Decimal hours เดิม, Company relation, progress และลิงก์ต้นทาง. ฟอร์มสร้างใช้ native disclosure และเปิดอัตโนมัติเมื่อแก้ไข. Calendar ใช้ theme tokens โดยตรงและส่ง Date/null ผ่าน callback เดิม. กราฟ Analysis มี stable key และชื่อ accessible ของลิงก์ช่วงเวลา.

ไม่เปลี่ยน API, schema/migration, backend services, owner authentication/authorization หรือ business rules. `/tasks` และ `/issues` ยังคง redirect ตาม routing เดิม. วันที่และช่วงเวลายึด Asia/Bangkok; งานนี้ไม่เปลี่ยน persisted timestamps หรือแปลง Bangkok local wall-clock เป็น UTC.

## Unit Test Suite

**Scope:** Unit Test ของ #27 และ affected component regression  
**Real PostgreSQL:** No  
**Real Redis:** No  
**External Services:** No

ใช้ production TSX ที่ compile ด้วย TypeScript และ render ด้วย React/ReactDOM จริง. Mock เฉพาะ Next navigation/link, Owner Settings boundary, sidebar context และ MUI picker boundary ในเคส callback. Company/Projects regression ใช้ mocked API/React state แต่ render presentation components ที่แยกออกมาจริง. Runner unit tests mock child-process boundary. ไม่เชื่อมฐานข้อมูลหรือ network ใน unit tests ใหม่.

## Coverage by Case

| Case | Category | Expected Behavior | Result |
|---|---|---|---|
| TC-27-01 | Happy Path / Edge | active route ถูกต้องทั้งหน้าหลักและ nested detail; ไม่จับ prefix ที่ไม่ใช่ route | PASS |
| TC-27-02 | Accessibility / Routing | มี 8 destinations จริงและ aria-current เดียวบน Project detail | PASS |
| TC-27-03 | Responsive Workflow | เลือกเมนูแล้วปิด mobile drawer | PASS |
| TC-27-04 | Data / Routing | Header อ่าน owner ที่บันทึกไว้และ Breadcrumb/profile actions ใช้ route จริง | PASS |
| TC-27-05 | Error / Edge | settings โหลดไม่ได้แสดงข้อความปลอดภัย ไม่สร้างตัวตนปลอม | PASS |
| TC-27-06 | Loading / Accessibility | ประกาศ status/busy และ spinner เคารพ reduced motion | PASS |
| TC-27-07 | Empty State | ข้อความและ action สำหรับขั้นตอนถัดไปยังทำงาน | PASS |
| TC-27-08 | Error Handling | error เป็น alert และไม่แทนข้อมูลที่โหลดล้มเหลวด้วยยอดศูนย์ | PASS |
| TC-27-09 | Data / Business Rules | Portfolio คง Company, Bangkok calendar date, progress aria และ Decimal hours แบบ exact | PASS |
| TC-27-10 | Edge / Workflow | Company ว่างอ่านได้และ callback แก้ไขส่ง Project ID เดิม | PASS |
| TC-27-11 | Data / Visibility | Company แสดงยอดจริงและ filtered Project drill-through | PASS |
| TC-27-12 | Business Rules | ไม่แสดงลบ default Company หรือ Company ที่มี Projects | PASS |
| TC-27-13 | Business Rules / Workflow | Company ว่างที่ไม่ใช่ default ส่ง record เดิมไป edit/delete | PASS |
| TC-27-14 | Validation / Accessibility | label, invalid, describedby, disabled และ busy semantics ไม่หาย | PASS |
| TC-27-15 | Accessibility / Data | Table เป็น semantic table; sort/selected และ local scrolling คงอยู่ | PASS |
| TC-27-16 | Date / Edge | Calendar ใช้วันเลือกจริง; callback ส่ง Date/null เดิม | PASS |
| TC-27-17 | Accessibility | text/link/semantic colors บนทุก surface และ solid buttons ผ่าน WCAG AA 4.5:1 ทั้งสามธีม | PASS |
| TC-27-18 | Responsive / Motion | Tailwind สร้าง pressed/inset, tablet breakpoint, coarse-pointer target และ reduced-motion rules จริง | PASS |
| TC-27-19 | Test Runner | ลงทะเบียนคำสั่ง pnpm และ shared suite runner ที่ใช้ซ้ำได้ | PASS |
| TC-27-20 | Error Regression / Routing | chart dot มี stable keys, accessible names, source URLs และ missing-payload fallback | PASS |
| Runner-01 | Happy Path / Isolation | ส่ง path ที่มีช่องว่างเป็น literal arguments, concurrency=1 และ reporter ที่เลือก | PASS |
| Runner-02 | Error / Exit Status | คง failure exit code และถือ process ที่ถูก terminate ว่าล้มเหลว | PASS |
| Runner-03 | Error Handling | spawn error ถูกส่งต่อ ไม่รายงานว่าทดสอบที่ยังไม่รันผ่านแล้ว | PASS |

Unit tests สำหรับ redesign **23 PASS, 0 FAIL, 0 SKIP**. Focused redesign suite มี 20 เคส; 3 runner cases อยู่ใน `pnpm test:runner`. Follow-up origin diagnostics มีเคสเพิ่มเติมแยกด้านล่าง.

Self-review: ไม่มีการลด assertion เพื่อให้ PASS. เพิ่ม negative/empty/error cases, Decimal และ date boundary ที่เกี่ยวข้อง, Company delete guard และ unique-key regression. อัปเดต Company/Project harness ให้ตรวจ extracted components จริง รวม disclosure ที่ปิดเริ่มต้นและเปิดตอนแก้ไข. Analysis contract test ตรวจ factory และลิงก์จริงที่แยกออกมา. Runner แยกแต่ละ test file เป็น process และรันทีละไฟล์ เพื่อไม่ให้ compilation ของ UI ขวาง timeout ของ suite อื่น; GitLab timeout assertion เดิมไม่ถูกเปลี่ยน.

## ผล verification

| Command / Check | Result |
|---|---|
| `pnpm test:frontend-redesign` | 20 PASS, 0 FAIL, 0 SKIP |
| `pnpm test:frontend-ui` | 34 PASS, 0 FAIL, 0 SKIP รวม suite #26 เดิม |
| `pnpm test:company-projects` | 27 PASS, 0 FAIL, 0 SKIP |
| `pnpm test:runner` | 6 PASS, 0 FAIL, 0 SKIP |
| `node --test-reporter=tap tests/run.mjs` | 316 tests: 307 PASS, 0 FAIL, 9 SKIP |
| `pnpm test` | 316 tests: 307 PASS, 0 FAIL, 9 SKIP |
| `pnpm lint` | ไม่มี ESLint warnings/errors |
| `pnpm typecheck` | PASS |
| `pnpm exec prisma validate` | schema valid; มี deprecation เดิมของ `package.json#prisma` |
| `git diff --check` | PASS |
| `docker build --target production -t pms-issue27-validation .` | PASS: compile, lint/typecheck, prerender 16/16 และ standalone production image |
| Browser fixture preview | 81 page/theme/viewport checks ไม่มี document horizontal overflow หรือ page error alert |
| SonarQube | ยังไม่ได้รัน: ไม่มี scanner/server/token configuration ที่เข้าถึงได้ |

Full regression มี contract/API boundary tests, subprocess และ synthetic localhost HTTP tests เดิม จึงไม่เหมารวมทั้งหมดว่าเป็น unit tests ใหม่. รายงานรายเคสทุกเคสและ 9 SKIP อยู่ใน [issue-27-test-cases.txt](./issue-27-test-cases.txt). ชื่อ dynamic subcases `zero`, `negative`, `malformed` ที่ formatter จัดไว้ใน `unmapped.test.mjs` มาจาก `tests/daily-work/management.test.mjs` เคส PATCH rejects non-positive or malformed hours.

9 SKIP เป็น opt-in integration checks เดิม: PostgreSQL backup/restore; production container security smoke; scheduled backup; effective Compose; migrations seed gate; migrations schema approval gate; PostgreSQL timezone/defaults; WorkItem DATE/Restrict FK; installation seed. ไม่ถูกนับว่า PASS. ไม่เปิด integration suites ที่เขียน schema/database จริงเพื่อทดสอบการเปลี่ยน UI นี้.

Windows local `pnpm build` compile/prerender ผ่าน แต่ standalone tracing สร้าง symlink ไม่ได้ (`EPERM`). ยืนยัน production build ด้วย Linux Docker แทน โดยไม่เปลี่ยน Next config หรือ OS permissions. Image digest: `sha256:c26822e4f6e8652bcae9ca69893fe56309281639b3c1c63db8a2bfb1bf919ce7`. ไม่ได้ deploy image นี้.

## Acceptance Criteria และขอบเขต verification

| AC | หลักฐาน | ขอบเขต |
|---|---|---|
| 1, 2, 3, 10: cohesive redesign, shell และทุก major screen | shared tokens/primitives, browser visual pass ทุกหน้าและ 3 themes | ความสวยงามต้องใช้ visual review; unit test ไม่ตัดสิน premium quality |
| 4: component states | TC-27-06–08, 14–18 และ shared #26 state tests | ตรวจ semantics/CSS ที่ emit จริง; interaction visual ตรวจผ่าน browser |
| 5: responsive | 390×844, 768×1024, 1280×900 บน 9 หน้ารวม Project detail × 3 themes | 81 fixture checks; Board ใช้ overflow ภายใน column area |
| 6: accessibility/readability | TC-27-02, 06–09, 14–18, 20; keyboard Tab ภายใน Work Item dialog และ Escape ปิดได้ | contrast ตรวจ token pairs 4.5:1; ยังไม่ใช่ screen-reader certification หรือ pixel audit ของทุก state |
| 7: workflow/API/permission เดิม | full regression 307 PASS; Company/Project CRUD และ safe error regressions; backend ไม่เปลี่ยน | owner/security ใช้ suites เดิม; ไม่สร้าง authorization cases ซ้ำสำหรับ presentation-only change |
| 8: imports/browser errors | lint/typecheck/build; console check หลังแก้ Recharts key warning; mobile drawer navigation | preview mock API, ไม่ใช่ production E2E |
| 9: checks/build | ผลคำสั่งด้านบน | SonarQube quality gate ยังตรวจไม่ได้ |

Browser preview ใช้ production UI กับข้อมูล synthetic ผ่าน `node scripts/frontend-preview.mjs`, bind เฉพาะ `127.0.0.1:3791`, ไม่อ่าน `.env`, ไม่ใช้ DB/auth จริงและปฏิเสธ API writes. ตรวจ mobile drawer, active navigation, เปิดฟอร์ม edit, dialog dimensions/scrolling และ keyboard navigation เพิ่มเติม. ไม่ถือ preview นี้เป็น E2E ของ production API, hydration หรือ authentication; การยืนยัน DB persistence, real GitLab, auth proxy และ deployment เป็น integration/E2E แยกต่างหาก.

เดิมกำหนดให้มีผล SonarQube/quality gate จาก server หรือ CI ก่อนปิด checklist #27; เมื่อ 2026-10-04 ผู้ใช้ยกเว้นเงื่อนไขนี้และสั่งปิด checklist. Workflow `.github/workflows/quality.yml` ต้องใช้ `SONAR_HOST_URL` และ `SONAR_TOKEN`; ไม่ควรส่ง token ในแชท. ไม่มีการอ้างว่า Sonar ไม่มี warnings/errors ขณะที่ยังไม่ได้ scan.

## Follow-up: บันทึก theme ถูกปฏิเสธ (2026-10-03)

ภาพ error `บันทึก theme ไม่สำเร็จ / ไม่สามารถเข้าถึงระบบได้` เกิดจาก runtime configuration: `pms-app-dev` publish `127.0.0.1:3777 → 3000` แต่ `APP_ORIGIN` ของ container เป็น `http://localhost:3002`. Reproduce ด้วย authenticated PATCH จาก origin `http://localhost:3777` ได้ **403 ACCESS_DENIED** ก่อนถึง Settings API.

Request จาก browser ที่ผู้ใช้ส่งมายืนยันว่าใช้ `http://127.0.0.1:3777/api/settings/me` และได้ 403. จึงตั้ง root `.env` ที่ Git ignore ให้ `APP_ENV=dev`, `APP_PORT=3777`, `APP_ORIGIN='http://127.0.0.1:3777'` ตรงกับ browser จริง และ recreate เฉพาะ app ด้วย `docker compose --env-file .env -f docker-compose.yml up -d --no-deps --no-build --force-recreate app`. ไม่ restart PostgreSQL, ไม่รัน migration, ไม่เปิด origin bypass และไม่เปลี่ยน credentials. Root `.env` ไม่รวมใน source changes.

ตรวจผ่าน owner gate ของระบบจริงด้วย origin `http://127.0.0.1:3777` หลังแก้: **GET 200 → PATCH 200 → GET reload 200** และ theme ตรงกับค่าก่อนตรวจ. PATCH ส่งเฉพาะ theme เดิมเพื่อไม่สลับธีมของผู้ใช้. การตรวจนี้เป็น runtime/API verification ที่ใช้ database จริง แยกจาก unit tests และยังไม่แทนผลจาก browser ของผู้ใช้. ให้เปิดเว็บด้วย `http://127.0.0.1:3777`; `localhost` เป็นคนละ origin และยังถูกปฏิเสธตาม policy เดิม.

เพิ่ม safe audit diagnostics สำหรับ origin rejection: event มี HTTP status และเฉพาะ scheme/host/port ที่ normalize แล้ว; missing/opaque/invalid origin ใช้ marker. ไม่ log Authorization, username/password, path/query หรือ request body. ไม่เปลี่ยน authorization checks. Operator จึงแยกได้ว่าเป็น credentials (401) หรือ origin (403) โดยไม่ต้องเดา config.

| Case | Category | Expected Behavior | Result |
|---|---|---|---|
| Theme-Origin-01 | Security / Configuration | PATCH ถูกปฏิเสธเมื่อ port เดิม 3002 ไม่ตรง 3777; อนุญาตเมื่อ origin ตรงทุกส่วน; ปฏิเสธ missing/foreign origin | PASS |
| Theme-Origin-02 | Authentication | origin ตรงไม่ทำให้ missing/invalid owner credentials ผ่าน gate | PASS |
| Theme-Origin-03 | Error / Retry | ACCESS_DENIED ไม่เปลี่ยน persisted theme, ไม่ล็อกการ save ค้าง และ retry ที่ server ยืนยันแล้วเปลี่ยน shared state ได้ | PASS |
| Theme-Origin-04 | Diagnostics / Security | audit แยก missing/opaque/invalid/mismatched origin และ HTTP status โดยไม่เผย credentials/path/query; timestamp ยึด Bangkok | PASS |

4 unit cases ใหม่ใช้ direct authorization/audit functions และ mocked Settings API ไม่ใช้ network/DB. อยู่ใน `tests/runtime/owner-origin.test.mjs` และ `tests/settings/provider.test.mjs`. Affected commands: `pnpm test:settings` **22 PASS / 0 FAIL / 0 SKIP**, `pnpm test:runtime-security` **13 PASS / 0 FAIL / 0 SKIP**. Runtime security suite เดิมมี synthetic localhost HTTP/subprocess checks จึงไม่เหมารวมว่าเป็น unit tests ที่ไม่มี network ทั้งหมด. ผล full regression 316 tests ด้านบนเป็นผลของ redesign ก่อนเพิ่ม follow-up 4 เคสนี้.

Verification หลัง follow-up: **`pnpm quality` PASS** (lint ไม่มี ESLint warnings/errors, typecheck, Prisma schema valid และ **320 tests: 311 PASS / 0 FAIL / 9 SKIP**). Prisma CLI ยังแจ้ง deprecation เดิมของ `package.json#prisma`. ผู้ใช้รีเฟรช browser และยืนยันว่า **บันทึกธีมได้แล้ว**. ผลรายเคสล่าสุดอยู่ใน [issue-27-test-cases.txt](./issue-27-test-cases.txt); รวม follow-up 4 เคสด้วย. ณ เวลาบันทึกยังต้องตรวจ SonarQube ผ่าน server/CI; ผู้ใช้ยกเว้น gate และสั่งปิด checklist #27 ในวันที่ 2026-10-04.

**UNIT TESTS COMPLETE**
