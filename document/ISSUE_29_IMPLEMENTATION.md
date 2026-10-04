# Issue #29 — Implementation and final visual audit

วันที่ 2026-10-04 (Asia/Bangkok). ทำเฉพาะ Final Visual Audit & Pixel-Perfect Frontend Polish ตาม local work item #29, checklist, `.cursor/rules` และสอง implementation prompts ที่ผู้ใช้ระบุ.

ดำเนินการ Audit → Fix → Review → Final Polish. แก้ KPI baseline, GitLab panel heading, long-content overflow, form font breakpoint, modal close/title/focus, Analysis table consistency และ less-visible states. คง visual direction, colors, shadows และ motion ของ #27/#28; ไม่มี product feature, API/schema/auth/permission/business-data changes หรือ deployment.

Review follow-up แก้ Daily Work tablet regression และ Prisma CLI deprecation แล้ว. Checklist #29 ยัง pending เพราะยังไม่มี SonarQube gate result. คงจำนวน 18 เสร็จ / 1 pending / 19 รวม; ไม่ใช้ waiver ของ issue อื่น.

## Review follow-up — 2026-10-04

1. **Daily Work identity collapse — fixed:** identity ใช้ preferred basis 16rem ตั้งแต่ tablet แทน 0; badges wrap ลงอีกแถวเมื่อพื้นที่ไม่พอ. Browser fixture ที่ 768×1024 เปลี่ยนจาก title 0px × 4,464px เป็น 617px × 72px; header 150px. คงชื่อ, exact hours และ workflow เดิม. เพิ่ม opt-in `layoutCheck=1` ใน isolated preview เพื่อวัด production DOM จริง พร้อม TC-29-24/25 ที่พิสูจน์ว่า geometry verdict ปฏิเสธค่าที่เสียและยังตรวจ exact hours/local overflow. Browser review ล่าสุด: normal/edge × Light/Dark/Special Dark × 320/390/639/640/768/1024/1536px = **42/42 PASS**, console ไม่มี warning/error. ดู [browser regression evidence](./issue-29-browser-regression.json).
2. **Quality verification — partially resolved:** ย้าย legacy `package.json#prisma` ไป `prisma.config.ts` โดยคง `prisma/schema.prisma`, `tsx prisma/seed.ts`, root `.env` และ shell/container precedence. Docker migrate/development copy config ก่อน generate. ไม่เปลี่ยน schema/seed logic และไม่รัน migration/seed จริง. TC-29-26–28 ตรวจ CLI metadata, image wiring, missing/read-failure env และ native env precedence. Prisma deprecation หาย; SonarQube ยังไม่มี scanner/host/token หรือผล gate สำหรับ diff นี้ จึงยังไม่ปิด finding ด้าน gate.

## Verification

