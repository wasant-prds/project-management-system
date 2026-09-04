# Projects — Scope

| Field | Value |
| --- | --- |
| Feature | `/projects` list and `/projects/[id]` detail |
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
| Data | Existing project APIs / Prisma on the list and detail pages. |
| New API / Docker service / migration | **No.** |

---

## 2. In scope

| Business case | In scope |
| --- | --- |
| Case 1 — Browse | Existing list, detail, create, edit, team flows. |
| Case 2 — Scroll | Shared sidebar shell + `PAGE_MAIN` on list and detail. |
| Case 3 — Contrast | Shared button/badge/dialog tokens. |
| Case 4 — Modals | `DIALOG_SHELL_SCROLL_CLASS` on create, edit, and team dialogs; opaque `bg-card`. |
| Case 5 — Responsive | Shared page chrome tokens. |

---

## 3. Out of scope

| Item | Out of scope |
| --- | --- |
| New project fields | Do not add schema fields in this pass. |
| Kanban on this route | Board stays on `/board`. |
| Platform | No new REST resource, no Prisma schema change, no new Docker service. |

---

## 4. Technical notes

- Dialog shells: `components/ui/responsive-dialog.ts`.
- Confirm-delete remains an alert dialog (compact), with the same card contrast as other modals.
- Breakpoints: phone `< 640`, tablet `640–1023`, desktop `1024+`.

---

## 5. Files expected to change

| Area | Path |
| --- | --- |
| Pages | `app/projects/page.tsx`, `app/projects/[id]/page.tsx` |
| Dialogs | `components/page/projects/project-create-modal.tsx`, `project-edit-modal.tsx`, `project-team-modal.tsx` |
| Shell / contrast | `components/ui/sidebar.tsx`, `components/ui/dialog.tsx`, `components/ui/alert-dialog.tsx`, `app/globals.css` |
