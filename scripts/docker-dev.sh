#!/bin/bash
# Development Docker Helper Script

set -e

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
DB_ROOT="$ROOT"
. "$ROOT/scripts/db-env.sh"

if [ ! -f "$ROOT/.env" ]; then
  echo "Error: root .env file not found. Copy .env.example to .env and set APP_ENV." >&2
  exit 1
fi
DB_SITE="$(db_resolve_env)"
case "$DB_SITE" in
  local|dev) ;;
  *) echo "This is the development helper; set APP_ENV=local or APP_ENV=dev in .env." >&2; exit 1 ;;
esac
APP_ENV="$DB_SITE"
export APP_ENV
COMPOSE_FILE="$(db_compose_file "$DB_SITE")"
cd "$ROOT"

compose() {
  db_compose --env-file "$ROOT/.env" -f "$COMPOSE_FILE" "$@"
}

echo "🚀 Starting Development Environment..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

case "$1" in
  start)
    echo -e "${GREEN}Starting all development services...${NC}"
    compose up -d
    echo ""
    echo -e "${GREEN}✅ Development environment is running!${NC}"
    echo ""
    echo "📱 Application: http://localhost:3000"
    echo "🗄️  PostgreSQL: localhost:5432"
    echo ""
    echo "To view logs: bash scripts/docker-dev.sh logs"
    ;;
    
  start-studio)
    echo -e "${GREEN}Starting development with Prisma Studio...${NC}"
    compose --profile studio up -d
    echo ""
    echo -e "${GREEN}✅ Development environment with Prisma Studio is running!${NC}"
    echo ""
    echo "📱 Application: http://localhost:3000"
    echo "🎨 Prisma Studio: http://localhost:5555"
    echo "🗄️  PostgreSQL: localhost:5432"
    ;;
    
  stop)
    echo -e "${YELLOW}Stopping development services...${NC}"
    compose down
    echo -e "${GREEN}✅ Development environment stopped${NC}"
    ;;
    
  restart)
    echo -e "${YELLOW}Restarting development services...${NC}"
    compose restart
    echo -e "${GREEN}✅ Development environment restarted${NC}"
    ;;
    
  logs)
    compose logs -f
    ;;
    
  logs-app)
    compose logs -f app
    ;;
    
  logs-db)
    compose logs -f postgres
    ;;
    
  shell)
    compose exec app sh
    ;;
    
  db-shell)
    compose exec postgres psql -U postgres -d project_management_dev
    ;;
    
  clean)
    echo -e "${YELLOW}Cleaning development environment...${NC}"
    compose down -v
    echo -e "${GREEN}✅ Development environment cleaned (volumes removed)${NC}"
    ;;
    
  rebuild)
    echo -e "${YELLOW}Rebuilding development containers...${NC}"
    compose down
    compose build --no-cache
    compose up -d
    echo -e "${GREEN}✅ Development environment rebuilt${NC}"
    ;;
    
  *)
    echo "Usage: bash scripts/docker-dev.sh $1"
    echo ""
    echo "Available commands:"
    echo "  start         - Start development environment"
    echo "  start-studio  - Start with Prisma Studio"
    echo "  stop          - Stop all services"
    echo "  restart       - Restart all services"
    echo "  logs          - View all logs"
    echo "  logs-app      - View application logs"
    echo "  logs-db       - View database logs"
    echo "  shell         - Open shell in app container"
    echo "  db-shell      - Open PostgreSQL shell"
    echo "  clean         - Stop and remove volumes"
    echo "  rebuild       - Rebuild containers"
    exit 1
    ;;
esac