- `pnpm test:frontend-polish`: **28 PASS / 0 FAIL / 0 SKIP**.
- `pnpm test:company-projects`: **29 PASS / 0 FAIL / 0 SKIP** หลังเติม Skeleton boundary mock.
- `pnpm quality`: **404 total / 395 PASS / 0 FAIL / 9 SKIP**. ESLint ไม่มี warning/error, TypeScript ผ่าน และ Prisma schema valid; ไม่มี Prisma deprecation warning.
- Production หลัง review fixes: `docker build --target production --tag pms-issue-29:local .` exit 0; compile, lint/typecheck, static generation, trace และ image assembly ผ่าน. Manifest list `sha256:2784bd286790e0a51d875b1bc1d47ad4d3d5603e651114c46e5b8b8c9b25f395`.
- Tooling: `docker build --target migrate --tag pms-issue29-tooling:local .` และ `docker run --rm --network none --entrypoint pnpm pms-issue29-tooling:local exec prisma validate` exit 0. CLI config ถูก copy/generate/validate จริง ไม่มี deprecation; ไม่เชื่อม DB ไม่ seed/migrate. [Tooling output](./issue-29-tooling-results.txt).
- Tooling probes เพิ่มเติม: generate เมื่อ unset `DATABASE_URL`/ไม่มี `.env` ผ่าน; seed command forwarding ไป `tsx prisma/seed.ts` ผ่านโดยแทน tsx ด้วย stub ใน ephemeral container/network none (ไม่รัน seed implementation/DB). Probe รอบแรกติด PowerShell stdin CRLF (`seed\r`); rerun หลัง normalize LF exit 0. Raw output เก็บทั้งสองรอบเพื่อไม่ซ่อน failure ของ test harness.
- Final browser matrix **108/108**: ทั้ง 8 เมนูและ Project detail × Light/Dark/Special Dark × large desktop/laptop/tablet/mobile. ทุกหน้ามี heading; ไม่มี document horizontal overflow, unexpected alert หรือ loading skeleton ค้าง.
- Fallback matrix **24/24**: error/404 components × 3 themes × 4 sizes; recovery controls อยู่ใน viewport และไม่มี overflow.
- Supplemental browser: 18 empty/error/slow combinations ใน 6 client routes; slow เริ่ม busy แล้วเปลี่ยนเป็น content, error มี feedback, empty ไม่มี fabricated records. ตรวจซ้ำ Work Items failed reads หลังแก้: 4 unavailable KPI และ tabs `—`.
- Long-content/exact Decimal checks ทุก major route; ปรับ Project heading, Work Item preview และ Daily Work hours/details/remarks ที่พบ overflow. ตรวจ Analysis Daily Work table และ top alignment หลังย้ายเข้า shared Table.
- Keyboard: เปิด Work Item modal ด้วย Enter, autofocus ไป Title, Escape ปิดแล้วคืน focus ไปปุ่มเปิดหลัง exit จบ; mobile sidebar Escape คืน focus ไป trigger. Form/overlay bounds และ visible focus ตรวจใน browser.
- Normal browser review ไม่พบ console warning/error ใหม่. Logs จาก injected `qa=error` เป็น simulated failures ที่ตั้งใจและไม่นับเป็นผล normal routes.

## Audit ครบ 24 หมวดของ prompt

1. Full application: ตรวจ 8 เมนู, Project detail, shared shell/controls, loading และ fallback; native Basic authentication challenge คงเดิมเพราะไม่มี custom auth screen.
2. Pixel consistency: KPI label/value baseline, modal title/close spacing, Analysis row/cell alignment และ long identifiers.
3. Typography: ลด GitLab section heading จาก inherited oversized h2 เป็น text-base; title leading/wrapping และ Input/Textarea ใช้ breakpoint เดียวกัน.
4. Rhythm: คง PAGE_INNER/TOOLBAR/STAT_GRID; ใช้ shared feedback/table density แทน one-off wrappers.
5. Alignment: KPI values, modal close, right-aligned tabular hours และ top-aligned source tables; numeric text ไม่ถูกแปลง/ปัด.
6. Hierarchy: page title แยกจาก panel heading; secondary GitLab panel ไม่แข่งกับชื่อหน้า.
7. Components: shared SummaryStatCard, CardTitle, Dialog, Table, PageState และ ApplicationState; แยก reusable report tables.
8. Neumorphism: คง base/raised/inset/pressed/floating tokens เดิม; ไม่เพิ่ม nested shadows เพื่อกลบ layout.
9. Light: ตรวจทุก major route ที่ 4 sizes; readability/surface/control states ใช้ palette เดิมและ contrast regressions ใน full suite.
10. Dark: ตรวจ Dark และ Special Dark แยกครบทุก route/size; modal/feedback ใช้ semantic theme colors.
11. Motion: คง shared timings/reduced-motion; modal focus คืนหลัง close lifecycle โดยไม่ใส่ delay/animation ใหม่.
12. States: default/hover/focus/pressed/selected/disabled/loading/error/success ใช้ primitives เดิม; KPI แยก pending/failure/real-zero.
13. Data-dense UI: Analysis ใช้ shared table container; column widths 100%, local scrolling/wrapping, source links และ exact hours คงเดิม.
14. Forms: Input/Textarea typography, title/helper wrapping, close target และ existing invalid/disabled callbacks.
15. Responsive: 1536×960, 1024×768, 768×1024, 390×844; Board เลื่อนภายใน columns ตามเดิม.
16. Edge states: synthetic unbroken identifiers, names/contact/description/remarks, exact Decimal, missing relations, empty/search/error/loading และ 404/retry.
17. Generic UI: แทน one-off Work Items/Daily Work/Analysis feedback และ default route fallbacks ด้วย system components.
18. Noise: ตัด duplicated table wrapper styles; ไม่เพิ่ม gradients/decorative containers/motion.
19. Tokens: เพิ่ม utility `content-wrap` ที่ใช้ซ้ำกับ long content; คง spacing/radius/palette/motion variables เดิม.
20. Regression: final normal/fallback matrices และ full unit regressions ผ่าน; ปรับ tests เดิมที่อ่าน source location ให้ตรวจ extracted components ด้วย.
21. Competition review: ตรวจ screenshots และ weakest details ของ headings/KPI/forms/data states; แก้ issues ที่พบรวม keyboard focus loss. คุณภาพ visual เป็น design judgment ไม่ใช่ automated certification.
22. Functionality: API/schema/auth/routing destinations/date/Decimal/business logic คงเดิม; fallback files เพิ่ม presentation ของ Next boundary เท่านั้น.
23. Strategy: audit shared tokens/primitives → targeted page fixes → behavioral/unit checks → browser states → final build/quality → docs.
24. Verification: lint/typecheck/tests/build, themes/viewports, keyboard/focus, console และ final diff review ตามหลักฐานด้านบน.

