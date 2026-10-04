# SQL schema, numeric IDs and migrations — Issue #31

วันที่ 2026-10-04. ระบบใช้ `Asia/Bangkok`.

## ขอบเขต

Issue นี้เพิ่ม SQL target สำหรับฐานข้อมูลว่างและ runner ที่รันกับเป้าหมายที่ระบุชัดเจน. แอปที่ใช้งานยังอ่าน `prisma/schema.prisma` ซึ่งใช้ `cuid()`. Compose migration ยังเรียก rollout gate แล้ว `prisma db push`.

ไฟล์ที่ควบคุม DDL ของ target นี้มีไฟล์เดียวคือ `database/schema.sql`. `database/migrations/manifest.json` revision `31.0.0` อ้างไฟล์นั้นเป็น migration `0001` ชื่อ `initial_schema` ชนิด `baseline_snapshot`. ไม่มีสำเนา DDL อีกชุด.

รายละเอียดการตัดสินใจอยู่ที่ [SQL database decisions](../../database/SQL_DATABASE_DECISIONS.md). คอลัมน์และ FK อยู่ที่ [schema dictionary](../../database/SQL_SCHEMA_DICTIONARY.md). โมเดลที่แอปใช้อยู่ยังอธิบายใน [data model](./data-model.md).

## โครงสร้างตารางและ External Integration

SQL target ปัจจุบันคง 11 business tables ที่โค้ดอ่าน/เขียนหรือ query ผ่าน Project DELETE guard และ `schema_migrations`. ตัด `Comment`, `Notification` และ `legacy_id_mapping` ซึ่งไม่มี query ปัจจุบัน. ชื่อตารางใช้ plural snake_case, ชื่อ column/enum/index ใช้ snake_case และทุก table/column มี `COMMENT ON`. Active Prisma ยังใช้ชื่อเดิม; ดู mapping และหลักฐานการใช้ใน [schema dictionary](../../database/SQL_SCHEMA_DICTIONARY.md).

External integration ใช้ `external_project_mappings` พร้อม `provider` (default gitlab), `instance_url`, `external_project_id`; references ใช้ `external_issue_id` และ `external_issue_number`. Unique source keys รวม provider/instance เพื่อให้ GitLab/GitHub IDs อยู่ร่วมกันได้. Snapshot มี 12 tables/145 columns และ comments ครบ. Active importer ยังเป็น GitLab; #33 ต้องเพิ่ม provider ให้ ORM, map compound identities และกรอง GitLab queries/mutations ด้วย provider=gitlab ก่อนใช้ schema นี้กับ runtime. การปรับครั้งนี้ยังไม่ได้ implement GitHub sync.

## การทำงานของ Migration Runner (`scripts/sql-migrate.mjs`)

`scripts/sql-migrate.mjs` มีห้าคำสั่ง.

| คำสั่ง | ต้องมี target | พฤติกรรม |
|---|---|---|
| `inspect` | ไม่ | อ่าน manifest และ checksum โดยไม่ต่อฐานข้อมูล |
| `status` | ใช่ | อ่าน history แล้วรายงาน version ที่ apply แล้ว |
| `plan` | ใช่ | รายงาน version ที่ยังไม่ apply โดยไม่เขียน |
| `empty-bootstrap` | ใช่ | ใช้ได้เมื่อ `public` ไม่มีตาราง |
| `upgrade` | ใช่ | ใช้เมื่อมี `schema_migrations` แล้วและมี version ค้าง |

Target เป็น `docker:<container>` หรือ URL ที่ขึ้นต้น `postgresql://` / `postgres://`. ต้องมี `--target-label` ที่ขึ้นต้นด้วยตัวอักษรเล็กและยาวไม่เกิน 41 ตัว. Runner ปฏิเสธเมื่อ host, port และชื่อ database ตรงกับ `DATABASE_URL` และปฏิเสธ container `pms-postgres-local`, `pms-postgres-dev`, `pms-postgres-uat`, `pms-postgres-prod` รวม `pms-postgres-$APP_ENV`. Password ใน URL ส่งผ่าน `PGPASSWORD` ไม่ใส่ใน argv. Runner ไม่ได้อ่าน root `.env`.

แต่ละการ apply อยู่ใน transaction เดียว: `lock_timeout` 5000 ms, `statement_timeout` 120000 ms, `TIME ZONE Asia/Bangkok`, `pg_advisory_xact_lock` และแถว history. Checksum เดิมทำให้รอบถัดไปข้าม. Checksum ที่เปลี่ยนทำให้หยุดก่อนรันสคริปต์. ฐานข้อมูลที่มีตารางแต่ไม่มี history ถูกปฏิเสธ. ฐานข้อมูลว่างต้องใช้ `empty-bootstrap` ไม่ใช่ `upgrade`.

ข้อความ error ตัด URL ของ PostgreSQL ออก. ความล้มเหลวของสคริปต์หรือการถูกตัด backend ใน transaction ไม่เหลือแถว history.

### ข้อผิดพลาดและการวินิจฉัย (Troubleshooting)

