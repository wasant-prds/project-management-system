#!/bin/bash
# UAT Docker Helper Script

set -e

echo "🧪 UAT Environment Manager..."
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check if .env.uat exists
if [ ! -f .env.uat ]; then
    echo -e "${RED}❌ Error: .env.uat file not found${NC}"
    echo "Please create .env.uat from env.uat.example"
    exit 1
fi

case "$1" in
  start)
    echo -e "${GREEN}Starting UAT environment...${NC}"
    docker-compose -f docker-compose.uat.yml --env-file .env.uat up -d
    echo ""
    echo -e "${GREEN}✅ UAT environment is running!${NC}"
    echo ""
    echo "📱 Application: http://localhost:3001"
    echo "🗄️  PostgreSQL: localhost:5433"
    ;;
    
  init)
    echo -e "${GREEN}Initializing UAT database...${NC}"
    docker-compose -f docker-compose.uat.yml --env-file .env.uat --profile init up migrations
    echo -e "${GREEN}✅ UAT database initialized${NC}"
    ;;
    
  stop)
    echo -e "${YELLOW}Stopping UAT services...${NC}"
    docker-compose -f docker-compose.uat.yml --env-file .env.uat down
    echo -e "${GREEN}✅ UAT environment stopped${NC}"
    ;;
    
  restart)
    echo -e "${YELLOW}Restarting UAT services...${NC}"
    docker-compose -f docker-compose.uat.yml --env-file .env.uat restart
    echo -e "${GREEN}✅ UAT environment restarted${NC}"
    ;;
    
  logs)
    docker-compose -f docker-compose.uat.yml --env-file .env.uat logs -f
    ;;
    
  logs-app)
    docker-compose -f docker-compose.uat.yml --env-file .env.uat logs -f app
    ;;
    
  status)
    docker-compose -f docker-compose.uat.yml --env-file .env.uat ps
    ;;
    
  shell)
    docker-compose -f docker-compose.uat.yml --env-file .env.uat exec app sh
    ;;
    
  db-shell)
    docker-compose -f docker-compose.uat.yml --env-file .env.uat exec postgres psql -U postgres -d project_management_uat
    ;;
    
  rebuild)
    echo -e "${YELLOW}Rebuilding UAT containers...${NC}"
    docker-compose -f docker-compose.uat.yml --env-file .env.uat down
    docker-compose -f docker-compose.uat.yml --env-file .env.uat build --no-cache
    docker-compose -f docker-compose.uat.yml --env-file .env.uat up -d
    echo -e "${GREEN}✅ UAT environment rebuilt${NC}"
    ;;
    
  *)
    echo "Usage: npm run docker:uat:$1"
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

