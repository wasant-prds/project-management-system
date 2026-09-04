import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { PAGE_INNER, PAGE_MAIN } from "@/components/layout/page-layout"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { prisma } from "@/lib/db"
import { ProjectsHeader } from "@/components/page/projects/projects-header"
import { ProjectsContent } from "@/components/page/projects/projects-content"

async function getProjects() {
  const projects = await prisma.project.findMany({
    include: {
      _count: {
        select: {
          workItems: true,
          members: true,
        },
      },
      workItems: {
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
    const totalWorkItems = project._count.workItems
    const completedWorkItems = project.workItems.filter((item) => item.status === 'completed').length
    const openWorkItems = project.workItems.filter(
      (item) => item.status !== 'completed' && item.status !== 'cancelled',
    ).length

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
      workItems: { total: totalWorkItems, completed: completedWorkItems, open: openWorkItems },
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
        <main className={PAGE_MAIN}>
          <div className={PAGE_INNER}>
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
