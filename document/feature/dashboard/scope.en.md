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
| New API / Docker service / migration | **No.** |

---

## 2. In scope

| Business case | In scope |
| --- | --- |
| Case 1 — Overview | Existing dashboard stats, recent projects, and charts. |
| Case 2 — Scroll | App shell `h-svh overflow-hidden`; main uses `PAGE_MAIN` (`overflow-y-auto`). Sidebar content already `overflow-auto`. |
| Case 3 — Contrast | Global button/badge/dialog tokens; no `text-foreground` on all `button` / `span` / `div`. |
| Case 4 — Responsive | Shared `STAT_GRID`, `PAGE_TOOLBAR`, compact headings. |

---

## 3. Out of scope

| Item | Out of scope |
| --- | --- |
| Live metrics | Binding every dashboard number to live Prisma aggregates (page may still use sample chart data). |
| New widgets | No new dashboard cards or chart types in this pass. |
| Platform | No new REST resource, no Prisma schema change, no new Docker service. |

---

## 4. Technical notes

- Breakpoints: phone `< sm` (640px), tablet `sm`–`lg` (640–1023px), desktop `lg+` (1024px).
- Contrast rule is CSS/component-level so it applies on every menu, not only `/`.
- `html, body { overflow: hidden }` so the bounded `PAGE_MAIN` is the scroll container.

---

## 5. Files expected to change

| Area | Path |
| --- | --- |
| Page | `app/page.tsx` |
| Shell | `components/ui/sidebar.tsx`, `app/globals.css` |
| Contrast | `components/ui/button.tsx`, `components/ui/badge.tsx` |
