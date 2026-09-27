# SCOPE

| รายการ | ค่า |
| --- | --- |
| ระบบ | Project Management System |
| เอกสาร | Scope ฉบับรวมและแบ่งตาม Menu |
| ภาษา | ภาษาไทยเป็นหลัก; system terms ใช้ภาษาอังกฤษเมื่อเป็นคำที่ใช้ทั่วไป |
| สถานะ | กรอบเป้าหมายสำหรับวางแผนงานพัฒนา; Step 1 ปัจจุบันส่งมอบเอกสารเท่านั้น |
| เอกสารเชื่อมโยง | [Shared Data Model](./SHARED_DATA_MODEL.md) · [Customer/Project Migration Contract](./CUSTOMER_PROJECT_MIGRATION.md) · [BUSINESS_REQUIREMENT.md](./BUSINESS_REQUIREMENT.md) · [ENGINEERING_SPEC.md](./ENGINEERING_SPEC.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) |

## 1. วัตถุประสงค์และขอบเขตของ Step 1

Step 1 จัดทำ baseline และข้อกำหนดครบชุดก่อนเริ่มแก้ระบบ: Engineering Spec, Architecture, Business Requirement, Scope, Database, Database Mapping, API และ Deployment

**สิ่งที่ทำใน Step 1:** ตรวจ repository และ schema ปัจจุบัน, บันทึก As-Is/Gap, นิยาม target data flow, แยก requirement ตาม menu, ทำ inventory API/database/runtime, เสนอ dependencies และ acceptance criteria

**สิ่งที่ยังไม่ทำใน Step 1:** เปลี่ยน UI, เพิ่ม Customer model/migration, สร้าง endpoint ใหม่, เพิ่ม authentication, เปลี่ยน Docker/deployment behavior หรือย้ายข้อมูลจริง

## 2. Product scope เป้าหมาย

ขอบเขตผลิตภัณฑ์ครอบคลุม 8 เมนูที่ผู้ใช้ระบุและการเชื่อมข้อมูลระหว่างกัน:

| กลุ่ม/เมนู | In scope เป้าหมาย | ระบบปัจจุบันที่พบ / งานที่ต้องเติม |
| --- | --- | --- |
| Overview — Dashboard `/` | KPI, งานที่ต้องติดตาม, Project ล่าสุด, filter และ deep link จาก records จริง | ปัจจุบันเป็น sample data; เพิ่ม DB-backed queries |
| Overview — Projects `/projects` | Project CRUD/detail, required Customer relation, Work Item/role/hour summaries | ใช้งานบางส่วน; เพิ่ม Customer, hours, consistent progress และ business rules |
| Overview — Work Items `/work-items` | WorkItem list/create/edit/delete/filter/import/export; manual one-way GitLab Issue sync; owner is sole assignee; Developer/Infra/SA are functional roles | มี API/หน้าใช้งาน; ตรวจเติม validation, owner access control, external mapping และ sync contract |
| Management — Board `/board` | Kanban ของ WorkItem จริง; persist status change | ปัจจุบันเป็น client sample state; เชื่อม WorkItem API และ status enum |
| Management — Analysis `/analysis` | KPI/charts/tables จาก WorkItem และ TimeEntry จริง | ปัจจุบันเป็น sample arrays; เพิ่ม shared queries, metric definitions, export |
| Management — Daily Work `/daily-work` | CRUD TimeEntry, period views, WorkItem/Project relation, hours | มี API/หน้าใช้งาน; เสริม auth, validation, date/time consistency |
| Management — Company `/company` | Single company profile และ Customer registry ที่ Project ใช้ร่วมกัน | อ่าน DB บางส่วน; เพิ่ม company/customer mutations; ไม่มีสมาชิกหลายคน |
| Settings `/settings` | Profile/preferences/security ของ owner account เดียวที่ persist | ปัจจุบันเป็น form UI; เพิ่ม persistence และ owner access control |

## 3. Data scope และระบบที่เชื่อมกัน

ข้อกำหนดข้อมูลร่วมฉบับบรรทัดฐานอยู่ใน [Shared Data Model](./SHARED_DATA_MODEL.md)

### 3.1 Core business data

