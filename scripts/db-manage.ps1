# Database Management Script for Project Management System (PowerShell)
# This script provides utilities for managing the PostgreSQL database

param(
    [Parameter(Position=0)]
    [string]$Command,
    
    [Parameter(Position=1)]
    [string]$BackupFile
)

# Configuration
$CONTAINER_NAME = "pms-postgres-dev"
$VOLUME_NAME = "pms-postgres-data-dev"
$DATA_DIR = "./database/postgres/data"
$BACKUP_DIR = "./database/backups"

# Functions
function Print-Header {
    Write-Host "================================================" -ForegroundColor Blue
    Write-Host "  Database Management - PMS" -ForegroundColor Blue
    Write-Host "================================================" -ForegroundColor Blue
}

function Print-Success {
    param([string]$Message)
    Write-Host "✓ $Message" -ForegroundColor Green
}

function Print-Error {
    param([string]$Message)
    Write-Host "✗ $Message" -ForegroundColor Red
}

function Print-Warning {
    param([string]$Message)
    Write-Host "⚠ $Message" -ForegroundColor Yellow
}

function Print-Info {
    param([string]$Message)
    Write-Host "ℹ $Message" -ForegroundColor Cyan
}

# Check if data directory has content
function Test-DataDir {
    if (Test-Path $DATA_DIR) {
        $items = Get-ChildItem -Path $DATA_DIR -Force
        return ($items.Count -gt 0)
    }
    return $false
}

# Check if container is running
function Test-Container {
    $container = docker ps -q -f "name=$CONTAINER_NAME" 2>$null
    return ($null -ne $container -and $container.Length -gt 0)
}

# Status check
function Show-Status {
    Print-Header
    Write-Host ""
    
    # Check container status
    if (Test-Container) {
        Print-Success "PostgreSQL container is running"
        
        # Get container info
        Write-Host ""
        Print-Info "Container Details:"
        docker ps -f "name=$CONTAINER_NAME" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        
        # Check connection
        Write-Host ""
        Print-Info "Connection Test:"
        $result = docker exec $CONTAINER_NAME pg_isready 2>$null
        if ($LASTEXITCODE -eq 0) {
            Print-Success "Database is accepting connections"
        } else {
            Print-Error "Database is not accepting connections"
        }
    } else {
        Print-Warning "PostgreSQL container is not running"
    }
    
    # Check data directory
    Write-Host ""
    Print-Info "Data Directory Status:"
    if (Test-DataDir) {
        $size = (Get-ChildItem -Path $DATA_DIR -Recurse | Measure-Object -Property Length -Sum).Sum
        $sizeInMB = [math]::Round($size / 1MB, 2)
        Print-Success "Data exists (Size: $sizeInMB MB)"
    } else {
        Print-Warning "No data found (Database is empty)"
    }
    
    # Check volume
    Write-Host ""
    Print-Info "Volume Status:"
    $volume = docker volume inspect $VOLUME_NAME 2>$null
    if ($LASTEXITCODE -eq 0) {
        Print-Success "Volume '$VOLUME_NAME' exists"
    } else {
        Print-Warning "Volume '$VOLUME_NAME' does not exist"
    }
    
    Write-Host ""
}

# Reset database
function Reset-Database {
    Print-Header
    Write-Host ""
    Print-Warning "⚠️  WARNING: This will DELETE ALL DATABASE DATA!"
    Write-Host ""
    
    $confirm = Read-Host "Are you sure you want to reset the database? (yes/no)"
    
    if ($confirm -ne "yes") {
        Print-Info "Reset cancelled"
        return
    }
    
    Write-Host ""
    Print-Info "Stopping containers..."
    docker-compose down
    
    Print-Info "Removing database data..."
    if (Test-Path $DATA_DIR) {
        Remove-Item -Path "$DATA_DIR\*" -Recurse -Force
    }
    
    Print-Success "Database reset complete!"
    Print-Info "Run 'docker-compose up -d' to start with fresh data"
    Write-Host ""
}

