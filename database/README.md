# Database Directory

This directory contains persistent database storage for the Project Management System.

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
2. Prisma runs migrations (`pnpm db:push`)
3. Seed script checks if data exists
4. If empty, seeds initial data
5. If data exists, **skips seeding to prevent data loss**

### Checking Data Existence
The seed script (`prisma/seed.ts`) automatically checks for existing data by counting:
- Companies
- Users
- Projects

If any of these exist, seeding is skipped with a friendly message.

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
pnpm db:push
pnpm db:seed
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
- `shared_buffers`: 256MB - Memory for caching data
- `work_mem`: 16MB - Memory for query operations
- `maintenance_work_mem`: 64MB - Memory for maintenance tasks
- `effective_cache_size`: 512MB - Estimated OS cache size

### Development-Only Optimizations
⚠️ **These settings are for DEVELOPMENT ONLY** - They trade data safety for speed:
- `fsync=off` - Don't force writes to disk (faster but risky)
- `synchronous_commit=off` - Don't wait for disk confirmation
- `full_page_writes=off` - Don't write full pages after checkpoints

**DO NOT USE THESE IN PRODUCTION!**

## Backup Strategy

The volume is labeled with backup metadata:
- **Frequency**: Daily
- **Retention**: 30 days
- **Type**: Database

Implement your backup strategy based on these labels using tools like:
- `pg_dump` for database dumps
- Volume snapshots
- File-based backups of the data directory

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
If the database becomes corrupted:
```bash
# Stop containers
docker-compose down

# Backup current data (optional)
cp -r ./database/postgres/data ./database/postgres/data.backup

# Remove corrupted data
rm -rf ./database/postgres/data/*

# Restart with fresh data
docker-compose up -d
```

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

Database configuration is managed through Docker secrets:
- `postgres_user.txt` - Database username
- `postgres_password.txt` - Database password
- `postgres_db.txt` - Database name

See `./secrets/README.md` for more information.

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