- `WorkItem`: แหล่งจริงสำหรับงาน สถานะ ประเภท priority, functional role, owner/assignee, Project และวันทำงาน
- `WorkItem.role`: ระบุว่าเจ้าของกำลังทำงานในบทบาท Developer, Infra หรือ SA; ไม่ใช่ user account/permission
- `TimeEntry`: แหล่งจริงสำหรับ Daily Work/ชั่วโมงจริง ผูกกับ WorkItem และเจ้าของระบบ
- `Project`: จัดกลุ่ม Work Items; target เพิ่ม Customer relation และรวมข้อมูล Work/Time
- `Customer`: target master ใหม่สำหรับลูกค้า; ยังไม่มีใน schema
- `User`: เก็บ identity ของเจ้าของระบบหนึ่งคน; `ProjectMember` เป็น legacy schema ไม่ได้แปลว่าผลิตภัณฑ์ต้องรองรับสมาชิกหลายคน
- `Company`: ข้อมูลบริษัทเดียวของ installation; `Customer`: ลูกค้าหลายรายที่ Projects เชื่อมโยง
- Dashboard/Analysis: read-only derived views จาก core records

### 3.2 Invariants ที่อยู่ใน scope

- Board status = WorkItem status; ไม่มีสถานะซ้ำใน Board
- Daily Work ต้องเชื่อม WorkItem; Project ID ต้องสอดคล้องกับ Project ของ WorkItem
- Project Customer ต้องใช้ relation เดียวกันใน Project list/detail, filters, Dashboard และ Analysis
- Summary counts/hours/progress ใช้สูตรชุดเดียวกันทุกหน้า
- ใช้ Asia/Bangkok ใน filter และ date grouping; เก็บ timestamp เป็น UTC

## 4. รายละเอียด scope / non-scope แยกตาม Menu

### Dashboard

**In scope:** DB-backed KPIs, overdue/recent lists, selected period, Customer/Project filters, links ไปยังรายการต้นทาง, loading/empty/error states; responsive card/chart layout ที่ไม่ทำให้หน้า overflow.

**Out of scope เว้นแต่มี requirement เพิ่ม:** notification center, portfolio forecasting, configurable dashboard builder, cross-company BI warehouse.

### Projects

**In scope:** Customer picker/filter, Project CRUD/detail, work item counts, functional role breakdown, progress formula, logged hours, guard against accidental data loss. Project แต่ละรายการต้องมี Customer หนึ่งราย; Customer หนึ่งรายเชื่อม Projects ได้หลายรายการ. Customer มีชื่อและสถานะ active/inactive; backfill ต้องใช้ approved per-Project mapping register และผ่าน backup/restore/validation gates ก่อนบังคับ relation ตาม [Customer/Project Migration Contract](./CUSTOMER_PROJECT_MIGRATION.md).

**Out of scope:** CRM pipeline/contract billing, invoice, budget ledger, project document versioning, unless explicitly prioritized later. Existing budget/spent fields may remain visible only if maintained and defined.

### Work Items

**In scope:** existing type/status/priority/functional role, single-owner assignment, Project, dates, types, list/detail, filtering, import/export, shared mutation contract, manual one-way GitLab Issue import with explicit GitLab Project → PMS Project mapping, source link, deduplication and sync result summary. GitLab import creates/updates the same canonical `WorkItem`; Customer is inherited through the mapped PMS Project. Removing a mapping retains imported WorkItems and TimeEntries. Filter/summary สำคัญคือ Developer/Infra/SA ไม่ใช่การเลือก account หลายคน.

**Out of scope:** GitLab write-back/two-way sync, Merge Requests, commits, CI, webhooks/scheduled sync and GitLab time tracking import in phase one; new workflow statuses, custom fields, nested subtasks, dependency graph UI, attachment storage, comments workflow, unless separately specified (schema models for some legacy entities exist but are not in the primary menu contract).

### Board

**In scope:** live WorkItem cards, status columns, filters by Customer/Project/functional role, open details, persisted status updates, responsive scrolling and error rollback.

**Out of scope:** user-defined columns/WIP policies, board-specific work item records, unrelated card actions such as comments/attachments without underlying API support.

### Analysis

**In scope:** operational analytics from WorkItem/TimeEntry, documented formulas, period/filter consistency, Customer/Project/functional-role filters, export of visible result, drill-through; responsive charts whose axes, legend, tooltip and labels remain inside the chart component.

**Out of scope:** predictive analytics, utilization/efficiency score unless denominator/working calendar is agreed, financial reporting from budget data without validated source, historical status charts before event history exists.

### Daily Work

**In scope:** CRUD `TimeEntry` by the owner, link to WorkItem, date ranges, description/remarks/status, hour totals, validation, owner identity and Project consistency.

**Out of scope until agreed:** timesheet approvals, payroll, invoicing, stopwatch timer, overtime rules, billable/non-billable accounting, offline synchronization.

### Company

**In scope:** edit the single company profile; CRUD/deactivate Customer records; show Customer-to-Project portfolio and Work Item/TimeEntry totals. No member directory, invites, team management, or per-user permissions.

