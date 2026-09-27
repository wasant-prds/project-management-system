# DEPLOYMENT

| รายการ | ค่า |
| --- | --- |
| Runtime | Docker Compose; Next.js standalone container + PostgreSQL 16 |
| Environments | Development, UAT, Production |
| สถานะ | คู่มือ deployment จาก Compose/scripts ปัจจุบัน |
| ภาษา | ภาษาไทยเป็นหลัก; command และ environment names คงเดิม |
| เอกสารเชื่อมโยง | [ARCHITECTURE.md](./ARCHITECTURE.md) · [DATABASE.md](./DATABASE.md) · [document/process/docker.md](./process/docker.md) · [document/process/db.md](./process/db.md) |

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

ระบบเป้าหมายเป็น installation สำหรับเจ้าของหนึ่งคน ไม่ใช่ multi-user service; ให้ปกป้อง owner account และจำกัดการเปิดเผย network ตามรูปแบบใช้งานจริง

## 3. Prerequisites and configuration

- Docker Engine/Desktop และ Docker Compose plugin
- `.env` ที่ root ตั้ง `APP_ENV` ให้ตรง environment (`dev`/`local`, `uat`, `prod`) ตาม scripts
- สร้าง secret files ตาม [secrets/README.md](../secrets/README.md): `postgres_user`, `postgres_password`, `postgres_db`; ใส่ค่าจริงเฉพาะในเครื่อง/secret store ห้าม commit
- ตั้ง `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `APP_PORT` และ DB/backup overrides ตาม environment; secret name ยังอยู่ใน config แม้ repository ปัจจุบันยังไม่มี auth feature
- เมื่อเปิด GitLab sync ให้กำหนด GitLab base URL และ access token ใน secret store/environment ของ server ตาม least privilege; ห้ามใช้ `NEXT_PUBLIC_*`, commit secret หรือพิมพ์ token ลง log. ชื่อ variable จริงกำหนดพร้อม connector implementation
- `POSTGRES_DATA_DIR` เลือก host path สำหรับ DB volume; default จาก shared compose คือ `./database/postgres/data`
- `SEED_PATH` default `database/seeds/master`; `RUN_SEED` ควบคุม seed ใน migrations service

Compose สร้าง `DATABASE_URL` ใน entrypoint จาก Docker secrets. อย่าใส่ secret จริงใน docs, command history, source control หรือ support request. `.env.example` เป็น template ที่มี placeholder และไม่ใช่ค่าใช้งานจริง

## 4. Build และ start

### Development

```bash
docker compose up -d --build
```

App: `http://localhost:3777`; health: `http://localhost:3777/api/health`. Dev entrypoint generate Prisma Client แล้วเรียก `pnpm dev`; shared migrations service ทำ schema sync และ seed ตาม `RUN_SEED`.

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
5. App รอ migrations service สำเร็จ แล้ว entrypoint สร้าง `DATABASE_URL` จาก secrets และเริ่ม server

ปัจจุบัน flow ใช้ `prisma db push` ไม่ได้ maintain migration history แบบ versioned migrations ใน repository ที่ตรวจพบ. Customer migration/backfill ควรทำเป็น staged rollout และ backup ก่อนตาม [DATABASE.md](./DATABASE.md); อย่าใช้ force seed/reset กับข้อมูล production

## 6. Health checks and operational verification

- Container healthcheck เรียก `GET /api/health` ทุก 30 วินาทีหลัง start period 40 วินาที
- `/api/health` ตรวจ query DB; success คืน HTTP 200 และ `database: connected`, failure คืน 503
- หลัง deploy ตรวจ app container, PostgreSQL, migrations exit status, health endpoint, และอ่านหน้า Work Items/Daily Work ด้วย record ที่ยืนยันแล้ว
- ตรวจ environment variables/Compose interpolation โดยไม่พิมพ์ค่าลับ; ตรวจ `APP_ENV`, image target, host ports และ volume path
- Build-time `NEXT_PUBLIC_ENV` ถูก bake เข้า client bundle; เปลี่ยน environment label ต้อง rebuild image

## 7. Persistent data, backup, restore

- PostgreSQL data อยู่ใน bind-backed Docker volume ชื่อ `pms-postgres-data-${APP_ENV}`; actual host path จาก `POSTGRES_DATA_DIR`
- Production `backup` service อยู่ใต้ Compose profile `backup`, ใช้ `pg_dump` gzip รายวัน และลบไฟล์เก่าตาม `BACKUP_KEEP_DAYS`; compose default เป็น 3 วัน หากต้องการนานกว่านั้นต้อง override อย่างชัดเจน
- Manual backup/restore/status/seed helpers อธิบายใน [document/process/db.md](./process/db.md)
- ก่อน schema rollout หรือ restore: ยืนยัน environment, สร้าง backup ใหม่, ตรวจขนาด/เวลาของไฟล์, และมี downtime/restore plan ที่เจ้าของระบบรับรู้
- ทดสอบ restore ไป environment แยกและตรวจ row counts/relations; ไฟล์ backup ที่ยังไม่เคย restore ไม่ถือว่า verified

## 8. Deployment security baseline

- Production ต้องใช้ secret ที่ไม่ใช่ค่า development, จำกัดสิทธิ์ filesystem ของ secret และไม่ publish PostgreSQL port สู่ public network โดยไม่จำเป็น
- ตั้ง HTTPS/reverse proxy, domain, firewall, backup destination และ retention ตาม infrastructure จริง (Compose files ไม่ได้กำหนด TLS/reverse proxy)
- จำกัดการเข้าถึง Docker socket/host, ใช้ non-root user สำหรับ production app image และเก็บ logs โดยไม่เผยข้อมูลส่วนบุคคลหรือ credentials
- API ปัจจุบันยังไม่มี owner authentication ที่พบ; แม้มีผู้ใช้คนเดียว ต้องไม่เปิด instance สู่อินเทอร์เน็ตจนกว่าจะปกป้อง account เจ้าของด้วย authentication หรือ private access gate ที่เหมาะสม
- มี rollback image/config และ DB recovery plan; schema downgrade อัตโนมัติไม่ควรถูกสมมติ
- GitLab sync ใช้ credential ฝั่ง server เท่านั้น; จำกัด token ให้เข้าถึงเฉพาะ Projects ที่ต้อง sync และ rotate/revoke ได้โดยไม่แก้ข้อมูล WorkItem ที่นำเข้าแล้ว

## 9. Troubleshooting quick map

| อาการ | ตรวจสอบ |
| --- | --- |
| App ไม่เริ่ม | `docker compose ps`, logs ของ app/migrations, env/secret file existence, app port collision |
| `/api/health` เป็น 503 | PostgreSQL health, secrets, DB host `postgres`, database name, migrations status |
| Prisma schema/client error | schema version, generated client, build logs, migrations service output |
| เปิด URL ไม่ได้ | effective `APP_PORT` และ port mapping; dev ปัจจุบันคือ 3777 |
| Seed ไม่เข้า | `RUN_SEED`, `SEED_PATH`, seed guard และข้อมูลเดิม; อย่า force-seed production เพื่อทดลอง |
| Disk โต | PostgreSQL data, `backups`, Docker logs และ backup retention; ตรวจ backup ก่อน cleanup |

