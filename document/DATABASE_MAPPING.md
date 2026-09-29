# DATABASE MAPPING

| รายการ | ค่า |
| --- | --- |
| วัตถุประสงค์ | เชื่อม Menu, UI field, API และ persistent model |
| สถานะ | As-Is mapping พร้อม Target mapping |
| ภาษา | ภาษาไทยเป็นหลัก; ชื่อ code/schema คงภาษาอังกฤษ |
| เอกสารเชื่อมโยง | [Shared Data Model](./SHARED_DATA_MODEL.md) · [Customer/Project Migration Contract](./CUSTOMER_PROJECT_MIGRATION.md) · [GitLab Issue Import Contract](./GITLAB_ISSUE_IMPORT.md) · [DATABASE.md](./DATABASE.md) · [API.md](./API.md) · [BUSINESS_REQUIREMENT.md](./BUSINESS_REQUIREMENT.md) |

> `Customer`, `Project.customerId` และ GitLab external references เป็น target; ยังไม่มีใน Prisma schema/API/UI ปัจจุบัน. ความสัมพันธ์และ metric เป้าหมายยึด [Shared Data Model](./SHARED_DATA_MODEL.md)

การ backfill, mapping register, validation/rollback gates และ external identity uniqueness ใช้ [Customer/Project Migration Contract](./CUSTOMER_PROJECT_MIGRATION.md) เป็นข้อกำหนดกลาง. GitLab fields, project mapping, upsert และ failure outcomes ใช้ [GitLab Issue Import Contract](./GITLAB_ISSUE_IMPORT.md). Register จริงเป็น run artifact ของ environment และห้ามใส่ข้อมูลลูกค้าจริงใน repository.

Target mapping: ค่า default time zone ของระบบ, application และ PostgreSQL session คือ `Asia/Bangkok` ทุก environment. Calendar-only fields ใช้ PostgreSQL `DATE` (Prisma `@db.Date`) และ timestamps ใช้ `TIMESTAMP WITHOUT TIME ZONE` (Prisma `@db.Timestamp`) เก็บค่า Bangkok local wall-clock; ห้ามแปลง timestamp เป็น UTC. ห้ามอาศัย timezone ของ browser/device ในการ map วัน.

## 1. Source-of-truth matrix

| Business data | Canonical model | Canonical key | อ่านโดย | เขียนโดย |
| --- | --- | --- | --- | --- |
| Work Item / status / assignment | `WorkItem` / `work_items` | `WorkItem.id` | Work Items, Board, Dashboard, Projects, Analysis, Daily Work selector | Work Items API; target Board mutation ผ่าน WorkItem service |
| Daily Work / actual hours | `TimeEntry` | `TimeEntry.id` | Daily Work, Work Item detail, Project, Dashboard, Analysis | Work Logs API (`/api/work-logs`) |
| Project | `Project` | `Project.id` | Projects, selectors, Work Items, Daily Work, Dashboard, Analysis | Projects page/API |
| Customer | Target `Customer` | `Customer.id` | Company registry, Projects, Dashboard, filters, Analysis | Target Customer/Project API |
| Owner identity | One `User` row | `User.id` | Work Items (assignee), Daily Work (logger), Settings | Issue #17: server `getOwner()` หลัง owner gate/middleware; ไม่รับ browser ID ที่ต่างจาก owner |
| Work Item functional role | `WorkItem.role` | enum value | Work Items, Board, Analysis, Project summaries | Work Items API; values Developer / infra / SA |
| GitLab Issue identity | Target `ExternalWorkItemReference` | provider + canonical instance URL + GitLab project ID + global issue ID | Work Items (source link/sync status) | GitLab connector only; database unique key plus transactional upsert prevents duplicate import |
| GitLab Project link | Target `GitLabProjectMapping` | GitLab instance/project ID → `Project.id`; owner-approved `approvedLabelMap` | Work Items sync setup; Project supplies Customer context | Owner-managed mapping; one GitLab Project maps to one PMS Project in phase one |
| Company profile | One `Company` row per installation | `Company.id` | Company | Target Company API; current page read-only query |
| Project membership | Legacy `ProjectMember` relation | `ProjectMember.id` | As-Is Projects/Company counts only | No multi-member/team management in target scope |
| Owner preferences | Target owner-scoped preference record or selected provider | owner key | Settings | Target Settings API |

