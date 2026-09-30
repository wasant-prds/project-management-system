# Production daily database backup candidate

## Overview

สร้าง PostgreSQL custom-format dump รายวันสำหรับ Production เพื่อเป็น backup candidate. Compose service ใช้ image `postgres:16-alpine` และรัน `scripts/db-backup-scheduled.sh`; ไม่ใช่ application queue/worker job. ไฟล์ candidate ยังต้องผ่าน isolated restore ก่อนถือว่าใช้กู้คืนได้

## Trigger

Job เริ่มเมื่อสั่ง Production Compose พร้อม profile `backup` (หรือ helper `start-backup`) และ service สร้าง dump รอบแรกหลังเริ่มทำงานสำเร็จ จากนั้นรอ `86400` วินาทีหลังแต่ละรอบ; ไม่มี cron expression. Compose ตั้ง `restart: always` เพื่อเริ่ม container ใหม่เมื่อ process จบ/ล้มเหลว

```bash
docker compose -f docker-compose.prod.yml --profile backup up -d
# หรือใช้ helper ตาม document/process/docker.md
bash scripts/docker-prod.sh start-backup
```

ค่าที่ใช้: `APP_ENV` ต้องเป็น `prod`; `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` มาจาก root `.env`; `BACKUP_DIR` default `./database/backups/postgres_data`; `BACKUP_KEEP_DAYS` default 30 และรับจำนวนเต็ม 1–3650 เท่านั้น.

## Processing flow

Production Compose backup service
→ รอ PostgreSQL healthy
→ สร้าง temporary file ใน `/backups`
→ `pg_dump --format=custom --no-owner --no-privileges`
→ เมื่อ exit code สำเร็จ rename เป็น `pms_<APP_ENV>_daily_<YYYYMMDD_HHMMSS>.dump`
→ ลบเฉพาะ daily candidate ของ environment นี้ที่เก่ากว่า retention
→ รอ 86400 วินาทีแล้วทำซ้ำ

`umask 077` จำกัดสิทธิ์ไฟล์ชั่วคราวและ dump ใหม่. `PGTZ`/`PGOPTIONS` เป็น `Asia/Bangkok`. Script ไม่ dump PostgreSQL passwords ลงไฟล์.

## Database impact

| พื้นที่ | ผล |
| --- | --- |
| PostgreSQL | อ่านข้อมูลทั้ง database ด้วย `pg_dump`; ไม่แก้ row หรือ schema |
| Backup directory | สร้าง custom dump file หลัง dump สำเร็จเท่านั้น |
| Retention | ลบเฉพาะ `pms_<APP_ENV>_daily_*.dump` ที่เกิน `BACKUP_KEEP_DAYS`; ไม่ลบ manual/pinned rollout evidence |

## Retry / Failure handling

`pg_dump` ล้มเหลว: ลบ partial file, เขียนข้อความ failure แบบไม่เปิดเผย diagnostics และ exit non-zero. Compose `restart: always` เริ่ม container ใหม่ จึงลองใหม่เมื่อ container restart; ไม่มี application retry counter หรือ backoff ที่กำหนดใน script. ตรวจสถานะและ logs ของ `pms-backup-prod`; candidate ที่ยังไม่ restore ไม่ใช่ backup ที่ยืนยันแล้ว.

## Logging / Monitoring

Success log คือ `Daily backup candidate created; isolated restore required before rollout`. Failure log คือ `Daily backup failed; diagnostics withheld`. ตรวจ service state และ logs โดยไม่แสดง environment variables:

```bash
docker compose -f docker-compose.prod.yml --profile backup ps
docker compose -f docker-compose.prod.yml --profile backup logs --tail=100 backup
```

## Verification

- Automated: `pnpm test:runtime-docker` ตรวจ Compose/scheduled script behavior แบบ Docker test (test อาจ skip เมื่อไม่ได้เปิด opt-in).
- ตรวจ candidate ใน backup directory ว่ามีชื่อของ `APP_ENV` และไฟล์ใหม่ไม่ใช่ partial.
- ก่อนใช้เป็น restore point ให้ทำ isolated restore/validate ตาม [Database Rollout](../../../DATABASE_ROLLOUT.md); อย่าทดสอบ restore ทับ live database.
