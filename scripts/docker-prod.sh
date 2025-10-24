#!/bin/bash
# Production Docker Helper Script

set -e

echo "🏭 Production Environment Manager..."
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if .env.production exists
if [ ! -f .env.production ]; then
    echo -e "${RED}❌ Error: .env.production file not found${NC}"
    echo "Please create .env.production from env.production.example"
    exit 1
fi

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
    docker-compose -f docker-compose.prod.yml --env-file .env.production up -d
    echo ""
    echo -e "${GREEN}✅ Production environment is running!${NC}"
    echo ""
    echo "📱 Application: http://localhost:3002"
    echo "🗄️  PostgreSQL: localhost:5434"
    ;;
    
  start-backup)
    warning_prompt
    echo -e "${GREEN}Starting production with backup service...${NC}"
    docker-compose -f docker-compose.prod.yml --env-file .env.production --profile backup up -d
    echo -e "${GREEN}✅ Production with backup service is running!${NC}"
    ;;
    
  init)
    warning_prompt
    echo -e "${GREEN}Initializing production database...${NC}"
    docker-compose -f docker-compose.prod.yml --env-file .env.production --profile init up migrations
    echo -e "${GREEN}✅ Production database initialized${NC}"
    ;;
    
  stop)
    warning_prompt
    echo -e "${YELLOW}Stopping production services...${NC}"
    docker-compose -f docker-compose.prod.yml --env-file .env.production down
    echo -e "${GREEN}✅ Production environment stopped${NC}"
    ;;
    
  restart)
    warning_prompt
    echo -e "${YELLOW}Restarting production services...${NC}"
    docker-compose -f docker-compose.prod.yml --env-file .env.production restart app
    echo -e "${GREEN}✅ Production application restarted${NC}"
    ;;
    
  logs)
    docker-compose -f docker-compose.prod.yml --env-file .env.production logs -f "$2"
    ;;
    
  status)
    docker-compose -f docker-compose.prod.yml --env-file .env.production ps
    ;;
    
  health)
    echo "Checking production health..."
    docker-compose -f docker-compose.prod.yml --env-file .env.production exec app node -e "require('http').get('http://localhost:3000/api/health', (r) => {console.log('Status:', r.statusCode)})"
    ;;
    
  backup-now)
    echo -e "${GREEN}Creating manual backup...${NC}"
    docker-compose -f docker-compose.prod.yml --env-file .env.production exec postgres pg_dump -U postgres -d project_management_prod > "backup_$(date +%Y%m%d_%H%M%S).sql"
    echo -e "${GREEN}✅ Backup created${NC}"
    ;;
    
  rebuild)
    warning_prompt
    echo -e "${YELLOW}Rebuilding production containers...${NC}"
    docker-compose -f docker-compose.prod.yml --env-file .env.production build --no-cache
    echo -e "${GREEN}✅ Production containers rebuilt${NC}"
    echo -e "${YELLOW}Run 'npm run docker:prod:start' to start the environment${NC}"
    ;;
    
  *)
    echo "Usage: npm run docker:prod:$1"
    echo ""
    echo "Available commands:"
    echo "  start         - Start production environment"
    echo "  start-backup  - Start with backup service"
    echo "  init          - Initialize database"
    echo "  stop          - Stop all services"
    echo "  restart       - Restart application"
    echo "  logs          - View logs"
    echo "  status        - View service status"
    echo "  health        - Check application health"
    echo "  backup-now    - Create manual backup"
    echo "  rebuild       - Rebuild containers"
    exit 1
    ;;
esac

