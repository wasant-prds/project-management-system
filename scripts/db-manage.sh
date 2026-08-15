#!/bin/bash

# Database Management Script for Project Management System
# This script provides utilities for managing the PostgreSQL database

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
CONTAINER_NAME="pms-postgres-dev"
VOLUME_NAME="pms-postgres-data-dev"
DATA_DIR="./database/postgres/data"
BACKUP_DIR="./database/backups"

# Functions
print_header() {
    echo -e "${BLUE}================================================${NC}"
    echo -e "${BLUE}  Database Management - PMS${NC}"
    echo -e "${BLUE}================================================${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ $1${NC}"
}

# Check if database directory exists
check_data_dir() {
    if [ -d "$DATA_DIR" ] && [ "$(ls -A $DATA_DIR)" ]; then
        return 0 # Has data
    else
        return 1 # Empty or doesn't exist
    fi
}

# Check if container is running
check_container() {
    if docker ps -q -f name=$CONTAINER_NAME | grep -q .; then
        return 0 # Running
    else
        return 1 # Not running
    fi
}

# Status check
status() {
    print_header
    echo ""
    
    # Check container status
    if check_container; then
        print_success "PostgreSQL container is running"
        
        # Get container info
        echo ""
        print_info "Container Details:"
        docker ps -f name=$CONTAINER_NAME --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
        
        # Check connection
        echo ""
        print_info "Connection Test:"
        if docker exec $CONTAINER_NAME pg_isready > /dev/null 2>&1; then
            print_success "Database is accepting connections"
        else
            print_error "Database is not accepting connections"
        fi
    else
        print_warning "PostgreSQL container is not running"
    fi
    
    # Check data directory
    echo ""
    print_info "Data Directory Status:"
    if check_data_dir; then
        DATA_SIZE=$(du -sh $DATA_DIR 2>/dev/null | cut -f1)
        print_success "Data exists (Size: $DATA_SIZE)"
    else
        print_warning "No data found (Database is empty)"
    fi
    
    # Check volume
    echo ""
    print_info "Volume Status:"
    if docker volume inspect $VOLUME_NAME > /dev/null 2>&1; then
        print_success "Volume '$VOLUME_NAME' exists"
    else
        print_warning "Volume '$VOLUME_NAME' does not exist"
    fi
    
    echo ""
}

