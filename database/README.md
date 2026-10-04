# Database Directory

This directory contains persistent database storage for the Project Management System.

Issue #31 adds an empty SQL target at `schema.sql` and `migrations/manifest.json`. It is not applied by Compose. The active migration path remains guarded `prisma db push` until Issue #33. Run `node scripts/sql-migrate.mjs` only against an explicit isolated target, never the `APP_ENV` database. See [SQL schema foundation](../document/handbook/database/issue-31-sql-schema.md).

The target gives every table an internal BIGINT identity `id` and an immutable random UUIDv4 `public_id`. PK/FK relations use numeric keys; API/UI references use public UUIDs after #33 adoption. See the [identifier contract](../document/database/PUBLIC_IDENTIFIERS.md) and [project rule](../.cursor/rules/05-record-identifiers.mdc).

## Structure

```
database/
└── postgres/
    ├── data/          # PostgreSQL data files (persistent storage)
    ├── .gitignore     # Ignores data contents but keeps structure
    └── README.md      # This file
```

## PostgreSQL Data

- **Location**: `./database/postgres/data`
- **Type**: Bind mount volume
- **Persistence**: Data persists between container restarts
- **Backup**: Configured for daily backups (see docker-compose.yml labels)
- **Retention**: 30 days (configurable)

## Data Management

### First Run
When you first run `docker-compose up`, the database will be initialized automatically:
1. PostgreSQL creates its data structure
2. Prisma runs migrations (`sh scripts/db-push-safe.sh`)
3. Seed script checks if data exists
4. If empty, seeds initial data
5. If data exists, **skips seeding to prevent data loss**

### Checking Data Existence

Set `RUN_SEED=true` in root `.env`. The seed runner checks each table listed in `database/seeds/master/config.json`, in dependency order. Empty tables receive seed rows; tables with any existing rows are skipped without updating or deleting those rows. A skipped table does not require its seed file. Foreign keys must resolve against existing or newly seeded parent records. Invalid files or constraints roll back inserts from the entire seed transaction; never reset production to work around a seed error.

### Resetting the Database

#### Option 1: Remove Volume (Recommended)
```bash
# Stop containers
docker-compose down

# Remove the volume (this deletes all data)
docker volume rm pms-postgres-data-dev
# or manually delete the directory
rm -rf ./database/postgres/data/*

# Restart (will seed fresh data)
docker-compose up -d
```

#### Option 2: Manual Reset (Advanced)
```bash
# Connect to the database
docker exec -it pms-postgres-dev psql -U <username> -d <database>

# Drop and recreate schema
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO <username>;
GRANT ALL ON SCHEMA public TO public;

# Exit and run migrations + seed
sh scripts/db-push-safe.sh
pnpm prisma db seed
```

#### Option 3: Use Docker Volume
```bash
# Stop and remove everything including volumes
docker-compose down -v

# Start fresh
docker-compose up -d
```

## Performance Optimizations

The development PostgreSQL configuration includes:

### Memory Settings
Sized for a 1 vCPU / 2 GB host running two projects (this stack ~384 MB for Postgres):
- `shared_buffers`: 64MB - Memory for caching data
- `work_mem`: 2MB - Memory for query operations
- `maintenance_work_mem`: 32MB - Memory for maintenance tasks
- `effective_cache_size`: 192MB - Estimated OS cache size
- `max_connections`: 20 - Fits the small shared_buffers / work_mem budget

### Development-Only Optimizations
⚠️ **These settings are for DEVELOPMENT ONLY** - They trade data safety for speed:
- `fsync=off` - Don't force writes to disk (faster but risky)
- `synchronous_commit=off` - Don't wait for disk confirmation
- `full_page_writes=off` - Don't write full pages after checkpoints

**DO NOT USE THESE IN PRODUCTION!**

## Backup Strategy

The volume is labeled with backup metadata:
- **Frequency**: Daily
- **Retention**: owner-approved default `BACKUP_KEEP_DAYS=30` (override supported); labels do not certify that backups have run
- **Type**: Database

Use [Database Rollout](../document/DATABASE_ROLLOUT.md) for approved `BACKUP_DIR`, retention, verified custom `pg_dump`, isolated restore, staged checks and recovery. Raw copies of a running PostgreSQL data directory are not verified backups. Database/session defaults are `Asia/Bangkok`; preserve Bangkok local wall-clock values without UTC conversion.

## Troubleshooting

### Permission Issues
If you encounter permission issues:
```bash
# Check ownership
ls -la ./database/postgres/data/

# Fix permissions (Linux/Mac)
sudo chown -R $USER:$USER ./database/postgres/data/

# For Windows, ensure Docker Desktop has access to the directory
```

### Corrupted Data
Stop affected writes, preserve the current volume and incident snapshot, and follow [the recovery runbook](../document/DATABASE_ROLLOUT.md). Restore a verified backup to an isolated replacement, reconcile post-backup writes and obtain owner approval before cutover. Never delete the original data directory or initialize a fresh database as a recovery shortcut.

### Connection Issues
```bash
# Check if PostgreSQL is healthy
docker ps
docker logs pms-postgres-dev

# Check if port is available
netstat -an | grep 5432

# Test connection
docker exec -it pms-postgres-dev pg_isready
```

## Environment Variables

Database configuration is read from root `.env`: `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`. Do not commit `.env`. See `document/RUNTIME_SECURITY.md`.

## Security Notes

🔒 **Important Security Considerations**:

1. **Never commit** the actual data directory contents
2. **Keep secrets secure** - don't commit secret files
3. **Use strong passwords** in production
4. **Change default settings** before production deployment
5. **Enable SSL/TLS** for production databases
6. **Regular backups** are essential
7. **Test restore procedures** regularly

## Additional Resources

- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Prisma Documentation](https://www.prisma.io/docs/)
- [Docker Volumes](https://docs.docker.com/storage/volumes/)
- [PostgreSQL Performance Tuning](https://wiki.postgresql.org/wiki/Performance_Optimization)

