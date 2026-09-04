"use client"

import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Search, Filter } from "lucide-react"
import { ProjectCard } from "@/components/page/projects/project-card"
import { ACTION_LABEL_CLASS, TAB_SCROLL_CLASS, TAB_TRIGGER_CLASS } from "@/components/layout/page-layout"

interface Project {
  id: string
  name: string
  description: string | null
  status: string
  priority: string
  progress: number
  startDate: string
  dueDate: string
  team: number
  workItems: { total: number; completed: number; open: number }
  budget: string | null
  spent: string | null
}

interface ProjectsContentProps {
  readonly projects: ReadonlyArray<Project>
}

export function ProjectsContent({ projects }: Readonly<ProjectsContentProps>) {
  const [searchQuery, setSearchQuery] = useState("")

  // Filter projects based on search query
  const filteredProjects = useMemo(() => {
    if (!searchQuery.trim()) {
      return projects
    }

    const query = searchQuery.toLowerCase()
    return projects.filter((project) => {
      return (
        project.name.toLowerCase().includes(query) ||
        project.description?.toLowerCase().includes(query) ||
        project.status.toLowerCase().includes(query) ||
        project.priority.toLowerCase().includes(query)
      )
    })
  }, [projects, searchQuery])

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative w-full max-w-none flex-1 sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search projects..."
            className="pl-10 bg-secondary/50"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <Button variant="outline" className="w-full sm:w-auto">
          <Filter className="h-4 w-4" />
          <span className={ACTION_LABEL_CLASS}>Filter</span>
        </Button>
      </div>

      <Tabs defaultValue="all" className="space-y-4">
        <div className={TAB_SCROLL_CLASS}>
          <TabsList>
            <TabsTrigger className={TAB_TRIGGER_CLASS} value="all">All Projects ({filteredProjects.length})</TabsTrigger>
            <TabsTrigger className={TAB_TRIGGER_CLASS} value="active">
              Active ({filteredProjects.filter((p) => p.status === "In Progress").length})
            </TabsTrigger>
            <TabsTrigger className={TAB_TRIGGER_CLASS} value="review">
              In Review ({filteredProjects.filter((p) => p.status === "Review").length})
            </TabsTrigger>
            <TabsTrigger className={TAB_TRIGGER_CLASS} value="completed">
              Completed ({filteredProjects.filter((p) => p.status === "Completed").length})
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="all" className="space-y-4">
          {filteredProjects.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No projects found matching &quot;{searchQuery}&quot;
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredProjects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="active">
          {filteredProjects.filter((p) => p.status === "In Progress").length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery ? `No active projects found matching "${searchQuery}"` : "No active projects"}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredProjects
                .filter((p) => p.status === "In Progress")
                .map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="review">
          {filteredProjects.filter((p) => p.status === "Review").length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery ? `No projects in review found matching "${searchQuery}"` : "No projects in review"}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredProjects
                .filter((p) => p.status === "Review")
                .map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="completed">
          {filteredProjects.filter((p) => p.status === "Completed").length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {searchQuery ? `No completed projects found matching "${searchQuery}"` : "No completed projects"}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {filteredProjects
                .filter((p) => p.status === "Completed")
                .map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

