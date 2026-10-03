# Analysis — Scope

| Field | Value |
| --- | --- |
| Feature | `/analysis` reports and charts |
| Document | Scope (EN) |
| Thai version | [scope.th.md](./scope.th.md) |
| Related | [business-requirement.en.md](./business-requirement.en.md) |
| **Status** | **Live data delivered in Issue #24** |
| Date | 2026-10-03 |

This document describes **what is in or out of this work** and which service implements it. Product behavior is in the [business requirement](./business-requirement.en.md).

---

## 1. Service

| Item | In this work |
| --- | --- |
| Runtime | Next.js **`app`** only (`pms-app-dev`). No new microservice. |
| Page | `app/analysis/page.tsx` |
| New API / Docker service / migration | Owner-only `GET /api/analysis/summary`; no Docker service or schema/migration change. |

---

## 2. In scope

| Business case | In scope |
| --- | --- |
| Case 1 — Review | KPIs, breakdowns, charts, filtered source tables, and CSV from real WorkItem/TimeEntry data. |
| Case 2 — Scroll | Shared sidebar shell + `PAGE_MAIN`. |
| Case 3 — Contrast | Shared button tokens. |
| Case 4 — Responsive | `STAT_GRID`, scrollable tabs, shared toolbar. |

---

## 3. Out of scope

| Item | Out of scope |
| --- | --- |
| Historical throughput | Do not show before reliable status history or a completion timestamp exists. |
| Live warehouse | Do not add a reporting service. |
| Platform | No new service or Prisma schema change; add a summary Route Handler inside the Next.js app. |

---

## 4. Technical notes

- Breakpoints: phone `< 640`, tablet `640–1023`, desktop `1024+`.
- Target: Analysis reporting periods and time-series grouping use the system default timezone, `Asia/Bangkok`, in every environment.
- Charts resize with their container; axes, legend, tooltip, and labels stay inside the chart component at every breakpoint without page-level horizontal overflow.
- Chart grid lines already use CSS variables in `app/globals.css`.
- Dashboard parser/query definitions and metric formulas are shared; periods, filters, breakdowns, details, and export use one filtered result.

---

## 5. Files expected to change

| Area | Path |
| --- | --- |
| Page | `app/analysis/page.tsx` |
| Shell / contrast | `components/ui/sidebar.tsx`, `components/ui/button.tsx`, `app/globals.css` |
