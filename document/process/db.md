# Database process commands

Run these from the repository root. They replace the former `package.json` scripts (`db:*`).

`postinstall` still runs `prisma generate`. Prisma seed is still configured as `tsx prisma/seed.ts` in `package.json`.

## Prisma

| Command | Description |
| --- | --- |
| `pnpm prisma generate` | Generate Prisma Client |
| `pnpm prisma migrate dev` | Create and apply a migration |
| `pnpm prisma db seed` | Seed database (skips if data exists; never wipes) |
| `pnpm prisma studio` | Open Prisma Studio |
| `sh scripts/db-push-safe.sh` | Push schema (non-destructive; refuses data-loss flags) |
| `sh scripts/dump-master-seeds.sh` | Export running DB into `database/seeds/master/*.json` |

## Management helper

Script: `scripts/db-manage.sh` (PowerShell: `scripts/db-manage.ps1`)

```bash
bash scripts/db-manage.sh <command>
```

| Command | Description |
| --- | --- |
| `bash scripts/db-manage.sh status` | Show database status |
| `bash scripts/db-manage.sh reset` | Reset database (delete all data) |
| `bash scripts/db-manage.sh backup` | Create a backup of the database |
| `bash scripts/db-manage.sh restore <file>` | Restore database from backup |
| `bash scripts/db-manage.sh connect` | Connect to database (psql) |
| `bash scripts/db-manage.sh logs` | Show PostgreSQL logs |
| `bash scripts/db-manage.sh seed` | Run database seed (skips if data exists) |
| `bash scripts/db-manage.sh force-seed` | Force reseed (deletes existing data) |
