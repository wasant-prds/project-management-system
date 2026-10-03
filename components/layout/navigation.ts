/** One route registry for navigation and breadcrumbs; nested Project routes stay active. */
export const APP_NAVIGATION = [
  { title: 'Dashboard', url: '/', group: 'ภาพรวม' },
  { title: 'Projects', url: '/projects', group: 'ภาพรวม' },
  { title: 'Work Items', url: '/work-items', group: 'ภาพรวม' },
  { title: 'Board', url: '/board', group: 'การทำงาน' },
  { title: 'Analysis', url: '/analysis', group: 'การทำงาน' },
  { title: 'Daily Work', url: '/daily-work', group: 'การทำงาน' },
  { title: 'Company', url: '/company', group: 'การทำงาน' },
  { title: 'การตั้งค่า', url: '/settings', group: 'ระบบ' },
] as const

export function isNavigationActive(pathname: string, url: string) {
  return pathname === url || (url !== '/' && pathname.startsWith(`${url}/`))
}

export function currentNavigation(pathname: string) {
  return APP_NAVIGATION.find((item) => isNavigationActive(pathname, item.url))
}