# Backup database
function Backup-Database {
    Print-Header
    Write-Host ""
    
    if (-not (Test-Container)) {
        Print-Error "Container is not running. Start it with 'docker-compose up -d'"
        return
    }
    
    # Create backup directory
    if (-not (Test-Path $BACKUP_DIR)) {
        New-Item -ItemType Directory -Path $BACKUP_DIR -Force | Out-Null
    }
    
    # Generate backup filename with timestamp
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $backupFile = "$BACKUP_DIR/pms_backup_$timestamp.sql"
    
    Print-Info "Creating backup: $backupFile"
    
    # Read secrets
    $dbUser = Get-Content "./secrets/postgres_user.txt" -Raw
    $dbName = Get-Content "./secrets/postgres_db.txt" -Raw
    $dbUser = $dbUser.Trim()
    $dbName = $dbName.Trim()
    
    # Create backup
    docker exec $CONTAINER_NAME pg_dump -U $dbUser $dbName | Out-File -FilePath $backupFile -Encoding UTF8
    
    # Compress backup
    Print-Info "Compressing backup..."
    Compress-Archive -Path $backupFile -DestinationPath "$backupFile.zip" -Force
    Remove-Item $backupFile
    
    Print-Success "Backup created: $backupFile.zip"
    
    # Show backup size
    $backupSize = (Get-Item "$backupFile.zip").Length / 1MB
    $backupSize = [math]::Round($backupSize, 2)
    Print-Info "Backup size: $backupSize MB"
    Write-Host ""
}

# Restore database from backup
function Restore-Database {
    param([string]$BackupPath)
    
    Print-Header
    Write-Host ""
    
    if ([string]::IsNullOrEmpty($BackupPath)) {
        Print-Error "Please specify a backup file"
        Print-Info "Usage: .\scripts\db-manage.ps1 restore <backup_file>"
        Write-Host ""
        Print-Info "Available backups:"
        if (Test-Path $BACKUP_DIR) {
            Get-ChildItem -Path "$BACKUP_DIR\*.zip" | Select-Object Name, Length, LastWriteTime
        } else {
            Print-Warning "No backups found"
        }
        return
    }
    
    if (-not (Test-Path $BackupPath)) {
        Print-Error "Backup file not found: $BackupPath"
        return
    }
    
    if (-not (Test-Container)) {
        Print-Error "Container is not running. Start it with 'docker-compose up -d'"
        return
    }
    
    Print-Warning "⚠️  WARNING: This will OVERWRITE the current database!"
    Write-Host ""
    
    $confirm = Read-Host "Are you sure you want to restore from backup? (yes/no)"
    
    if ($confirm -ne "yes") {
        Print-Info "Restore cancelled"
        return
    }
    
    Write-Host ""
    Print-Info "Restoring from: $BackupPath"
    
    # Read secrets
    $dbUser = Get-Content "./secrets/postgres_user.txt" -Raw
    $dbName = Get-Content "./secrets/postgres_db.txt" -Raw
    $dbUser = $dbUser.Trim()
    $dbName = $dbName.Trim()
    
    # Decompress if needed
    $tempFile = "$env:TEMP\pms_restore_temp.sql"
    if ($BackupPath -match '\.zip$') {
        Print-Info "Decompressing backup..."
        Expand-Archive -Path $BackupPath -DestinationPath $env:TEMP -Force
        $sqlFile = Get-ChildItem -Path $env:TEMP -Filter "pms_backup_*.sql" | Select-Object -First 1
        $tempFile = $sqlFile.FullName
    } else {
        Copy-Item $BackupPath $tempFile
    }
    
    Get-Content $tempFile | docker exec -i $CONTAINER_NAME psql -U $dbUser $dbName
    Remove-Item $tempFile -Force
    
    Print-Success "Database restored successfully!"
    Write-Host ""
}

