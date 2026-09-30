# Database data model

## ภาพรวม

Prisma ใช้ PostgreSQL. API ปัจจุบันอ่าน/เขียน model หลักด้านล่าง โดย `WorkItem` map ไปยังตารางจริง `work_items`; model อื่นใช้ชื่อ table ตาม Prisma model. ไม่มี migration history แบบ versioned migrations ใน repository ที่ตรวจพบ; Compose migrations service ใช้ guarded `prisma db push`.

## ตารางและความสัมพันธ์

| Prisma model / table | ความสัมพันธ์และ API use |
| --- | --- |
| `User` / `User` | `getOwner()` อ่าน User ที่ยืนยันแล้ว; `/api/users` คืน owner. User เชื่อม WorkItem และ TimeEntry; `password` ไม่ถูก select/ส่งออก |
| `Company` / `Company` | หลาย Company; Project อ้าง Company หนึ่งรายการผ่าน `Project.companyId`. Company collection คำนวณจำนวน Project, WorkItem และชั่วโมง TimeEntry |
| `Project` / `Project` | เก็บชื่อ, สถานะ, priority, date และ `companyId`; relation `Company` ใช้ `onDelete: Restrict`. Project เป็น parent ของ WorkItem และ TimeEntry |
| `WorkItem` / `work_items` | ต้องอ้าง Project และ assignee User; มี status, priority, type, role และ date. API list/detail/create/update/import กรองหรือกำหนด assignee จาก owner |
| `TimeEntry` / `TimeEntry` | เก็บชั่วโมง, วันทำงาน, User และ relation ไป Project/WorkItem. WorkLog APIs scope ด้วย `userId` ของ owner; `projectId` และ `workItemId` nullable ตาม schema แต่ POST API กำหนดให้มีทั้งคู่ |
| `ProjectMember`, `Comment`, `Document`, `Milestone`, `ActivityLog`, `Notification` | มีอยู่ใน schema แต่ไม่ใช่ user-facing API ปัจจุบัน. Project deletion ตรวจจำนวน `members`, `documents`, `milestones`, `activityLogs` ด้วย |

เส้นทางข้อมูลหลักคือ `Company → Project → WorkItem → TimeEntry`. Project summary คำนวณจาก WorkItem และ TimeEntry ตอนอ่าน; Company summary รวมค่าจาก Projects ของ Company. ค่าชั่วโมงใช้ Decimal และรวมโดยไม่ปัดแต่ละแถวก่อน

## วันที่และเวลา

- Runtime และ PostgreSQL session กำหนด `Asia/Bangkok`.
- Project date fields เป็น PostgreSQL `DATE`; API ใช้ `YYYY-MM-DD`.
- WorkItem date fields และ TimeEntry date เป็น Prisma `DateTime`.
- WorkLog APIs parse date-only หรือ timestamp ที่ลงท้าย `+07:00`, query วันด้วยช่วงเริ่มรวม/วันถัดไปไม่รวม และ serialize วันที่/เวลาเป็น `+07:00`.
- Company/Project API serialize timestamp ด้วย `+07:00`; date-only ของ Project ส่งเป็น `YYYY-MM-DD`.

การ parse/serialize WorkItem timestamp ให้ตรวจ route และ schema ปัจจุบันโดยตรง เนื่องจาก API ใช้ JSON serialization ของ Prisma DateTime และไม่ได้ใช้ Bangkok serializer เดียวกับ WorkLog. อย่าสมมติว่า contract เป้าหมายใน [API.md](../../API.md) มีผลกับทุก route แล้ว

## Constraints สำคัญ

- Project ต้องมี Company; `onDelete: Restrict`.
- WorkItem ต้องมี Project และ assignee; Project deletion ใช้ restrict.
- TimeEntry มี User เสมอ; Project restrict; WorkItem deletion ตั้ง relation เป็น `SetNull`.
- Project API ปฏิเสธการลบเมื่อมี WorkItems, TimeEntries หรือ child history ที่นับใน handler.
- Company API ปฏิเสธการลบ Dhas Company และ Company ที่ยังมี Projects.
- WorkItem/TimeEntry ownership เป็น owner ID ที่ resolve ฝั่ง server ไม่ใช่ค่าที่ client ใช้เลือกเจ้าของ.

## Verification และ operations

- ตรวจ schema: `pnpm exec prisma validate`.
- Runtime unit/API contract tests: `pnpm test:company-projects`, `pnpm test:auth`.
- ขั้นตอน backup, isolated restore, schema rollout และการใช้ DB tools อยู่ใน [Database Rollout](../../DATABASE_ROLLOUT.md), [DB operations](../../process/db.md) และ [Docker operations](../../process/docker.md).
