# DATABASE

| รายการ | ค่า |
| --- | --- |
| Database | PostgreSQL 16 |
| ORM | Prisma 6 (`prisma/schema.prisma`) |
| สถานะ | As-Is schema พร้อม target changes ที่เสนอ; ยังไม่มี Customer model |
| ภาษาหลัก | ภาษาไทย; คงชื่อ model/field ตาม code |
| เอกสารเชื่อมโยง | [DATABASE_MAPPING.md](./DATABASE_MAPPING.md) · [API.md](./API.md) · [DEPLOYMENT.md](./DEPLOYMENT.md) |

> ส่วน As-Is อ้างอิง Prisma schema ใน repository ณ วันที่ 2026-09-27 ไม่ใช่ผล introspection ของ database instance ใดโดยเฉพาะ การเพิ่ม `Customer` และ constraint ในหัวข้อ Target ต้องผ่าน review, backup และ migration/backfill plan ก่อน deploy

## 1. Database conventions

- Prisma datasource ใช้ PostgreSQL ผ่าน `DATABASE_URL`; local/Docker environment สร้าง URL จาก environment หรือ Docker secrets
- `id` ส่วนใหญ่เป็น String ใช้ `cuid()`; เวลาใช้ `DateTime` และ default `now()`; `updatedAt` ใช้ `@updatedAt`
- Prisma model จะ map ไป table ชื่อเดียวกันตาม default ยกเว้น `WorkItem` ซึ่ง map ไป table `work_items`
- Prisma field `WorkItem.types` map ไป PostgreSQL column `labels_types` และเป็น `String[]`
- ไม่มี schema migration folder ในรายการไฟล์ปัจจุบันที่ตรวจพบ; Docker migration service ใช้ guarded `prisma db push` ไม่ใช่ versioned migration history
- จำนวน/scale ของ `Decimal` ยังไม่ได้กำหนดใน schema สำหรับ `budget`, `spent` และ `hours`

## 2. As-Is models

### 2.1 `User` → `User` (As-Is schema)

| Field | Type / constraint | ความหมาย |
| --- | --- | --- |
| `id` | String, PK, cuid | รหัสผู้ใช้ |
| `email` | String, unique, index | อีเมล |
| `name` | String | ชื่อที่แสดง |
| `password` | String | credential field; schema ไม่บอก hashing/provider policy |
| `role` | String, default `member` | field legacy ใน schema; comment ระบุ member/manager/admin แต่ไม่ใช่ Developer/Infra/SA |
| `avatar`, `phone` | String? | รูป/เบอร์ติดต่อ |
| `status` | String, default `Active` | comment ระบุ Active/Inactive/Away |
| `joinDate` | DateTime, default now | วันที่เริ่มงาน |
| `createdAt`, `updatedAt` | DateTime | เวลาสร้าง/แก้ไข |

Relations: assigned Work Items, Project memberships, comments, activity logs, notifications, time entries, created projects, documents.

**Business target:** มีผู้ใช้ระบบเพียงคนเดียวคือเจ้าของโปรเจ็ค และมี `User` record ที่แทนเจ้าของหนึ่งคน ค่า `User.role` ปัจจุบันเป็น implementation เดิม ไม่ได้กำหนด functional role ของงาน; Developer/Infra/SA อยู่ใน `WorkItem.role` เท่านั้น ตารางและ relations ปัจจุบันยังรองรับหลาย User ในเชิง schema แต่ไม่ใช่ requirement ของ product scope

### 2.2 `Company` → `Company`

`id` (PK), `name` (required), `industry`, `email`, `phone`, `address`, `website`, `logo`, `description` (optional), `createdAt`, `updatedAt`. ไม่มี unique constraint ที่บังคับให้มีบริษัทเดียว; business target คือ company profile เดียวต่อ installation

### 2.3 `Project` → `Project`

