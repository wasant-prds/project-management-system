# Analysis — Scope

| Field | Value |
| --- | --- |
| Feature | `/analysis` reports and charts |
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
| Page | `app/analysis/page.tsx` |
| New API / Docker service / migration | **No.** |

---

## 2. In scope

| Business case | In scope |
| --- | --- |
| Case 1 — Review | Existing stats, tabs, and charts. |
| Case 2 — Scroll | Shared sidebar shell + `PAGE_MAIN`. |
| Case 3 — Contrast | Shared button tokens. |
| Case 4 — Responsive | `STAT_GRID`, scrollable tabs, shared toolbar. |

---

## 3. Out of scope

| Item | Out of scope |
| --- | --- |
| New report types | Do not add new chart families in this pass. |
| Live warehouse | Do not add a reporting service. |
| Platform | No new REST resource, no Prisma schema change, no new Docker service. |

---

## 4. Technical notes

- Breakpoints: phone `< 640`, tablet `640–1023`, desktop `1024+`.
- Chart grid lines already use CSS variables in `app/globals.css`.

---

## 5. Files expected to change

| Area | Path |
| --- | --- |
| Page | `app/analysis/page.tsx` |
| Shell / contrast | `components/ui/sidebar.tsx`, `components/ui/button.tsx`, `app/globals.css` |
