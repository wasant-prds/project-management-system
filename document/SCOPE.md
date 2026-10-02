# SCOPE

> **Owner decision 2026-09-29:** ขอบเขตที่ใช้ต่อจากนี้ไม่มี Customer; ใช้ Company Dhas → Projects ตาม [Company → Project decision](./COMPANY_PROJECT_DECISION.md). ข้อความ Customer ที่เหลือเป็นประวัติข้อเสนอเดิม.

| รายการ | ค่า |
| --- | --- |
| ระบบ | Project Management System |
| เอกสาร | Scope ฉบับรวมและแบ่งตาม Menu |
| ภาษา | ภาษาไทยเป็นหลัก; system terms ใช้ภาษาอังกฤษเมื่อเป็นคำที่ใช้ทั่วไป |
| สถานะ | กรอบเป้าหมายสำหรับวางแผนงานพัฒนา; Step 1 ปัจจุบันส่งมอบเอกสารเท่านั้น |
| เอกสารเชื่อมโยง | [Shared Data Model](./SHARED_DATA_MODEL.md) · [Customer/Project Migration Contract](./CUSTOMER_PROJECT_MIGRATION.md) · [GitLab Issue Import Contract](./GITLAB_ISSUE_IMPORT.md) · [BUSINESS_REQUIREMENT.md](./BUSINESS_REQUIREMENT.md) · [ENGINEERING_SPEC.md](./ENGINEERING_SPEC.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) |

## 1. วัตถุประสงค์และขอบเขตของ Step 1

Step 1 จัดทำ baseline และข้อกำหนดครบชุดก่อนเริ่มแก้ระบบ: Engineering Spec, Architecture, Business Requirement, Scope, Database, Database Mapping, API และ Deployment

**สิ่งที่ทำใน Step 1:** ตรวจ repository และ schema ปัจจุบัน, บันทึก As-Is/Gap, นิยาม target data flow, แยก requirement ตาม menu, ทำ inventory API/database/runtime, เสนอ dependencies และ acceptance criteria

**สิ่งที่ยังไม่ทำใน Step 1:** เปลี่ยน UI, เพิ่ม Customer model/migration, สร้าง endpoint ใหม่, เพิ่ม authentication, เปลี่ยน Docker/deployment behavior หรือย้ายข้อมูลจริง

**ความคืบหน้าหลัง Step 1 — #17:** มี owner gate กับ Next.js middleware และ server-side owner resolver แล้ว. ใช้ HTTP Basic สำหรับ owner identity เดียว; หากมี legacy User rows หลายแถวให้เลือก owner ที่ผ่าน audit ด้วย `OWNER_USER_ID`, มิฉะนั้นต้องมี `User` หนึ่งแถว. ไม่เพิ่ม multi-user authorization, RBAC, session table หรือการย้ายข้อมูล. ข้อความ Step 1 ข้างต้นเป็น baseline ของงานเอกสารเดิม.

## 2. Product scope เป้าหมาย

ขอบเขตผลิตภัณฑ์ครอบคลุม 8 เมนูที่ผู้ใช้ระบุและการเชื่อมข้อมูลระหว่างกัน:

| กลุ่ม/เมนู | In scope เป้าหมาย | ระบบปัจจุบันที่พบ / งานที่ต้องเติม |
| --- | --- | --- |
| Overview — Dashboard `/` | KPI, งานที่ต้องติดตาม, Project ล่าสุด, filter และ deep link จาก records จริง | ปัจจุบันเป็น sample data; เพิ่ม DB-backed queries |
| Overview — Projects `/projects` | Project CRUD/detail, required Company relation, Work Item/role/hour summaries | #18 เพิ่ม Company relation, hours, consistent progress และ business rules |
| Overview — Work Items `/work-items` | WorkItem list/create/edit/delete/filter/import/export; manual one-way GitLab Issue sync; owner is sole assignee; Developer/Infra/SA are functional roles | #19 Work Item CRUD/validation; #20 owner-only GitLab mapping/manual sync implementation; real instance setup and schema rollout remain environment steps |
| Management — Board `/board` | Kanban ของ WorkItem จริง; persist status change | ปัจจุบันเป็น client sample state; เชื่อม WorkItem API และ status enum |
| Management — Analysis `/analysis` | KPI/charts/tables จาก WorkItem และ TimeEntry จริง | ปัจจุบันเป็น sample arrays; เพิ่ม shared queries, metric definitions, export |
| Management — Daily Work `/daily-work` | CRUD TimeEntry, period views, WorkItem/Project relation, hours | มี API/หน้าใช้งาน; เสริม auth, validation, date/time consistency |
| Management — Company `/company` | จัดการหลาย Companies และ Project portfolio | #18 เพิ่ม Company API/UI; ไม่มีสมาชิกหลายคนหรือ Customer registry |
| Settings `/settings` | Profile/preferences/security ของ owner account เดียวที่ persist | ปัจจุบันเป็น form UI; เพิ่ม persistence และ owner access control |