| Field | Type / constraint | ความหมาย |
| --- | --- | --- |
| `id` | String, PK, cuid | รหัส Project |
| `name` | String | ชื่อ |
| `description` | String? | รายละเอียด |
| `status` | String, default `Planning`, indexed | Planning / In Progress / Review / Completed / On Hold (comment) |
| `priority` | String, default `Medium`, indexed | Low / Medium / High / Critical (comment) |
| `startDate`, `dueDate` | DateTime | วันเริ่มและกำหนดเสร็จ |
| `budget`, `spent` | Decimal?, `spent` default 0 | งบ/ยอดใช้; ไม่มี scale ระบุ |
| `progress` | Int, default 0 | ความคืบหน้า; comment ระบุช่วง 0–100 แต่ไม่มี DB check |
| `colorProject` | String? | สีแสดงผล |
| `creatorId` | String? FK → User.id | ผู้สร้าง; relation `ProjectCreator` |
| `createdAt`, `updatedAt` | DateTime | เวลาสร้าง/แก้ไข |

Relations: creator, `ProjectMember[]`, `WorkItem[]`, documents, milestones, activity logs, time entries. ไม่มี `customerId` ใน As-Is

### 2.4 `ProjectMember` → `ProjectMember`

`id` (PK), `role` (String, default `member`), `joinedAt`; `projectId` FK → Project และ `userId` FK → User, ทั้งคู่ required; unique (`projectId`, `userId`); index แยกทั้งสอง FK. การลบ Project/User cascade ลบ membership. เป็น legacy schema relation; ไม่ใช่ requirement สำหรับ team/multiple users ใน product ปัจจุบัน

### 2.5 `WorkItem` → `work_items`

| Field | Type / constraint | ความหมาย |
| --- | --- | --- |
| `id` | String, PK, cuid | รหัสงาน |
| `title` | String | ชื่องาน |
| `description` | String? | รายละเอียด |
| `kind` | Enum `WorkItemKind` | Incident / Issue / Task |
| `priority` | Enum `WorkItemPriority`, default `none` | none / low / medium / high / urgent |
| `role` | Enum `WorkItemRole`? | functional role ที่เจ้าของทำงานใน Work Item นี้: Developer / infra / SA; ไม่ใช่ account role/permission |
| `status` | Enum `WorkItemStatus`, default `backlog` | backlog, todo, in-progress, blocked, sa-testing, pm-testing, completed, cancelled |
| `types` | String[], default `[]`, column `labels_types` | labels/types |
| `workDate`, `dueDate`, `submittedAt` | DateTime? | วันทำงาน, กำหนดเสร็จ, timestamp ที่ปัจจุบัน stamp สำหรับ sa-testing/completed |
| `createdAt`, `updatedAt` | DateTime | เวลาสร้าง/แก้ไข |
| `projectId` | String, required FK → Project.id | Project เจ้าของงาน; delete Project cascade ลบ WorkItem |
| `assigneeId` | String, required FK → User.id | ผู้รับผิดชอบ; target คือ owner `User` record เดียว |

Indexes: projectId, assigneeId, kind, status, priority, workDate, dueDate, createdAt.

### 2.6 `TimeEntry` → `TimeEntry` (Daily Work)

| Field | Type / constraint | ความหมาย |
| --- | --- | --- |
| `id` | String, PK, cuid | รหัสบันทึกเวลา |
| `description`, `remarks` | String? | รายละเอียดและหมายเหตุ |
| `hours` | Decimal | ชั่วโมง; ไม่มี precision/scale/check ระบุ |
| `date` | DateTime, default now | วันที่บันทึก |
| `status` | String? | free-form; comment ระบุตัวอย่าง To Do/In Progress/Review/Completed/Blocked |
| `createdAt`, `updatedAt` | DateTime | เวลาสร้าง/แก้ไข |
| `userId` | String, required FK → User.id | ผู้บันทึก; delete User cascade ลบ TimeEntry |
| `projectId` | String? FK → Project.id | Project context; delete Project cascade ลบ TimeEntry |
| `workItemId` | String? FK → WorkItem.id | Work Item context; delete WorkItem เปลี่ยนเป็น null (`SetNull`) |

Indexes: userId, projectId, workItemId, date. API/หน้า Daily Work กำหนด Project และ Work Item เป็น required สำหรับการสร้าง แต่ database อนุญาตให้เป็น null และไม่บังคับว่า Project ของ TimeEntry ตรงกับ Project ของ WorkItem. Target มีผู้บันทึกเพียงเจ้าของระบบ

