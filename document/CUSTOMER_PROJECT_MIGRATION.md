# Customer and Project Data Migration Contract

| รายการ | ค่า |
| --- | --- |
| Issue | #12 — Specify Customer and Project Data Migration |
| Role | SA |
| สถานะ | Target contract and rollout plan; not yet applied to any database |
| แหล่งอ้างอิง | [DATABASE.md](./DATABASE.md) · [DATABASE_MAPPING.md](./DATABASE_MAPPING.md) · [DEPLOYMENT.md](./DEPLOYMENT.md) · [Shared Data Model](./SHARED_DATA_MODEL.md) |

เอกสารนี้กำหนดวิธีนำ Customer เข้าสู่ข้อมูล Project เดิมโดยมีหลักฐานตรวจสอบได้ และวิธีป้องกัน external identity ซ้ำ เป็นแผนสำหรับฐานข้อมูลแต่ละ environment ที่ได้รับอนุมัติ ไม่ใช่ผลสำรวจหรือการยืนยันข้อมูลจริงใน UAT/Production

## 1. As-Is baseline และขอบเขต

- อ้างอิง `prisma/schema.prisma` ใน repository: ยังไม่มี `Customer`, `Project.customerId`, `GitLabProjectMapping` หรือ `ExternalWorkItemReference`.
- `Project.id` เป็น primary key; `WorkItem.projectId` required; `TimeEntry.projectId` และ `TimeEntry.workItemId` nullable ใน schema ปัจจุบัน.
- การลบ Project ปัจจุบัน cascade ไป WorkItem และ TimeEntry; การลบ WorkItem ตั้ง `TimeEntry.workItemId` เป็น null. ต้องไม่ใช้ behavior นี้ระหว่าง backfill.
- repository ใช้ guarded `prisma db push` ผ่าน `scripts/db-push-safe.sh` และยังไม่พบ versioned migration history. แผนนี้จึงใช้ schema rollout แบบ compatibility สองช่วง; ต้องตรวจ schema diff ที่จะ apply ทุกครั้ง.
- ไม่มี Project inventory หรือ Customer mapping ที่ยืนยันแล้วใน repository. ห้ามใช้ seed/sample data, ชื่อคล้ายกัน หรือค่าเดาเป็นหลักฐานแทนข้อมูลจาก environment เป้าหมาย.

Issue #12 กำหนดสัญญาและขั้นตอนเท่านั้น: ไม่เชื่อมต่อหรือเปลี่ยนฐานข้อมูลจริง และไม่สร้าง Customer หรือ GitLab mapping ตัวอย่าง

การ backfill Customer/Project ใน issue นี้ต้องแก้เฉพาะ `Project.customerId` และคงค่าวัน/เวลาเดิมทุกแถว ห้ามแปลง timezone ใน migration นี้. การปรับข้อมูลเก่าให้ตรงกับ Bangkok wall-clock ต้องแยกเป็น migration เฉพาะ หลังตรวจชนิด column, timezone ของ session และความหมายของค่าที่มีอยู่ พร้อมอนุมัติแผนก่อนเขียนข้อมูล.

## 2. Target data contract

### 2.1 Customer

ขั้นต่ำที่ต้องเก็บ:

| Field | กติกา |
| --- | --- |
| `id` | Primary key แบบ stable; ใช้ ID เดิมหลังสร้าง ห้ามสร้างใหม่ในแต่ละ backfill retry |
| `name` | Required, trim แล้วต้องไม่ว่าง; ต้องมาจากข้อมูลลูกค้าที่ผู้ดูแลยืนยัน |
| `status` | Required: `active` หรือ `inactive`; inactive ใช้เก็บประวัติและห้ามเลือกผูก Project ใหม่ |
| `createdAt`, `updatedAt` | Audit timestamps |
| `code`, contact fields, address, website, notes | Optional; เพิ่มเมื่อมีข้อมูลยืนยันเท่านั้น ไม่เป็นเงื่อนไขในการ map |

ชื่อไม่ใช่ unique identity และห้าม merge Customer อัตโนมัติด้วยชื่อเพียงอย่างเดียว. การเปลี่ยนชื่อไม่เปลี่ยน `Customer.id`. Customer ที่ Project อ้างอยู่ห้าม hard-delete; เปลี่ยนเป็น inactive เพื่อรักษาประวัติ. Customer ที่ไม่มี Project อ้างถึงจะลบได้เมื่อผ่านการตรวจ FK และการอนุมัติตามขั้นตอนปฏิบัติการ.

### 2.2 Project, work history และ referential rules