**Out of scope:** HR lifecycle, payroll, recruitment, external identity directory synchronization. Multi-tenant administration is not assumed by the present schema.

### Settings

**In scope:** the single owner's authenticated profile and preferences that the app actually consumes; protect owner access; security controls only with provider/API support.

**Out of scope until provider selected:** password management/2FA implementation by custom app, organization-wide policy console, notification delivery channels that are not integrated.

## 5. Cross-cutting technical scope

**In scope สำหรับ implementation phase:**

- shared server validation and consistent error contracts
- single-owner authentication/access control before exposing the app beyond a trusted private environment; no multi-user role authorization
- Customer schema/API/UI and Project backfill plan
- aggregate queries for dashboard/analysis and consistent calculation helper(s)
- DB integrity checks for WorkItem/TimeEntry and Project/customer relations
- GitLab Issue import connector, external-reference mapping, manual sync endpoint/UI, server-only token handling and idempotent upsert
- consistent visual hierarchy, design tokens and shared components across all eight menus
- responsive UX for phone (<640px), tablet (640–1023px) and notebook (≥1024px); prevent page-level overflow or clipped primary actions/content, while allowing intentional local scrolling in Board/tabs
- short, purposeful motion for hover/focus (120–180 ms), dialog/dropdown (160–220 ms), loading and Board drag using existing CSS/utilities; no unnecessary animation dependency, no motion that delays saves or shifts layout; support keyboard focus and `prefers-reduced-motion`
- responsive Dashboard/Analysis chart components that contain their axes, legend, tooltip and labels within the component frame
- loading/empty/error UX and Thai-first labels
- deployment/schema rollout and safe backup/rollback plan for Customer and GitLab mapping changes

**Out of scope ใน scope ปัจจุบัน:**

- เปลี่ยนจาก Next.js/Prisma/PostgreSQL/Docker เป็น framework/database ใหม่
- แยก microservices/event bus โดยไม่มี measurement หรือ scaling need
- API integrations other than the approved one-way GitLab Issue import, mobile native clients, external CRM/HR services
- ยืนยัน SLA/ปริมาณข้อมูลที่ยังไม่มี baseline วัดจริง

## 6. Dependencies และลำดับแนะนำ

| ลำดับ | Dependency / output | เหตุผล |
| --- | --- | --- |
| 0 | ทบทวนเอกสารทั้งชุด; วาง mapping Projects เดิมไป Customer, ยืนยัน timezone, owner access method, metric formulas และ retention | ป้องกัน schema/API เปลี่ยนซ้ำ |
| 1 | Validation, owner access-control foundation, error contract | ป้องกันข้อมูลผิดและป้องกัน instance ก่อนเปิด mutation |
| 2 | Customer model/API + Project backfill + Project UI relation | ทำให้ Project มี customer context |
| 3 | Board เชื่อม WorkItem และปรับ Daily Work consistency | ยืนยัน operational records ที่ใช้ร่วมกัน |
| 4 | Dashboard shared query/aggregates | ใช้ข้อมูลแกนที่นิ่งแล้ว |
| 5 | Analysis, historical event strategy, export | Metrics ต้องมีนิยามและ timestamp เชื่อถือได้ |
| 6 | Company/Customer/Settings persistence สำหรับ owner account เดียว | ต้องพึ่ง owner identity ที่ตกลงแล้ว |
| 7 | GitLab Issue sync แบบทางเดียว | ต้องมี WorkItem/Project mapping, credential handling และ external ID ก่อนเปิดใช้ |

## 7. Acceptance gate สำหรับระบบเป้าหมาย

- ทุกเมนูในตาราง scope ใช้ database records จริงหรือแสดงข้อความว่า feature ยัง unavailable; ไม่มี sample metrics
- WorkItem record เดียวกันแสดง status/project/functional role/owner ตรงกันใน Work Items, Board, Projects และ Dashboard
- TimeEntry แสดงเจ้าของผู้บันทึก วันที่ ชั่วโมง Project และ Work Item ตรงกันใน Daily Work และ Analysis
- เปลี่ยน Customer ของ Project แล้วทุก filter/summary แสดง Customer เดียวกัน
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
4. Projects เพิ่ม Customer relationship, migration/backfill, progress/hour formulas และ delete policy
5. Daily Work เพิ่ม ownership, hour validation, project/work-item invariant และ duplicate submission handling
6. Company/Settings ระบุ company/customer persistence และ owner account persistence; เอา role permissions/team-management requirements ที่ไม่ตรง single-owner scope ออก
7. ปรับสถานะเอกสารเดิมที่ระบุ “เสร็จ” ให้แยกงาน UI ที่เสร็จจาก data/API behavior ที่ยังไม่ implemented

