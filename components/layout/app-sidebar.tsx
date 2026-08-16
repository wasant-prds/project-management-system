'use client'

import { memo } from 'react'
import {
  Calendar,
  Home,
  Settings,
  FolderKanban,
  CheckSquare,
  Users,
  BarChart3,
  Kanban,
} from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import Link from 'next/link'

const navigationItems = [
  {
    title: 'Overview',
    items: [
      { title: 'Dashboard', url: '/', icon: Home },
      { title: 'Projects', url: '/projects', icon: FolderKanban },
      { title: 'Work Items', url: '/work-items', icon: CheckSquare },
    ],
  },
  {
    title: 'Management',
    items: [
      { title: 'Board', url: '/board', icon: Kanban },
      { title: 'Analysis', url: '/analysis', icon: BarChart3 },
      { title: 'Daily Work', url: '/daily-work', icon: Calendar },
      { title: 'Company', url: '/company', icon: Users },
    ],
  },
]

// Memoized sidebar to prevent unnecessary re-renders
export const AppSidebar = memo(function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader className="border-b border-border px-6 py-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <FolderKanban className="h-4 w-4" />
          </div>
          <span className="font-semibold text-lg">ProjectHub</span>
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {navigationItems.map((group) => (
          <SidebarGroup key={group.title}>
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <Link href={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-border p-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/settings">
                <Settings className="h-4 w-4" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
})