- Target: `Customer` 1:N `Project`; `Project.customerId` required และอ้าง Customer หลักหนึ่งรายพอดี.
- ระหว่าง backfill `Project.customerId` nullable ได้เฉพาะใน schema compatibility stage. ก่อนบังคับ NOT NULL ต้องไม่มี Project ที่ไม่มี mapping หรือ Customer ที่ไม่มีอยู่จริง; Customer inactive อาจคง relation ของ Project เดิม แต่ห้ามใช้กับการสร้าง/เปลี่ยน Customer ของ Project ใหม่.
- Project IDs, WorkItem IDs, TimeEntry IDs, foreign keys ที่มีอยู่, timestamps, descriptions, statuses, dates, decimal hours, และ row counts ต้องคงเดิม. Backfill แก้เฉพาะ `Project.customerId`; ห้ามสร้าง WorkItem/TimeEntry สำเนา, เปลี่ยน parent IDs, หรือลบ/ย้ายประวัติ.
- ห้าม hard-delete Project ที่มี WorkItem, TimeEntry หรือ dependent history. As-Is cascade ต้องถูกปิดกั้นโดย API และแผน schema/referential action ที่ผ่าน review ก่อนเปิด Customer/Project delete; จนกว่าจะมี archive contract ให้ reject การลบที่มี references.
- ลบ/แก้ GitLab Project mapping ต้องไม่ลบ Customer, Project, WorkItem หรือ TimeEntry.

### 2.3 GitLab external identity

GitLab Issue identity คือ tuple ต่อไปนี้ ไม่ใช่ URL, Issue IID, title หรือ label:

```text
(provider = "gitlab", canonical instance URL, GitLab Project ID, global Issue ID)
```

- Canonical instance URL: URL แบบ absolute ของ scheme + host + optional base path; normalize scheme/host เป็น lowercase และตัด trailing slash ก่อน persist. URL ต่าง instance ต้องแยก identity; ห้ามลบ base path ของ self-managed instance.
- `GitLabProjectMapping` ต้อง unique ที่ `(canonical instance URL, GitLab Project ID)` และชี้ PMS `Project.id` ที่มี Customer แล้ว.
- `ExternalWorkItemReference` ต้อง unique ที่ `(provider, canonical instance URL, GitLab Project ID, global Issue ID)`. ระยะแรก `workItemId` ก็ unique เพื่อให้ WorkItem หนึ่งรายการมี source reference เดียว.
- บันทึก global Issue ID เป็นตัวเลข/ข้อความตาม API โดยไม่แปลงจนเกิด precision loss; เก็บ Issue IID และ source URL เพิ่มได้เพื่อแสดงผล แต่ใช้ IID/URL เป็น identity ไม่ได้.
- Upsert ต้องทำใน transaction โดยอาศัย unique constraint เป็น final race guard. หาก concurrent insert ชน constraint ให้โหลด reference ที่มีอยู่และอัปเดต WorkItem เดิม; ห้ามสร้าง WorkItem ที่สอง. หาก tuple เดิมชี้ `workItemId` อื่น ให้รายงาน conflict และไม่เขียนทับ.
- Mapping/reference ไม่มี GitLab token หรือ secret. การลบ mapping ไม่ลบ external reference หรือ imported history โดยปริยาย.

## 3. Auditable legacy Project mapping register

หนึ่งแถวต่อ `Project.id` จาก inventory ของ environment ที่กำลัง rollout. เก็บ register เป็น run artifact ในที่เก็บควบคุมสิทธิ์ของเจ้าของ ไม่ commit ชื่อลูกค้าจริงหรือข้อมูลฐานข้อมูลลง source control.

| Column | Required use |
| --- | --- |
| `environment`, `snapshot_id`, `captured_at` | ระบุ environment และ snapshot/inventory รอบที่ใช้ |
| `project_id`, `project_name_as_seen` | ระบุ Project เดิมอย่างไม่กำกวม; `project_id` เป็น key |
| `customer_id`, `customer_name_confirmed` | Customer target ที่ผู้มีอำนาจยืนยัน; ห้ามใช้ชื่ออย่างเดียวเป็น join key |
| `evidence_reference` | ที่มาที่ตรวจซ้ำได้ เช่น approved business record/ticket; ห้ามใส่ secret |
| `decision` | `approved`, `unmapped`, `ambiguous`, หรือ `rejected` |
| `reviewed_by`, `reviewed_at`, `notes` | ผู้ทบทวน, เวลา, เหตุผล/ข้อจำกัด |

Header template (ยังไม่มี row จริง):

```csv
environment,snapshot_id,captured_at,project_id,project_name_as_seen,customer_id,customer_name_confirmed,evidence_reference,decision,reviewed_by,reviewed_at,notes
```

