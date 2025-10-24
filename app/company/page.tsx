import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Plus, Search, MoreVertical, Users, Building2, Mail, Phone, Calendar, Briefcase } from "lucide-react"
import { prisma } from "@/lib/db"

async function getCompanyData() {
  const company = await prisma.company.findFirst()

  const departments = await prisma.department.findMany({
    include: {
      lead: {
        select: {
          name: true,
          avatar: true,
        },
      },
      _count: {
        select: {
          members: true,
          projects: true,
        },
      },
    },
    orderBy: {
      name: 'asc',
    },
  })

  const users = await prisma.user.findMany({
    include: {
      department: {
        select: {
          name: true,
        },
      },
      _count: {
        select: {
          assignedTasks: true,
          projectMemberships: true,
        },
      },
    },
    orderBy: {
      name: 'asc',
    },
  })

  // Get company statistics
  const stats = {
    totalEmployees: await prisma.user.count(),
    totalDepartments: await prisma.department.count(),
    activeProjects: await prisma.project.count({
      where: {
        status: {
          in: ['In Progress', 'Review'],
        },
      },
    }),
    avgTeamSize: Math.round(
      (await prisma.user.count()) / Math.max(await prisma.department.count(), 1)
    ),
  }

  return {
    company: company || {
      name: 'ProjectHub Inc.',
      industry: 'Technology',
      email: 'contact@projecthub.com',
      phone: '+1 (555) 000-0000',
      address: '123 Tech Street, San Francisco, CA 94105',
    },
    departments: departments.map((dept) => ({
      name: dept.name,
      description: dept.description,
      members: dept._count.members,
      projects: dept._count.projects,
      lead: dept.lead
        ? {
            name: dept.lead.name,
            avatar: dept.lead.avatar || dept.lead.name.substring(0, 2).toUpperCase(),
          }
        : { name: 'No Lead', avatar: 'NL' },
    })),
    teamMembers: users.map((user) => ({
      name: user.name,
      role: user.role,
      department: user.department?.name || 'Unassigned',
      email: user.email,
      phone: user.phone,
      avatar: user.avatar || user.name.substring(0, 2).toUpperCase(),
      status: user.status,
      joinDate: user.joinDate.toISOString().split('T')[0],
      projects: user._count.projectMemberships,
      tasks: user._count.assignedTasks,
    })),
    stats,
  }
}

export default async function CompanyPage() {
  const { company, departments, teamMembers, stats } = await getCompanyData()

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold tracking-tight text-balance">Company</h1>
                <p className="text-muted-foreground mt-1">Manage your organization and team members</p>
              </div>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Add Member
              </Button>
            </div>

            {/* Company Overview */}
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="card-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Employees</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalEmployees}</div>
                </CardContent>
              </Card>
              <Card className="card-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Departments</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.totalDepartments}</div>
                </CardContent>
              </Card>
              <Card className="card-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Active Projects</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.activeProjects}</div>
                </CardContent>
              </Card>
              <Card className="card-shadow">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Avg. Team Size</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stats.avgTeamSize}</div>
                </CardContent>
              </Card>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="departments" className="space-y-4">
              <TabsList>
                <TabsTrigger value="departments">Departments</TabsTrigger>
                <TabsTrigger value="team">Team Members</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
              </TabsList>

              <TabsContent value="departments" className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  {departments.map((dept) => (
                    <Card key={dept.name} className="card-shadow hover:border-primary/30 transition-colors">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="space-y-1 flex-1">
                            <div className="flex items-center gap-2">
                              <Building2 className="h-5 w-5 text-primary" />
                              <CardTitle>{dept.name}</CardTitle>
                            </div>
                            <CardDescription>{dept.description}</CardDescription>
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
                              <DropdownMenuItem>View Details</DropdownMenuItem>
                              <DropdownMenuItem>Edit Department</DropdownMenuItem>
                              <DropdownMenuItem>Manage Members</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive">Delete Department</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10 border-2 border-primary/20">
                            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                              {dept.lead.avatar}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-sm font-medium">{dept.lead.name}</p>
                            <p className="text-xs text-muted-foreground">Department Lead</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/50">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Users className="h-3 w-3" />
                              <span>Members</span>
                            </div>
                            <p className="text-sm font-medium">{dept.members}</p>
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Briefcase className="h-3 w-3" />
                              <span>Projects</span>
                            </div>
                            <p className="text-sm font-medium">{dept.projects}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="team" className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input type="search" placeholder="Search team members..." className="pl-10 bg-secondary/50" />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {teamMembers.map((member) => (
                    <Card key={member.email} className="card-shadow hover:border-primary/30 transition-colors">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-3 flex-1">
                            <Avatar className="h-12 w-12 border-2 border-primary/20">
                              <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                                {member.avatar}
                              </AvatarFallback>
                            </Avatar>
                            <div className="space-y-1">
                              <CardTitle className="text-base">{member.name}</CardTitle>
                              <CardDescription className="text-xs capitalize">{member.role}</CardDescription>
                            </div>
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
                              <DropdownMenuItem>View Profile</DropdownMenuItem>
                              <DropdownMenuItem>Edit Member</DropdownMenuItem>
                              <DropdownMenuItem>Assign Projects</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive">Remove Member</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <Badge variant="outline" className="bg-chart-4/10 text-chart-4 border-chart-4/20">
                          {member.status}
                        </Badge>

                        <div className="space-y-2 text-sm">
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Building2 className="h-3 w-3" />
                            <span>{member.department}</span>
                          </div>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            <span className="truncate">{member.email}</span>
                          </div>
                          {member.phone && (
                            <div className="flex items-center gap-2 text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              <span>{member.phone}</span>
                            </div>
                          )}
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span>Joined {member.joinDate}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/50">
                          <div className="text-center">
                            <p className="text-lg font-bold">{member.projects}</p>
                            <p className="text-xs text-muted-foreground">Projects</p>
                          </div>
                          <div className="text-center">
                            <p className="text-lg font-bold">{member.tasks}</p>
                            <p className="text-xs text-muted-foreground">Tasks</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TabsContent>

              <TabsContent value="settings" className="space-y-4">
                <Card className="card-shadow">
                  <CardHeader>
                    <CardTitle>Company Information</CardTitle>
                    <CardDescription>Manage your company details and settings</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Company Name</label>
                        <Input defaultValue={company.name} className="bg-secondary/50" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Industry</label>
                        <Input defaultValue={company.industry || ''} className="bg-secondary/50" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Email</label>
                        <Input defaultValue={company.email || ''} className="bg-secondary/50" />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Phone</label>
                        <Input defaultValue={company.phone || ''} className="bg-secondary/50" />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <label className="text-sm font-medium">Address</label>
                        <Input defaultValue={company.address || ''} className="bg-secondary/50" />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-4">
                      <Button variant="outline" className="bg-transparent">
                        Cancel
                      </Button>
                      <Button>Save Changes</Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
