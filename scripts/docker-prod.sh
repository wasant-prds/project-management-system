#!/bin/bash
# Production Docker Helper Script

set -e

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
DB_ROOT="$ROOT"
. "$ROOT/scripts/db-env.sh"

if [ ! -f "$ROOT/.env" ]; then
    echo "Error: root .env file not found. Copy .env.example to .env and set APP_ENV=prod." >&2
    exit 1
fi
DB_SITE="$(db_resolve_env)"
if [ "$DB_SITE" != "prod" ]; then
    echo "This is the production helper; set APP_ENV=prod in the root .env file." >&2
    exit 1
fi
APP_ENV="$DB_SITE"
export APP_ENV
COMPOSE_FILE="$(db_compose_file "$DB_SITE")"
cd "$ROOT"

compose() {
    db_compose --env-file "$ROOT/.env" -f "$COMPOSE_FILE" "$@"
}

compose_up() {
    if [ -s "$ROOT/infra/nginx/certs/fullchain.pem" ] && [ -s "$ROOT/infra/nginx/certs/privkey.pem" ]; then
        echo -e "${GREEN}Certificate files found. Starting nginx with the https profile.${NC}"
        compose --profile https "$@"
    else
        compose "$@"
    fi
}

echo "🏭 Production Environment Manager..."
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Warning for production operations
warning_prompt() {
    echo -e "${RED}⚠️  WARNING: This is a PRODUCTION operation!${NC}"
    read -p "Are you sure you want to continue? (yes/no): " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Operation cancelled"
        exit 0
    fi
}

case "$1" in
  start)
    warning_prompt
    echo -e "${GREEN}Starting production environment...${NC}"
    compose_up up -d
    echo ""
    echo -e "${GREEN}✅ Production environment is running!${NC}"
    echo ""
    echo "📱 Application: http://localhost:3002"
    echo "🗄️  PostgreSQL: localhost:5434"
    ;;
    
  start-backup)
    warning_prompt
    echo -e "${GREEN}Starting production with backup service...${NC}"
    compose_up --profile backup up -d
    echo -e "${GREEN}✅ Production with backup service is running!${NC}"
    ;;
    
  init)
    warning_prompt
    echo -e "${GREEN}Initializing production database...${NC}"
    compose up migrations
    echo -e "${GREEN}✅ Production database initialized${NC}"
    ;;
    
  stop)
    warning_prompt
    echo -e "${YELLOW}Stopping production services...${NC}"
    compose --profile https down
    echo -e "${GREEN}✅ Production environment stopped${NC}"
    ;;
    
  restart)
    warning_prompt
    echo -e "${YELLOW}Restarting production services...${NC}"
    compose restart app
    echo -e "${GREEN}✅ Production application restarted${NC}"
    ;;
    
  logs)
    compose logs -f "${2:-}"
    ;;
    
  status)
    compose ps
    ;;
    
  health)
    echo "Checking production health..."
    compose exec app node -e "require('http').get('http://localhost:3000/api/health', (r) => {console.log('Status:', r.statusCode)})"
    ;;
    
  backup-now)
    bash "$ROOT/scripts/db-manage.sh" backup
    ;;
    
  rebuild)
    warning_prompt
    echo -e "${YELLOW}Rebuilding production containers...${NC}"
    compose build --no-cache
    echo -e "${GREEN}✅ Production containers rebuilt${NC}"
    echo -e "${YELLOW}Run 'bash scripts/docker-prod.sh start' to start the environment${NC}"
    ;;

  https)
    shift
    bash "$ROOT/infra/certbot/setup-https.sh" "$@"
    ;;
    
  *)
    echo "Usage: bash scripts/docker-prod.sh $1"
    echo ""
    echo "Available commands:"
    echo "  start         - Start production (includes nginx when certificate files exist)"
    echo "  start-backup  - Start with backup service"
    echo "  init          - Initialize database"
    echo "  stop          - Stop all services"
    echo "  restart       - Restart application"
    echo "  logs          - View logs"
    echo "  status        - View service status"
    echo "  health        - Check application health"
    echo "  backup-now    - Create manual backup"
    echo "  rebuild       - Rebuild containers"
    echo "  https         - Issue or renew the production HTTPS certificate"
    exit 1
    ;;
esac