# Connect to database
function Connect-Database {
    Print-Header
    Write-Host ""
    
    if (-not (Test-Container)) {
        Print-Error "Container is not running. Start it with 'docker-compose up -d'"
        return
    }
    
    $dbUser = Get-Content "./secrets/postgres_user.txt" -Raw
    $dbName = Get-Content "./secrets/postgres_db.txt" -Raw
    $dbUser = $dbUser.Trim()
    $dbName = $dbName.Trim()
    
    Print-Info "Connecting to database as '$dbUser'..."
    Write-Host ""
    
    docker exec -it $CONTAINER_NAME psql -U $dbUser $dbName
}

# Show logs
function Show-Logs {
    Print-Header
    Write-Host ""
    
    Print-Info "Showing PostgreSQL logs (Ctrl+C to exit)..."
    Write-Host ""
    
    docker logs -f $CONTAINER_NAME
}

# Seed database
function Seed-Database {
    Print-Header
    Write-Host ""
    
    Print-Info "Running database seed..."
    Write-Host ""
    
    pnpm db:seed
    
    Write-Host ""
}

# Force seed (bypasses existing data check)
function Force-Seed {
    Print-Header
    Write-Host ""
    
    Print-Warning "⚠️  WARNING: This will DELETE ALL DATA and reseed!"
    Write-Host ""
    
    $confirm = Read-Host "Are you sure you want to force reseed? (yes/no)"
    
    if ($confirm -ne "yes") {
        Print-Info "Force seed cancelled"
        return
    }
    
    Write-Host ""
    Print-Info "Resetting and reseeding database..."
    
    # Drop and recreate schema
    $dbUser = Get-Content "./secrets/postgres_user.txt" -Raw
    $dbName = Get-Content "./secrets/postgres_db.txt" -Raw
    $dbUser = $dbUser.Trim()
    $dbName = $dbName.Trim()
    
    $sql = @"
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO $dbUser;
GRANT ALL ON SCHEMA public TO public;
"@
    
    $sql | docker exec -i $CONTAINER_NAME psql -U $dbUser $dbName
    
    # Run migrations and seed
    pnpm db:push
    pnpm db:seed
    
    Print-Success "Database reseeded successfully!"
    Write-Host ""
}

# Show usage
function Show-Usage {
    Print-Header
    Write-Host ""
    Write-Host "Usage: .\scripts\db-manage.ps1 {command}" -ForegroundColor White
    Write-Host ""
    Write-Host "Commands:" -ForegroundColor White
    Write-Host "  status       - Show database status"
    Write-Host "  reset        - Reset database (delete all data)"
    Write-Host "  backup       - Create a backup of the database"
    Write-Host "  restore      - Restore database from backup"
    Write-Host "  connect      - Connect to database (psql)"
    Write-Host "  logs         - Show PostgreSQL logs"
    Write-Host "  seed         - Run database seed (skips if data exists)"
    Write-Host "  force-seed   - Force reseed (deletes existing data)"
    Write-Host ""
    Write-Host "Examples:" -ForegroundColor White
    Write-Host "  .\scripts\db-manage.ps1 status"
    Write-Host "  .\scripts\db-manage.ps1 backup"
    Write-Host "  .\scripts\db-manage.ps1 restore $BACKUP_DIR\pms_backup_20251017_120000.sql.zip"
    Write-Host ""
}

# Main
switch ($Command.ToLower()) {
    "status" {
        Show-Status
    }
    "reset" {
        Reset-Database
    }
    "backup" {
        Backup-Database
    }
    "restore" {
        Restore-Database -BackupPath $BackupFile
    }
    "connect" {
        Connect-Database
    }
    "logs" {
        Show-Logs
    }
    "seed" {
        Seed-Database
    }
    "force-seed" {
        Force-Seed
    }
    default {
        Show-Usage
    }
}

