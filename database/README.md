# Database

`database/schema.sql` เป็นแหล่งหลักเพียงไฟล์เดียวของ DDL ทั้งหมด. Application ใช้ `pg` ผ่าน `lib/database/repositories`; ไม่มี schema generation, ORM mapping หรือ versioned migration runner

## Paths

- `schema.sql`: tables, enums, PK/FK, indexes, functions, triggers และ comments. ไม่มี business data หรือ credentials
- `seeds/sql-master/`: private numbered SQL files เช่น `010_companies.sql`, `020_users.sql`, `120_issue_sync_configs.sql`. ทั้ง directory ถูก gitignore; `SEED_PATH` รองรับ path นี้เท่านั้น
- `live-identity/mappings.json`: reviewed compatibility mappings สำหรับ public references เดิม; ไม่ใช่ source ของ schema
- `postgres/data/`: PostgreSQL data directory บนเครื่อง ห้ามล้างเพื่อทดสอบ
- `backups/postgres_data/`: verified archives ตาม BACKUP_DIR

## Initialize ฐานว่าง

```sh
# host: DATABASE_URL ต้องชี้ไปยังฐานทดสอบ/ฐานใหม่ที่อนุมัติแล้ว
pnpm db:initialize
# Docker: service database-init ใช้ target database-tools
```

ต้องตั้ง `DB_SCHEMA_SYNC_APPROVED=true` สำหรับการสร้างครั้งแรก. Initializer ใช้ transaction และ advisory lock, อ่าน schema.sql แล้วบันทึก SHA-256 ใน comment ของ public schema. การเรียกซ้ำยอมรับเฉพาะ checksum และ table set เดิม. ฐานที่มี tables/functions อยู่แล้วแต่ไม่ตรงจะถูกปฏิเสธ แม้เปิด approval flag; ไม่มีการ drop/reset/upgrade อัตโนมัติ

`database/migrations` และ history เดิมถูกยกเลิกเพื่อเริ่มใหม่. การลบไฟล์เหล่านั้นไม่ลบข้อมูล PostgreSQL จริง. ถ้าต้องย้ายฐานที่ใช้งานอยู่ ต้องมี fresh verified backup, ซ้อมในฐานแยก, ตรวจ identities/relations/decimals/timestamps และอนุมัติ cutover ใหม่ก่อน

## SQL seeds

```sh
pnpm db:seed
```

Runner อ่านเฉพาะ `NNN_table_name.sql` ใน sql-master เรียงตามชื่อ และยอมรับ INSERT ของ table ตามชื่อไฟล์. ไม่ใช้ JSON config/manifest ของ flow เก่า. ต้องใช้ schema.sql ปัจจุบันและทุก application table ต้องว่าง. ทุกไฟล์อยู่ใน transaction เดียว; failure rollback ทั้งชุด. Runner รักษา reviewed public UUIDs/source timestamps และ align identity sequences หลังนำเข้า. ไม่ overwrite business data

Docker ใช้ `RUN_SEED=true` สำหรับ fresh install ที่เตรียม seed แล้ว; ตั้งกลับ false หลัง seed. ค่าเริ่มต้นคือ false และ SQL files mount จาก host แบบ read-only. การแก้ไฟล์ seed ไม่ทำให้ฐานเดิมเปลี่ยนเอง

`issue_sync_configs.token_env_var` ระบุ **ชื่อตัวแปร** ใน root `.env` เช่น `GITLAB_WORK_TOKEN` หรือ `GITHUB_PROJECT_A_TOKEN`. Token จริงไม่อยู่ใน table. แต่ละ row ใช้ชื่อต่างกันหรือใช้ชื่อเดียวกันได้. ตัวอย่างส่วนตัว 120_issue_sync_configs.sql คงอยู่บนเครื่องและไม่ถูก commit

## Backup และ verification

```sh
bash scripts/db-manage.sh backup
bash scripts/db-manage.sh restore /path/to/archive.dump
bash scripts/db-manage.sh health
```

Backup เก็บ custom pg_dump, SHA-256, row inventory และผล restore ใน disposable container. `restore` เป็นการซ้อมในฐานแยก ไม่เขียนทับฐานจริง. เก็บไฟล์ .pin สำหรับ archive ที่ห้าม prune

```sh
docker build --target database-tools -t pms-sql-tools-check .
docker build --target production -t pms-sql-app-check .
pnpm test:database-docker
```

Integration suite สร้าง containers ชั่วคราวที่ไม่มี host ports หรือ production volumes, ทดสอบแล้วลบเฉพาะ containers ของตัวเอง. ไม่อ่าน private seeds และไม่เรียก GitLab/GitHub ด้วย token จริง