## 2. Menu-to-data mapping

| Menu / page | As-Is source | Fields/relations ที่ใช้หรือแสดง | Target mapping / missing |
| --- | --- | --- | --- |
| Dashboard `/` | hard-coded arrays; `DashboardCharts` | sample project stats, work item counts, activity and chart values | Query WorkItem statuses/dates, TimeEntry.hours/date, Project/customer; remove mock arrays; link totals to filtered list |
| Projects `/projects` | Prisma `Project.findMany`; counts WorkItems/Members; detail uses Project API | Project status/priority/date/budget/spent/progress; `_count.workItems`, legacy `_count.members`; WorkItem status summary | Add required Project.customer relation; hours = `SUM(TimeEntry.hours)`; one shared progress formula; summarize WorkItem functional roles, not team members |
| Work Items `/work-items` | `/api/work-items`, `/api/projects?options=work-items`, `/api/users`; proposed `/api/integrations/gitlab/*` | `WorkItem` core fields; nested Project; GitLab source reference | Target has one owner assignee; add Project.customer projection; show Daily Work through `TimeEntry`; manual one-way GitLab Issue sync with deduplication |
| Board `/board` | hard-coded React `useState` columns/cards | No persistent mapping today | `WorkItem.status` defines column; card maps WorkItem fields; mutation patches same `WorkItem`; filters resolve Project/Customer/functional role |
| Analysis `/analysis` | hard-coded chart datasets and metric constants | Current displayed values do not map reliably to DB | Aggregate `WorkItem` and `TimeEntry` grouped by consistent period, Customer/Project and `WorkItem.role`; include metric definitions and drill-through IDs |
| Daily Work `/daily-work` | `/api/work-logs`; API persists to `TimeEntry` | `TimeEntry.date/hours/description/remarks/status/userId/projectId/workItemId`; nested User, Project, WorkItem | Derive `projectId` from WorkItem or enforce equality; resolve the sole owner identity server-side; summary uses exact rows |
| Company `/company` | server Prisma query on `Company`, `User`, `Project`, `WorkItem` | company first row/fallback display; current User/team counts and memberships are legacy UI/schema | Implement Company profile and Customer registry persistence; show Customer → Projects → Work Items/hours; remove member/team administration |
| Settings `/settings` | static form defaults and UI controls | No persistence/API mapping found | Profile/preferences map to the sole owner; security controls require owner authentication/provider integration |

## 3. Field-level mapping

### Work Items UI/API → `WorkItem`

| UI / API property | Prisma field | Transformation / rule |
| --- | --- | --- |
| `id` | `id` | cuid string |
| `title`, `description` | same | title required; description optional |
| `kind` | `kind` | `Incident` / `Issue` / `Task` enum |
| `priority` | `priority` | none/low/medium/high/urgent enum |
| `role` | `role` | Work Item functional role: Developer/infra/SA or null; not an account role |
| `status` | `status` | API serializes `in_progress` ↔ `in-progress`, `sa_testing` ↔ `sa-testing`, `pm_testing` ↔ `pm-testing` |
| `types` | `types` → DB `labels_types` | String array validated against supported types |
| `workDate`, `dueDate` | same | Target PostgreSQL `DATE` / Prisma `@db.Date`; persist and compare as calendar dates in `Asia/Bangkok` |
| `submittedAt` | same | Target `TIMESTAMP WITHOUT TIME ZONE` / Prisma `@db.Timestamp`; Bangkok local wall-clock; currently stamp for `sa-testing` and `completed`, not an unambiguous completedAt |
| `projectId` | `projectId` | required FK; relation supplies Project label/color |
| `assigneeId` | `assigneeId` | required FK; target resolves to the sole owner User row |

