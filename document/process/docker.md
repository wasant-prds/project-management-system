# Docker process commands

Run these from the repository root. They replace the former `package.json` scripts (`docker:dev:*`, `docker:uat:*`, `docker:prod:*`).

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

UAT requires `.env.uat`. Production requires `.env.production`. Production start/stop/init/restart/rebuild prompt for confirmation.

## Development

Script: `scripts/docker-dev.sh`  
Compose file: `docker-compose.yml`  
App: http://localhost:3000 · Prisma Studio: http://localhost:5555 · PostgreSQL: localhost:5432

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
App: http://localhost:3001 · PostgreSQL: localhost:5433

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
