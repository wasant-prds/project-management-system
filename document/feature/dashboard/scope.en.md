# Dashboard — Scope

| Field | Value |
| --- | --- |
| Feature | `/` overview dashboard |
| Document | Scope (EN) |
| Thai version | [scope.th.md](./scope.th.md) |
| Related | [business-requirement.en.md](./business-requirement.en.md) |
| **Status** | **done** |
| Date | 2026-09-04 |

This document describes **what is in or out of this work** and which service implements it. Product behavior is in the [business requirement](./business-requirement.en.md).

---

## 1. Service

| Item | In this work |
| --- | --- |
| Runtime | Next.js **`app`** only (`pms-app-dev`). No new microservice. |
| Page | `app/page.tsx` |
| Shared chrome | `components/layout/page-layout.ts`, `SidebarProvider` / `SidebarInset` |
| New API / Docker service / migration | `GET /api/dashboard/summary` was added in #23; no Docker service or schema migration. |

---

## 2. In scope

| Business case | In scope |
| --- | --- |
| Case 1 — Overview | Live WorkItem/TimeEntry KPIs and lists, recent Projects, date and Company/Project/role/kind filters, source links, and daily logged-hours chart. |
| Case 2 — Scroll | App shell `h-svh overflow-hidden`; main uses `PAGE_MAIN` (`overflow-y-auto`). Sidebar content already `overflow-auto`. |
| Case 3 — Contrast | Global button/badge/dialog tokens; no `text-foreground` on all `button` / `span` / `div`. |
| Case 4 — Responsive | Shared `STAT_GRID`, `PAGE_TOOLBAR`, compact headings. |

---

## 3. Out of scope

| Item | Out of scope |
| --- | --- |
| Advanced analytics | Forecasting, configurable widgets, and cross-company BI warehouse; live aggregates are now in scope through #23. |
| New widgets | No new dashboard cards or chart types in this pass. |
| Platform | No new REST resource, no Prisma schema change, no new Docker service. |

---

## 4. Technical notes

- Breakpoints: phone `< sm` (640px), tablet `sm`–`lg` (640–1023px), desktop `lg+` (1024px).
- Target: Dashboard reporting periods and date grouping use the system default timezone, `Asia/Bangkok`, in every environment.
- Charts resize with their container; axes, legend, tooltip, and labels stay inside the chart component at every breakpoint without page-level horizontal overflow.
- Contrast rule is CSS/component-level so it applies on every menu, not only `/`.
- `html, body { overflow: hidden }` so the bounded `PAGE_MAIN` is the scroll container.
- #23 shares `lib/dashboard.ts` between the page and API; metrics query PostgreSQL without adding schema or cache storage.

---

## 5. Files expected to change

| Area | Path |
| --- | --- |
| Page | `app/page.tsx` |
| Shell | `components/ui/sidebar.tsx`, `app/globals.css` |
| Contrast | `components/ui/button.tsx`, `components/ui/badge.tsx` |
