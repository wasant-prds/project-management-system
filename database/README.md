# Database — authoritative SQL schema

`database/schema.sql` เป็นแหล่งอ้างอิงหลักของโครงสร้างฐานข้อมูลทั้งหมด: tables, columns, constraints, indexes, functions, triggers และ PostgreSQL comments. `prisma/schema.prisma` เป็น ORM mapping ที่ต้องตรงกับ SQL นี้ ห้ามใช้ Prisma db push เพื่อกำหนด schema แทนไฟล์หลัก.

## ไฟล์และความรับผิดชอบ

- `schema.sql`: schema ล่าสุดสำหรับฐานข้อมูลว่าง ไม่มี business rows หรือ credentials.
- `migrations/0001_initial_schema.sql`: baseline เดิมที่เก็บ byte/checksum ไว้เพื่อรักษาประวัติ migration ที่ apply แล้ว.
- `migrations/0002_issue_sync.sql`: delta สำหรับอัปเกรดฐานเดิมให้ตรงกับ schema หลัก.
- `migrations/manifest.json`: checksum ของ schema หลัก, version ที่ snapshot ครอบคลุม และ migration history ตามลำดับ.
- `rollout/`: approval และหลักฐาน backup/restore/rehearsal; ไม่เก็บ secrets.
- `postgres/data/`: ข้อมูล PostgreSQL จริงบน Docker bind mount ห้ามล้างหรือแก้ไฟล์เอง.
- `backups/postgres_data/`: custom pg_dump พร้อม checksum, inventory และ verified restore receipt ตาม BACKUP_DIR.

## ติดตั้งและอัปเกรด

ฐานข้อมูลว่างสร้างจาก schema.sql แล้วบันทึก versions ที่ snapshot ครอบคลุม พร้อม apply delta ที่ใหม่กว่า snapshot ใน transaction เดียว. ฐานข้อมูลที่มี SQL history ตรวจ checksum เดิมก่อน apply เฉพาะ pending migrations; ไม่รัน CREATE TABLE จาก snapshot ทับฐานที่มีข้อมูล.

การเปลี่ยน schema ต้องแก้ schema.sql และ Prisma mapping ให้ตรงกัน พร้อมเพิ่ม migration สำหรับฐานเดิม. Archived migrations ที่ apply แล้วคงเนื้อหา/checksum เดิม. ตรวจว่า snapshot และ migration replay ให้ catalog เดียวกันด้วย isolated PostgreSQL ก่อน rollout.

ทุกตารางมี internal BIGINT identity `id` และ immutable UUIDv4 `public_id` ที่ database generate. Foreign keys ใช้ BIGINT; API/UI ใช้ UUID. วันที่และ timestamps ใช้ Asia/Bangkok wall-clock. ดู [Identifier contract](../document/database/PUBLIC_IDENTIFIERS.md).

## ใช้กับฐานข้อมูลจริง

ใช้ APP_ENV จาก root .env เพื่อเลือก Docker Compose/container/data directory. ก่อน schema change ต้องหยุด business writes, ทำ backup ใหม่, verify checksum และ restore ในฐานแยก พร้อมซ้อม migration และเทียบข้อมูลเดิม. Apply ได้เมื่อมี explicit approval และผ่าน rollout gate เท่านั้น. ห้าม reset, force-seed, ลบ volume หรือใช้ seed เพื่อแก้ปัญหา migration.

`RUN_SEED=false` เป็นค่าเริ่มต้น. การ seed/import เป็นงานแยกและไม่เป็นส่วนหนึ่งของการ sync issues หรือ schema upgrade. อย่า seed ชุด legacy JSON ลง SQL/BIGINT runtime.

## Verification

`node tests/run.mjs sql-schema` ตรวจ SQL/Prisma/migration contracts. `node tests/run.mjs sql-migrations-docker` ตรวจ snapshot, replay, transactions, history และ constraints บน disposable PostgreSQL. `node tests/run.mjs issue-sync` ตรวจ provider adapters, assignee filtering และ API boundaries โดยไม่ใช้ token จริง.

ดู [Migration workflow](migrations/README.md), [Database Rollout](../document/DATABASE_ROLLOUT.md), [SQL runtime](../document/handbook/database/issue-33-sql-runtime.md) และ [Project Issue Sync](../document/ISSUE_SYNC.md).

