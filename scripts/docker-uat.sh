#!/bin/bash
# UAT Docker Helper Script

set -e

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
DB_ROOT="$ROOT"
. "$ROOT/scripts/db-env.sh"

if [ ! -f "$ROOT/.env" ]; then
    echo "Error: root .env file not found. Copy .env.example to .env and set APP_ENV=uat." >&2
    exit 1
fi
DB_SITE="$(db_resolve_env)"
if [ "$DB_SITE" != "uat" ]; then
    echo "This is the UAT helper; set APP_ENV=uat in the root .env file." >&2
    exit 1
fi
APP_ENV="$DB_SITE"
export APP_ENV
COMPOSE_FILE="$(db_compose_file "$DB_SITE")"
cd "$ROOT"

compose() {
    db_compose --env-file "$ROOT/.env" -f "$COMPOSE_FILE" "$@"
}

echo "🧪 UAT Environment Manager..."
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

case "$1" in
  start)
    echo -e "${GREEN}Starting UAT environment...${NC}"
    compose up -d
    echo ""
    echo -e "${GREEN}✅ UAT environment is running!${NC}"
    echo ""
    echo "📱 Application: http://localhost:3001"
    echo "🗄️  PostgreSQL: localhost:5433"
    ;;
    
  init)
    echo -e "${GREEN}Initializing UAT database...${NC}"
    compose up migrations
    echo -e "${GREEN}✅ UAT database initialized${NC}"
    ;;
    
  stop)
    echo -e "${YELLOW}Stopping UAT services...${NC}"
    compose down
    echo -e "${GREEN}✅ UAT environment stopped${NC}"
    ;;
    
  restart)
    echo -e "${YELLOW}Restarting UAT services...${NC}"
    compose restart
    echo -e "${GREEN}✅ UAT environment restarted${NC}"
    ;;
    
  logs)
    compose logs -f
    ;;
    
  logs-app)
    compose logs -f app
    ;;
    
  status)
    compose ps
    ;;
    
  shell)
    compose exec app sh
    ;;
    
  db-shell)
    compose exec postgres psql -U postgres -d project_management_uat
    ;;
    
  rebuild)
    echo -e "${YELLOW}Rebuilding UAT containers...${NC}"
    compose down
    compose build --no-cache
    compose up -d
    echo -e "${GREEN}✅ UAT environment rebuilt${NC}"
    ;;
    
  *)
    echo "Usage: bash scripts/docker-uat.sh $1"
    echo ""
    echo "Available commands:"
    echo "  start      - Start UAT environment"
    echo "  init       - Initialize database"
    echo "  stop       - Stop all services"
    echo "  restart    - Restart all services"
    echo "  logs       - View all logs"
    echo "  logs-app   - View application logs"
    echo "  status     - View service status"
    echo "  shell      - Open shell in app container"
    echo "  db-shell   - Open PostgreSQL shell"
    echo "  rebuild    - Rebuild containers"
    exit 1
    ;;
esac
