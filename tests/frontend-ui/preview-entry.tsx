import { createRoot } from 'react-dom/client'
import Dashboard from '@/app/page'
import Projects from '@/app/projects/page'
import WorkItems from '@/app/work-items/page'
import Board from '@/app/board/page'
import Analysis from '@/app/analysis/page'
import DailyWork from '@/app/daily-work/page'
import Company from '@/app/company/page'
import Settings from '@/app/settings/page'
import ProjectDetail from '@/app/projects/[id]/page'
import { Toaster } from '@/components/ui/toaster'
import { ThemeProvider } from 'next-themes'
import Template from '@/app/template'
import NotFoundPage from '@/app/not-found'
import ErrorPage from '@/app/error'
import { WorkLogLayoutAudit } from './work-log-layout-audit'

const routes: Record<string, React.ComponentType> = { '/': Dashboard, '/projects': Projects, '/work-items': WorkItems, '/board': Board, '/analysis': Analysis, '/daily-work': DailyWork, '/company': Company, '/settings': Settings }
const route = window.location.pathname
const Page = routes[route] ?? Projects
const theme = new URLSearchParams(window.location.search).get('theme') ?? 'light'
const root = document.getElementById('root')
const detailParams = Promise.resolve({ id: route.split('/').at(-1) ?? 'project-0' })
let pageContent = <Page />
if (route === '/qa/not-found') {
  pageContent = <NotFoundPage />
} else if (route === '/qa/route-error') {
  pageContent = <ErrorPage error={new Error('Synthetic failure')} reset={() => window.location.reload()} />
} else if (route.startsWith('/projects/')) {
  pageContent = <ProjectDetail params={detailParams} />
}
if (root) createRoot(root).render(
  <ThemeProvider attribute="class" defaultTheme="light" forcedTheme={new URLSearchParams(window.location.search).get('themeSwitch') === '1' ? undefined : theme} themes={['light', 'dark', 'special-dark']}>
    <Template>{pageContent}</Template>
    {route === '/daily-work' && new URLSearchParams(window.location.search).get('layoutCheck') === '1' && <WorkLogLayoutAudit />}
    <Toaster />
  </ThemeProvider>,
)
