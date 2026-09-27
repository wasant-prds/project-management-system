# Docker process commands

เรียกใช้จาก root ของ repository โดยใช้แทน scripts เดิมใน `package.json` (`docker:dev:*`, `docker:uat:*`, `docker:prod:*`) ทุก site ใช้ `.env` ที่ root ร่วมกัน ให้ตั้ง `APP_ENV=local` หรือ `APP_ENV=dev` สำหรับ development, `APP_ENV=uat` สำหรับ UAT และ `APP_ENV=prod` สำหรับ production ก่อนเรียก helper ของ site นั้น

## Host sizing (1 vCPU / 2 GB / 50 GB, two projects)

Compose is tuned so **this stack uses about half the machine**, leaving room for a second project plus the OS/Docker daemon (~400 MB).

| Resource | This project | Leave for OS + other project |
| --- | --- | --- |
| CPU | ~0.50 (`postgres` 0.20 + `app` 0.30) | ~0.50 |
| RAM | ~768 MB (`postgres` 384 MB + `app` 384 MB) | ~1.2 GB |
| Disk | WAL capped at 256 MB; container logs 10 MB × 3; backups 3 days | rest of 50 GB |

PostgreSQL uses `max_connections=20`, `shared_buffers=64MB`, and a Prisma `connection_limit=5`. Node heap is capped with `NODE_OPTIONS=--max-old-space-size=256`. Do not run two heavy `pnpm dev` stacks on this host; use UAT/production images.

```bash
bash scripts/docker-dev.sh <command>
bash scripts/docker-uat.sh <command>
bash scripts/docker-prod.sh <command>
```

คัดลอก `.env.example` เป็น `.env` แล้วตั้งค่าตาม site ที่ใช้งาน UAT helper กำหนดให้ใช้ `APP_ENV=uat` และ production helper กำหนดให้ใช้ `APP_ENV=prod` ไม่ต้องสร้าง `.env.uat` หรือ `.env.production` แยกต่างหาก คำสั่ง start/stop/init/restart/rebuild ของ production จะถามยืนยันก่อนทำงาน

## Development

Script: `scripts/docker-dev.sh`  
Compose file: `docker-compose.yml`  
App: http://localhost:3777 · PostgreSQL: localhost:5437 (loopback เท่านั้น; Studio ต้องอ่าน effective config ก่อนเปิด)

| Command | Description |
| --- | --- |
| `bash scripts/docker-dev.sh start` | Start development environment |
| `bash scripts/docker-dev.sh start-studio` | Start with Prisma Studio |
| `bash scripts/docker-dev.sh stop` | Stop all services |
| `bash scripts/docker-dev.sh restart` | Restart all services |
| `bash scripts/docker-dev.sh logs` | View all logs |
| `bash scripts/docker-dev.sh logs-app` | View application logs |
| `bash scripts/docker-dev.sh logs-db` | View database logs |
| `bash scripts/docker-dev.sh shell` | Open shell in app container |
| `bash scripts/docker-dev.sh db-shell` | Open PostgreSQL shell |
| `bash scripts/docker-dev.sh clean` | Stop and remove volumes |
| `bash scripts/docker-dev.sh rebuild` | Rebuild containers |

## UAT

Script: `scripts/docker-uat.sh`  
Compose file: `docker-compose.uat.yml`  
App: http://localhost:3001 · PostgreSQL: localhost:5437 (ตรวจ POSTGRES_PORT ของ installation)

| Command | Description |
| --- | --- |
| `bash scripts/docker-uat.sh start` | Start UAT environment |
| `bash scripts/docker-uat.sh init` | Initialize database |
| `bash scripts/docker-uat.sh stop` | Stop all services |
| `bash scripts/docker-uat.sh restart` | Restart all services |
| `bash scripts/docker-uat.sh logs` | View all logs |
| `bash scripts/docker-uat.sh status` | View service status |
| `bash scripts/docker-uat.sh rebuild` | Rebuild containers |

Extra script actions (not previously in `package.json`): `logs-app`, `shell`, `db-shell`.

## Production

Script: `scripts/docker-prod.sh`  
Compose file: `docker-compose.prod.yml`  
App: http://localhost:3002 · PostgreSQL: localhost:5434

| Command | Description |
| --- | --- |
| `bash scripts/docker-prod.sh start` | Start production environment |
| `bash scripts/docker-prod.sh start-backup` | Start with backup service |
| `bash scripts/docker-prod.sh init` | Initialize database |
| `bash scripts/docker-prod.sh stop` | Stop all services |
| `bash scripts/docker-prod.sh restart` | Restart application |
| `bash scripts/docker-prod.sh logs` | View logs |
| `bash scripts/docker-prod.sh status` | View service status |
| `bash scripts/docker-prod.sh health` | Check application health |
| `bash scripts/docker-prod.sh backup-now` | Create manual backup |
| `bash scripts/docker-prod.sh rebuild` | Rebuild containers |

## Owner gate และ secrets (#15)

ก่อน start ให้ provision credential และ `APP_ORIGIN` และค่าทั้งหมดใน root `.env` ตาม [Runtime Security](../RUNTIME_SECURITY.md). แอปกับ DB publish loopback เท่านั้น. ตรวจ instance ที่กำลังรันด้วย `node scripts/runtime-verify.mjs docker-compose.yml` (UAT/Production เลือก Compose file ที่ตรงกัน); output ไม่มี secret. Rotation ต้อง recreate app only และ production ยังต้อง operator confirmation. ห้ามพิมพ์ raw Compose config/environment ใน logs.
