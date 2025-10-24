import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { prisma } from "@/lib/db"
import { ProjectsHeader } from "@/components/page/projects/projects-header"
import { ProjectsContent } from "@/components/page/projects/projects-content"

async function getProjects() {
  const projects = await prisma.project.findMany({
    include: {
      _count: {
        select: {
          tasks: true,
          issues: true,
          members: true,
        },
      },
      tasks: {
        select: {
          completed: true,
        },
      },
      issues: {
        select: {
          status: true,
        },
      },
    },
    orderBy: {
      createdAt: 'desc',
    },
  })

  return projects.map((project: (typeof projects)[number]) => {
    const totalTasks = project._count.tasks
    const completedTasks = project.tasks.filter((t: { completed: boolean }) => t.completed).length
    const openIssues = project.issues.filter((i: { status: string }) => i.status === 'Open' || i.status === 'In Progress').length
    const closedIssues = project.issues.filter((i: { status: string }) => i.status === 'Resolved' || i.status === 'Closed').length

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      priority: project.priority,
      progress: project.progress,
      startDate: project.startDate.toISOString().split('T')[0],
      dueDate: project.dueDate.toISOString().split('T')[0],
      team: project._count.members,
      tasks: { total: totalTasks, completed: completedTasks },
      issues: { open: openIssues, closed: closedIssues },
      budget: project.budget ? `$${Number(project.budget).toLocaleString()}` : null,
      spent: project.spent ? `$${Number(project.spent).toLocaleString()}` : null,
    }
  })
}

export default async function ProjectsPage() {
  const projects = await getProjects()

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Header */}
            <ProjectsHeader />

            {/* Projects Content with Search */}
            <ProjectsContent projects={projects} />
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