### GitLab Issue → `WorkItem` (target, inbound only)

| GitLab field | PMS target | Transformation / rule |
| --- | --- | --- |
| GitLab Project ID | `GitLabProjectMapping` → `Project.id` | ต้อง map ก่อน sync; Customer มาจาก Project ใน PMS |
| global Issue ID, project ID, instance URL, web URL | `ExternalWorkItemReference` | เก็บ identity/URL; unique key ใช้ป้องกันรายการซ้ำ |
| `title`, `description` | `WorkItem.title`, `WorkItem.description` | ฟิลด์จากต้นทาง; sync ซ้ำอัปเดตตาม GitLab |
| GitLab Issue | `WorkItem.kind` | กำหนดเป็น `Issue`; assignee เป็น owner คนเดียว, priority เป็น `none`, `role` และ `workDate` ว่างเมื่อสร้างใหม่ |
| `state` | `WorkItem.status` | `opened → todo`, `closed → completed`; ไม่มี status ใหม่ |
| `labels` | `WorkItem.types` | ใช้ `GitLabProjectMapping.approvedLabelMap` แบบ exact/case-sensitive ไปยังค่าที่รองรับ (`bug`, `data`, `documentation`, `epic`, `feature`, `maintenance`, `opl`, `ops`, `support`, `task`); แทนที่ชุด mapped ทุกครั้ง; label ที่ไม่ map ถูกข้ามและรายงาน; ห้ามกำหนด `role` จาก label |
| `due_date` | `WorkItem.dueDate` | date-only `YYYY-MM-DD` เป็น Bangkok calendar date; null ล้างค่าเดิม; ไม่เปลี่ยนวันตาม timezone |
| remote `updated_at` | `ExternalWorkItemReference.remoteUpdatedAt` | เก็บ remote source version เป็น Bangkok local wall-clock; ใช้ป้องกัน stale retry; ไม่เขียนทับ `WorkItem.updatedAt` |
| GitLab assignee | — | ระบบมี owner คนเดียว; ไม่สร้าง User/assignee จาก GitLab |

การ sync ไม่เขียนกลับ GitLab; Issue ที่มี reference ใช้ identity เดิม ส่วน Issue ใหม่สร้าง `kind=Issue`, owner assignee, `priority=none`, `role=null`, `workDate=null`. ทุกครั้งให้ GitLab เป็นเจ้าของ title/description/status/mapped types/dueDate ส่วน `role`, `priority`, `workDate`, owner และ `TimeEntry` เป็นของ PMS. Exact identity, initial reconciliation, pagination, retries และ partial outcomes อยู่ใน [GitLab Issue Import Contract](./GITLAB_ISSUE_IMPORT.md).

### Daily Work UI/API → `TimeEntry`

| UI / API property | Prisma field | Rule |
| --- | --- | --- |
| `id` | `id` | response identity |
| `description`, `remarks` | same | optional in schema; current page requires description on submit |
| `hours` | `hours` Decimal | UI/API convert input string to number; target validation must reject nonnumeric/nonpositive values server-side |
| `date` | `date` | Target PostgreSQL `DATE` / Prisma `@db.Date`; calendar date in `Asia/Bangkok`; day boundaries use the same timezone |
| `TimeEntry.status` | `status` | optional free-form legacy field As-Is; not a WorkItem workflow status or target metric; do not create a second status vocabulary |
| `userId` | `userId` | current page selects Admin/default User client-side; target always resolve the single owner's authenticated identity server-side |
| `projectId` | `projectId` | Project context มาจาก Project ของ WorkItem; derive หรือ validate ให้ตรงกันทุกครั้งที่ส่งค่านี้ |
| `workItemId` | `workItemId` | required in the target model; each TimeEntry belongs to exactly one WorkItem |
| nested `workItem` | relation | response includes id/title/kind/status; status serialized to public enum spelling |

### Project summary

