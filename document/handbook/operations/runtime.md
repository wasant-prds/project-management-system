# Runtime operations

## Runtime ที่ยืนยันจาก repository

ระบบรัน Next.js App Router และ Prisma บน PostgreSQL 16 ผ่าน Docker Compose. Node owner gate รับ traffic, ตรวจ Basic credential/Origin แล้ว forward ไปยัง Next.js child ที่ bind กับ `127.0.0.1`; PostgreSQL port ก็ bind กับ loopback. ทุก environment กำหนด `TZ`, `PGTZ` และ database session เป็น `Asia/Bangkok`.

| Environment | Compose file | App URL default |
| --- | --- | --- |
| Development | `docker-compose.yml` | `http://localhost:3777` |
| UAT | `docker-compose.uat.yml` | `http://localhost:3001` |
| Production | `docker-compose.prod.yml` | `http://localhost:3002` |

พอร์ตจริงอาจถูก override ใน root `.env`; ตรวจ effective Compose configuration ก่อนปฏิบัติการ. Production ที่เปิดจากอินเทอร์เน็ตใช้ [HTTPS certificate](./https.md) ผ่าน nginx; พอร์ตของแอปยังเป็น loopback.

## เริ่มระบบและตรวจสุขภาพ

Development:

```bash
docker compose up -d --build
curl -i http://localhost:3777/api/health
```

UAT หรือ Production ใช้ Compose file ที่ตรง environment:

```bash
docker compose -f docker-compose.uat.yml up -d --build
docker compose -f docker-compose.prod.yml up -d --build
```

`GET /api/health` เป็น public probe ที่ตรวจ PostgreSQL query และ session timezone. HTTP 200 หมายถึง `healthy`/`connected`; HTTP 503 หมายถึง `unhealthy`/`disconnected`. Probe คืน timestamp แบบ `+07:00` และ uptime เป็นวินาที; endpoint ไม่เปิด raw DB error.

## Logs และ diagnosis

เริ่มด้วยการตรวจ service และ logs ของ environment ที่ถูกต้อง:

```bash
docker compose ps
docker compose logs --tail=100 app postgres migrations
```

สำหรับ UAT/Production ให้เพิ่ม `-f docker-compose.uat.yml` หรือ `-f docker-compose.prod.yml` ตามลำดับ. อ่าน [Docker operations](../../process/docker.md) สำหรับ helper commands และ [DB operations](../../process/db.md) สำหรับ backup/restore/seed. ห้ามพิมพ์ raw Compose environment, `.env`, Basic credentials, GitLab token หรือ database URL ลง log/ticket.

อาการที่พบบ่อย:

| อาการ | จุดตรวจ |
| --- | --- |
| App ไม่เริ่ม | app/migrations logs, required environment, host port และ database health |
| Health เป็น 503 | PostgreSQL health, migrations exit status, session timezone และ DB connection |
| API ตอบ 401 | Basic credential ที่ gate และ owner proof path; ตรวจว่าเข้า endpoint ผ่าน runtime launcher |
| API ตอบ 503 ตอน resolve owner | ต้อง resolve `User` ได้หนึ่งแถว; ตรวจ `OWNER_USER_ID` และข้อมูล owner โดยไม่แสดง password |
| เรียก API เขียนแล้วได้ 403 | `Origin` ต้องตรงกับ `APP_ORIGIN`; browser ต้องเข้าผ่าน configured origin |
| Daily Work วันไม่ตรง | ตรวจ `Asia/Bangkok`, ค่า date-only/`+07:00` และใช้ [Daily Work API](../api/daily-work/collection.md) contract |

## Database startup

Compose รอ PostgreSQL healthy แล้วรัน one-shot `migrations` service ผ่าน schema rollout gate และ `scripts/sql-runtime.mjs apply`. `RUN_SEED` ค่าเริ่มต้นคือ `false`. Gate ปิดการเขียนไว้จนกว่าจะยืนยัน backup/isolated restore หรือฐานข้อมูลว่าง, approval ของ target environment, hash ของ Prisma schema, checksum ของ SQL, revision และ release fingerprint. App เริ่มหลัง migrations สำเร็จ. `reset` และ `force-seed` ถูกปฏิเสธ. ทำ schema/restore operation ตาม [Database Rollout](../../DATABASE_ROLLOUT.md) และ [Issue #33 handbook](../database/issue-33-sql-runtime.md).

## Background processing

ไม่พบ application queue หรือ worker. Production มี optional Compose `backup` profile สำหรับ daily database dump candidate; ดู [Database backup job](../jobs/database/daily-backup.md). หลังออก certificate แล้ว cron ของเครื่องต่ออายุใบของ hostname นี้; ดู [HTTPS renew](../jobs/operations/https-renew.md). `docker-prod.sh start` เปิด nginx เมื่อไฟล์ใบมีข้อมูลแล้ว. GitLab config validation ไม่ได้หมายความว่า scheduled sync มีอยู่; ดู [GitLab integration status](../integration/gitlab.md).