### 2.7 Models อื่นใน schema

| Model/table | Fields หลัก | ความสัมพันธ์/หมายเหตุ |
| --- | --- | --- |
| `Comment` | id, content, createdAt, updatedAt, authorId | ผูก User ผู้เขียน แต่ยังไม่มี relation ไป WorkItem/Project |
| `Milestone` | id, name, description, dueDate, status, timestamps, projectId | ผูก Project; status เป็น String |
| `Document` | id, name, description, fileUrl, fileSize, fileType, timestamps, projectId?, uploaderId? | ผูก Project/User แบบ optional |
| `ActivityLog` | id, action, entity, entityId, description, metadata JSON?, createdAt, userId?, projectId? | entity/entityId เป็น polymorphic string ไม่มี FK ไป entity จริง |
| `Notification` | id, title, message, type, read, link, createdAt, userId | ผูก User; type เป็น String |

## 3. Relationship summary As-Is

```mermaid
erDiagram
  USER ||--o{ WORK_ITEM : assigned
  PROJECT ||--o{ WORK_ITEM : contains
  PROJECT ||--o{ PROJECT_MEMBER : has
  USER ||--o{ PROJECT_MEMBER : joins
  USER ||--o{ TIME_ENTRY : records
  WORK_ITEM o|--o{ TIME_ENTRY : references
  PROJECT o|--o{ TIME_ENTRY : context
  USER ||--o{ COMMENT : authors
  PROJECT ||--o{ MILESTONE : contains
  PROJECT o|--o{ DOCUMENT : stores
  USER o|--o{ DOCUMENT : uploads
```

Customer relation ยังไม่มี ส่วน relation ระหว่าง TimeEntry กับ Project/WorkItem เป็น optional และไม่มี composite constraint ตรวจ consistency ของทั้งคู่

## 4. Target schema changes ที่เสนอ

### 4.1 เพิ่ม `Customer`

ข้อเสนอเริ่มต้น:

```text
Customer
  id          String PK (cuid)
  name        String required
  code        String? unique (business decision)
  status      String/enum (Active, Inactive) — ยืนยันค่าก่อนทำ schema
  email       String?
  phone       String?
  address     String?
  website     String?
  notes       String?
  createdAt   DateTime
  updatedAt   DateTime

Project.customerId String? FK → Customer.id (nullable ระหว่าง backfill)
```

Required business cardinality: Customer 1:N Project; **Project แต่ละรายการต้องผูกกับ Customer หนึ่งราย** และ Customer หนึ่งรายผูก Projects ได้หลายรายการ. ระหว่าง migration `customerId` อาจ nullable ชั่วคราวเพื่อ backfill เท่านั้น; ก่อนเปิดใช้ requirement ใหม่ต้อง map ทุก Project เดิมและตรวจว่าไม่มี orphan. ห้ามใช้ชื่อลูกค้าจาก seed/sample เป็นข้อเท็จจริงโดยไม่มีการยืนยัน

### 4.2 External reference สำหรับ GitLab Issues (target)

เพื่อ sync GitLab → PMS ซ้ำได้โดยไม่สร้าง WorkItem ซ้ำ ให้เพิ่มตารางเชื่อมภายนอกและ mapping GitLab Project กับ Project ใน PMS:

```text
GitLabProjectMapping
  id, gitLabInstanceUrl, gitLabProjectId, projectId FK → Project.id
  unique(gitLabInstanceUrl, gitLabProjectId)

ExternalWorkItemReference
  id, workItemId FK → WorkItem.id
  provider, gitLabInstanceUrl, gitLabProjectId, gitLabIssueId, gitLabIssueIid
  externalUrl, remoteUpdatedAt, lastSyncedAt, createdAt, updatedAt
  unique(provider, gitLabInstanceUrl, gitLabProjectId, gitLabIssueId)
  unique(workItemId) // ระยะแรก: WorkItem หนึ่งรายการผูกแหล่งภายนอกได้หนึ่งรายการ
```

ฟิลด์นี้เป็นข้อเสนอสำหรับ review; ใช้ GitLab global Issue ID เป็นตัว deduplicate และเก็บ IID สำหรับ URL/diagnostics. GitLab token ห้ามเก็บในตารางนี้หรือส่งให้ client; ใช้ secret store/environment หรือ owner-scoped secret provider ที่เลือกแล้ว.