## 3. Data scope และระบบที่เชื่อมกัน

ข้อกำหนดข้อมูลร่วมฉบับบรรทัดฐานอยู่ใน [Shared Data Model](./SHARED_DATA_MODEL.md)

### 3.1 Core business data

- `WorkItem`: แหล่งจริงสำหรับงาน สถานะ ประเภท priority, functional role, owner/assignee, Project และวันทำงาน
- `WorkItem.role`: ระบุว่าเจ้าของกำลังทำงานในบทบาท Developer, Infra หรือ SA; ไม่ใช่ user account/permission
- `TimeEntry`: แหล่งจริงสำหรับ Daily Work/ชั่วโมงจริง ผูกกับ WorkItem และเจ้าของระบบ
- `Project`: ทุกแถวผูก Company หนึ่งรายผ่าน `Project.companyId`; รายการเดิม 25 Projects ผูกกับ Dhas แล้ว
- `Company`: รองรับหลายราย; Dhas เป็น Company ของ Projects เดิมและ Company เดิม `ProjectHub Inc.` ยังคงอยู่
- `User`: เก็บ identity ของเจ้าของระบบหนึ่งคน; `ProjectMember` เป็น legacy schema ไม่ได้แปลว่าผลิตภัณฑ์ต้องรองรับสมาชิกหลายคน
- `Customer`: ไม่มี model, API หรือ UI; Project เลือก Company โดยตรง
- Dashboard/Analysis: read-only derived views จาก core records

### 3.2 Invariants ที่อยู่ใน scope

- Board status = WorkItem status; ไม่มีสถานะซ้ำใน Board
- Daily Work ต้องเชื่อม WorkItem; Project ID ต้องสอดคล้องกับ Project ของ WorkItem
- Project Company ต้องใช้ relation เดียวกันใน Project list/detail, filters, Dashboard และ Analysis
- Summary counts/hours/progress ใช้สูตรชุดเดียวกันทุกหน้า
- ใช้ `Asia/Bangkok` เป็น default time zone ของทุก environment รวม application และ PostgreSQL session; ทุกวันที่/เวลาที่บันทึกลง DB ใช้ Bangkok calendar/wall-clock semantics ไม่แปลง timestamp เป็น UTC. Parse/format ค่าอย่างชัดเจนและไม่พึ่ง timezone ของ browser/device

## 4. รายละเอียด scope / non-scope แยกตาม Menu

### Dashboard

**In scope:** DB-backed KPIs, overdue/recent lists, selected period, Company/Project filters, links ไปยังรายการต้นทาง, loading/empty/error states; responsive card/chart layout ที่ไม่ทำให้หน้า overflow.

**Out of scope เว้นแต่มี requirement เพิ่ม:** notification center, portfolio forecasting, configurable dashboard builder, cross-company BI warehouse.

### Projects

**In scope:** Company picker/filter, Project CRUD/detail, work item counts, functional role breakdown, progress formula, logged hours, guard against accidental data loss. Project แต่ละรายการต้องมี Company หนึ่งราย; Company หนึ่งรายเชื่อม Projects ได้หลายรายการ. Project ใหม่เลือก Company ที่มีอยู่; Projects เดิมผูกกับ Dhas ผ่าน staged verified rollout.

