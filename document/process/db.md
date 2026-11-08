# Database commands

ใช้ [database/README.md](../../database/README.md) เป็นคู่มือปัจจุบัน และ `database/schema.sql` เป็น DDL หลัก. ใช้ root .env เพียงไฟล์เดียว

```sh
pnpm db:initialize   # สร้าง schema เฉพาะฐานว่างที่อนุมัติ
pnpm db:seed         # INSERT จาก database/seeds/sql-master เฉพาะฐานว่าง
bash scripts/db-manage.sh status
bash scripts/db-manage.sh connect
bash scripts/db-manage.sh logs
bash scripts/db-manage.sh backup
bash scripts/db-manage.sh restore /path/to/archive.dump
bash scripts/db-manage.sh health
bash scripts/db-manage.sh prune-backups
bash scripts/db-manage.sh seed
```

บน Windows ใช้ `scripts/db-manage.ps1` เพื่อเรียก Git Bash. คำสั่งเลือก environment ตาม APP_ENV ใน root .env (`local`, `dev`, `uat`, `prod`). Backup/restore ต้องมี Node.js และ Docker CLI. `reset` และ `force-seed` ถูกปฏิเสธ

เครื่องมือที่เกี่ยวกับฐานข้อมูลอยู่ใน `scripts/database`: initialize.mjs, seed.mjs, backup.mjs, connection.mjs และ schema.mjs. Compose database-init ใช้ entrypoint.sh ใน directory เดียวกัน

ถ้า database-init แจ้ง schema ไม่ตรง ให้หยุดตรวจ baseline และซ้อมในฐานแยก. ไม่ลบ data directory/volume หรือรัน seed ทับฐานที่ใช้งานเพื่อแก้ startup
