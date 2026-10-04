# SQL master seeds and backup conversion — Issue #32

วันที่ 2026-10-04. ระบบใช้ `Asia/Bangkok`.

## Overview

Issue นี้แปลง backup ที่ระบุเป็น SQL `INSERT` สำหรับ schema ของ [Issue #31](./issue-31-sql-schema.md). ไม่มี HTTP API และไม่มี background Job, queue หรือ scheduler สำหรับงานนี้. จุดเริ่มคือคำสั่งใน `scripts/sql-seeds.mjs`.

แอปที่ใช้งานยังอ่าน Prisma `cuid()` และ JSON seed ที่ `database/seeds/master`. SQL dataset ถูก stage ที่ `database/seeds/sql-master` และยังไม่ถูก apply เข้าฐานข้อมูลของแอป. การสลับ runtime เป็นงานของ Issue #33.

ไฟล์นโยบายที่ track ได้คือ `database/seed-policy/issue-32.json`. ไฟล์นี้อ้าง `document/COMPANY_PROJECT_DECISION.md` และ `lib/dhas-company.json`.

## Data flow

```text
inspect-archive / convert
→ ตรวจ gzip checksum และขนาด
→ parse COPY ใน process
→ ตรวจ legacy-id-map ถ้ามี
→ แปลงตาม policy
→ เขียน SQL, map, evidence และ manifest
```

`seed` ไม่ได้แปลงข้อมูลซ้ำ. มันอ่าน dataset ที่ stage ไว้แล้วส่งเข้า PostgreSQL 16 ที่ระบุด้วย `--target`.

`promote` ย้าย directory ของ dataset ไปยัง `--dest` ด้วย `rename`. ไม่มีค่า default ของปลายทาง.

## ตารางที่เกี่ยวข้อง

เป้าหมายคือ 11 business tables ของ Issue #31 บวก `schema_migrations` ที่ต้องมีแถว baseline อยู่แล้วก่อน seed. Seed ไม่สร้าง schema.

| ต้นทาง | จำนวน | ปลายทาง | จำนวน | การเขียน |
|---|---:|---|---:|---|
| `Company` | 1 | `companies` | 2 | Insert แถวต้นทาง 1 และแถว derived `dhas` 1 |
| `User` | 11 | `users` | 11 | Insert; `theme`/`locale` เป็นค่า synthetic |
| `Project` | 27 | `projects` | 27 | Insert และตั้ง `company_id` เป็น `dhas` |
| `ProjectMember` | 19 | `project_members` | 19 | Insert; `created_at`/`updated_at` คัดลอกจาก `joinedAt` |
| `work_items` | 286 | `work_items` | 286 | Insert; calendar date ตามนโยบายเวลา |
| ไม่มีใน backup | 0 | `external_project_mappings` | 0 | ไฟล์ว่าง ไม่สร้าง GitLab identity |
| ไม่มีใน backup | 0 | `external_work_item_references` | 0 | ไฟล์ว่าง ไม่สร้าง GitLab identity |
| `Milestone` | 4 | `project_milestones` | 4 | Insert; `due_date` คงเป็น timestamp |
| `Document` | 3 | `project_documents` | 3 | Insert URL เดิม; ไม่ตรวจไฟล์จริง |
| `TimeEntry` | 363 | `work_logs` | 363 | Insert; ผลรวม `hours` คือ 1828 |
| `ActivityLog` | 4 | `activity_logs` | 4 | Insert; `entity_id` เป็นข้อความต้นทาง |
| `Comment` | 3 | ไม่มีตาราง | 0 | นับเป็น excluded |
| `Notification` | 4 | ไม่มีตาราง | 0 | นับเป็น excluded |

รวมต้นทาง 725 แถว. นำเข้า 718, ไม่นำเข้า 7, เพิ่ม derived 1, ได้ปลายทาง 719 แถว.

`users.password_hash` ถูกคัดลอกจาก backup. คู่มือนี้ไม่แสดงค่า hash, email หรือเบอร์โทร.

## ความสัมพันธ์และข้อจำกัด

- PK/FK ใช้ numeric `id`. `public_id` เป็น UUIDv4 ที่บันทึกใน `legacy-id-map.json` และถูก reuse เมื่อแปลงซ้ำ.
- เรียงลำดับด้วย code point ของ `createdAt` แล้ว `oldId` ไม่ใช้ locale sort.
- Map ต้องครอบคลุมทุกแถว, เป็น `sourceScope=seed`, checksum และ revision ตรง backup และ `createdAt` ตรงแหล่งข้อมูล. ถ้าไม่ครบ จะหยุดก่อนสร้าง UUID ใหม่.
- Calendar date รับเฉพาะเวลา `00:00:00` หรือ `09:00:00`. `work_items.work_date` และ `due_date` มี 236 แถวที่ `09:00:00`, 49 แถวที่ `00:00:00` และ null 1 แถวต่อคอลัมน์.
- WorkItem `cpu5h1vk8unjmgbklwsp2w58p` คง `updated_at` ก่อน `created_at`.
- ActivityLog แถว `project` 1 แถว resolve ได้. แถว `task` 3 แถวไม่พบ work item และคง source id ใน `entity_id`.
- Timestamp ของบริษัท `dhas` เป็นค่า synthetic `2025-10-17 10:30:43.000`.

Dataset fingerprint ปัจจุบันคือ `ac791aba9ee7f2bc2e3c06d98524c4091ef87f8da89b75d366703e5c304a7ad2`. ค่านี้รวม checksum ของไฟล์ SQL, policy version, legacy map และ schema contract `31.0.0`.

## Transaction

`scripts/sql-seed-runner.mjs` ส่งสคริปต์เดียวเข้า `psql`:

1. `BEGIN`
2. `lock_timeout` 5000 ms, `statement_timeout` 120000 ms, `TIME ZONE Asia/Bangkok`
3. `pg_advisory_xact_lock(hashtext('pms_sql_seed'))`
4. `SET LOCAL pms.preserve_source_timestamps = 'on'`
5. ตรวจ `schema_migrations` ว่าเป็น version `0001`, revision `31.0.0` และ checksum ของ baseline
6. ตรวจว่า 11 business tables ว่าง
7. `INSERT`
8. `pms_align_identity` ทุก business table
9. `COMMIT`

`setval` ไม่ rollback. ถ้า transaction ล้มเหลว runner เรียก `pms_align_identity` เฉพาะตารางที่ `count(*) = 0`. ตารางที่ยังมีแถวจะไม่ถูกลด sequence.

Target ที่อนุญาตเป็น `docker:<container>` หรือ URL `postgresql://` / `postgres://` พร้อม `--target-label`. Runner ปฏิเสธ container `pms-postgres-local`, `pms-postgres-dev`, `pms-postgres-uat`, `pms-postgres-prod` และ `pms-postgres-$APP_ENV` รวม URL ที่ชี้ฐานเดียวกับ `DATABASE_URL`.

## คำสั่ง

| คำสั่ง | Flag ที่รับ | พฤติกรรม |
|---|---|---|
| `inspect-archive` | `--archive` | ตรวจ checksum แล้วพิมพ์จำนวนแถว. ไม่ตรง baseline แล้วออกด้วย error |
| `convert` | `--archive`, `--output`, `--mapping`, `--revision` | เขียน dataset. ค่า output เริ่มต้นคือ `database/seeds/sql-master` |
| `verify-dataset` | `--dir` | ตรวจ manifest checksum และ checksum ของไฟล์ SQL |
| `seed` | `--seed-dir`, `--target`, `--target-label` | ต้องมี target และ label. โหลดเข้าฐานที่ระบุ |
| `promote` | `--source`, `--dest`, `--confirm-active-master` | ต้องมี `--dest`. Flag สุดท้ายเป็น boolean และไม่มีค่าตามหลัง |

Flag ของคำสั่งอื่นถูกปฏิเสธ. ตัวอย่าง:

```powershell
node scripts/sql-seeds.mjs inspect-archive
node scripts/sql-seeds.mjs convert
node scripts/sql-seeds.mjs verify-dataset
node scripts/sql-seeds.mjs seed --seed-dir database/seeds/sql-master --target docker:<isolated-container> --target-label sql32-lab
node scripts/sql-seeds.mjs promote --source database/seeds/sql-master --dest database/seeds/sql-promoted
```

การเขียนทับ `database/seeds/master` ต้องเพิ่ม `--confirm-active-master` และควรทำเมื่อ Issue #33 พร้อมรับ SQL dataset เท่านั้น.

## Failure handling

| อาการ | สาเหตุ | การตรวจ |
|---|---|---|
| `Archive checksum or size does not match` | ไฟล์ backup ไม่ใช่ snapshot ที่กำหนด | หยุดก่อนเขียน dataset |
| `Legacy mapping file is invalid` หรือ `does not exist` | map เสีย หรือระบุ `--mapping` ที่ไม่มีไฟล์ | ไม่สร้าง UUID ใหม่ทับ map |
| `does not cover every` | map มีอยู่แต่ไม่ครบทุกแถว | หยุดก่อนเขียน |
| `Calendar time` | เวลาไม่ใช่ `00:00:00` หรือ `09:00:00` | หยุดก่อนเขียน |
| `Refusing the active application database target` | target เป็นฐานของแอป | ไม่มีการ query |
| `schema contract mismatch` | baseline ในฐานไม่ตรง revision/checksum | transaction rollback และยังไม่มีแถวธุรกิจ |
| `lock timeout` | session อื่นถือ `pms_sql_seed` | รอไม่เกิน 5 วินาทีแล้ว rollback |
| `nonempty target table` | ตารางธุรกิจมีแถวอยู่แล้ว | rollback ก่อน insert |
| `Atomic promotion failed` | ย้าย directory ไม่สำเร็จหลังขยับของเดิม | คืน directory เดิม |

ข้อความ error จาก SQL คงเฉพาะ error class, redact URL และตัด `DETAIL`, `CONTEXT`, `LINE`.

`database/seeds/sql-master` ถูก git ignore และถูกระบุใน `.dockerignore` จึงไม่เข้า image ที่ `COPY database/seeds`. JSON master ยังถูก copy ได้.

## Verification

ไม่มี Makefile. คำสั่งที่ใช้ซ้ำได้:

```powershell
pnpm test:sql-seeds
node tests/run.mjs sql-seeds
pnpm test:sql-seeds-docker
node tests/run.mjs sql-seeds-docker
```

`scripts/test-unit.sh sql-seeds` ส่งชื่อ suite ต่อไปที่ `tests/run.mjs` ได้. Script นี้ไม่ได้ปฏิเสธ `sql-seeds-docker` ต่างจาก `sql-migrations-docker`. อย่าใช้คำสั่งนั้นแทนชุด Docker ถ้าไม่ได้ตั้งใจเปิด container.

ผลล่าสุดวันที่ 2026-10-04:

- `node tests/run.mjs sql-seeds`: 23 PASS / 0 FAIL / 0 SKIP
- `node tests/run.mjs sql-seeds-docker`: 2 PASS / 0 FAIL / 0 SKIP
- `node scripts/sql-seeds.mjs verify-dataset`: 11 tables, 719 rows, fingerprint ด้านบน

ชุด unit เขียนลง temp directory. ถ้า checkout ไม่มี backup การทดสอบ authoritative จะถูก skip. ชุด Docker ต้องมี backup และจะล้มเหลวชัดเจนถ้าไฟล์หาย. มัน restore ด้วย `psql` หลัง `CREATE ROLE "pms-root"` ใน container `--network none` แล้วตรวจ schema mismatch, lock timeout, sequence repair, การ seed 719 แถว และการไม่ติด `sql-master` ใน build context.

รายการ assertion อยู่ที่ [issue-32-test-cases.txt](../../issue-32-test-cases.txt).

## สิ่งที่ยังไม่เกิดขึ้น

ไม่ได้ seed ฐานข้อมูลของแอป และไม่ได้แทนที่ JSON master. ไฟล์จริงที่ `project_documents.file_url` ชี้ไปยังไม่ถูกตรวจว่ามีอยู่. ไม่มี SonarQube scanner, `SONAR_HOST_URL` หรือ `SONAR_TOKEN` ในเครื่องนี้ จึงยังไม่มีผล quality gate.