**Out of scope:** CRM pipeline/contract billing, invoice, budget ledger, project document versioning, unless explicitly prioritized later. Existing budget/spent fields may remain visible only if maintained and defined.

### Work Items

**In scope:** existing type/status/priority/functional role, single-owner assignment, Project, dates, types, list/detail, filtering, import/export, shared mutation contract, manual one-way GitLab Issue import with explicit GitLab Project → PMS Project mapping, source link, deduplication and sync result summary. GitLab import creates/updates the same canonical `WorkItem`; Company is inherited through the mapped PMS Project. Removing a mapping retains imported WorkItems and TimeEntries. Follow the [GitLab Issue Import Contract](./GITLAB_ISSUE_IMPORT.md) for first-sync approval, field ownership, supported labels, pagination, partial failures and retries. Filter/summary สำคัญคือ Developer/Infra/SA ไม่ใช่การเลือก account หลายคน.

**Out of scope:** GitLab write-back/two-way sync, Merge Requests, commits, CI, webhooks/scheduled sync and GitLab time tracking import in phase one; new workflow statuses, custom fields, nested subtasks, dependency graph UI, attachment storage, comments workflow, unless separately specified (schema models for some legacy entities exist but are not in the primary menu contract).

### Board

**In scope:** live WorkItem cards, status columns, filters by Company/Project/functional role, open details, persisted status updates, responsive scrolling and error rollback.

**Out of scope:** user-defined columns/WIP policies, board-specific work item records, unrelated card actions such as comments/attachments without underlying API support.

### Analysis

**In scope:** operational analytics from WorkItem/TimeEntry, documented formulas, period/filter consistency, Company/Project/functional-role filters, export of visible result, drill-through; responsive charts whose axes, legend, tooltip and labels remain inside the chart component.

**Out of scope:** predictive analytics, utilization/efficiency score unless denominator/working calendar is agreed, financial reporting from budget data without validated source, historical status charts before event history exists.

### Daily Work

**In scope:** CRUD `TimeEntry` by the owner, link to WorkItem, date ranges, description/remarks/status, hour totals, validation, owner identity and Project consistency.

**Out of scope until agreed:** timesheet approvals, payroll, invoicing, stopwatch timer, overtime rules, billable/non-billable accounting, offline synchronization.

### Company

**In scope:** CRUD multiple Company records; show Company-to-Project portfolio and Work Item/TimeEntry totals. No Customer registry, member directory, invites, team management, or per-user permissions.

**Out of scope:** HR lifecycle, payroll, recruitment, external identity directory synchronization. Multi-tenant administration is not assumed by the present schema.

### Settings

**In scope:** the single owner's authenticated profile and preferences that the app actually consumes; protect owner access; security controls only with provider/API support.

**Out of scope until provider selected:** password management/2FA implementation by custom app, organization-wide policy console, notification delivery channels that are not integrated.

## 5. Cross-cutting technical scope

**In scope สำหรับ implementation phase:**

- shared server validation and consistent error contracts
- single-owner authentication/access control before exposing the app beyond a trusted private environment; no multi-user role authorization
- Company schema/API/UI and Dhas Project backfill
- aggregate queries for dashboard/analysis and consistent calculation helper(s)
- DB integrity checks for WorkItem/TimeEntry and Project/Company relations
- GitLab Issue import connector, external-reference mapping, manual sync endpoint/UI, server-only token handling and idempotent upsert
- consistent visual hierarchy, design tokens and shared components across all eight menus
- system-wide Neumorphism visual language implemented through shared theme-aware tokens/components: restrained raised/inset surfaces and soft shadows across all eight menus and current light/dark/special-dark modes; retain readable typography, explicit boundaries and business states, contrast and visible keyboard focus; no separate Neumorphism theme toggle
- responsive UX for phone (<640px), tablet (640–1023px) and notebook (≥1024px); prevent page-level overflow or clipped primary actions/content, while allowing intentional local scrolling in Board/tabs
- short, purposeful motion for hover/focus (120–180 ms), dialog/dropdown (160–220 ms), loading and Board drag using existing CSS/utilities; no unnecessary animation dependency, no motion that delays saves or shifts layout; support keyboard focus and `prefers-reduced-motion`
- responsive Dashboard/Analysis chart components that contain their axes, legend, tooltip and labels within the component frame
- loading/empty/error UX and Thai-first labels
- deployment/schema rollout and safe backup/rollback plan for Company and GitLab mapping changes

