# DATABASE MAPPING

| รายการ | ค่า |
| --- | --- |
| วัตถุประสงค์ | เชื่อม Menu, UI field, API และ persistent model |
| สถานะ | As-Is mapping พร้อม Target mapping |
| ภาษา | ภาษาไทยเป็นหลัก; ชื่อ code/schema คงภาษาอังกฤษ |
| เอกสารเชื่อมโยง | [DATABASE.md](./DATABASE.md) · [API.md](./API.md) · [BUSINESS_REQUIREMENT.md](./BUSINESS_REQUIREMENT.md) |

> `Customer`, `Project.customerId` และ GitLab external references เป็น target; ยังไม่มีใน Prisma schema/API/UI ปัจจุบัน

## 1. Source-of-truth matrix

| Business data | Canonical model | Canonical key | อ่านโดย | เขียนโดย |
| --- | --- | --- | --- | --- |
| Work Item / status / assignment | `WorkItem` / `work_items` | `WorkItem.id` | Work Items, Board, Dashboard, Projects, Analysis, Daily Work selector | Work Items API; target Board mutation ผ่าน WorkItem service |
| Daily Work / actual hours | `TimeEntry` | `TimeEntry.id` | Daily Work, Work Item detail, Project, Dashboard, Analysis | Work Logs API (`/api/work-logs`) |
| Project | `Project` | `Project.id` | Projects, selectors, Work Items, Daily Work, Dashboard, Analysis | Projects page/API |
| Customer | Target `Customer` | `Customer.id` | Projects, Dashboard, filters, Analysis | Target Customer/Project API |
| Owner identity | One `User` row | `User.id` | Work Items (assignee), Daily Work (logger), Settings | Owner identity resolved by server; current users API is read-only |
| Work Item functional role | `WorkItem.role` | enum value | Work Items, Board, Analysis, Project summaries | Work Items API; values Developer / infra / SA |
| GitLab Issue identity | Target `ExternalWorkItemReference` | instance + GitLab project ID + global issue ID | Work Items (source link/sync status) | GitLab connector only; unique key prevents duplicate import |
| GitLab Project link | Target `GitLabProjectMapping` | GitLab instance/project ID → `Project.id` | Work Items sync setup; Project supplies Customer context | Owner-managed mapping; one GitLab Project maps to one PMS Project in phase one |
| Company profile | One `Company` row per installation | `Company.id` | Company | Target Company API; current page read-only query |
| Customer | Target `Customer` | `Customer.id` | Company registry, Projects, Dashboard, Analysis | Target Customer API |
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
| `workDate`, `dueDate` | same | optional timestamps; filter timezone must be consistent |
| `submittedAt` | same | currently stamp for `sa-testing` and `completed`; not an unambiguous completedAt |
| `projectId` | `projectId` | required FK; relation supplies Project label/color |
| `assigneeId` | `assigneeId` | required FK; target resolves to the sole owner User row |

### GitLab Issue → `WorkItem` (target, inbound only)

| GitLab field | PMS target | Transformation / rule |
| --- | --- | --- |
| GitLab Project ID | `GitLabProjectMapping` → `Project.id` | ต้อง map ก่อน sync; Customer มาจาก Project ใน PMS |
| global Issue ID, project ID, instance URL, web URL | `ExternalWorkItemReference` | เก็บ identity/URL; unique key ใช้ป้องกันรายการซ้ำ |
| `title`, `description` | `WorkItem.title`, `WorkItem.description` | ฟิลด์จากต้นทาง; sync ซ้ำอัปเดตตาม GitLab |
| GitLab Issue | `WorkItem.kind` | กำหนดเป็น `Issue`; assignee เป็น owner คนเดียว, priority เป็น `none`, `role` และ `workDate` ว่างเมื่อสร้างใหม่ |
| `state` | `WorkItem.status` | ข้อเสนอ: `opened → todo`, `closed → completed` |
| `labels` | `WorkItem.types` | รับเฉพาะ label ที่ตรงกับค่าที่ระบบรองรับ (`bug`, `data`, `documentation`, `epic`, `feature`, `maintenance`, `opl`, `ops`, `support`, `task`); ข้าม label อื่นและแจ้งในผล sync; ห้ามกำหนด `role` จาก label |
| `due_date`, remote `updated_at` | `WorkItem.dueDate`, reference metadata | แปลงเวลาอย่างสม่ำเสมอ; `workDate` ไม่ได้มาจาก GitLab Issue |
| GitLab assignee | — | ระบบมี owner คนเดียว; ไม่สร้าง User/assignee จาก GitLab |

การ sync ไม่เขียนกลับ GitLab; สร้าง WorkItem ใหม่เมื่อพบ Issue ครั้งแรกและ sync ซ้ำด้วย external identity. ทุกครั้งให้ GitLab เป็นเจ้าของ title/description/status/mapped types/dueDate ส่วน `role`, `priority`, `workDate`, owner และ `TimeEntry` เป็นของ PMS. รายละเอียด mapping สถานะเป็น proposal จนกว่าจะยืนยันก่อน implementation.

### Daily Work UI/API → `TimeEntry`

| UI / API property | Prisma field | Rule |
| --- | --- | --- |
| `id` | `id` | response identity |
| `description`, `remarks` | same | optional in schema; current page requires description on submit |
| `hours` | `hours` Decimal | UI/API convert input string to number; target validation must reject nonnumeric/nonpositive values server-side |
| `date` | `date` | DateTime; day boundaries interpreted in consistent timezone |
| `status` | `status` | optional free-form string today; standard values must be agreed/enforced |
| `userId` | `userId` | current page selects Admin/default User client-side; target always resolve the single owner's authenticated identity server-side |
| `projectId` | `projectId` | currently required by create API despite nullable schema |
| `workItemId` | `workItemId` | currently required by create API despite nullable schema; must belong to `projectId` |
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
| Work Item/TimeEntry enum validity | WorkItem enums and API parser; TimeEntry.status is free-form String | Central enum/ref data and server validation |
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

