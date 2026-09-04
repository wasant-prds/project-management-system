'use client'

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { DIALOG_SHELL_SCROLL_CLASS } from "@/components/ui/responsive-dialog"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/hooks/use-toast"
import { Loader2 } from "lucide-react"

interface ProjectTeamModalProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly projectId: string
}

interface TeamMember {
  id: string
  role: string
  user: {
    id: string
    name: string
    email: string
    avatar: string | null
  }
}

export function ProjectTeamModal({ open, onOpenChange, projectId }: ProjectTeamModalProps) {
  const [loading, setLoading] = useState(false)
  const [members, setMembers] = useState<TeamMember[]>([])

  useEffect(() => {
    if (open) {
      fetchTeamData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId])

  const fetchTeamData = async () => {
    try {
      setLoading(true)
      
      // Fetch project with team members
      const projectResponse = await fetch(`/api/projects/${projectId}`)
      if (!projectResponse.ok) throw new Error('Failed to fetch project')
      
      const projectData = await projectResponse.json()
      setMembers(projectData.project.members || [])
      
      // Fetch all users (you might want to create a dedicated endpoint for this)
      // For now, we'll just show the existing members
      
    } catch {
      toast({
        title: "Error",
        description: "Failed to load team data",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const getRoleBadgeColor = (role: string) => {
    switch (role.toLowerCase()) {
      case 'lead':
        return "bg-chart-1/10 text-chart-1 border-chart-1/20"
      case 'manager':
        return "bg-chart-2/10 text-chart-2 border-chart-2/20"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={DIALOG_SHELL_SCROLL_CLASS}>
        <DialogHeader>
          <DialogTitle>Manage Team</DialogTitle>
          <DialogDescription>
            View and manage team members for this project.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Team Members List */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium">Current Team Members ({members.length})</h3>
              
              {members.length > 0 ? (
                <div className="space-y-2">
                  {members.map((member) => (
                    <div
                      key={member.id}
                      className="flex items-center justify-between p-3 rounded-lg border border-border/50 hover:border-primary/30 transition-colors"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        <Avatar className="h-10 w-10 border-2 border-primary/20">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
                            {getInitials(member.user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{member.user.name}</p>
                          <p className="text-xs text-muted-foreground">{member.user.email}</p>
                        </div>
                        <Badge variant="outline" className={getRoleBadgeColor(member.role)}>
                          {member.role}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <p className="text-sm">No team members assigned yet.</p>
                  <p className="text-xs mt-1">Team members need to be added through the API.</p>
                </div>
              )}
            </div>

            {/* Info about adding members */}
            <div className="rounded-lg border border-border/50 bg-muted/50 p-4">
              <p className="text-sm text-muted-foreground">
                <strong>Note:</strong> To add new team members, you need to create project members through 
                the API endpoint. This feature will be enhanced in a future update to allow direct member 
                addition from this interface.
              </p>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

