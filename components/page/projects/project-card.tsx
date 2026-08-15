'use client'

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Users, Calendar, Target, AlertCircle, MoreVertical } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "@/hooks/use-toast"
import { ProjectEditModal } from "./project-edit-modal"
import { ProjectTeamModal } from "./project-team-modal"

interface ProjectCardProps {
  readonly project: {
    readonly id: string
    readonly name: string
    readonly description: string | null
    readonly status: string
    readonly priority: string
    readonly progress: number
    readonly startDate: string
    readonly dueDate: string
    readonly team: number
    readonly tasks: { readonly total: number; readonly completed: number }
    readonly issues: { readonly open: number; readonly closed: number }
    readonly budget: string | null
    readonly spent: string | null
  }
}

export function ProjectCard({ project }: ProjectCardProps) {
  const getStatusColor = (status: string) => {
    switch (status) {
      case "In Progress":
        return "bg-chart-2/10 text-chart-2 border-chart-2/20"
      case "Review":
        return "bg-chart-4/10 text-chart-4 border-chart-4/20"
      case "Planning":
        return "bg-chart-3/10 text-chart-3 border-chart-3/20"
      case "Completed":
        return "bg-chart-1/10 text-chart-1 border-chart-1/20"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "High":
        return "bg-destructive/10 text-destructive border-destructive/20"
      case "Medium":
        return "bg-chart-5/10 text-chart-5 border-chart-5/20"
      case "Low":
        return "bg-muted text-muted-foreground border-border"
      default:
        return "bg-muted text-muted-foreground"
    }
  }
  const router = useRouter()
  const [showEditModal, setShowEditModal] = useState(false)
  const [showTeamModal, setShowTeamModal] = useState(false)
  const [showArchiveDialog, setShowArchiveDialog] = useState(false)
  const [isArchiving, setIsArchiving] = useState(false)

  const handleViewDetails = () => {
    router.push(`/projects/${project.id}`)
  }

  const handleArchive = async () => {
    try {
      setIsArchiving(true)
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'On Hold', // or create an "Archived" status
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to archive project')
      }

      toast({
        title: "Project Archived",
        description: `${project.name} has been archived successfully.`,
      })

      // Refresh the page to show updated data
      router.refresh()
    } catch {
      toast({
        title: "Error",
        description: "Failed to archive project. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsArchiving(false)
      setShowArchiveDialog(false)
    }
  }

  return (
    <>
      <Card className="card-shadow hover:border-primary/30 transition-colors">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="space-y-1 flex-1">
              <Link href={`/projects/${project.id}`}>
                <CardTitle className="hover:text-primary transition-colors cursor-pointer">
                  {project.name}
                </CardTitle>
              </Link>
              <CardDescription className="line-clamp-2">{project.description}</CardDescription>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleViewDetails}>
                  View Details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowEditModal(true)}>
                  Edit Project
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowTeamModal(true)}>
                  Manage Team
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  className="text-destructive"
                  onClick={() => setShowArchiveDialog(true)}
                >
                  Archive Project
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex items-center gap-2 pt-2">
            <Badge variant="outline" className={getStatusColor(project.status)}>
              {project.status}
            </Badge>
            <Badge variant="outline" className={getPriorityColor(project.priority)}>
              {project.priority}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Progress */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium">{project.progress}%</span>
            </div>
            <Progress value={project.progress} className="h-2" />
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-4 pt-2">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Users className="h-3 w-3" />
                <span>Team</span>
              </div>
              <p className="text-sm font-medium">{project.team} members</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-3 w-3" />
                <span>Due Date</span>
              </div>
              <p className="text-sm font-medium">{project.dueDate}</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Target className="h-3 w-3" />
                <span>Tasks</span>
              </div>
              <p className="text-sm font-medium">
                {project.tasks.completed}/{project.tasks.total}
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <AlertCircle className="h-3 w-3" />
                <span>Issues</span>
              </div>
              <p className="text-sm font-medium">{project.issues.open} open</p>
            </div>
          </div>

          {/* Budget */}
          {project.budget && project.spent && (
            <div className="pt-2 border-t border-border/50">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Budget</span>
                <span className="font-medium">
                  {project.spent} / {project.budget}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Modal */}
      <ProjectEditModal
        open={showEditModal}
        onOpenChange={setShowEditModal}
        projectId={project.id}
      />

      {/* Team Modal */}
      <ProjectTeamModal
        open={showTeamModal}
        onOpenChange={setShowTeamModal}
        projectId={project.id}
      />

      {/* Archive Confirmation Dialog */}
      <AlertDialog open={showArchiveDialog} onOpenChange={setShowArchiveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive Project?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to archive "{project.name}"? This will change the project status to "On Hold" 
              and it will no longer appear in active projects. You can always reactivate it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleArchive}
              disabled={isArchiving}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isArchiving ? "Archiving..." : "Archive Project"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