### 4.3 Data integrity ที่ควรประเมิน

- หากฐานข้อมูลมี User หลายแถวจาก seed/ข้อมูลเดิม ให้เลือก User row ที่เป็นเจ้าของหลักก่อน; map `WorkItem.assigneeId` และ `TimeEntry.userId` อย่างมี audit โดยไม่ลบประวัติหรือ user rows ก่อนตรวจ references ทั้งหมด
- บังคับว่า Daily Work ของ workflow นี้ต้องมี `workItemId`; หากรักษา optional เพื่อ legacy/import ให้ปฏิเสธ orphan records ในหน้าปฏิบัติงานและรายงานแยก
- Project ID ของ TimeEntry ควรถูก derive จาก WorkItem หรือใช้ composite relation/check เพื่อป้องกัน mismatch
- กำหนด precision ของ Decimal (`hours`, `budget`, `spent`); ชั่วโมงใช้ scale ที่เหมาะกับการบันทึกเศษชั่วโมงและ currency ใช้ scale 2 ตาม currency policy
- เพิ่ม check constraints สำหรับ `hours > 0`, `progress BETWEEN 0 AND 100` และ date ranges ตามกฎที่ตกลง
- พิจารณา enum/reference tables สำหรับ Project status/priority, owner account status และ TimeEntry status แทน String free-form; อย่านำ `Developer`/`Infra`/`SA` ไปใส่ `User.role`
- เพิ่ม `completedAt` หรือ `WorkItemStatusHistory` สำหรับ historical throughput; กำหนดการ stamp/reset เมื่อ status เข้า/ออก terminal state
- พิจารณา soft delete/archive สำหรับ Project/User/WorkItem เพื่อรักษา TimeEntry, ActivityLog และ audit history
- กำหนดวิธีบังคับ/เลือก company profile เดียวต่อ installation; multi-company/tenant model อยู่นอก scope ปัจจุบัน
- ปรับ relation ของ Comment/ActivityLog หากต้องการแสดง conversation/activity ต่อ WorkItem อย่าง referentially safe

## 5. Constraints, indexes และ referential actions

### As-Is ที่สำคัญ

- `User.email` unique; `ProjectMember(projectId,userId)` unique
- Foreign keys ใช้ relation Prisma ตาม schema; Project delete cascades WorkItems, ProjectMembers, Documents, Milestones, ActivityLogs, TimeEntries
- WorkItem delete ทำให้ TimeEntry.workItemId เป็น null; User delete cascade ลบ TimeEntries และ memberships/comments/notifications
- Indexes หลักอยู่บน filter fields ตามที่ระบุใน model sections; ไม่พบ composite index สำหรับ query แบบ project+status+date หรือ user+date

### Target review

เลือก composite indexes จาก query จริง เช่น `WorkItem(projectId,status)`, `WorkItem(role,status)`, `TimeEntry(date)`, `TimeEntry(workItemId,date)` และ `Project(customerId,status)` หลังดู `EXPLAIN ANALYZE` บนข้อมูลที่เป็นตัวแทน ไม่เพิ่ม index ทุก combination โดยไม่วัดผล

## 6. Schema change process

1. สร้าง DB backup และทดสอบ restore ก่อนเปลี่ยน schema สำคัญ
2. สร้าง Prisma schema change และตรวจ generated SQL/data-loss warning
3. หากมี data transformation ให้ทำ staged backfill และรายงาน record ที่ map ไม่ได้
4. สำหรับ production พิจารณาเปลี่ยน `db push` เป็น versioned migration เมื่อทีมพร้อม; ปัจจุบัน repository ใช้ safe `db push`
5. deploy additive nullable field/table ก่อน; backfill; validate; แล้วค่อยเพิ่ม not-null/unique constraints
6. ตรวจ `/api/health`, row counts, API และเมนูที่พึ่ง field หลัง rollout

ขั้นตอนใช้งาน Compose/DB ที่มีอยู่ดูใน [DEPLOYMENT.md](./DEPLOYMENT.md) และ [document/process/db.md](./process/db.md)

