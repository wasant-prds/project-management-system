import { DashboardLoading } from '@/components/layout/dashboard-loading'

/** Instant commit for `/` so a desktop view transition does not wait on the dashboard query. */
export default function Loading() {
  return <DashboardLoading />
}
