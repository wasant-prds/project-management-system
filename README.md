# 📊 Project Management System

A comprehensive, full-stack project management system built with **Next.js 15**, **PostgreSQL**, **Prisma ORM**, and **Docker**.

![Next.js](https://img.shields.io/badge/Next.js-15.2-black?logo=next.js)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue?logo=postgresql)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma)

## ✨ Features

### Core Functionality
- 📁 **Project Management** - Track projects with status, priority, budgets, and progress
- ✅ **Task Management** - Assign tasks, set due dates, track time, and dependencies
- 🐛 **Issue Tracking** - Bug reports, feature requests, and enhancements
- 👥 **Team Management** - Departments, roles, and user profiles
- 📊 **Data Analysis** - Comprehensive analytics and insights dashboard
- 📋 **Kanban Board** - Visual workflow management with drag-and-drop
- 📅 **Daily Work Logs** - Track daily activities and time entries
- ⚙️ **Settings** - User profile and application preferences
- 💬 **Comments & Collaboration** - Discussion threads on tasks and issues
- ⏱️ **Time Tracking** - Log work hours and track estimates vs actuals
- 📝 **Activity Logs** - Complete audit trail of all actions
- 🔔 **Notifications** - Stay updated on project activities

### Technical Features
- 🎨 **Modern UI** - Built with Tailwind CSS and Radix UI
- 🌓 **Multi-Theme System** - Light, Dark, Special Dark, and System themes
- 📱 **Responsive Design** - Works seamlessly on all devices
- 🔒 **Type-Safe** - Full TypeScript coverage with Prisma
- 🐳 **Docker Ready** - Complete containerization for all environments
- 🗄️ **PostgreSQL** - Robust relational database with optimized queries
- 🚀 **Performance** - Optimized builds and database indexing (3-5x faster)
- 📡 **RESTful API** - Complete API routes for all operations
- 🛡️ **Smart Seeding** - Prevents data loss with automatic detection
- 💾 **Auto Backup** - Database backup and restore utilities
- 🔧 **Management Tools** - Bash & PowerShell scripts for easy database management

## 🚀 Quick Start

### Local Development (Without Docker)

```bash
# 1. Install dependencies
pnpm install

# 2. Set up PostgreSQL database
createdb project_management_dev

# 3. Configure environment
cp env.development.example .env

# 4. Set up database
pnpm db:push
pnpm db:seed

# 5. Start development server
pnpm dev

# Visit http://localhost:3000
```

### Docker Development (Recommended)

```bash
# Start everything with one command
npm run docker:dev:start

# With Prisma Studio (database GUI)
npm run docker:dev:start-studio

# Access:
# 🌐 App: http://localhost:3000
# 🎨 Prisma Studio: http://localhost:5555
```

**That's it!** Docker handles PostgreSQL, database setup, seeding, and hot reload. 🎉

See the scripts directory for detailed Docker management commands.

## 📚 Documentation

- **[Database README](./database/README.md)** - Database setup and management
- **[Secrets README](./secrets/README.md)** - Environment configuration guide

## 🏗️ Architecture

### Tech Stack

**Frontend:**
- Next.js 15 (App Router)
- React 19
- TypeScript 5
- Tailwind CSS 4
- Radix UI Components
- Lucide Icons

**Backend:**
- Next.js API Routes
- Prisma ORM
- PostgreSQL 16

**DevOps:**
- Docker & Docker Compose
- Multi-stage builds
- Environment-specific configurations

### Project Structure

```
├── app/
│   ├── api/              # API routes (projects, tasks, issues, users, work-logs)
│   ├── projects/         # Project management pages
│   ├── tasks/            # Task management pages
│   ├── issues/           # Issue tracking pages
│   ├── company/          # Team & department pages
│   ├── analysis/         # Data analysis and analytics
│   ├── board/            # Kanban board view
│   ├── daily-work/       # Daily work logs and time tracking
│   ├── settings/         # User settings and preferences
│   └── layout.tsx        # Root layout
├── components/
│   ├── ui/               # Reusable UI components
│   ├── app-sidebar.tsx   # Navigation sidebar
│   └── app-header.tsx    # Application header
├── lib/
│   ├── db.ts             # Prisma client instance
│   └── utils.ts          # Utility functions
├── prisma/
│   ├── schema.prisma     # Database schema (14 models)
│   └── seed.ts           # Mock data seeding
├── scripts/              # Docker helper scripts
├── Dockerfile            # Multi-stage Docker build
├── docker-compose.yml    # Development environment
├── docker-compose.uat.yml    # UAT environment
└── docker-compose.prod.yml   # Production environment
```

## 🗄️ Database Schema

14 interconnected tables:

- **Company** - Organization information
- **Department** - Company departments with leads
- **User** - Team members and authentication
- **Project** - Projects with budget and progress tracking
- **ProjectMember** - Many-to-many user-project relationship
- **Task** - Tasks with assignments and time tracking
- **TaskDependency** - Task dependencies
- **Issue** - Bug reports and feature requests
- **Comment** - Discussion threads
- **Milestone** - Project milestones
- **Document** - File attachments
- **TimeEntry** - Work time logging
- **ActivityLog** - Audit trail
- **Notification** - User notifications

See the Prisma schema file for detailed database documentation.

## 🐳 Docker Environments

### Development
- Hot reload enabled
- Source code mounted
- Prisma Studio available
- Auto database seeding

```bash
npm run docker:dev:start
```

### UAT (User Acceptance Testing)
- Production-like build
- Environment variable mapping
- Separate database and ports
- Migration support

```bash
npm run docker:uat:start
```

### Production
- Optimized standalone build
- Resource limits (2GB RAM, 2 CPUs)
- Health checks with auto-restart
- Automatic backups
- PostgreSQL performance tuning

```bash
npm run docker:prod:start
```

## 📊 Mock Data

The project includes comprehensive mock data:

- **1 Company** (ProjectHub Inc.)
- **5 Departments** (Engineering, Design, Product, Marketing, Operations)
- **10 Users** with complete profiles
- **6 Projects** in various statuses
- **12+ Tasks** with assignments and time entries
- **6 Issues** (bugs, features, enhancements)
- **Work Logs** for time tracking and daily activities
- **Analytics Data** for charts and insights
- Comments, notifications, activity logs, and more!

## 🛠️ Available Scripts

### Development
```bash
pnpm dev                 # Start dev server
pnpm build              # Build for production
pnpm start              # Start production server
pnpm lint               # Run linter
```

### Database
```bash
pnpm db:generate        # Generate Prisma Client
pnpm db:push            # Push schema to database
pnpm db:migrate         # Create migration
pnpm db:seed            # Seed database (smart - skips if data exists)
pnpm db:studio          # Open Prisma Studio
pnpm db:status          # 🆕 Check database status
pnpm db:backup          # 🆕 Create database backup
pnpm db:connect         # 🆕 Connect to database (psql)
pnpm db:logs            # 🆕 View PostgreSQL logs
pnpm db:reset           # 🆕 Reset database (delete all data)
pnpm db:force-seed      # 🆕 Force reseed (dangerous!)
```

> 💡 **New!** Database management tools with smart seeding, automatic backups, and performance optimizations. See [OPTIMIZATION_GUIDE.md](./OPTIMIZATION_GUIDE.md) for details.

### Docker - Development
```bash
npm run docker:dev:start              # Start dev environment
npm run docker:dev:start-studio       # Start with Prisma Studio
npm run docker:dev:stop               # Stop services
npm run docker:dev:logs               # View logs
npm run docker:dev:shell              # Open app shell
npm run docker:dev:clean              # Clean volumes
```

### Docker - UAT
```bash
npm run docker:uat:start              # Start UAT
npm run docker:uat:init               # Initialize database
npm run docker:uat:stop               # Stop UAT
npm run docker:uat:logs               # View logs
```

### Docker - Production
```bash
npm run docker:prod:start             # Start production
npm run docker:prod:init              # Initialize database
npm run docker:prod:stop              # Stop production
npm run docker:prod:health            # Check health
npm run docker:prod:backup-now        # Manual backup
```

## 📡 API Endpoints

### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create project
- `GET /api/projects/[id]` - Get project details
- `PATCH /api/projects/[id]` - Update project
- `DELETE /api/projects/[id]` - Delete project

### Tasks
- `GET /api/tasks` - List all tasks
- `POST /api/tasks` - Create task
- `GET /api/tasks/[id]` - Get task details
- `PATCH /api/tasks/[id]` - Update task
- `DELETE /api/tasks/[id]` - Delete task

### Issues
- `GET /api/issues` - List all issues
- `POST /api/issues` - Create issue
- `GET /api/issues/[id]` - Get issue details
- `PATCH /api/issues/[id]` - Update issue
- `DELETE /api/issues/[id]` - Delete issue

### Users
- `GET /api/users` - List all users

### Work Logs
- `GET /api/work-logs` - List all work logs
- `POST /api/work-logs` - Create work log
- `GET /api/work-logs/[id]` - Get work log details
- `PATCH /api/work-logs/[id]` - Update work log
- `DELETE /api/work-logs/[id]` - Delete work log

### Health Check
- `GET /api/health` - Application health status

## 🎯 Key Features

### Performance
- ⚡ Next.js 15 with App Router
- 🎨 Tailwind CSS for optimal styling
- 🗄️ PostgreSQL with strategic indexing
- 🔄 Prisma for type-safe database access
- 📦 Docker standalone build (70% smaller images)

### Security
- 🔒 Type-safe API routes
- 🛡️ Non-root Docker user
- 🔐 Environment variable isolation
- 📝 Activity logging and audit trails

### Developer Experience
- 🔥 Hot reload in development
- 🎨 Prisma Studio for database management
- 🐳 One-command Docker setup
- 📚 Comprehensive documentation
- 🧪 UAT environment for testing

### User Interface
- 📊 **Interactive Dashboard** - Real-time project metrics and statistics
- 📋 **Kanban Board** - Visual task management with drag-and-drop functionality
- 📈 **Data Analysis** - Comprehensive analytics with charts and insights
- 📅 **Daily Work Logs** - Time tracking and activity logging
- ⚙️ **Settings Panel** - User profile and application preferences
- 🎨 **Modern UI Components** - Built with Radix UI and Tailwind CSS

## 🚀 Deployment

### Development
```bash
npm run docker:dev:start
```

### UAT
```bash
# 1. Configure environment
cp env.uat.example .env.uat

# 2. Start UAT
npm run docker:uat:start
npm run docker:uat:init
```

### Production
```bash
# 1. Configure environment
cp env.production.example .env.production

# 2. Build and start
npm run docker:prod:rebuild
npm run docker:prod:start
npm run docker:prod:init
```

## 📦 Requirements

- Node.js 20+
- pnpm 10+
- PostgreSQL 16+ (or Docker)
- Docker Desktop (for containerized deployment)

## 🤝 Contributing

This is a demonstration project showcasing best practices for:
- Next.js application architecture
- PostgreSQL database design
- Docker multi-environment setup
- Type-safe full-stack development

## 📄 License

This project is provided as-is for educational and demonstration purposes.

## 🙏 Acknowledgments

Built with:
- [Next.js](https://nextjs.org/)
- [Prisma](https://www.prisma.io/)
- [PostgreSQL](https://www.postgresql.org/)
- [Docker](https://www.docker.com/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Radix UI](https://www.radix-ui.com/)

---

**Ready to start?** Run `npm run docker:dev:start` and you're good to go! 🚀

