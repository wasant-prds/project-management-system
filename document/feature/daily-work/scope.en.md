# Daily Work — Scope

| Field | Value |
| --- | --- |
| Feature | `/daily-work` time logs |
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
| Data | Existing work-log APIs. |
| New API / Docker service / migration | **No.** |

---

## 2. In scope

| Business case | In scope |
| --- | --- |
| Case 1 — Log hours | Existing list, create, edit, view, and grouped view-all. |
| Case 2 — Scroll | Shared sidebar shell + `PAGE_MAIN`. |
| Case 3 — Contrast | Shared button tokens; success export uses white text. |
| Case 4 — Modals | `DIALOG_SHELL_WIDE_CLASS`; card view compact meta like view-all; Details `flex-[3]` / Remarks `flex-[7]`; `WorkItemDescription` including GFM tables. |
| Case 5 — Responsive | Shared page chrome; stacked dialog columns on phone. |

---

## 3. Out of scope

| Item | Out of scope |
| --- | --- |
| Timesheet payroll | No payroll export or approval workflow. |
| Work-item grouping | Urgency subgroups stay on `/work-items`. |
| Platform | No new REST resource, no Prisma schema change, no new Docker service. |

---

## 4. Technical notes

- Dialog shells: `components/ui/responsive-dialog.ts` (`DIALOG_SHELL_WIDE_CLASS`).
- Field panels: `text-foreground` on `bg-muted/40`.
- Details/Remarks: `WorkItemDescription` in `ScrollablePanel`; card modal `flex-[3]` / `flex-[7]`. GFM tables in `work-item-description.tsx`.
- Breakpoints: phone `< 640`, tablet `640–1023`, desktop `1024+`.

---

## 5. Files expected to change

| Area | Path |
| --- | --- |
| Page | `app/daily-work/page.tsx` |
| Dialogs | `components/page/daily-work/work-log-dialog.tsx`, `work-log-list.tsx` |
| Shell / contrast | `components/ui/dialog.tsx`, `components/ui/button.tsx`, `app/globals.css` |
