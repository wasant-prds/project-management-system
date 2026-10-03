'use client'

import { memo } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Calendar, Home, Settings, FolderKanban, CheckSquare, Building2, BarChart3, Kanban, ArrowUpRight } from 'lucide-react'
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { APP_NAVIGATION, isNavigationActive } from './navigation'

const icons = [Home, FolderKanban, CheckSquare, Kanban, BarChart3, Calendar, Building2, Settings]

export const AppSidebar = memo(function AppSidebar() {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()
  const closeMobile = () => setOpenMobile(false)
  return (
    <Sidebar variant="floating" className="lg:p-3">
      <SidebarHeader className="px-5 pb-6 pt-6">
        <Link href="/" onClick={closeMobile} aria-label="ProjectHub — Dashboard" className="flex items-center gap-3 rounded-lg">
          <span className="surface-soft flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><FolderKanban aria-hidden="true" className="size-5" /></span>
          <span className="min-w-0"><span className="block text-lg font-semibold tracking-tight">ProjectHub</span><span className="block text-xs text-muted-foreground">พื้นที่ทำงานของคุณ</span></span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="px-3">
        <nav aria-label="เมนูหลัก">
          {['ภาพรวม', 'การทำงาน'].map((group) => (
            <SidebarGroup key={group} className="px-0 pb-5">
              <SidebarGroupLabel className="mb-2 px-3 text-[11px] font-semibold tracking-wide">{group}</SidebarGroupLabel>
              <SidebarGroupContent><SidebarMenu className="gap-1.5">
                {APP_NAVIGATION.map((item, index) => {
                  if (item.group !== group) return null
                  const Icon = icons[index]
                  const active = isNavigationActive(pathname, item.url)
                  return <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active} className="h-11 rounded-xl px-3 transition-[background-color,box-shadow] duration-150">
                      <Link href={item.url} aria-current={active ? 'page' : undefined} onClick={closeMobile}>
                        <Icon aria-hidden="true" className="size-4" /><span>{item.title}</span>
                        {active && <span aria-hidden="true" className="ml-auto size-1.5 rounded-full bg-primary" />}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                })}
              </SidebarMenu></SidebarGroupContent>
            </SidebarGroup>
          ))}
        </nav>
      </SidebarContent>
      <SidebarFooter className="gap-4 p-4">
        <div className="surface-inset rounded-xl border border-border/50 p-3">
          <p className="text-xs font-semibold">ปฏิทินระบบ</p><p className="mt-1 text-xs text-muted-foreground">Asia/Bangkok · UTC+07:00</p>
        </div>
        <SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild isActive={isNavigationActive(pathname, '/settings')} className="h-11 rounded-xl px-3">
          <Link href="/settings" onClick={closeMobile} aria-current={isNavigationActive(pathname, '/settings') ? 'page' : undefined}><Settings aria-hidden="true" /><span>การตั้งค่า</span><ArrowUpRight aria-hidden="true" className="ml-auto size-4 text-muted-foreground" /></Link>
        </SidebarMenuButton></SidebarMenuItem></SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
})