| ข้อผิดพลาด | สาเหตุที่เป็นไปได้ | การวินิจฉัยและการแก้ไข |
|---|---|---|
| `Refusing the active application database target` | Target ชี้ไปยัง host, port และ database เดียวกับ `DATABASE_URL` หรือเป็น app container เช่น `pms-postgres-dev` | ตรวจสอบ target; runner อนุญาตเฉพาะ isolated test target เพื่อป้องกันการแก้ schema ของแอปโดยตรง |
| `Bootstrap target is not empty` | สั่ง `empty-bootstrap` บนฐานข้อมูลที่มีตารางใน `public` schema อยู่แล้ว | ตรวจสอบตารางใน DB หากมีประวัติ migration แล้วให้ใช้ `upgrade` หรือ `status` หากเป็น DB ทดลองให้ drop schema public แล้วสร้างใหม่ |
| `Unsupported baseline on a populated database` | ฐานข้อมูลมีตารางอยู่แล้วแต่ไม่มีตาราง `schema_migrations` | ระบบไม่สนับสนุน baseline marker บนฐานข้อมูลที่มีข้อมูลโดยไม่ผ่านการ bootstrap ที่ตรวจแล้ว |
| `Applied checksum mismatch for migration XXXX` | Checksum ของ script ใน manifest หรือ disk ไม่ตรงกับที่เคยบันทึกในตาราง `schema_migrations` | Script เดิมถูกแก้ไขย้อนหลัง; ห้ามแก้ script ที่ apply แล้ว ให้ตรวจสอบ drift หรือใช้ fixture ใหม่ |
| `lock timeout` | มี session อื่นถือ lock หรือมี runner อีกตัวกำลังทำงานพร้อมกัน | Runner รอ advisory lock ได้สูงสุด 5000 ms; ตรวจสอบ `pg_locks` หรือรอให้ transaction อื่นจบ |
| `ActivityLog cannot be updated or deleted` | มีคำสั่ง UPDATE/DELETE บน `activity_logs` หรือพยายามลบ User/Project ที่มี log อ้างถึง | `activity_logs` เป็น append-only และ foreign key เป็น RESTRICT ห้ามลบข้อมูลต้นทางที่มี log อ้างอิง |

## เวลาและตัวเลข

นาฬิกา local ทับค่าที่ client ส่งในการเขียนปกติ. การ import ที่ต้องรักษาเวลาต้นทางตั้งค่านี้ใน transaction เดียว:

```sql
SELECT set_config('pms.preserve_source_timestamps', 'on', true);
```

ค่านี้ยังไม่จำกัดตาม role. เวลา local ที่ไม่ได้ส่งมาจะใช้เวลาตอนโหลด.

ทุก table มี numeric `id` สำหรับ PK/FK และ immutable UUIDv4 `public_id` สำหรับ API/frontend. `scripts/sql-id.mjs` มี parsePublicId/serializePublicId สำหรับ canonical public UUID; parseDecimalId/serializeDecimalId ใช้เฉพาะ restricted internal tooling. #33 ต้อง resolve UUID → authorized row และสร้าง explicit DTO ไม่ส่ง numeric PK/FK รวม nested relations. ยังไม่มี active route ที่ใช้สัญญาใหม่. Legacy mapping มี newId + newPublicId; เรียง createdAt/oldId ตาม code point และ persist/reuse UUID เดิมก่อนรัน conversion ซ้ำ. ดู [public identifier contract](../../database/PUBLIC_IDENTIFIERS.md).

## คำสั่งตรวจ

Unit suite ไม่เปิด PostgreSQL, Redis, Docker หรือ network:

```powershell
pnpm test:sql-schema
node tests/run.mjs sql-schema
bash scripts/test-unit.sh sql-schema
```

หลักฐาน catalog, sequence, FK, trigger และ transaction ใช้ PostgreSQL 16 จริงใน container ชั่วคราว. คำสั่งนี้สร้าง `postgres:16-alpine` แบบ `--network none`, trust authentication และไม่ publish port แล้วลบ container:

```powershell
pnpm test:sql-migrations-docker
node tests/run.mjs sql-migrations-docker
```

`pnpm test` จะเห็นไฟล์ Docker แต่ข้ามเคสจนกว่าจะใช้คำสั่งเฉพาะด้านบน. `bash scripts/test-unit.sh` ปฏิเสธ suite `sql-migrations-docker`. ไม่มี Makefile ใน repository.

ตรวจ manifest โดยไม่ต่อฐานข้อมูล:

```powershell
node scripts/sql-migrate.mjs inspect
```

ตัวอย่าง bootstrap ใช้ได้เฉพาะ container ทดลองที่สร้างเองและไม่มีข้อมูลติดตั้ง:

```powershell
node scripts/sql-migrate.mjs empty-bootstrap --target docker:<isolated-container> --target-label sql31-lab
```

ห้ามใช้ชื่อ container ของ `APP_ENV` และห้ามใช้ URL จาก root `.env`.

## สิ่งที่ยังไม่เกิดขึ้น

#31 ไม่ได้ migrate, seed, reset หรือ deploy. ไม่ได้เปลี่ยน entrypoint, Prisma schema หรือ JSON seed. แถว SQL seed ของ backup อยู่ที่ [Issue #32](./issue-32-sql-master-seeds.md) และยังไม่ถูก apply เข้าแอป. #33 ยังไม่ได้สลับแอปมาใช้ internal numeric keys/public UUID API boundary. Downgrade อัตโนมัติไม่มี.

SonarQube scanner, `SONAR_HOST_URL` และ `SONAR_TOKEN` ไม่พบในเครื่องนี้ จึงยังไม่มีผล quality gate ของ issue นี้.