**Out of scope ใน scope ปัจจุบัน:**

- เปลี่ยนจาก Next.js/Prisma/PostgreSQL/Docker เป็น framework/database ใหม่
- แยก microservices/event bus โดยไม่มี measurement หรือ scaling need
- API integrations other than the approved one-way GitLab Issue import, mobile native clients, external CRM/HR services
- ยืนยัน SLA/ปริมาณข้อมูลที่ยังไม่มี baseline วัดจริง

## 6. Dependencies และลำดับแนะนำ

| ลำดับ | Dependency / output | เหตุผล |
| --- | --- | --- |
| 0 | ทบทวนเอกสารทั้งชุด; ยืนยัน Company Dhas สำหรับ Projects เดิม, ใช้ default time zone Asia/Bangkok, owner access method, metric formulas และ retention | ป้องกัน schema/API เปลี่ยนซ้ำ |
| 1 | Validation, owner access-control foundation, error contract | ป้องกันข้อมูลผิดและป้องกัน instance ก่อนเปิด mutation |
| 2 | Company API + Dhas Project backfill + Project UI relation | ทำให้ Project มี Company context |
| 3 | Board เชื่อม WorkItem และปรับ Daily Work consistency | ยืนยัน operational records ที่ใช้ร่วมกัน |
| 4 | Dashboard shared query/aggregates | ใช้ข้อมูลแกนที่นิ่งแล้ว |
| 5 | Analysis, historical event strategy, export | Metrics ต้องมีนิยามและ timestamp เชื่อถือได้ |
| 6 | Company/Settings persistence สำหรับ owner account เดียว | ต้องพึ่ง owner identity ที่ตกลงแล้ว |
| 7 | GitLab Issue sync แบบทางเดียว | ต้องมี WorkItem/Project mapping, credential handling และ external ID ก่อนเปิดใช้ |

## 7. Acceptance gate สำหรับระบบเป้าหมาย

- ทุกเมนูในตาราง scope ใช้ database records จริงหรือแสดงข้อความว่า feature ยัง unavailable; ไม่มี sample metrics
- WorkItem record เดียวกันแสดง status/project/functional role/owner ตรงกันใน Work Items, Board, Projects และ Dashboard
- TimeEntry แสดงเจ้าของผู้บันทึก วันที่ ชั่วโมง Project และ Work Item ตรงกันใน Daily Work และ Analysis
- เปลี่ยน Company ของ Project แล้วทุก filter/summary แสดง Company เดียวกัน
- Summary formula และ timezone ถูกบันทึกและใช้ร่วมกัน
- ทุกเมนูใช้งานได้ตามขนาดหน้าจอที่กำหนดโดยไม่เกิด page-level horizontal overflow; Dashboard/Analysis chart elements อยู่ภายใน chart component
- Motion ไม่ขัดจังหวะการทำงาน และรองรับ keyboard focus กับ `prefers-reduced-motion`
- Mutation ที่ไม่ผ่าน validation/permission ไม่เปลี่ยนข้อมูล; deletion ไม่ลบประวัติที่ต้องเก็บ
- Operations documentation มีขั้นตอน deploy, DB sync, backup และ health verification

## 8. ข้อเสนอเพิ่มเติมต่อเอกสาร BR และ Scope รายเมนู

เอกสารที่มีอยู่ใน `document/feature/` เน้น responsive layout, visual contrast และ UI case เป็นหลัก ควรเพิ่ม/ปรับรายละเอียดต่อไปนี้ในแต่ละชุดเมื่อเริ่ม implementation:

1. เพิ่ม **current behavior / target behavior / data source / API / acceptance test** ในทุก menu
2. Dashboard และ Analysis เพิ่ม metric formula, date basis, timezone, filters และการ drill-through
3. Board ระบุ mapping 1:1 ระหว่าง status columns กับ WorkItem enum และ persistence behavior
4. Projects เพิ่ม Company relationship, Dhas backfill, progress/hour formulas และ delete policy
5. Daily Work เพิ่ม ownership, hour validation, project/work-item invariant และ duplicate submission handling
6. Company/Settings รองรับ Company persistence และ owner account persistence; เอา role permissions/team-management requirements ที่ไม่ตรง single-owner scope ออก
7. ปรับสถานะเอกสารเดิมที่ระบุ “เสร็จ” ให้แยกงาน UI ที่เสร็จจาก data/API behavior ที่ยังไม่ implemented


## Runtime security ที่ implement ใน #15

ณ #15 (2026-09-28) มี private owner access gate หน้า Next.js, server-only environment injection, loopback host ports และ `Asia/Bangkok` สำหรับ app/PostgreSQL session. #17 ผูก owner resolver; #20 เพิ่ม GitLab connector ใน code โดยยังไม่ deploy หรือเชื่อม instance จริง. รายละเอียดอยู่ใน [Runtime Security](./RUNTIME_SECURITY.md).

## Database operations ที่ implement ใน #16

เครื่องมือ backup/isolated restore/staged validation/health และ retention อยู่ใน [Database Rollout](./DATABASE_ROLLOUT.md). #16 เตรียมเครื่องมือ; #18 ได้ rollout Company → Project ไป Production แล้วตาม [Company/Project implementation](./COMPANY_PROJECT_IMPLEMENTATION.md). #20 เพิ่ม GitLab schema source และ APIs; ยังไม่มี database rollout หรือการเชื่อม instance จริง ต้องผ่าน runbook ของ environment เป้าหมายก่อนใช้งาน.

## ขอบเขตที่ส่งมอบใน Issue #19

Work Items รองรับ shared create/update validation, Company/status/priority/functional-role filters, detail ของ Project/Company/owner/Daily Work, import แบบรายแถวพร้อมเหตุผล, และ export CSV/Markdown/JSON ที่ JSON นำกลับเข้า import ได้. ทุกทางใช้ `WorkItem` ID เดิม; `cancelled` แยกจาก `completed`. ลบ WorkItem ไม่ได้เมื่อ TimeEntry อ้างอยู่. Schema source กำหนด WorkItem business dates เป็น `DATE` และ timestamp เป็น Bangkok local wall-clock; การนำ schema ไปใช้กับ database environment ยังต้องทำตาม backup/restore gate ของ [Database Rollout](./DATABASE_ROLLOUT.md).

## ขอบเขตที่ส่งมอบใน Issue #21

Daily Work รองรับ owner-only CRUD, Work Item ที่ owner เป็นเจ้าของ, Project ที่ derive จาก Work Item, positive `DECIMAL(65,30)` hours และ Bangkok calendar date/local timestamp. ตัวกรอง day/week/month/year ใช้ Bangkok calendar boundaries; Work Item options อ่านทุกหน้าและทุกปี. การแก้ไขและลบคำนวณยอดใหม่จาก TimeEntry ล่าสุดด้วย exact decimal arithmetic; Work Item detail, Project summary และ logged-hours metric ของ Dashboard/Analysis อ่านข้อมูลจริง. Dashboard/Analysis ส่วนอื่นยังเป็น scope ของ #23/#24. GitLab ไม่สร้าง TimeEntry. Schema source เปลี่ยน precision ของ hours, `TimeEntry.date` เป็น PostgreSQL `DATE` และ timestamp เป็น `TIMESTAMP(3) WITHOUT TIME ZONE`; ยังไม่มี database rollout ในงานนี้.

## ขอบเขตที่ส่งมอบใน Issue #22

Board โหลด WorkItems ทุกหน้าจาก API เดิม พร้อม filter Company, Project และ functional role; แสดงทุก status จาก enum กลางและเปิดรายละเอียดของ record เดิม. การย้ายสถานะใช้ `PATCH /api/work-items/{id}` เพื่อผ่าน shared Work Item validation. UI rollback สถานะเมื่อบันทึกล้มเหลวและมี loading, empty, retry และ error states. เพิ่ม unit suite แบบ mock/in-memory; ไม่มี endpoint หรือ schema ใหม่.
