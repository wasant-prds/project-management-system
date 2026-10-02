# Database data model

## ภาพรวม

Prisma ใช้ PostgreSQL. API ปัจจุบันอ่าน/เขียน model หลักด้านล่าง โดย `WorkItem` map ไปยังตารางจริง `work_items`; model อื่นใช้ชื่อ table ตาม Prisma model. ไม่มี migration history แบบ versioned migrations ใน repository ที่ตรวจพบ; Compose migrations service ใช้ guarded `prisma db push`.

Issue #18 ใช้ `Company → Project`: schema ปัจจุบันไม่มี `Customer` model และ `Project.companyId` เป็น required. ข้อความนี้ยืนยันเฉพาะ Prisma schema/API ใน repository; สถานะ physical tables หรือ rows ใน database ของแต่ละ environment — รวมถึงจำนวน Projects ที่ผูกกับ Dhas — **ไม่พบข้อมูลที่ยืนยันได้จาก implementation ปัจจุบัน**.

**ชื่อ table สำหรับ Company summary ยังต้องยืนยัน:** Company collection raw query อ้าง `"WorkItem"`, ขณะที่ Prisma model ระบุ `@@map("work_items")`. การทดสอบ API ใช้ mocked query; physical table ที่มีอยู่ใน environment จริง **ไม่พบข้อมูลที่ยืนยันได้จาก implementation ปัจจุบัน**. นี่เป็นความต่างที่พบใน source; ผลต่อ database จริงยังไม่ได้ตรวจ.

## ตารางและความสัมพันธ์

| Prisma model / table | ความสัมพันธ์และ API use |
| --- | --- |
| `User` / `User` | `getOwner()` อ่าน User ที่ยืนยันแล้ว; `/api/users` คืน owner. User เชื่อม WorkItem และ TimeEntry; `password` ไม่ถูก select/ส่งออก |
| `Company` / `Company` | เก็บ `code`, `name`, `displayName`, ที่ตั้ง, ข้อมูลติดต่อ และรายละเอียด; `code` unique แต่ nullable เพื่อสงวน `dhas`. หนึ่ง Company มีหลาย Projects. Company collection คำนวณจำนวน Project, WorkItem และชั่วโมง TimeEntry |
| `Project` / `Project` | เก็บชื่อ, สถานะ, priority, date และ required `companyId`; Project แต่ละรายการอ้าง Company หนึ่งรายการ และ relation ใช้ `onDelete: Restrict`. Project เป็น parent ของ WorkItem และ TimeEntry |
| `WorkItem` / `work_items` | ต้องอ้าง Project และ assignee User; มี status, priority, type, role และ date. API list/detail/create/update/import กรองหรือกำหนด assignee จาก owner |
| `TimeEntry` / `TimeEntry` | เก็บชั่วโมง `Decimal(65,30)`, Bangkok calendar date, timestamps และ relation ไป Project/WorkItem. WorkLog APIs scope ด้วย `userId` ของ owner; API บังคับ WorkItem และ derive Project สำหรับ create/update แต่คอลัมน์ relation ยัง nullable เพื่อรักษา legacy rows ก่อน rollout audit |
| `ProjectMember`, `Comment`, `Document`, `Milestone`, `ActivityLog`, `Notification` | มีอยู่ใน schema แต่ไม่ใช่ user-facing API ปัจจุบัน. Project deletion ตรวจจำนวน `members`, `documents`, `milestones`, `activityLogs` ด้วย |

เส้นทางข้อมูลหลักคือ `Company → Project → WorkItem → TimeEntry`. Project summary คำนวณจาก WorkItem และ TimeEntry ตอนอ่าน; Company summary รวมค่าจาก Projects ของ Company. ค่าชั่วโมงใช้ Decimal และรวมโดยไม่ปัดแต่ละแถวก่อน

### Company เริ่มต้น Dhas

`lib/dhas-company.json` เป็น source สำหรับ Company เริ่มต้น: `code` ที่ service ใช้คือ `dhas`, `name` คือ `D.H.A. Siamwalla Ltd.`, `displayName` คือ `Dhas`, `location` คือ `Dan's Happy Square`, `address` คือ `202 Surawong Rd, Si Phraya, Bang Rak, Bangkok 10500`, `phone` คือ `02 668 0123`, และ `description` เป็นรายละเอียดภาษาไทยจาก configuration. Schema ไม่มี field สำหรับ Hours; ค่าอื่นที่ไม่ได้อยู่ใน JSON ไม่ได้ถูกกำหนดโดย default นี้.

