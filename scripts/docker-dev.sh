#!/bin/bash
# Development Docker Helper Script

set -e

echo "🚀 Starting Development Environment..."
echo ""

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

case "$1" in
  start)
    echo -e "${GREEN}Starting all development services...${NC}"
    docker-compose up -d
    echo ""
    echo -e "${GREEN}✅ Development environment is running!${NC}"
    echo ""
    echo "📱 Application: http://localhost:3000"
    echo "🗄️  PostgreSQL: localhost:5432"
    echo ""
    echo "To view logs: npm run docker:dev:logs"
    ;;
    
  start-studio)
    echo -e "${GREEN}Starting development with Prisma Studio...${NC}"
    docker-compose --profile studio up -d
    echo ""
    echo -e "${GREEN}✅ Development environment with Prisma Studio is running!${NC}"
    echo ""
    echo "📱 Application: http://localhost:3000"
    echo "🎨 Prisma Studio: http://localhost:5555"
    echo "🗄️  PostgreSQL: localhost:5432"
    ;;
    
  stop)
    echo -e "${YELLOW}Stopping development services...${NC}"
    docker-compose down
    echo -e "${GREEN}✅ Development environment stopped${NC}"
    ;;
    
  restart)
    echo -e "${YELLOW}Restarting development services...${NC}"
    docker-compose restart
    echo -e "${GREEN}✅ Development environment restarted${NC}"
    ;;
    
  logs)
    docker-compose logs -f
    ;;
    
  logs-app)
    docker-compose logs -f app
    ;;
    
  logs-db)
    docker-compose logs -f postgres
    ;;
    
  shell)
    docker-compose exec app sh
    ;;
    
  db-shell)
    docker-compose exec postgres psql -U postgres -d project_management_dev
    ;;
    
  clean)
    echo -e "${YELLOW}Cleaning development environment...${NC}"
    docker-compose down -v
    echo -e "${GREEN}✅ Development environment cleaned (volumes removed)${NC}"
    ;;
    
  rebuild)
    echo -e "${YELLOW}Rebuilding development containers...${NC}"
    docker-compose down
    docker-compose build --no-cache
    docker-compose up -d
    echo -e "${GREEN}✅ Development environment rebuilt${NC}"
    ;;
    
  *)
    echo "Usage: npm run docker:dev:$1"
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

