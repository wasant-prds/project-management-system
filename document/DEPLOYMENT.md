# DEPLOYMENT

| รายการ | ค่า |
| --- | --- |
| Runtime | Docker Compose; Next.js standalone container + PostgreSQL 16 |
| Environments | Development, UAT, Production |
| สถานะ | คู่มือ deployment จาก Compose/scripts ปัจจุบัน |
| ภาษา | ภาษาไทยเป็นหลัก; command และ environment names คงเดิม |
| เอกสารเชื่อมโยง | [Shared Data Model](./SHARED_DATA_MODEL.md) · [Customer/Project Migration Contract](./CUSTOMER_PROJECT_MIGRATION.md) · [GitLab Issue Import Contract](./GITLAB_ISSUE_IMPORT.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [DATABASE.md](./DATABASE.md) · [document/process/docker.md](./process/docker.md) · [document/process/db.md](./process/db.md) |

> เอกสารนี้อธิบาย configuration ที่พบใน repository ไม่ใช่การยืนยันว่า environment ใดกำลังทำงานหรือพร้อม deploy คำสั่ง Production บางรายการอาจมี confirmation ใน helper script

## 1. Runtime topology

```text
Browser → Next.js app (port 3000 in container) → PostgreSQL 16
                                                   ↑
                                      one-shot migrations service
```

Dockerfile มี stages `development`, `uat`, `production`, `migrate`; production/UAT app ใช้ Next.js standalone build และ Prisma client ที่ generate ระหว่าง build. Shared `docker-compose.database.yml` กำหนด PostgreSQL, migrations, network, secrets และ persistent volume

## 2. Environments และ ports

| Environment | Compose file | Container name (app/db) | Host app port default | หมายเหตุ |
| --- | --- | --- | --- | --- |
| Development | `docker-compose.yml` | `pms-app-dev` / `pms-postgres-${APP_ENV}` | `3777` → container 3000 | source bind mount, `pnpm dev`; Compose file ปัจจุบัน map host 3777 |
| UAT | `docker-compose.uat.yml` | `pms-app-uat` / `pms-postgres-${APP_ENV}` | `3001` → container 3000 (`APP_PORT`) | production-like standalone; `NEXT_PUBLIC_ENV=uat` |
| Production | `docker-compose.prod.yml` | `pms-app-prod` / `pms-postgres-${APP_ENV}` | `3002` → container 3000 (`APP_PORT`) | standalone; optional backup profile |

Database host port defaults to 5437 ใน shared compose; helper/env settings อาจ override ผ่าน `POSTGRES_PORT`. ตรวจ effective Compose config ก่อนเปลี่ยนค่า port. README เดิมระบุ dev URL เป็น 3000 แต่ Compose ที่ตรวจพบใช้ 3777:3000

นโยบาย Target: ตั้ง `TZ=Asia/Bangkok` สำหรับ application container และตั้ง timezone ของ PostgreSQL database/session เป็น `Asia/Bangkok` ในทุก environment. วันและเวลาทุกค่าที่เขียนลง PostgreSQL ต้องใช้ Bangkok calendar/wall-clock semantics และห้ามแปลงเป็น UTC. Application ต้อง parse/format ด้วย `Asia/Bangkok` อย่างชัดเจนเพื่อไม่ให้ timezone ของ browser/device เปลี่ยนค่าที่บันทึก.

ระบบเป้าหมายเป็น installation สำหรับเจ้าของหนึ่งคน ไม่ใช่ multi-user service; ให้ปกป้อง owner account และจำกัดการเปิดเผย network ตามรูปแบบใช้งานจริง

## 3. Prerequisites and configuration

- Docker Engine/Desktop และ Docker Compose plugin
- `.env` ที่ root ตั้ง `APP_ENV` ให้ตรง environment (`dev`/`local`, `uat`, `prod`) ตาม scripts
- ตั้ง `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `OWNER_GATE_USERNAME`, `OWNER_GATE_PASSWORD` และ GitLab configuration ใน root `.env` ตาม [Runtime Security](./RUNTIME_SECURITY.md); ไม่มี secret files/mounts แล้ว และห้าม commit credentials
- ตั้ง `APP_ORIGIN`, `APP_PORT` และ DB/backup overrides ตาม environment; Compose ไม่ใช้ NextAuth placeholder secret แล้ว
- เมื่อเปิด GitLab sync ให้ owner ยืนยัน instance/base path, Project และ label mappings กับ first-sync policy ตาม [GitLab Issue Import Contract](./GITLAB_ISSUE_IMPORT.md); กำหนด base URL จาก server config/allowlist และ access token ใน secret store/environment ของ server ตาม least privilege; ห้ามใช้ `NEXT_PUBLIC_*`, commit secret หรือพิมพ์ token ลง log. ชื่อ configuration ปัจจุบันคือ `GITLAB_BASE_URL` และ `GITLAB_TOKEN` ใน root `.env` ตาม Runtime Security.
- `POSTGRES_DATA_DIR` เลือก host path สำหรับ DB volume; default จาก shared compose คือ `./database/postgres/data`
- `SEED_PATH` default `database/seeds/master`; `RUN_SEED` ควบคุม seed ใน migrations service

Compose สร้าง `DATABASE_URL` ใน entrypoint จาก `POSTGRES_*` ที่ Compose inject จาก root `.env`. อย่าใส่ secret จริงใน docs, command history, source control หรือ support request. `.env.example` เป็น template ที่มี placeholder และไม่ใช่ค่าใช้งานจริง

## 4. Build และ start

### Development

```bash
docker compose up -d --build
```

App: `http://localhost:3777`; health: `http://localhost:3777/api/health`. Dev entrypoint generate Prisma Client แล้วเรียก `pnpm dev` ผ่าน owner gate; shared migrations service ทำ schema sync และ seed ตาม `RUN_SEED`.

### UAT

```bash
docker compose -f docker-compose.uat.yml up -d --build
```

App default: `http://localhost:3001`; ตรวจ `APP_ENV=uat`, `APP_PORT` และ secrets ก่อน start. `NEXT_PUBLIC_ENV=uat` ถูกส่งตอน build เพื่อให้ค่า client bundle ตรง environment.

### Production

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

App default: `http://localhost:3002`; ตั้ง `APP_ENV=prod`, `NEXTAUTH_URL` และ secrets ที่เหมาะกับ host. Production helper scripts มี confirmation ก่อน start/stop/restart/rebuild/init ตามเอกสาร `document/process/docker.md`.

### Helper scripts

Repository มี `scripts/docker-dev.sh`, `scripts/docker-uat.sh`, `scripts/docker-prod.sh` และ PowerShell equivalents ที่เอกสาร helper ระบุ. เรียก `bash scripts/docker-<env>.sh <command>` ใน shell ที่รองรับ Bash (Windows ใช้ Git Bash) และอ่าน help/source ของ script ก่อนงาน destructive เช่น clean/reset.

## 5. Database initialization and schema rollout

1. PostgreSQL healthcheck รอให้ DB พร้อม
2. `migrations` one-shot service สร้าง Prisma Client และเรียก `scripts/db-push-safe.sh`
3. `db-push-safe.sh` ปฏิเสธ flags ที่อาจทำ data loss ตาม implementation
4. หาก `RUN_SEED=true` จะรัน Prisma seed จาก `SEED_PATH`; ตรวจ `prisma/seed.ts` และ seed guard ก่อนใช้งานจริง
5. App รอ migrations service สำเร็จ แล้ว entrypoint สร้าง `DATABASE_URL` จาก environment ของ root `.env` และเริ่ม server

ปัจจุบัน flow ใช้ `prisma db push` ไม่ได้ maintain migration history แบบ versioned migrations ใน repository ที่ตรวจพบ. Customer migration/backfill ต้องทำ per-environment staged nullable → approved mapping → validate → required rollout ตาม [Customer/Project Migration Contract](./CUSTOMER_PROJECT_MIGRATION.md), พร้อม backup และ isolated restore rehearsal ก่อน apply. อย่าใช้ force seed/reset กับข้อมูล production.

## 6. Health checks and operational verification

- Container healthcheck เรียก `GET /api/health` ทุก 30 วินาทีหลัง start period 40 วินาที
- `/api/health` ตรวจ query DB; success คืน HTTP 200 และ `database: connected`, failure คืน 503
- หลัง deploy ตรวจ app container, PostgreSQL, migrations exit status, health endpoint, และอ่านหน้า Work Items/Daily Work ด้วย record ที่ยืนยันแล้ว
- ตรวจ environment variables/Compose interpolation โดยไม่พิมพ์ค่าลับ; ตรวจ `APP_ENV`, image target, host ports และ volume path
- Build-time `NEXT_PUBLIC_ENV` ถูก bake เข้า client bundle; เปลี่ยน environment label ต้อง rebuild image

## 7. Persistent data, backup, restore

- PostgreSQL data อยู่ใน bind-backed Docker volume ชื่อ `pms-postgres-data-${APP_ENV}`; actual host path จาก `POSTGRES_DATA_DIR`
- Production `backup` service อยู่ใต้ Compose profile `backup`, ใช้ custom `pg_dump` รายวันแบบ atomic; defaults ที่เจ้าของกำหนดคือ `BACKUP_DIR=./database/backups/postgres_data` และ `BACKUP_KEEP_DAYS=30` (override ได้). ต้องทดสอบ isolated restore ก่อน rollout ตาม [Database Rollout](./DATABASE_ROLLOUT.md)
- Manual backup/restore/status/seed helpers อธิบายใน [document/process/db.md](./process/db.md)
- ก่อน schema rollout หรือ restore: ยืนยัน environment, สร้าง backup ใหม่, ตรวจขนาด/เวลาของไฟล์, และมี downtime/restore plan ที่เจ้าของระบบรับรู้
- ทดสอบ restore ไป environment แยกและตรวจ row counts/relations; ไฟล์ backup ที่ยังไม่เคย restore ไม่ถือว่า verified

## 8. Deployment security baseline

- Production ต้องใช้ secret ที่ไม่ใช่ค่า development, จำกัดสิทธิ์ filesystem ของ secret และไม่ publish PostgreSQL port สู่ public network โดยไม่จำเป็น
- ตั้ง HTTPS/reverse proxy, domain, firewall, backup destination และ retention ตาม infrastructure จริง (Compose files ไม่ได้กำหนด TLS/reverse proxy)
- จำกัดการเข้าถึง Docker socket/host, ใช้ non-root user สำหรับ production app image และเก็บ logs โดยไม่เผยข้อมูลส่วนบุคคลหรือ credentials
- API ผ่าน private owner access gate ใน runtime launcher แล้ว; owner User/session ยังเป็น #17. Host ports เป็น loopback; remote access ต้องใช้ HTTPS proxy/private tunnel ตาม Runtime Security.
- มี rollback image/config และ DB recovery plan; schema downgrade อัตโนมัติไม่ควรถูกสมมติ
- GitLab sync ใช้ credential ฝั่ง server เท่านั้น; จำกัด token ให้เข้าถึงเฉพาะ Projects ที่ต้อง sync และ rotate/revoke ได้โดยไม่แก้ข้อมูล WorkItem ที่นำเข้าแล้ว; ทำตาม [GitLab Issue Import Contract](./GITLAB_ISSUE_IMPORT.md) และห้ามเปิด sync ก่อนผ่าน owner-access gate

## 9. Troubleshooting quick map

| อาการ | ตรวจสอบ |
| --- | --- |
| App ไม่เริ่ม | `docker compose ps`, logs ของ app/migrations, env/secret file existence, app port collision |
| `/api/health` เป็น 503 | PostgreSQL health, secrets, DB host `postgres`, database name, migrations status |
| Prisma schema/client error | schema version, generated client, build logs, migrations service output |
| เปิด URL ไม่ได้ | effective `APP_PORT` และ port mapping; dev ปัจจุบันคือ 3777 |
| Seed ไม่เข้า | `RUN_SEED`, `SEED_PATH`, seed guard และข้อมูลเดิม; อย่า force-seed production เพื่อทดลอง |
| Disk โต | PostgreSQL data, `backups`, Docker logs และ backup retention; ตรวจ backup ก่อน cleanup |


## Runtime security ที่ implement ใน #15

สถานะเพิ่มเติม ณ 2026-09-28: Issue #17 เพิ่ม proof แบบสุ่มต่อ process ระหว่าง owner gate, Next.js middleware และ server-side owner resolver; launcher ส่ง proof ให้ child ผ่าน environment ภายในเท่านั้นและไม่บันทึกค่า. ใช้ credential gate จาก root `.env` เดิม; ไม่ต้องเพิ่ม secret ใหม่หรือ schema migration. ก่อนเปิดใช้งานต้องตรวจว่า DB มี `User` เจ้าของเพียงหนึ่งแถว. คำสั่งตรวจเฉพาะงานคือ `pnpm test:auth`, `pnpm test:runtime-security`, `pnpm exec tsc --noEmit` และ `pnpm build`. Build บน Windows อาจต้องเปิดสิทธิ์สร้าง symlink สำหรับ Next standalone trace หรือรันใน Linux/Docker. การใช้ HTTP Basic จากภายนอกต้องผ่าน HTTPS proxy/private tunnel ตาม [Runtime Security](./RUNTIME_SECURITY.md); ยังไม่ยืนยันว่า deploy จริงแล้ว.

### Migrations stops at seed

If schema sync succeeds but seed fails and `database/seeds/master/config.json` is absent, set `RUN_SEED=false` in root `.env`. Seeding is opt-in (default false); use `RUN_SEED=true` only with an approved dataset at `SEED_PATH`. Do not reset the database or fabricate seed records. After reviewing production changes, rerun `docker compose -f docker-compose.prod.yml up -d` to recreate migrations with the updated environment. Changing `.env` requires recreation; restarting the old container keeps its old values.

### RUN_SEED=true with per-table guards

With an approved dataset at `database/seeds/master`, set `RUN_SEED=true` in root `.env`. Each configured table is checked independently: any existing row causes that table to be skipped; empty tables receive the configured seed rows. Parent references must resolve against existing or newly inserted records. Invalid data rolls back all seed inserts. Rebuild the migration image after changing the seed runner: `docker compose -f docker-compose.prod.yml build migrations`, then (after deployment authorization) `docker compose -f docker-compose.prod.yml up -d`. No reset or volume deletion is needed.

## Database operations ที่ implement ใน #16

เครื่องมือ backup/isolated restore/staged validation/health และ retention อยู่ใน [Database Rollout](./DATABASE_ROLLOUT.md). ใช้ Asia/Bangkok และตรวจ exact history โดยไม่แปลง timestamp เป็น UTC. Customer/GitLab target schema และ business API ยังไม่ถูก deploy ในงาน Infra นี้. เจ้าของกำหนด defaults เป็น BACKUP_DIR=./database/backups/postgres_data และ BACKUP_KEEP_DAYS=30 แล้ว. ผล isolated verification ยืนยันการเตรียมเครื่องมือของ #16; ยังไม่ได้ rollout หรือสร้าง backup ของ Dev/UAT/Production จริง ซึ่งต้องผ่าน runbook ก่อน schema changes.
