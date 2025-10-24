import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding database...')

  // Check if data already exists
  console.log('🔍 Checking for existing data...')
  const existingCompanyCount = await prisma.company.count()
  const existingUserCount = await prisma.user.count()
  const existingProjectCount = await prisma.project.count()

  if (existingCompanyCount > 0 || existingUserCount > 0 || existingProjectCount > 0) {
    console.log('⚠️  Database already contains data:')
    console.log(`   - ${existingCompanyCount} Companies`)
    console.log(`   - ${existingUserCount} Users`)
    console.log(`   - ${existingProjectCount} Projects`)
    console.log('⏭️  Skipping seed to prevent data loss.')
    console.log('💡 If you want to re-seed, please manually delete the data first or drop the database.')
    return
  }

  console.log('✅ Database is empty. Starting seed process...')

  // Clean existing data (safety measure)
  console.log('🧹 Cleaning existing data...')
  await prisma.notification.deleteMany()
  await prisma.activityLog.deleteMany()
  await prisma.timeEntry.deleteMany()
  await prisma.document.deleteMany()
  await prisma.comment.deleteMany()
  await prisma.taskDependency.deleteMany()
  await prisma.task.deleteMany()
  await prisma.milestone.deleteMany()
  await prisma.issue.deleteMany()
  await prisma.projectMember.deleteMany()
  await prisma.project.deleteMany()
  await prisma.user.deleteMany()
  await prisma.department.deleteMany()
  await prisma.company.deleteMany()

  // Create Company
  console.log('🏢 Creating company...')
  const company = await prisma.company.create({
    data: {
      name: 'ProjectHub Inc.',
      industry: 'Technology',
      email: 'contact@projecthub.com',
      phone: '+1 (555) 000-0000',
      address: '123 Tech Street, San Francisco, CA 94105',
      website: 'https://projecthub.com',
      description: 'A leading project management solutions provider',
    },
  })

  // Create Departments
  console.log('🏛️ Creating departments...')
  const engineeringDept = await prisma.department.create({
    data: {
      name: 'Engineering',
      description: 'Software development and technical infrastructure',
      companyId: company.id,
    },
  })

  const designDept = await prisma.department.create({
    data: {
      name: 'Design',
      description: 'UI/UX design and brand identity',
      companyId: company.id,
    },
  })

  const productDept = await prisma.department.create({
    data: {
      name: 'Product',
      description: 'Product strategy and roadmap planning',
      companyId: company.id,
    },
  })

  const marketingDept = await prisma.department.create({
    data: {
      name: 'Marketing',
      description: 'Marketing campaigns and brand awareness',
      companyId: company.id,
    },
  })

  const operationsDept = await prisma.department.create({
    data: {
      name: 'Operations',
      description: 'Business operations and process optimization',
      companyId: company.id,
    },
  })

  // Create Users
  console.log('👥 Creating users...')
  const users = await Promise.all([
    prisma.user.create({
      data: {
        email: 'wasant_p@dhas.com',
        name: 'Wasant Pep',
        password: 'hashed_password',
        role: 'Admin',
        avatar: 'Pep',
        phone: '+66 81 999 9999',
        status: 'Active',
        joinDate: new Date('2025-10-16'),
      },
    }),
    prisma.user.create({
      data: {
        email: 'sarah.chen@projecthub.com',
        name: 'Sarah Chen',
        password: 'hashed_password', // In production, use proper hashing
        role: 'manager',
        avatar: 'SC',
        phone: '+1 (555) 123-4567',
        status: 'Active',
        departmentId: productDept.id,
        joinDate: new Date('2023-01-15'),
      },
    }),
    prisma.user.create({
      data: {
        email: 'mike.johnson@projecthub.com',
        name: 'Mike Johnson',
        password: 'hashed_password',
        role: 'manager',
        avatar: 'MJ',
        phone: '+1 (555) 234-5678',
        status: 'Active',
        departmentId: engineeringDept.id,
        joinDate: new Date('2022-08-20'),
      },
    }),
    prisma.user.create({
      data: {
        email: 'emily.davis@projecthub.com',
        name: 'Emily Davis',
        password: 'hashed_password',
        role: 'member',
        avatar: 'ED',
        phone: '+1 (555) 345-6789',
        status: 'Active',
        departmentId: designDept.id,
        joinDate: new Date('2023-03-10'),
      },
    }),
    prisma.user.create({
      data: {
        email: 'alex.turner@projecthub.com',
        name: 'Alex Turner',
        password: 'hashed_password',
        role: 'member',
        avatar: 'AT',
        phone: '+1 (555) 456-7890',
        status: 'Active',
        departmentId: engineeringDept.id,
        joinDate: new Date('2023-06-01'),
      },
    }),
    prisma.user.create({
      data: {
        email: 'lisa.wang@projecthub.com',
        name: 'Lisa Wang',
        password: 'hashed_password',
        role: 'member',
        avatar: 'LW',
        phone: '+1 (555) 567-8901',
        status: 'Active',
        departmentId: engineeringDept.id,
        joinDate: new Date('2023-02-14'),
      },
    }),
    prisma.user.create({
      data: {
        email: 'david.kim@projecthub.com',
        name: 'David Kim',
        password: 'hashed_password',
        role: 'member',
        avatar: 'DK',
        phone: '+1 (555) 678-9012',
        status: 'Active',
        departmentId: engineeringDept.id,
        joinDate: new Date('2023-04-05'),
      },
    }),
    prisma.user.create({
      data: {
        email: 'rachel.moore@projecthub.com',
        name: 'Rachel Moore',
        password: 'hashed_password',
        role: 'member',
        avatar: 'RM',
        phone: '+1 (555) 789-0123',
        status: 'Active',
        departmentId: designDept.id,
        joinDate: new Date('2023-05-20'),
      },
    }),
    prisma.user.create({
      data: {
        email: 'james.wilson@projecthub.com',
        name: 'James Wilson',
        password: 'hashed_password',
        role: 'member',
        avatar: 'JW',
        phone: '+1 (555) 890-1234',
        status: 'Active',
        departmentId: marketingDept.id,
        joinDate: new Date('2023-07-10'),
      },
    }),
    prisma.user.create({
      data: {
        email: 'olivia.taylor@projecthub.com',
        name: 'Olivia Taylor',
        password: 'hashed_password',
        role: 'member',
        avatar: 'OT',
        phone: '+1 (555) 901-2345',
        status: 'Active',
        departmentId: operationsDept.id,
        joinDate: new Date('2023-08-15'),
      },
    }),
    prisma.user.create({
      data: {
        email: 'chris.anderson@projecthub.com',
        name: 'Chris Anderson',
        password: 'hashed_password',
        role: 'member',
        avatar: 'CA',
        phone: '+1 (555) 012-3456',
        status: 'Active',
        departmentId: engineeringDept.id,
        joinDate: new Date('2023-09-01'),
      },
    }),
  ])

  // Update department leads
  await prisma.department.update({
    where: { id: productDept.id },
    data: { leadId: users[0].id }, // Sarah Chen
  })
  await prisma.department.update({
    where: { id: engineeringDept.id },
    data: { leadId: users[1].id }, // Mike Johnson
  })
  await prisma.department.update({
    where: { id: designDept.id },
    data: { leadId: users[2].id }, // Emily Davis
  })
  await prisma.department.update({
    where: { id: marketingDept.id },
    data: { leadId: users[7].id }, // James Wilson
  })
  await prisma.department.update({
    where: { id: operationsDept.id },
    data: { leadId: users[8].id }, // Olivia Taylor
  })

  // Create Projects
  console.log('📁 Creating projects...')
  const projects = await Promise.all([
    prisma.project.create({
      data: {
        name: 'AI - Backend API',
        description: 'Development of AI-powered backend API services',
        status: 'In Progress',
        priority: 'High',
        startDate: new Date('2025-07-01'),
        dueDate: new Date('2025-12-31'),
        budget: 150000,
        spent: 75000,
        progress: 50,
        creatorId: users[1].id,
        departmentId: engineeringDept.id,
        colorProject: '#FF0000',
      },
    }),
    prisma.project.create({
      data: {
        name: 'AI - Frontend NextJS',
        description: 'NextJS frontend application for AI services',
        status: 'In Progress',
        priority: 'High',
        startDate: new Date('2025-08-01'),
        dueDate: new Date('2025-12-31'),
        budget: 120000,
        spent: 48000,
        progress: 40,
        creatorId: users[2].id,
        departmentId: engineeringDept.id,
        colorProject: '#FF6B00',
      },
    }),
    prisma.project.create({
      data: {
        name: 'Bill-Collection',
        description: 'Automated bill collection and payment tracking system',
        status: 'In Progress',
        priority: 'Medium',
        startDate: new Date('2025-06-15'),
        dueDate: new Date('2025-11-30'),
        budget: 85000,
        spent: 59500,
        progress: 70,
        creatorId: users[8].id,
        departmentId: operationsDept.id,
        colorProject: '#FFD700',
      },
    }),
    prisma.project.create({
      data: {
        name: 'Cipher',
        description: 'Data encryption and security management platform',
        status: 'Review',
        priority: 'High',
        startDate: new Date('2025-05-01'),
        dueDate: new Date('2025-10-31'),
        budget: 95000,
        spent: 85500,
        progress: 90,
        creatorId: users[1].id,
        departmentId: engineeringDept.id,
        colorProject: '#00C853',
      },
    }),
    prisma.project.create({
      data: {
        name: 'Corporate - API',
        description: 'Corporate backend API infrastructure',
        status: 'In Progress',
        priority: 'High',
        startDate: new Date('2025-07-15'),
        dueDate: new Date('2026-01-31'),
        budget: 180000,
        spent: 90000,
        progress: 50,
        creatorId: users[1].id,
        departmentId: engineeringDept.id,
        colorProject: '#2196F3',
      },
    }),
    prisma.project.create({
      data: {
        name: 'Corporate - Frontend',
        description: 'Corporate web application frontend',
        status: 'In Progress',
        priority: 'High',
        startDate: new Date('2025-08-01'),
        dueDate: new Date('2026-01-31'),
        budget: 160000,
        spent: 80000,
        progress: 50,
        creatorId: users[2].id,
        departmentId: designDept.id,
        colorProject: '#00BCD4',
      },
    }),
    prisma.project.create({
      data: {
        name: 'Dropship',
        description: 'Dropshipping platform and vendor management system',
        status: 'In Progress',
        priority: 'Medium',
        startDate: new Date('2025-09-01'),
        dueDate: new Date('2026-03-31'),
        budget: 110000,
        spent: 33000,
        progress: 30,
        creatorId: users[8].id,
        departmentId: operationsDept.id,
        colorProject: '#9C27B0',
      },
    }),
    prisma.project.create({
      data: {
        name: 'EDI',
        description: 'Electronic Data Interchange system integration',
        status: 'In Progress',
        priority: 'Medium',
        startDate: new Date('2025-08-15'),
        dueDate: new Date('2026-02-28'),
        budget: 130000,
        spent: 52000,
        progress: 40,
        creatorId: users[1].id,
        departmentId: engineeringDept.id,
        colorProject: '#E91E63',
      },
    }),
    prisma.project.create({
      data: {
        name: 'Goods Return',
        description: 'Return merchandise authorization and tracking system',
        status: 'Review',
        priority: 'Medium',
        startDate: new Date('2025-06-01'),
        dueDate: new Date('2025-11-30'),
        budget: 75000,
        spent: 67500,
        progress: 90,
        creatorId: users[8].id,
        departmentId: operationsDept.id,
        colorProject: '#795548',
      },
    }),
    prisma.project.create({
      data: {
        name: 'i-Claim',
        description: 'Insurance and warranty claim management platform',
        status: 'In Progress',
        priority: 'High',
        startDate: new Date('2025-07-01'),
        dueDate: new Date('2025-12-31'),
        budget: 140000,
        spent: 84000,
        progress: 60,
        creatorId: users[0].id,
        departmentId: operationsDept.id,
        colorProject: '#FF5722',
      },
    }),
    prisma.project.create({
      data: {
        name: 'iSFA',
        description: 'Integrated Sales Force Automation system',
        status: 'In Progress',
        priority: 'High',
        startDate: new Date('2025-06-15'),
        dueDate: new Date('2025-12-15'),
        budget: 165000,
        spent: 115500,
        progress: 70,
        creatorId: users[7].id,
        departmentId: marketingDept.id,
        colorProject: '#3F51B5',
      },
    }),
    prisma.project.create({
      data: {
        name: 'IMS',
        description: 'Inventory Management System',
        status: 'In Progress',
        priority: 'Medium',
        startDate: new Date('2025-08-01'),
        dueDate: new Date('2026-02-28'),
        budget: 125000,
        spent: 50000,
        progress: 40,
        creatorId: users[8].id,
        departmentId: operationsDept.id,
        colorProject: '#009688',
      },
    }),
    prisma.project.create({
      data: {
        name: 'Internal Claim',
        description: 'Internal claims and reimbursement processing system',
        status: 'Planning',
        priority: 'Low',
        startDate: new Date('2025-10-01'),
        dueDate: new Date('2026-04-30'),
        budget: 60000,
        spent: 6000,
        progress: 10,
        creatorId: users[8].id,
        departmentId: operationsDept.id,
        colorProject: '#607D8B',
      },
    }),
    prisma.project.create({
      data: {
        name: 'Odoo',
        description: 'Odoo ERP customization and integration',
        status: 'In Progress',
        priority: 'High',
        startDate: new Date('2025-05-15'),
        dueDate: new Date('2025-11-30'),
        budget: 175000,
        spent: 140000,
        progress: 80,
        creatorId: users[1].id,
        departmentId: engineeringDept.id,
        colorProject: '#8BC34A',
      },
    }),
    prisma.project.create({
      data: {
        name: 'PRECRM',
        description: 'Pre-sales CRM and lead management platform',
        status: 'In Progress',
        priority: 'High',
        startDate: new Date('2025-07-01'),
        dueDate: new Date('2026-01-31'),
        budget: 155000,
        spent: 77500,
        progress: 50,
        creatorId: users[7].id,
        departmentId: marketingDept.id,
        colorProject: '#FF9800',
      },
    }),
    prisma.project.create({
      data: {
        name: 'Sales Ops',
        description: 'Sales operations and analytics dashboard',
        status: 'In Progress',
        priority: 'Medium',
        startDate: new Date('2025-08-15'),
        dueDate: new Date('2026-02-28'),
        budget: 105000,
        spent: 42000,
        progress: 40,
        creatorId: users[7].id,
        departmentId: marketingDept.id,
        colorProject: '#CDDC39',
      },
    }),
    prisma.project.create({
      data: {
        name: 'S & OP',
        description: 'Sales and Operations Planning system',
        status: 'Planning',
        priority: 'Medium',
        startDate: new Date('2025-10-15'),
        dueDate: new Date('2026-05-31'),
        budget: 145000,
        spent: 14500,
        progress: 10,
        creatorId: users[0].id,
        departmentId: productDept.id,
        colorProject: '#FFC107',
      },
    }),
    prisma.project.create({
      data: {
        name: 'Social Listening - Backend FastAPI',
        description: 'FastAPI backend for social media monitoring and analytics',
        status: 'In Progress',
        priority: 'High',
        startDate: new Date('2025-08-01'),
        dueDate: new Date('2026-01-31'),
        budget: 135000,
        spent: 67500,
        progress: 50,
        creatorId: users[1].id,
        departmentId: engineeringDept.id,
        colorProject: '#673AB7',
      },
    }),
    prisma.project.create({
      data: {
        name: 'Social Listening - Frontend NextJS',
        description: 'NextJS frontend for social listening platform',
        status: 'In Progress',
        priority: 'High',
        startDate: new Date('2025-08-15'),
        dueDate: new Date('2026-01-31'),
        budget: 115000,
        spent: 46000,
        progress: 40,
        creatorId: users[2].id,
        departmentId: designDept.id,
        colorProject: '#9E9D24',
      },
    }),
    prisma.project.create({
      data: {
        name: 'Tripplan - Cambodia',
        description: 'Trip planning and logistics system for Cambodia operations',
        status: 'In Progress',
        priority: 'Medium',
        startDate: new Date('2025-07-01'),
        dueDate: new Date('2025-12-31'),
        budget: 90000,
        spent: 54000,
        progress: 60,
        creatorId: users[8].id,
        departmentId: operationsDept.id,
        colorProject: '#00ACC1',
      },
    }),
    prisma.project.create({
      data: {
        name: 'Tripplan - Laos',
        description: 'Trip planning and logistics system for Laos operations',
        status: 'In Progress',
        priority: 'Medium',
        startDate: new Date('2025-07-15'),
        dueDate: new Date('2026-01-15'),
        budget: 92000,
        spent: 46000,
        progress: 50,
        creatorId: users[8].id,
        departmentId: operationsDept.id,
        colorProject: '#26A69A',
      },
    }),
    prisma.project.create({
      data: {
        name: 'Xpress-Redeem',
        description: 'Express rewards redemption and loyalty program platform',
        status: 'Review',
        priority: 'Medium',
        startDate: new Date('2025-06-01'),
        dueDate: new Date('2025-11-15'),
        budget: 100000,
        spent: 90000,
        progress: 90,
        creatorId: users[7].id,
        departmentId: marketingDept.id,
        colorProject: '#F06292',
      },
    }),
  ])

  // Create Project Members
  console.log('👨‍💼 Creating project members...')
  await Promise.all([
    // AI - Backend API team
    prisma.projectMember.create({
      data: { projectId: projects[0].id, userId: users[1].id, role: 'lead' },
    }),
    prisma.projectMember.create({
      data: { projectId: projects[0].id, userId: users[3].id, role: 'member' },
    }),
    prisma.projectMember.create({
      data: { projectId: projects[0].id, userId: users[4].id, role: 'member' },
    }),

    // AI - Frontend NextJS team
    prisma.projectMember.create({
      data: { projectId: projects[1].id, userId: users[2].id, role: 'lead' },
    }),
    prisma.projectMember.create({
      data: { projectId: projects[1].id, userId: users[6].id, role: 'member' },
    }),

    // Bill-Collection team
    prisma.projectMember.create({
      data: { projectId: projects[2].id, userId: users[8].id, role: 'lead' },
    }),
    prisma.projectMember.create({
      data: { projectId: projects[2].id, userId: users[5].id, role: 'member' },
    }),

    // Cipher team
    prisma.projectMember.create({
      data: { projectId: projects[3].id, userId: users[1].id, role: 'lead' },
    }),
    prisma.projectMember.create({
      data: { projectId: projects[3].id, userId: users[9].id, role: 'member' },
    }),

    // Corporate - API team
    prisma.projectMember.create({
      data: { projectId: projects[4].id, userId: users[1].id, role: 'lead' },
    }),
    prisma.projectMember.create({
      data: { projectId: projects[4].id, userId: users[3].id, role: 'member' },
    }),
    prisma.projectMember.create({
      data: { projectId: projects[4].id, userId: users[5].id, role: 'member' },
    }),

    // Corporate - Frontend team
    prisma.projectMember.create({
      data: { projectId: projects[5].id, userId: users[2].id, role: 'lead' },
    }),
    prisma.projectMember.create({
      data: { projectId: projects[5].id, userId: users[6].id, role: 'member' },
    }),

    // Odoo team
    prisma.projectMember.create({
      data: { projectId: projects[13].id, userId: users[1].id, role: 'lead' },
    }),
    prisma.projectMember.create({
      data: { projectId: projects[13].id, userId: users[4].id, role: 'member' },
    }),
    prisma.projectMember.create({
      data: { projectId: projects[13].id, userId: users[9].id, role: 'member' },
    }),

    // iSFA team
    prisma.projectMember.create({
      data: { projectId: projects[11].id, userId: users[7].id, role: 'lead' },
    }),
    prisma.projectMember.create({
      data: { projectId: projects[11].id, userId: users[0].id, role: 'member' },
    }),
  ])

  // Create Milestones
  console.log('🎯 Creating milestones...')
  const milestones = await Promise.all([
    prisma.milestone.create({
      data: {
        name: 'AI API v1.0 Release',
        description: 'Initial release with core AI features',
        dueDate: new Date('2025-12-01'),
        status: 'In Progress',
        projectId: projects[0].id,
      },
    }),
    prisma.milestone.create({
      data: {
        name: 'AI Frontend Beta',
        description: 'Complete beta testing phase for AI frontend',
        dueDate: new Date('2025-11-30'),
        status: 'Not Started',
        projectId: projects[1].id,
      },
    }),
    prisma.milestone.create({
      data: {
        name: 'Corporate API Launch',
        description: 'Production launch of Corporate API',
        dueDate: new Date('2026-01-15'),
        status: 'In Progress',
        projectId: projects[4].id,
      },
    }),
    prisma.milestone.create({
      data: {
        name: 'Odoo Integration Complete',
        description: 'Complete Odoo ERP integration',
        dueDate: new Date('2025-11-15'),
        status: 'In Progress',
        projectId: projects[13].id,
      },
    }),
  ])

  // Create Tasks
  console.log('✅ Creating tasks...')
  const tasks = await Promise.all([
    // AI - Backend API tasks
    prisma.task.create({
      data: {
        title: 'Implement ML model API endpoints',
        description: 'Create REST API endpoints for ML model inference',
        status: 'In Progress',
        priority: 'High',
        dueDate: new Date('2025-11-15'),
        estimatedHours: 16,
        actualHours: 8,
        projectId: projects[0].id,
        assigneeId: users[1].id,
        creatorId: users[1].id,
        milestoneId: milestones[0].id,
      },
    }),
    prisma.task.create({
      data: {
        title: 'Set up AI model training pipeline',
        description: 'Configure automated ML model training and deployment',
        status: 'In Progress',
        priority: 'High',
        dueDate: new Date('2025-11-30'),
        estimatedHours: 24,
        actualHours: 12,
        projectId: projects[0].id,
        assigneeId: users[3].id,
        creatorId: users[1].id,
        milestoneId: milestones[0].id,
      },
    }),
    prisma.task.create({
      data: {
        title: 'Configure AI backend infrastructure',
        description: 'Set up cloud infrastructure for AI services',
        status: 'Completed',
        priority: 'High',
        dueDate: new Date('2025-10-10'),
        estimatedHours: 12,
        actualHours: 14,
        completed: true,
        projectId: projects[0].id,
        assigneeId: users[4].id,
        creatorId: users[1].id,
        milestoneId: milestones[0].id,
      },
    }),

    // AI - Frontend NextJS tasks
    prisma.task.create({
      data: {
        title: 'Build AI dashboard UI',
        description: 'Create interactive dashboard for AI model management',
        status: 'In Progress',
        priority: 'High',
        dueDate: new Date('2025-11-20'),
        estimatedHours: 20,
        actualHours: 10,
        projectId: projects[1].id,
        assigneeId: users[2].id,
        creatorId: users[2].id,
        milestoneId: milestones[1].id,
      },
    }),
    prisma.task.create({
      data: {
        title: 'Implement real-time data visualization',
        description: 'Add charts and graphs for AI predictions',
        status: 'To Do',
        priority: 'Medium',
        dueDate: new Date('2025-11-25'),
        estimatedHours: 12,
        projectId: projects[1].id,
        assigneeId: users[6].id,
        creatorId: users[2].id,
        milestoneId: milestones[1].id,
      },
    }),

    // Bill-Collection tasks
    prisma.task.create({
      data: {
        title: 'Implement payment tracking',
        description: 'Create system for tracking bill payments',
        status: 'In Progress',
        priority: 'High',
        dueDate: new Date('2025-11-10'),
        estimatedHours: 16,
        actualHours: 12,
        projectId: projects[2].id,
        assigneeId: users[8].id,
        creatorId: users[8].id,
      },
    }),

    // Cipher tasks
    prisma.task.create({
      data: {
        title: 'Implement AES encryption',
        description: 'Add AES-256 encryption for sensitive data',
        status: 'Review',
        priority: 'High',
        dueDate: new Date('2025-10-20'),
        estimatedHours: 10,
        actualHours: 11,
        projectId: projects[3].id,
        assigneeId: users[1].id,
        creatorId: users[1].id,
      },
    }),
    prisma.task.create({
      data: {
        title: 'Security audit preparation',
        description: 'Prepare documentation for security audit',
        status: 'Review',
        priority: 'High',
        dueDate: new Date('2025-10-25'),
        estimatedHours: 8,
        actualHours: 8,
        projectId: projects[3].id,
        assigneeId: users[9].id,
        creatorId: users[1].id,
      },
    }),

    // Corporate - API tasks
    prisma.task.create({
      data: {
        title: 'Design corporate API architecture',
        description: 'Define API architecture and endpoints',
        status: 'Completed',
        priority: 'High',
        dueDate: new Date('2025-09-15'),
        estimatedHours: 20,
        actualHours: 22,
        completed: true,
        projectId: projects[4].id,
        assigneeId: users[1].id,
        creatorId: users[1].id,
        milestoneId: milestones[2].id,
      },
    }),
    prisma.task.create({
      data: {
        title: 'Implement authentication service',
        description: 'Build OAuth2 authentication for corporate API',
        status: 'In Progress',
        priority: 'High',
        dueDate: new Date('2025-11-30'),
        estimatedHours: 16,
        actualHours: 8,
        projectId: projects[4].id,
        assigneeId: users[3].id,
        creatorId: users[1].id,
        milestoneId: milestones[2].id,
      },
    }),

    // Odoo tasks
    prisma.task.create({
      data: {
        title: 'Customize Odoo modules',
        description: 'Implement custom modules for business requirements',
        status: 'In Progress',
        priority: 'High',
        dueDate: new Date('2025-11-20'),
        estimatedHours: 30,
        actualHours: 25,
        projectId: projects[13].id,
        assigneeId: users[1].id,
        creatorId: users[1].id,
        milestoneId: milestones[3].id,
      },
    }),
    prisma.task.create({
      data: {
        title: 'Data migration to Odoo',
        description: 'Migrate existing data to Odoo ERP',
        status: 'In Progress',
        priority: 'High',
        dueDate: new Date('2025-11-15'),
        estimatedHours: 24,
        actualHours: 20,
        projectId: projects[13].id,
        assigneeId: users[4].id,
        creatorId: users[1].id,
        milestoneId: milestones[3].id,
      },
    }),
  ])

  // Create Issues
  console.log('🐛 Creating issues...')
  await Promise.all([
    prisma.issue.create({
      data: {
        title: 'AI Frontend login page not responsive on mobile',
        description: 'The login form breaks on screens smaller than 375px',
        status: 'Open',
        priority: 'High',
        type: 'Bug',
        projectId: projects[1].id,
        reporterId: users[2].id,
        assigneeId: users[6].id,
      },
    }),
    prisma.issue.create({
      data: {
        title: 'Bill Collection API rate limiting not working',
        description: 'Rate limiter allows more requests than configured',
        status: 'In Progress',
        priority: 'Critical',
        type: 'Bug',
        projectId: projects[2].id,
        reporterId: users[8].id,
        assigneeId: users[5].id,
      },
    }),
    prisma.issue.create({
      data: {
        title: 'Add dark mode support to Corporate Frontend',
        description: 'Users requesting dark mode for better accessibility',
        status: 'Open',
        priority: 'Medium',
        type: 'Feature',
        projectId: projects[5].id,
        reporterId: users[2].id,
        assigneeId: users[6].id,
      },
    }),
    prisma.issue.create({
      data: {
        title: 'Improve AI Backend API search performance',
        description: 'Search queries taking too long on large datasets',
        status: 'Open',
        priority: 'Medium',
        type: 'Enhancement',
        projectId: projects[0].id,
        reporterId: users[1].id,
        assigneeId: users[3].id,
      },
    }),
    prisma.issue.create({
      data: {
        title: 'Odoo email notification not sent',
        description: 'Users not receiving email notifications from Odoo',
        status: 'Resolved',
        priority: 'High',
        type: 'Bug',
        projectId: projects[13].id,
        reporterId: users[1].id,
        assigneeId: users[4].id,
        resolvedAt: new Date('2025-10-05'),
      },
    }),
    prisma.issue.create({
      data: {
        title: 'Add export to CSV feature to iSFA',
        description: 'Sales team needs ability to export data to CSV format',
        status: 'Open',
        priority: 'Low',
        type: 'Feature',
        projectId: projects[11].id,
        reporterId: users[7].id,
        assigneeId: users[0].id,
      },
    }),
  ])

  // Create Comments
  console.log('💬 Creating comments...')
  await Promise.all([
    prisma.comment.create({
      data: {
        content: 'I can take a look at this issue. Will investigate the CSS breakpoints.',
        authorId: users[0].id,
        taskId: tasks[4].id,
      },
    }),
    prisma.comment.create({
      data: {
        content: 'The payment gateway integration is going well. Should be done by end of week.',
        authorId: users[3].id,
        taskId: tasks[1].id,
      },
    }),
    prisma.comment.create({
      data: {
        content: 'Updated the design mockups based on feedback. Ready for review.',
        authorId: users[2].id,
        taskId: tasks[5].id,
      },
    }),
  ])

  // Create additional tasks for projects that will have time entries
  console.log('✅ Creating additional tasks for time tracking...')
  const additionalTasks = await Promise.all([
    // Corporate - Frontend task
    prisma.task.create({
      data: {
        title: 'Corporate Frontend Development',
        description: 'General frontend development tasks',
        status: 'In Progress',
        priority: 'High',
        dueDate: new Date('2025-12-31'),
        estimatedHours: 160,
        actualHours: 0,
        projectId: projects[5].id, // Corporate - Frontend
        assigneeId: users[0].id,
        creatorId: users[0].id,
      },
    }),
    // Sales Ops task
    prisma.task.create({
      data: {
        title: 'Sales Operations Development',
        description: 'General sales ops development tasks',
        status: 'In Progress',
        priority: 'Medium',
        dueDate: new Date('2026-02-28'),
        estimatedHours: 120,
        actualHours: 0,
        projectId: projects[15].id, // Sales Ops
        assigneeId: users[0].id,
        creatorId: users[0].id,
      },
    }),
    // Cipher task (additional)
    prisma.task.create({
      data: {
        title: 'Cipher Development',
        description: 'General cipher development tasks',
        status: 'In Progress',
        priority: 'High',
        dueDate: new Date('2025-10-31'),
        estimatedHours: 80,
        actualHours: 0,
        projectId: projects[3].id, // Cipher
        assigneeId: users[0].id,
        creatorId: users[0].id,
      },
    }),
    // Xpress-Redeem task
    prisma.task.create({
      data: {
        title: 'Xpress-Redeem Development',
        description: 'General xpress-redeem development tasks',
        status: 'In Progress',
        priority: 'Medium',
        dueDate: new Date('2025-11-15'),
        estimatedHours: 100,
        actualHours: 0,
        projectId: projects[21].id, // Xpress-Redeem
        assigneeId: users[0].id,
        creatorId: users[0].id,
      },
    }),
    // Bill-Collection task (additional)
    prisma.task.create({
      data: {
        title: 'Bill Collection Development',
        description: 'General bill collection development tasks',
        status: 'In Progress',
        priority: 'Medium',
        dueDate: new Date('2025-11-30'),
        estimatedHours: 100,
        actualHours: 0,
        projectId: projects[2].id, // Bill-Collection
        assigneeId: users[0].id,
        creatorId: users[0].id,
      },
    }),
    // IMS task
    prisma.task.create({
      data: {
        title: 'IMS Development',
        description: 'General IMS development tasks',
        status: 'In Progress',
        priority: 'Medium',
        dueDate: new Date('2026-02-28'),
        estimatedHours: 120,
        actualHours: 0,
        projectId: projects[11].id, // IMS
        assigneeId: users[0].id,
        creatorId: users[0].id,
      },
    }),
  ])

  // Create Time Entries based on provided data
  console.log('⏰ Creating time entries...')
  
  // Helper function to convert dd/mm/yyyy to Date
  const parseDate = (dateStr: string): Date => {
    const [day, month, year] = dateStr.split('/').map(Number)
    return new Date(year, month - 1, day)
  }

  // Map project names to task IDs
  const projectTaskMap: Record<string, string> = {
    'Corporate - Frontend': additionalTasks[0].id,
    'Sales Ops': additionalTasks[1].id,
    'Cipher': additionalTasks[2].id,
    'Xpress-Redeem': additionalTasks[3].id,
    'Bill-Collection': additionalTasks[4].id,
    'IMS': additionalTasks[5].id,
  }

  await Promise.all([
    prisma.timeEntry.create({
      data: {
        description: 'Set up the role switching interactive component for data access rights.',
        remarks: '',
        hours: 8,
        date: parseDate('1/10/2025'),
        userId: users[0].id,
        taskId: projectTaskMap['Corporate - Frontend'],
      },
    }),
    prisma.timeEntry.create({
      data: {
        description: 'Authentication Setup & Enhanced Login Form with Validation & Error Handling System',
        remarks: '',
        hours: 8,
        date: parseDate('1/10/2025'),
        userId: users[0].id,
        taskId: projectTaskMap['Corporate - Frontend'],
      },
    }),
    prisma.timeEntry.create({
      data: {
        description: 'Setting up GitLab CI/CD Pipeline for dhas-corporate Frontend',
        remarks: '',
        hours: 8,
        date: parseDate('1/10/2025'),
        userId: users[0].id,
        taskId: projectTaskMap['Corporate - Frontend'],
      },
    }),
    prisma.timeEntry.create({
      data: {
        description: 'set up after-script-push : Cleaning up pushed images from build server',
        remarks: '',
        hours: 8,
        date: parseDate('1/10/2025'),
        userId: users[0].id,
        taskId: projectTaskMap['Corporate - Frontend'],
      },
    }),
    prisma.timeEntry.create({
      data: {
        description: '(Frontend) Set up docker compose for development',
        remarks: '',
        hours: 8,
        date: parseDate('1/10/2025'),
        userId: users[0].id,
        taskId: projectTaskMap['Sales Ops'],
      },
    }),
    prisma.timeEntry.create({
      data: {
        description: 'Set up the runtime configuration system',
        remarks: '',
        hours: 8,
        date: parseDate('1/10/2025'),
        userId: users[0].id,
        taskId: projectTaskMap['Corporate - Frontend'],
      },
    }),
    prisma.timeEntry.create({
      data: {
        description: 'Docker Configuration Changes (Node.js version upgrade) & Configuration Changes (Vue CLI, Package, Runtime configuration)',
        remarks: '',
        hours: 8,
        date: parseDate('3/10/2025'),
        userId: users[0].id,
        taskId: projectTaskMap['Corporate - Frontend'],
      },
    }),
    prisma.timeEntry.create({
      data: {
        description: 'Docker Configuration for UAT (web-proxy,  web[image from registry] ),  set nginx-proxy.conf',
        remarks: '',
        hours: 8,
        date: parseDate('6/10/2025'),
        userId: users[0].id,
        taskId: projectTaskMap['Corporate - Frontend'],
      },
    }),
    prisma.timeEntry.create({
      data: {
        description: 'get conditions เพิ่มเติมหน้า Corporate Planning',
        remarks: '',
        hours: 8,
        date: parseDate('7/10/2025'),
        userId: users[0].id,
        taskId: projectTaskMap['Corporate - Frontend'],
      },
    }),
    prisma.timeEntry.create({
      data: {
        description: 'recehck process calculate inv.',
        remarks: '',
        hours: 8,
        date: parseDate('7/10/2025'),
        userId: users[0].id,
        taskId: projectTaskMap['Cipher'],
      },
    }),
    prisma.timeEntry.create({
      data: {
        description: 'update case เพิ่มเติม หลังจาก test (3 case)',
        remarks: '',
        hours: 8,
        date: parseDate('7/10/2025'),
        userId: users[0].id,
        taskId: projectTaskMap['Xpress-Redeem'],
      },
    }),
    prisma.timeEntry.create({
      data: {
        description: 'Set sub-levels (groups, sub-groups, CGs, products), route hierarchy and display by sub-level.',
        remarks: '',
        hours: 8,
        date: parseDate('8/10/2025'),
        userId: users[0].id,
        taskId: projectTaskMap['Corporate - Frontend'],
      },
    }),
    prisma.timeEntry.create({
      data: {
        description: 'update cal-point product : params validation, null-safe operations, and update format arrays',
        remarks: '',
        hours: 8,
        date: parseDate('8/10/2025'),
        userId: users[0].id,
        taskId: projectTaskMap['Xpress-Redeem'],
      },
    }),
    prisma.timeEntry.create({
      data: {
        description: 'update (conditions promotion then show placeholder, check active, config mail.operator.address)',
        remarks: '',
        hours: 8,
        date: parseDate('9/10/2025'),
        userId: users[0].id,
        taskId: projectTaskMap['Xpress-Redeem'],
      },
    }),
    prisma.timeEntry.create({
      data: {
        description: 'set data on site dev & set Show points on pop-up promotional products only.',
        remarks: '',
        hours: 8,
        date: parseDate('10/10/2025'),
        userId: users[0].id,
        taskId: projectTaskMap['Xpress-Redeem'],
      },
    }),
    prisma.timeEntry.create({
      data: {
        description: 'เอกสารใบลดหนี้ PD25003732 ยอดรวมแสดงผิด ที่ถูกต้องเป็น 11,294.31',
        remarks: '',
        hours: 8,
        date: parseDate('10/10/2025'),
        userId: users[0].id,
        taskId: projectTaskMap['Bill-Collection'],
      },
    }),
    prisma.timeEntry.create({
      data: {
        description: 'Set a.href="" to not work using javascript:void(0)',
        remarks: '',
        hours: 8,
        date: parseDate('14/10/2025'),
        userId: users[0].id,
        taskId: projectTaskMap['Xpress-Redeem'],
      },
    }),
    prisma.timeEntry.create({
      data: {
        description: 'update condition for sub-levels in route hierarchy and display by sub-level.',
        remarks: '',
        hours: 8,
        date: parseDate('15/10/2025'),
        userId: users[0].id,
        taskId: projectTaskMap['Corporate - Frontend'],
      },
    }),
    prisma.timeEntry.create({
      data: {
        description: 'Set up Authentication Data & Converting sessionStorage to localStorage across the entire application',
        remarks: '',
        hours: 8,
        date: parseDate('15/10/2025'),
        userId: users[0].id,
        taskId: projectTaskMap['Corporate - Frontend'],
      },
    }),
    prisma.timeEntry.create({
      data: {
        description: 'Case : Cross-Location แล้ว Data ไม่เข้า Bride',
        remarks: '',
        hours: 8,
        date: parseDate('16/10/2025'),
        userId: users[0].id,
        taskId: projectTaskMap['IMS'],
      },
    }),
    prisma.timeEntry.create({
      data: {
        description: 'Bill-Collection : check process print pdf (RN, PD) and check call api-cipher',
        remarks: '',
        hours: 8,
        date: parseDate('16/10/2025'),
        userId: users[0].id,
        taskId: projectTaskMap['Bill-Collection'],
      },
    }),
    prisma.timeEntry.create({
      data: {
        description: 'Debug Check process : Generate PDF (PD/ RN) 	Bill-Collection',
        remarks: '',
        hours: 8,
        date: parseDate('17/10/2025'),
        userId: users[0].id,
        taskId: projectTaskMap['Bill-Collection'],
      },
    }),
  ])

  // Create Activity Logs
  console.log('📝 Creating activity logs...')
  await Promise.all([
    prisma.activityLog.create({
      data: {
        action: 'created',
        entity: 'project',
        entityId: projects[0].id,
        description: 'Created project E-Commerce Platform',
        userId: users[0].id,
        projectId: projects[0].id,
      },
    }),
    prisma.activityLog.create({
      data: {
        action: 'completed',
        entity: 'task',
        entityId: tasks[2].id,
        description: 'Completed task: Set up shopping cart',
        userId: users[5].id,
        projectId: projects[0].id,
      },
    }),
    prisma.activityLog.create({
      data: {
        action: 'updated',
        entity: 'task',
        entityId: tasks[1].id,
        description: 'Updated task status to In Progress',
        userId: users[3].id,
        projectId: projects[0].id,
      },
    }),
    prisma.activityLog.create({
      data: {
        action: 'commented',
        entity: 'task',
        entityId: tasks[4].id,
        description: 'Added comment on task',
        userId: users[0].id,
        projectId: projects[1].id,
      },
    }),
  ])

  // Create Notifications
  console.log('🔔 Creating notifications...')
  await Promise.all([
    prisma.notification.create({
      data: {
        title: 'New Task Assigned',
        message: 'You have been assigned to: Update API documentation',
        type: 'info',
        link: `/tasks/${tasks[0].id}`,
        userId: users[0].id,
      },
    }),
    prisma.notification.create({
      data: {
        title: 'Task Due Soon',
        message: 'Task "Implement payment gateway" is due in 2 days',
        type: 'warning',
        link: `/tasks/${tasks[1].id}`,
        userId: users[3].id,
      },
    }),
    prisma.notification.create({
      data: {
        title: 'Issue Resolved',
        message: 'Issue "Payment confirmation email not sent" has been resolved',
        type: 'success',
        read: true,
        userId: users[0].id,
      },
    }),
    prisma.notification.create({
      data: {
        title: 'New Comment',
        message: 'Sarah Chen commented on your task',
        type: 'info',
        userId: users[1].id,
      },
    }),
  ])

  // Create Documents
  console.log('📄 Creating documents...')
  await Promise.all([
    prisma.document.create({
      data: {
        name: 'Project Requirements.pdf',
        description: 'Initial project requirements and specifications',
        fileUrl: '/documents/project-requirements.pdf',
        fileSize: 2048576,
        fileType: 'application/pdf',
        projectId: projects[0].id,
        uploaderId: users[0].id,
      },
    }),
    prisma.document.create({
      data: {
        name: 'Design Mockups.fig',
        description: 'Figma design files for mobile app',
        fileUrl: '/documents/design-mockups.fig',
        fileSize: 5242880,
        fileType: 'application/figma',
        projectId: projects[1].id,
        uploaderId: users[2].id,
      },
    }),
    prisma.document.create({
      data: {
        name: 'API Documentation.md',
        description: 'Complete API documentation',
        fileUrl: '/documents/api-docs.md',
        fileSize: 102400,
        fileType: 'text/markdown',
        projectId: projects[2].id,
        uploaderId: users[1].id,
      },
    }),
  ])

  console.log('✅ Seeding completed successfully!')
  console.log(`
    📊 Created:
    - 1 Company
    - 5 Departments
    - 10 Users
    - 22 Projects
    - ${(await prisma.projectMember.count())} Project Members
    - 4 Milestones
    - ${tasks.length + additionalTasks.length} Tasks
    - 6 Issues
    - 3 Comments
    - 22 Time Entries
    - 4 Activity Logs
    - 4 Notifications
    - 3 Documents
  `)
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })


