'use client'

import { memo } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { Calendar, Home, Settings, FolderKanban, CheckSquare, Building2, BarChart3, Kanban, ArrowUpRight } from 'lucide-react'
import { ICON_SIZE_PX } from '@/components/ui/product-identity'
import { ProductIcon } from '@/components/ui/product-icon'
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { APP_NAVIGATION, isNavigationActive } from './navigation'
import { SharedNavigationIndicator } from './shared-navigation-indicator'

const icons = [Home, FolderKanban, CheckSquare, Kanban, BarChart3, Calendar, Building2, Settings]
const NAV_BUTTON = "motion-nav-item nav-rail type-nav h-11 rounded-xl px-3 [&_svg[data-icon-category=navigation]]:size-5 [&_svg[data-icon-category=action]]:size-[18px]"

export const AppSidebar = memo(function AppSidebar() {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()
  const closeMobile = () => setOpenMobile(false)

  return (
    <Sidebar variant="floating" className="lg:p-3">
      <SidebarHeader className="px-5 pb-6 pt-6">
        <Link href="/" onClick={closeMobile} aria-label="ProjectHub — Dashboard" data-spatial="magnetic" data-shared-element="workspace" className="cinematic-brand flex items-center gap-3 rounded-lg">
          <span data-slot="icon-well" data-icon-purpose="brand" className="icon-well surface-soft flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground"><ProductIcon icon={FolderKanban} category="system" size={ICON_SIZE_PX.feature} /></span>
          <span className="min-w-0"><span className="type-card-title block">ProjectHub</span><span className="type-caption block">พื้นที่ทำงานของคุณ</span></span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="px-3">
        <nav aria-label="เมนูหลัก" className="motion-nav-root">
          {['ภาพรวม', 'การทำงาน'].map((group) => (
            <SidebarGroup key={group} className="px-0 pb-5">
              <SidebarGroupLabel className="type-label mb-2 px-3 font-semibold">{group}</SidebarGroupLabel>
              <SidebarGroupContent><SidebarMenu className="gap-1.5">
                {APP_NAVIGATION.map((item, index) => {
                  if (item.group !== group) return null
                  const Icon = icons[index]
                  const active = isNavigationActive(pathname, item.url)
                  return <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={active} className={NAV_BUTTON}>
                      <Link
                        href={item.url}
                        aria-current={active ? 'page' : undefined}
                        onClick={closeMobile}
                      >
                        <ProductIcon icon={Icon} category="navigation" intent="navigate" /><span>{item.title}</span>
                        {active && <span aria-hidden="true" className="motion-active-nav-dot ml-auto size-1.5 rounded-full bg-primary" />}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                })}
              </SidebarMenu></SidebarGroupContent>
            </SidebarGroup>
          ))}
          <SharedNavigationIndicator pathname={pathname} />
        </nav>
      </SidebarContent>
      <SidebarFooter className="gap-4 p-4">
        <div className="surface-inset rounded-xl border border-border/50 p-3">
          <p className="type-card-title">ปฏิทินระบบ</p><p className="type-caption mt-1">Asia/Bangkok · UTC+07:00</p>
        </div>
        <SidebarMenu><SidebarMenuItem><SidebarMenuButton asChild isActive={isNavigationActive(pathname, '/settings')} className={NAV_BUTTON}>
          <Link href="/settings" onClick={closeMobile} aria-current={isNavigationActive(pathname, '/settings') ? 'page' : undefined}><ProductIcon icon={Settings} category="navigation" intent="navigate" /><span>การตั้งค่า</span><ProductIcon icon={ArrowUpRight} category="action" intent="navigate" className="ml-auto text-muted-foreground" /></Link>
        </SidebarMenuButton></SidebarMenuItem></SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
})