# Reset database
reset() {
    print_header
    echo ""
    print_warning "⚠️  WARNING: This will DELETE ALL DATABASE DATA!"
    echo ""
    read -p "Are you sure you want to reset the database? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        print_info "Reset cancelled"
        exit 0
    fi
    
    echo ""
    print_info "Stopping containers..."
    docker-compose down
    
    print_info "Removing database data..."
    rm -rf $DATA_DIR/*
    
    print_success "Database reset complete!"
    print_info "Run 'docker-compose up -d' to start with fresh data"
    echo ""
}

# Backup database
backup() {
    print_header
    echo ""
    
    if ! check_container; then
        print_error "Container is not running. Start it with 'docker-compose up -d'"
        exit 1
    fi
    
    # Create backup directory
    mkdir -p $BACKUP_DIR
    
    # Generate backup filename with timestamp
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BACKUP_FILE="$BACKUP_DIR/pms_backup_$TIMESTAMP.sql"
    
    print_info "Creating backup: $BACKUP_FILE"
    
    # Read secrets
    DB_USER=$(cat ./secrets/postgres_user.txt)
    DB_NAME=$(cat ./secrets/postgres_db.txt)
    
    # Create backup
    docker exec $CONTAINER_NAME pg_dump -U "$DB_USER" "$DB_NAME" > "$BACKUP_FILE"
    
    # Compress backup
    print_info "Compressing backup..."
    gzip "$BACKUP_FILE"
    
    print_success "Backup created: ${BACKUP_FILE}.gz"
    
    # Show backup size
    BACKUP_SIZE=$(du -sh "${BACKUP_FILE}.gz" | cut -f1)
    print_info "Backup size: $BACKUP_SIZE"
    echo ""
}

# Restore database from backup
restore() {
    print_header
    echo ""
    
    if [ -z "$1" ]; then
        print_error "Please specify a backup file"
        print_info "Usage: $0 restore <backup_file>"
        echo ""
        print_info "Available backups:"
        ls -lh $BACKUP_DIR/*.sql.gz 2>/dev/null || print_warning "No backups found"
        exit 1
    fi
    
    BACKUP_FILE="$1"
    
    if [ ! -f "$BACKUP_FILE" ]; then
        print_error "Backup file not found: $BACKUP_FILE"
        exit 1
    fi
    
    if ! check_container; then
        print_error "Container is not running. Start it with 'docker-compose up -d'"
        exit 1
    fi
    
    print_warning "⚠️  WARNING: This will OVERWRITE the current database!"
    echo ""
    read -p "Are you sure you want to restore from backup? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        print_info "Restore cancelled"
        exit 0
    fi
    
    echo ""
    print_info "Restoring from: $BACKUP_FILE"
    
    # Read secrets
    DB_USER=$(cat ./secrets/postgres_user.txt)
    DB_NAME=$(cat ./secrets/postgres_db.txt)
    
    # Decompress if needed
    if [[ $BACKUP_FILE == *.gz ]]; then
        print_info "Decompressing backup..."
        gunzip -c "$BACKUP_FILE" | docker exec -i $CONTAINER_NAME psql -U "$DB_USER" "$DB_NAME"
    else
        docker exec -i $CONTAINER_NAME psql -U "$DB_USER" "$DB_NAME" < "$BACKUP_FILE"
    fi
    
    print_success "Database restored successfully!"
    echo ""
}

# Connect to database
connect() {
    print_header
    echo ""
    
    if ! check_container; then
        print_error "Container is not running. Start it with 'docker-compose up -d'"
        exit 1
    fi
    
    DB_USER=$(cat ./secrets/postgres_user.txt)
    DB_NAME=$(cat ./secrets/postgres_db.txt)
    
    print_info "Connecting to database as '$DB_USER'..."
    echo ""
    
    docker exec -it $CONTAINER_NAME psql -U "$DB_USER" "$DB_NAME"
}

# Show logs
logs() {
    print_header
    echo ""
    
    print_info "Showing PostgreSQL logs (Ctrl+C to exit)..."
    echo ""
    
    docker logs -f $CONTAINER_NAME
}

# Seed database
seed() {
    print_header
    echo ""
    
    print_info "Running database seed..."
    echo ""
    
    pnpm prisma db seed
    
    echo ""
}

# Force seed (bypasses existing data check)
force_seed() {
    print_header
    echo ""
    
    print_warning "⚠️  WARNING: This will DELETE ALL DATA and reseed!"
    echo ""
    read -p "Are you sure you want to force reseed? (yes/no): " confirm
    
    if [ "$confirm" != "yes" ]; then
        print_info "Force seed cancelled"
        exit 0
    fi
    
    echo ""
    print_info "Resetting and reseeding database..."
    
    # Drop and recreate schema
    DB_USER=$(cat ./secrets/postgres_user.txt)
    DB_NAME=$(cat ./secrets/postgres_db.txt)
    
    docker exec -i $CONTAINER_NAME psql -U "$DB_USER" "$DB_NAME" << EOF
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO $DB_USER;
GRANT ALL ON SCHEMA public TO public;
EOF
    
    # Run migrations and seed
    sh scripts/db-push-safe.sh
    pnpm prisma db seed
    
    print_success "Database reseeded successfully!"
    echo ""
}

# Show usage
usage() {
    print_header
    echo ""
    echo "Usage: $0 {command}"
    echo ""
    echo "Commands:"
    echo "  status       - Show database status"
    echo "  reset        - Reset database (delete all data)"
    echo "  backup       - Create a backup of the database"
    echo "  restore      - Restore database from backup"
    echo "  connect      - Connect to database (psql)"
    echo "  logs         - Show PostgreSQL logs"
    echo "  seed         - Run database seed (skips if data exists)"
    echo "  force-seed   - Force reseed (deletes existing data)"
    echo ""
    echo "Examples:"
    echo "  $0 status"
    echo "  $0 backup"
    echo "  $0 restore $BACKUP_DIR/pms_backup_20251017_120000.sql.gz"
    echo ""
}

# Main
case "${1:-}" in
    status)
        status
        ;;
    reset)
        reset
        ;;
    backup)
        backup
        ;;
    restore)
        restore "$2"
        ;;
    connect)
        connect
        ;;
    logs)
        logs
        ;;
    seed)
        seed
        ;;
    force-seed)
        force_seed
        ;;
    *)
        usage
        exit 1
        ;;
esac