| Display value | Source/formula |
| --- | --- |
| Work Item total | count of `WorkItem` where `projectId = Project.id` |
| Completed | count where status = `completed` |
| Open | count where status not in `completed`, `cancelled` |
| Progress (target) | completed ÷ (total − cancelled) × 100; zero denominator → 0 |
| Members | As-Is count `ProjectMember` rows; not a target product metric under the single-owner requirement |
| Logged hours (target) | sum `TimeEntry.hours` grouped by `projectId` or joined through WorkItem; ensure no duplicated join rows |
| Customer (target) | `Project.customerId → Customer.id`; no current field |

## 4. Integrity matrix

| Rule | Current enforcement | Target enforcement |
| --- | --- | --- |
| Work Item references valid Project | Required FK; API checks project exists | Keep FK and validate permissions |
| Work Item references valid assignee | Required FK; create API checks user exists | Resolve to the sole owner User row; remove assignee choice among multiple users |
| Daily Work references valid user | Required FK; POST API checks user exists | Use the sole owner's authenticated identity; retain FK |
| Daily Work Project and Work Item match | POST checks the pair; PATCH checks only when `workItemId` is included. PATCH that changes only `projectId` can mismatch; DB doesn't enforce pair | Derive Project from Work Item and/or add composite DB integrity; validate on every mutation |
| Work Item/TimeEntry enum validity | WorkItem enums and API parser; TimeEntry.status is free-form String | Keep WorkItem status canonical; TimeEntry has no separate target workflow status |
| Project has Customer | Not modeled | Customer FK, staged backfill, required once verified |
| Company singleton | Not enforced; page uses `findFirst()` | Enforce/select one Company row per installation; multi-company is out of current scope |
| Historical completion time | `submittedAt` means sa-testing or completed | Add `completedAt` or status history for period analytics |
| Owner identity on mutation | No session/auth enforcement found | Require authenticated owner; no manager/admin hierarchy under current scope |

## 5. Data lineage for shared views

```mermaid
flowchart LR
  C[Customer] --> P[Project]
  P --> W[WorkItem]
  O[Owner User] --> W
  W --> T[TimeEntry / Daily Work]
  O --> T
  W --> D[Dashboard / Board / Analysis / Project summary]
  T --> D
  P --> D
```

Project/Customer labels are context from relations, not copied text fields on WorkItem or TimeEntry. Keep stable IDs for joins; serialize display names for UI only. Developer/Infra/SA belong to `WorkItem.role`; they do not create separate User rows or access permissions.


## Runtime security ที่ implement ใน #15

สถานะเพิ่มเติม ณ 2026-09-28: มี private owner access gate หน้า Next.js, server-only environment injection จาก root `.env` ของ Dev/UAT/Production, loopback host ports และ `Asia/Bangkok` สำหรับ app/PostgreSQL session แล้ว. รายละเอียดปัจจุบันและคำสั่งตรวจที่ไม่พิมพ์ secrets อยู่ใน [Runtime Security](./RUNTIME_SECURITY.md). Baseline เดิมที่กล่าวว่าไม่มี auth/session ยังใช้กับ owner User/session (#17); gate นี้ไม่ resolve User หรือเพิ่ม GitLab connector (#20), ไม่เปลี่ยน schema/records และไม่ยืนยันว่า installation จริง deploy แล้ว.

## Database operations ที่ implement ใน #16

เครื่องมือ backup/isolated restore/staged validation/health และ retention อยู่ใน [Database Rollout](./DATABASE_ROLLOUT.md). ใช้ Asia/Bangkok และตรวจ exact history โดยไม่แปลง timestamp เป็น UTC. Customer/GitLab target schema และ business API ยังไม่ถูก deploy ในงาน Infra นี้. เจ้าของกำหนด defaults เป็น BACKUP_DIR=./database/backups/postgres_data และ BACKUP_KEEP_DAYS=30 แล้ว. ผล isolated verification ยืนยันการเตรียมเครื่องมือของ #16; ยังไม่ได้ rollout หรือสร้าง backup ของ Dev/UAT/Production จริง ซึ่งต้องผ่าน runbook ก่อน schema changes.