## Unit Test Suite

**Scope:** Unit Test  
**Real PostgreSQL:** No  
**Real Redis:** No  
**External Services:** No

ใช้ production TSX ผ่าน existing component loader และ React server render; mock เฉพาะ Next link, hook/DOM/autofocus boundaries และ Radix portal สำหรับ tests ที่ไม่ใช้ browser. CSS compiler ทำงานใน process. Report fixtures เป็น synthetic data และไม่เชื่อม repository/database/network. Preview/browser checks และ production image build เป็นการ verification แยกจาก unit suite.

ทุก executed case แสดงชื่อและผลใน [tree report](./issue-29-test-cases.txt). Tests: 28; PASS: 28; FAIL: 0; SKIP: 0.

## Coverage by case

| Case | Category | Expected behavior | Result |
|---|---|---|---|
| TC-29-01 | Alignment | Short/wrapped KPI labels share reserved value baseline | PASS |
| TC-29-02 | Edge / workflow | Long Company contact remains complete; edit keeps identity | PASS |
| TC-29-03 | Serialization / edge | Daily Work summary preserves large exact Decimal | PASS |
| TC-29-04 | Validation / controls | Input/Textarea retain invalid/disabled/label/change behavior | PASS |
| TC-29-05 | Typography / edge | Long modal title has close space and multi-line leading | PASS |
| TC-29-06 | Accessibility | Close control has Thai label and remains optional | PASS |
| TC-29-07 | Error / security | Route reset runs once; private diagnostics stay hidden | PASS |
| TC-29-08 | Not found | Themed dashboard recovery, no fake retry/data fetch | PASS |
| TC-29-09 | Empty / error | Unbroken feedback titles/messages remain complete | PASS |
| TC-29-10 | Source / timezone | Work Item source identity/filters/Bangkok date remain intact | PASS |
| TC-29-11 | Serialization / table | Exact hours wrap and source date filters remain intact | PASS |
| TC-29-12 | Null edge | Missing optional relation/description uses safe fallback | PASS |
| TC-29-13 | Source / period | Period hours/link retain inclusive interval and Decimal | PASS |
| TC-29-14 | Empty | Empty sources show guidance without fabricated rows | PASS |
| TC-29-15 | Compiled CSS | Anywhere wrapping and 44px coarse-pointer close target exist | PASS |
| TC-29-16 | Isolation / safety | Edge/empty fixtures do not mutate baseline; writes rejected | PASS |
| TC-29-17 | Test tooling | Focused suite uses existing pnpm/shared runner | PASS |
| TC-29-18 | Edge / workflow | Daily Work long details/remarks/hours keep selected identity | PASS |
| TC-29-19 | Responsive contract | Long Project heading uses shared wrapping | PASS |
| TC-29-20 | Loading / failure | Loading/failure hide stale count; successful empty keeps zero | PASS |
| TC-29-21 | Empty / search | Distinct Thai guidance keeps add callback | PASS |
| TC-29-22 | Keyboard | Controlled dialog returns focus without scrolling | PASS |
| TC-29-23 | Lifecycle / edge | Consumer prevention, detached opener and body fallback respected | PASS |
| TC-29-24 | Responsive regression | Geometry verdict rejects zero-width/tall Project identity; header reserves space | PASS |
| TC-29-25 | Browser verdict | Pending cards, local overflow and altered exact hours cannot claim PASS | PASS |
| TC-29-26 | CLI compatibility | Schema/seed metadata and tooling image config preserved; legacy config removed | PASS |
| TC-29-27 | Error handling | Missing root env accepted; real env read failures propagated | PASS |
| TC-29-28 | Environment precedence | Native env loading preserves shell values and reads file-only values | PASS |