`GET /api/company` เรียก `getOrCreateDhasCompany()` ก่อน list: หา Company ด้วย `code=dhas` หรือชื่อ Dhas, promote code ให้ record ชื่อที่ตรงเมื่อจำเป็น หรือสร้าง Dhas เมื่อไม่พบ. การพบ identity ซ้ำหรือ code ผูกกับชื่ออื่นทำให้ request ล้มเหลว. รายละเอียดอยู่ใน [Company collection](../api/company/collection.md).

### Backfill Projects เดิม

`scripts/company-project-backfill.mjs` มี `--check` และ `--apply <environment>`. Check ตรวจ conflict โดยไม่เขียนข้อมูล. Apply ตรวจ duplicate Dhas และ Company links ที่ขัดแย้ง, หา/สร้าง Dhas, จากนั้นกำหนด `companyId` ให้เฉพาะ Projects ที่ยังเป็น `NULL` ภายใน transaction `Serializable`; ตรวจซ้ำว่าไม่มี Project ค้าง unlinked. Script ระบุว่าจะคง `Project.updatedAt` และ business dates ไว้. การทำงานกับ live environment และจำนวน row จริงตรวจยืนยันจาก repository อย่างเดียวไม่ได้; ใช้ [Database rollout runbook](../../DATABASE_ROLLOUT.md) กับ backup/verification gates.

## วันที่และเวลา

- Runtime และ PostgreSQL session กำหนด `Asia/Bangkok`.
- Project date fields เป็น PostgreSQL `DATE`; API ใช้ `YYYY-MM-DD`.
- WorkItem date fields และ TimeEntry `date` ใช้ PostgreSQL `DATE` / Prisma `@db.Date`.
- TimeEntry `createdAt`/`updatedAt` ใช้ PostgreSQL `TIMESTAMP(3) WITHOUT TIME ZONE` / Prisma `@db.Timestamp(3)` และเขียนค่า Bangkok local wall-clock.
- WorkLog APIs parse date-only หรือ timestamp ที่ลงท้าย `+07:00`, query วันด้วยช่วงเริ่มรวม/วันถัดไปไม่รวม, serialize `date` เป็น `YYYY-MM-DD`, และ serialize timestamps เป็น `+07:00`.
- Company/Project API serialize timestamp ด้วย `+07:00`; date-only ของ Project ส่งเป็น `YYYY-MM-DD`.

การ parse/serialize WorkItem timestamp ให้ตรวจ route และ schema ปัจจุบันโดยตรง เนื่องจาก API ใช้ JSON serialization ของ Prisma DateTime และไม่ได้ใช้ Bangkok serializer เดียวกับ WorkLog. อย่าสมมติว่า contract เป้าหมายใน [API.md](../../API.md) มีผลกับทุก route แล้ว

## Constraints สำคัญ

- Project ต้องมี Company; `onDelete: Restrict`.
- WorkItem ต้องมี Project และ assignee; Project deletion ใช้ restrict.
- TimeEntry มี User เสมอ; Project/WorkItem deletion ตั้ง relation เป็น `Restrict`; legacy relation columns ยัง nullable แต่ WorkLog API ปฏิเสธการสร้างและอัปเดตแถวที่ไม่มี WorkItem.
- Project API ปฏิเสธการลบเมื่อมี WorkItems, TimeEntries หรือ child history ที่นับใน handler.
- Company API ปฏิเสธการลบ Dhas Company และ Company ที่ยังมี Projects.
- WorkItem/TimeEntry ownership เป็น owner ID ที่ resolve ฝั่ง server ไม่ใช่ค่าที่ client ใช้เลือกเจ้าของ.

## Verification และ operations

- ตรวจ schema: `pnpm exec prisma validate`.
- Runtime unit/API contract tests: `pnpm test:company-projects`, `pnpm test:auth`.
- Company/Project schema rollout tests: `pnpm test:database-rollout`, `pnpm test:database-rollout-docker` (Docker/PostgreSQL 16 required for the latter).
- ขั้นตอน backup, isolated restore, schema rollout และการใช้ DB tools อยู่ใน [Database Rollout](../../DATABASE_ROLLOUT.md), [DB operations](../../process/db.md) และ [Docker operations](../../process/docker.md).
