"use client"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Plus, MoreVertical, Calendar, Flag, MessageSquare, Paperclip } from "lucide-react"
import { useState } from "react"

interface Task {
  id: string
  title: string
  description: string
  priority: "High" | "Medium" | "Low"
  assignee: { name: string; avatar: string }
  dueDate: string
  comments: number
  attachments: number
}

interface Column {
  id: string
  title: string
  tasks: Task[]
}

export default function BoardPage() {
  const [columns, setColumns] = useState<Column[]>([
    {
      id: "backlog",
      title: "Backlog",
      tasks: [
        {
          id: "1",
          title: "Design user profile page",
          description: "Create mockups for user profile",
          priority: "Low",
          assignee: { name: "Emily Davis", avatar: "ED" },
          dueDate: "2025-10-20",
          comments: 3,
          attachments: 2,
        },
        {
          id: "2",
          title: "Write unit tests",
          description: "Add test coverage for authentication",
          priority: "Medium",
          assignee: { name: "Lisa Wang", avatar: "LW" },
          dueDate: "2025-10-22",
          comments: 1,
          attachments: 0,
        },
      ],
    },
    {
      id: "todo",
      title: "To Do",
      tasks: [
        {
          id: "3",
          title: "Fix login page responsiveness",
          description: "Mobile view has layout issues",
          priority: "High",
          assignee: { name: "Mike Johnson", avatar: "MJ" },
          dueDate: "2025-10-18",
          comments: 5,
          attachments: 1,
        },
        {
          id: "4",
          title: "Update API documentation",
          description: "Add new endpoints to docs",
          priority: "Medium",
          assignee: { name: "Sarah Chen", avatar: "SC" },
          dueDate: "2025-10-19",
          comments: 2,
          attachments: 3,
        },
      ],
    },
    {
      id: "in-progress",
      title: "In Progress",
      tasks: [
        {
          id: "5",
          title: "Implement payment gateway",
          description: "Integrate Stripe payment processing",
          priority: "High",
          assignee: { name: "Alex Turner", avatar: "AT" },
          dueDate: "2025-10-25",
          comments: 8,
          attachments: 4,
        },
      ],
    },
    {
      id: "review",
      title: "Review",
      tasks: [
        {
          id: "6",
          title: "Database migration script",
          description: "Review migration from MongoDB to PostgreSQL",
          priority: "High",
          assignee: { name: "Mike Johnson", avatar: "MJ" },
          dueDate: "2025-10-16",
          comments: 12,
          attachments: 2,
        },
      ],
    },
    {
      id: "done",
      title: "Done",
      tasks: [
        {
          id: "7",
          title: "Setup CI/CD pipeline",
          description: "Configure GitHub Actions",
          priority: "Medium",
          assignee: { name: "Alex Turner", avatar: "AT" },
          dueDate: "2025-10-10",
          comments: 6,
          attachments: 1,
        },
      ],
    },
  ])

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "High":
        return "bg-destructive/10 text-destructive border-destructive/20"
      case "Medium":
        return "bg-chart-5/10 text-chart-5 border-chart-5/20"
      case "Low":
        return "bg-chart-1/10 text-chart-1 border-chart-1/20"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className="flex-1 overflow-hidden p-6">
          <div className="space-y-6 h-full flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between flex-shrink-0">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-balance">Kanban Board</h1>
                <p className="text-muted-foreground mt-1">Visualize and manage your workflow</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="gap-2 bg-transparent">
                  <MoreVertical className="h-4 w-4" />
                  Options
                </Button>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Column
                </Button>
              </div>
            </div>

            {/* Board */}
            <ScrollArea className="flex-1">
              <div className="flex gap-4 pb-4 min-h-full">
                {columns.map((column) => (
                  <div key={column.id} className="flex-shrink-0 w-80">
                    <Card className="card-shadow h-full flex flex-col">
                      <CardHeader className="pb-3 flex-shrink-0">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-base">{column.title}</CardTitle>
                            <Badge variant="secondary" className="text-xs">
                              {column.tasks.length}
                            </Badge>
                          </div>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuLabel>Column Actions</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem>Add Task</DropdownMenuItem>
                              <DropdownMenuItem>Rename Column</DropdownMenuItem>
                              <DropdownMenuItem>Clear Column</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive">Delete Column</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardHeader>
                      <CardContent className="flex-1 space-y-3 overflow-y-auto">
                        {column.tasks.map((task) => (
                          <Card
                            key={task.id}
                            className="bg-secondary/30 border-border/50 hover:border-primary/30 transition-colors cursor-pointer"
                          >
                            <CardContent className="p-4 space-y-3">
                              <div className="flex items-start justify-between gap-2">
                                <h4 className="font-medium text-sm leading-tight">{task.title}</h4>
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0">
                                      <MoreVertical className="h-3 w-3" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem>Edit Task</DropdownMenuItem>
                                    <DropdownMenuItem>Move to...</DropdownMenuItem>
                                    <DropdownMenuItem>Duplicate</DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem className="text-destructive">Delete</DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>

                              <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>

                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className={`${getPriorityColor(task.priority)} text-xs`}>
                                  <Flag className="h-2 w-2 mr-1" />
                                  {task.priority}
                                </Badge>
                              </div>

                              <div className="flex items-center justify-between pt-2 border-t border-border/50">
                                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                  <div className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    <span>{task.dueDate}</span>
                                  </div>
                                  {task.comments > 0 && (
                                    <div className="flex items-center gap-1">
                                      <MessageSquare className="h-3 w-3" />
                                      <span>{task.comments}</span>
                                    </div>
                                  )}
                                  {task.attachments > 0 && (
                                    <div className="flex items-center gap-1">
                                      <Paperclip className="h-3 w-3" />
                                      <span>{task.attachments}</span>
                                    </div>
                                  )}
                                </div>
                                <Avatar className="h-6 w-6 border border-primary/20">
                                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                    {task.assignee.avatar}
                                  </AvatarFallback>
                                </Avatar>
                              </div>
                            </CardContent>
                          </Card>
                        ))}

                        <Button variant="ghost" className="w-full justify-start gap-2 text-muted-foreground">
                          <Plus className="h-4 w-4" />
                          Add Task
                        </Button>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
