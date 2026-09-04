import { AppSidebar } from "@/components/layout/app-sidebar"
import { AppHeader } from "@/components/layout/app-header"
import {
  PAGE_HEADING,
  PAGE_INNER,
  PAGE_LEAD,
  PAGE_MAIN,
  PAGE_TOOLBAR,
  STAT_GRID,
  TAB_SCROLL_CLASS,
  TAB_TRIGGER_CLASS,
} from "@/components/layout/page-layout"
import { SummaryStatCard } from "@/components/layout/summary-stat-card"
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
import { Plus, Search, MoreVertical, Mail, Phone, Calendar } from "lucide-react"
import { prisma } from "@/lib/db"

async function getCompanyData() {
  const company = await prisma.company.findFirst()

  const users = await prisma.user.findMany({
    include: {
      _count: {
        select: {
          assignedWorkItems: true,
          projectMemberships: true,
        },
      },
    },
    orderBy: {
      name: 'asc',
    },
  })

  const [totalEmployees, activeProjects, totalWorkItems, activeMembers] = await Promise.all([
    prisma.user.count(),
    prisma.project.count({
      where: {
        status: {
          in: ['In Progress', 'Review'],
        },
      },
    }),
    prisma.workItem.count(),
    prisma.user.count({ where: { status: 'Active' } }),
  ])

  return {
    company: company || {
      name: 'ProjectHub Inc.',
      industry: 'Technology',
      email: 'contact@projecthub.com',
      phone: '+1 (555) 000-0000',
      address: '123 Tech Street, San Francisco, CA 94105',
    },
    teamMembers: users.map((user) => ({
      name: user.name,
      role: user.role,
      email: user.email,
      phone: user.phone,
      avatar: user.avatar || user.name.substring(0, 2).toUpperCase(),
      status: user.status,
      joinDate: user.joinDate.toISOString().split('T')[0],
      projects: user._count.projectMemberships,
      workItems: user._count.assignedWorkItems,
    })),
    stats: {
      totalEmployees,
      activeProjects,
      totalWorkItems,
      activeMembers,
    },
  }
}

export default async function CompanyPage() {
  const { company, teamMembers, stats } = await getCompanyData()

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <AppHeader />
        <main className={PAGE_MAIN}>
          <div className={PAGE_INNER}>
            <div className={PAGE_TOOLBAR}>
              <div className="min-w-0">
                <h1 className={PAGE_HEADING}>Company</h1>
                <p className={PAGE_LEAD}>Manage your organization and team members</p>
              </div>
              <Button>
                <Plus className="h-4 w-4" />
                <span className="sm:hidden">Add</span>
                <span className="hidden sm:inline">Add Member</span>
              </Button>
            </div>

            <div className={STAT_GRID}>
              <SummaryStatCard label="Total Employees" value={stats.totalEmployees} />
              <SummaryStatCard label="Work Items" value={stats.totalWorkItems} />
              <SummaryStatCard label="Active Projects" value={stats.activeProjects} />
              <SummaryStatCard label="Active Members" value={stats.activeMembers} />
            </div>

            {/* Tabs */}
            <Tabs defaultValue="team" className="space-y-4">
              <div className={TAB_SCROLL_CLASS}>
                <TabsList>
                  <TabsTrigger className={TAB_TRIGGER_CLASS} value="team">Team Members</TabsTrigger>
                  <TabsTrigger className={TAB_TRIGGER_CLASS} value="settings">Settings</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="team" className="space-y-4">
                <div className="flex items-center gap-4">
                  <div className="relative w-full max-w-none flex-1 sm:max-w-md">
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
                            <p className="text-lg font-bold">{member.workItems}</p>
                            <p className="text-xs text-muted-foreground">Work Items</p>
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
                      <Button variant="outline">
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
