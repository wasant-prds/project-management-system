'use client'

import { memo } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { useOwnerSettings } from './owner-settings-provider'
import { currentNavigation } from './navigation'

export const AppHeader = memo(function AppHeader() {
  const pathname = usePathname()
  const route = currentNavigation(pathname)
  const { settings, isLoading, loadError } = useOwnerSettings()
  const profileName = settings?.profile.name || 'เจ้าของระบบ'
  return (
    <header className="cinematic-topbar sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-border/60 bg-background px-4 sm:px-6 lg:px-8">
      <div className="flex min-w-0 items-center gap-3">
        <SidebarTrigger aria-label="เปิดหรือปิดเมนูหลัก" />
        <nav aria-label="Breadcrumb" className="type-nav flex min-w-0 items-center gap-2">
          <Link href="/" className="motion-control hidden text-muted-foreground hover:text-foreground sm:inline">พื้นที่ทำงาน</Link>
          <ChevronRight aria-hidden="true" strokeWidth={1.75} className="hidden size-3 text-muted-foreground sm:block" />
          {route && pathname !== route.url ? <><Link href={route.url} className="motion-control text-muted-foreground hover:text-foreground">{route.title}</Link><ChevronRight aria-hidden="true" strokeWidth={1.75} className="size-3 text-muted-foreground" /><span aria-current="page" className="truncate font-semibold">รายละเอียด</span></> : <span aria-current="page" className="truncate font-semibold">{route?.title ?? 'พื้นที่ทำงาน'}</span>}
        </nav>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <ThemeToggle />
        <span aria-hidden="true" className="h-6 w-px bg-border/60" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-11 max-w-48 gap-2 rounded-xl px-2" aria-label="เมนูโปรไฟล์เจ้าของระบบ">
              <span data-slot="icon-well" className="icon-well surface-inset flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-link"><UserRound aria-hidden="true" strokeWidth={1.75} className="size-4" /></span>
              <span className="hidden min-w-0 text-left sm:block"><span className="block truncate text-xs font-semibold">{isLoading ? 'กำลังโหลด…' : profileName}</span><span className="type-caption block">เจ้าของระบบ</span></span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="content-wrap">{loadError ? 'โหลดโปรไฟล์ไม่สำเร็จ' : profileName}</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild><Link href="/settings">โปรไฟล์และการแสดงผล</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/projects">Projects ของคุณ</Link></DropdownMenuItem>
            <DropdownMenuItem asChild><Link href="/work-items">Work Items ของคุณ</Link></DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
})