ก่อน migrate ต้องเทียบ register กับ Project inventory จาก DB เป้าหมายแบบ exact set equality: Project ทุก ID ปรากฏครั้งเดียว, ไม่มี ID เกิน/ขาด/ซ้ำ, และทุก row เป็น `approved` พร้อม Customer ID ที่ resolve ได้. `unmapped`, `ambiguous`, `rejected`, หลักฐานขาด หรือ Customer ที่ไม่ยืนยันให้ถือเป็น blocker; ห้ามใส่ “Unknown”, “Default”, หรือ Customer จาก seed เพื่อผ่าน gate. รายงานจำนวนและ Project IDs ที่ block แยกไว้ใน run artifact โดยไม่เปิดเผยข้อมูลเกินจำเป็น.

## 4. Staged rollout

ทำทีละ environment; ยืนยัน `APP_ENV`, database identity, application/schema revision และผู้อนุมัติก่อนทุกขั้น. ใช้ `document/process/db.md` และ `scripts/db-manage.sh` สำหรับ operations ที่รองรับ environment นั้น.

### Stage 0 — inventory, backup, restore rehearsal

1. ใช้ read-only queries ต่อ environment ที่อนุมัติ เก็บ exact Project ID/name inventory และ baseline counts: Project, WorkItem, TimeEntry; ตรวจ FK/orphan เดิมและ dependencies ของ Project. บันทึก snapshot/time และ query revision. ตรวจ column types และ timezone ของ database/session; ห้ามสมมติว่าค่าวันเวลาเดิมเป็น Bangkok หากยังไม่มีหลักฐาน.
2. เตรียม Customer registry จากข้อมูลที่ยืนยัน และทำ mapping register ให้ครบ/อนุมัติตาม §3. หยุดก่อน schema change หากมี unresolved rows.
3. สร้าง full database backup ก่อนเปลี่ยน schema; บันทึก environment, timestamp, backup path, size และ checksum ใน run record. เก็บ backup ในพื้นที่จำกัดสิทธิ์ แยกจาก volume/database ที่จะเปลี่ยน.
4. Restore backup ไป isolated database ด้วยขั้นตอนใน `document/process/db.md`; ตรวจว่าฐานข้อมูลเปิดได้, schema/row counts สำคัญตรง baseline และ FK check ผ่าน. Backup ที่ยังไม่ผ่าน restore rehearsal ไม่ถือว่าพร้อม.

### Stage 1 — additive, nullable schema

1. เพิ่ม Customer และ relations พร้อม `Project.customerId` nullable; เพิ่ม target GitLab mapping/reference tables และ unique keys ตาม §2.3 แบบ additive.
2. ใช้ Prisma schema ที่ผ่าน review กับ guarded `db-push-safe` ตาม deployment runbook; ตรวจ generated diff/คำเตือนก่อน apply. ห้ามใช้ force/reset/accept-data-loss flags.
3. ตรวจว่า Project/WorkItem/TimeEntry row counts และ IDs คงเดิม และ app version เดิมยังอ่าน/เขียนได้ตาม compatibility ที่ยืนยันไว้. ถ้าไม่ compatible ให้หยุดก่อน backfill.

### Stage 2 — Customer registry และ Project backfill

1. Insert Customer จาก approved registry ด้วย stable ID; การ retry ใช้ Customer ID เดิมและไม่สร้างซ้ำ. ตรวจชื่อ required และ status เป็น `active`/`inactive`.
2. Apply mapping จาก register โดย join ด้วย `Project.id` และ `Customer.id` เท่านั้น; update เฉพาะ `Project.customerId`. ทำ transaction ต่อ batch ที่ขอบเขตชัดเจนและเก็บ run log ของ counts/IDs ที่เปลี่ยน.
3. ทำซ้ำได้อย่างปลอดภัย: Project ที่ผูก Customer ID เดิมให้เป็น no-op; ถ้าเจอ Customer ID ต่างจาก approved mapping ให้รายงาน conflict และหยุด record นั้น ห้าม overwrite เงียบ ๆ.
4. ห้ามสร้าง GitLab reference จากข้อมูลไม่ครบ. เมื่อ import phase เริ่มภายหลัง ให้ enforce unique tuple ใน DB ก่อนรับ sync traffic.

### Stage 3 — validation gate แล้วค่อย require

ผ่านทุกข้อก่อนแก้ schema ให้ `Project.customerId` required:

1. Project inventory IDs ตรงกับ mapping register แบบ exact set; ทุก Project มี Customer เดียว, Customer FK resolve ได้ และไม่มี `customerId IS NULL`.
2. ไม่มี duplicate mapping rows, Customer IDs ที่ไม่มีหลักฐานอนุมัติ, หรือการเปลี่ยน Customer จาก approved register.
3. Project/WorkItem/TimeEntry counts และ IDs เทียบกับ baseline; `WorkItem.projectId`, `TimeEntry.workItemId`, และ `TimeEntry.projectId` ไม่ถูก backfill นี้เปลี่ยน. เทียบ date/time values แบบ exact ก่อน/หลัง รวม nulls และ DB precision: `Project.startDate/dueDate/createdAt/updatedAt`, `WorkItem.workDate/dueDate/submittedAt/createdAt/updatedAt`, และ `TimeEntry.date/createdAt/updatedAt` ต้องไม่เปลี่ยน. ตรวจ legacy null/mismatch แยกเป็น report; ห้ามแก้เงียบ ๆ ใน migration นี้.
4. Referential integrity checks ผ่าน; GitLab mapping/external reference unique tuple ไม่มี duplicates; ทุก reference ชี้ WorkItem เดียวและ mapping ชี้ Project ที่มี Customer.
5. บันทึกผล query, counts, mismatch/orphan report (ต้องเป็นศูนย์สำหรับ migration gate), operator/reviewer และเวลา.

จากนั้น promote Prisma field เป็น required และ apply reviewed schema change ด้วย guarded rollout. หาก gate ใดไม่ผ่าน ให้คง nullable schema, ห้ามเปิด code path ที่บังคับ Customer สำหรับ legacy Project, แก้ register/source decision ก่อน แล้วรัน validation ซ้ำ.

### Stage 4 — post-rollout verification

- ตรวจ migration service exit status, `/api/health`, Project read/create/update, Customer relation, และ WorkItem/TimeEntry IDs/counts บน environment ที่อนุมัติ.
- ตรวจ Project listing/API ไม่ส่ง Project กำพร้า; create/update ใหม่ต้องรับ Customer ที่ active และคืน validation/conflict ที่ระบุสาเหตุได้.
- เก็บ migration run record, approved register, backup reference/checksum, restore evidence, pre/post counts, queries/revision และ exception report ตาม retention policy.

## 5. Failure and recovery

| Failure point | Recovery contract |
| --- | --- |
| ก่อน backup/restore rehearsal ผ่าน | ห้ามเปลี่ยน schema/data; แก้ backup/restore จนผ่าน |
| Additive schema apply ล้มเหลว | หยุด release; เก็บ logs ที่ไม่เปิด secret; ตรวจ schema จริงและทำ forward repair ที่ review แล้ว. ห้าม reset/drop tables |
| Backfill พบ conflict/unmapped | หยุด batch/rollout; nullable stage คงอยู่; เก็บ row IDs และสาเหตุ; แก้ mapping ด้วยหลักฐานและ reviewer แล้ว retry เฉพาะ approved IDs |
| Validation gate ไม่ผ่าน | ห้าม enforce NOT NULL หรือเปิด writes ที่สมมติว่า relation required; reconcile กับ baseline/register แล้วรัน gates ใหม่ |
| Required constraint apply ล้มเหลว | เก็บ schema/data state; หยุด promotion และ deploy compatible app; ทำ forward repair หลังตรวจ cause. ห้าม drop customer rows/constraints แบบอัตโนมัติ |
| Post-rollout application regression หรือ data corruption | หยุด writes ที่เกี่ยวข้องและเก็บ snapshot/backup ของ state ปัจจุบันก่อน recovery. ทดสอบ restore backup ใน isolated DB, เปรียบเทียบ post-backup writes แล้วให้เจ้าของอนุมัติ downtime/RPO ก่อน restore database replacement. ห้าม restore ทับข้อมูลใหม่โดยไม่มี reconciliation/อนุมัติ |

Rollback ระดับ app อาจทำได้เฉพาะ version ที่อ่าน schema แบบ nullable/compatible. การ restore database เป็น recovery ที่อาจทิ้ง writes หลัง backup; ไม่มี automatic schema downgrade หรือรับประกัน zero data loss. รักษา Customer rows, mapping register และ audit artifacts ระหว่างแก้เหตุการณ์.

## 6. Completion gates

Migration ใน environment หนึ่งถือว่าสำเร็จเมื่อ mapping coverage เป็น 100%, orphan/ambiguous counts เป็น 0, required constraint ผ่าน, history IDs/counts ตรง baseline, uniqueness ผ่าน และมี backup restore evidence กับ recovery record. สถานะของ repository/เอกสารไม่ยืนยันว่า environment ใด migrate แล้ว; บันทึกผลจริงแยกตาม environment.
