# Board — Scope

| Field | Value |
| --- | --- |
| Feature | `/board` Kanban board |
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
| Page | `app/board/page.tsx` |
| New API / Docker service / migration | **No.** |

---

## 2. In scope

| Business case | In scope |
| --- | --- |
| Case 1 — Visual workflow | Existing columns and cards. |
| Case 2 — Scroll | Sidebar shell `h-svh`; board `main` uses `overflow-hidden` plus an inner `overflow-auto` pane. |
| Case 3 — Contrast | Shared button/badge tokens. |
| Case 4 — Responsive | Shared toolbar tokens; columns remain fixed width and scroll sideways. |

---

## 3. Out of scope

| Item | Out of scope |
| --- | --- |
| Drag-and-drop persistence | Do not add a new persist API in this pass. |
| Work-item grouping rules | Those stay on `/work-items`. |
| Platform | No new REST resource, no Prisma schema change, no new Docker service. |

---

## 4. Technical notes

- Do not put `overflow-y-auto` on the board `main` in a way that double-scrolls against the column area. The column row uses native `overflow-auto` inside a `min-w-0` pane.
- Breakpoints: phone `< 640`, tablet `640–1023`, desktop `1024+`.

---

## 5. Files expected to change

| Area | Path |
| --- | --- |
| Page | `app/board/page.tsx` |
| Shell / contrast | `components/ui/sidebar.tsx`, `components/ui/button.tsx`, `app/globals.css` |