## Requirement / acceptance assessment

Requirements 1–9 และ Acceptance 1–7/9/11 มี unit support จาก typography/components/state/wrapping/table/focus cases และ existing color/motion suites; visual consistency/Neumorphism/readability/showcase quality ต้องอาศัย browser/screenshot review จึงไม่อ้างว่า unit tests พิสูจน์ pixel-perfect ได้.

Acceptance 8 (workflow preserved) ตรวจ source identity/callback/filters/Decimal/date ใน TC-29-02/04/10–13/18/21–23 และ full auth/Company/Project/WorkItem/Board/Daily Work/Dashboard/Analysis/Settings regressions. Acceptance 10 ใช้ executed lint/typecheck/unit/build. Permission/ownership/DB transactions ไม่เปลี่ยนใน #29; ใช้ regression mocks เดิมแทนการสร้าง duplicate auth/DB tests.

Self-review ตรวจ positive/negative/missing-data/pending/failure/custom-focus/detached-opener cases, exact text/Decimal preservation, source link metadata, fixture isolation และ assertions ที่ย้าย component. ไม่ลด assertion เพื่อให้ผ่าน. Test suite ไม่พึ่ง execution order หรือ real infrastructure.

## Files and reusable commands

Application changes อยู่ใน shared layout/UI, Work Items/Daily Work/Company/Project presentation, Analysis report tables และ Next error/not-found boundaries. เพิ่ม `tests/frontend-ui/polish.test.mjs`; อัปเดต regression wiring ที่ได้รับผลจาก component extraction/imports. เพิ่ม `test:frontend-polish` ใน package scripts และ suite selection ใน `tests/run.mjs`; ใช้ formatter/Bash runner เดิม ไม่มี test dependency ใหม่หรือ duplicate runner.

คำสั่งและ preview workflow ทั้งหมดอยู่ใน [frontend handbook](./handbook/frontend/issue-29-polish.md). หลักฐาน: [unit cases](./issue-29-test-cases.txt), [full quality](./issue-29-quality-results.txt), [production build](./issue-29-build-results.txt), [tooling build/validate](./issue-29-tooling-results.txt) และ [browser regression](./issue-29-browser-regression.json).

## Remaining limits

- Prisma baseline deprecation ถูกแก้ใน review follow-up โดยย้าย CLI configuration เท่านั้น; schema/seed implementation/data ไม่เปลี่ยน. Local quality ไม่มี warnings/errors แต่ยังไม่อ้างผล SonarQube.
- SonarQube ไม่ได้รัน: scanner/server configuration ไม่พร้อม. ไม่อ้างว่า scan ผ่านหรือใช้ waiver ของ #27/#28 กับ #29.
- 9 skipped tests เป็น opt-in infrastructure integration tests นอก unit boundary. ไม่มี real database/authenticated deployment E2E, physical touch device, OS reduced-motion emulation หรือ screen-reader certification.
- Preview error/404 routes render real components แต่ไม่ใช่ test ของ HTTP status/Next routing integration. ไม่มี exhaustive screenshot pixel-diff baseline ทุก record/viewport.
- ไม่มี deployment, schema rollout หรือ production data write; visual work ผ่าน gates ของ #29 ที่ตรวจได้ตามหลักฐานนี้.

**UNIT TESTS COMPLETE**
