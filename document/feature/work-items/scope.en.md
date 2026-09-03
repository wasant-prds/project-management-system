# Work Items — Scope

| Field | Value |
| --- | --- |
| Feature | `/work-items` list and view modal |
| Document | Scope (EN) |
| Thai version | [scope.th.md](./scope.th.md) |
| Related | [business-requirement.en.md](./business-requirement.en.md) |
| **Status** | **done** |
| Date | 2026-09-03 |

This document describes **what is in or out of this work** and which service implements it. Product behavior is in the [business requirement](./business-requirement.en.md).

---

## 1. Service

| Item | In this work |
| --- | --- |
| Runtime | Next.js **`app`** only (`pms-app-dev`). No new microservice. |
| Data | Existing `GET /api/work-items` (Prisma → Postgres). |
| Recency | Work item **`updatedAt`** (already on the model). Expose/use it on the client type if missing. |
| Grouping, year default, hover sort, expand/collapse tree | Client-side on `/work-items`. |
| New API / Docker service / migration | **No.** |

---

## 2. In scope (mapped to business cases)

| Business case | In scope |
| --- | --- |
| Case 1 — Current year | Default year filter; always keep current year in the dropdown. |
| Case 2 — Default recency order | Sort project groups by max `updatedAt`; On track items by `updatedAt`. |
| Case 3 — Hover sort + reset | Hover/click/keyboard menu: due date ↑/↓, project title A–Z/Z–A, **Reset to default**. Reset does not clear filters. |
| Case 4 — Project headers | Group the visible list by project. |
| Case 5 — Urgency subgroups | Overdue / Near due / On track / Complete under every project, all sort modes; hide empty subgroups; colored header bars. |
| Case 6 — View modal row | View dialog only: Assignee, Work date, Due date, Submitted on one row. |
| Case 7 — Expandable tree | Collapsible project + urgency headers; default first project / first subgroup; CSS tree connectors; nested size; reset expand on filter/sort/tab. |
| Case 8 — Sticky headers | Expanded project + subgroup stick under the app bar as two rows; unpin after last card; opaque while stuck. |

---

## 3. Out of scope (by case)

Treat each row as a **non-goal** for this delivery.

| Case | Out of scope |
| --- | --- |
| Recency | Daily-work logs and time-entry dates are not “most recent action”. |
| Kind / tabs | Do not default the tab to Issues. Do not force Kind = Issue above Incident/Task. |
| Case 3 vs filters | Reset to default is a **sort** reset only. It must not clear year, month, project, or search. |
| Case 6 | Create/Edit modal (Description form) is unchanged. |
| Export | No new CSV/Markdown grouping UX. Export the currently visible items as today. |
| Case 7 persist | Do not store expand state in `localStorage`. Reset when year, month, project, search, kind tab, or sort changes. |
| Case 7 cards | Cards are not collapsible. No compact one-line-only row mode. |
| Case 8 chrome | Do not pin page title, stats, filters, or kind tabs. Do not cover the app top bar. |
| Case 8 combined bar | Do not merge project and subgroup into one breadcrumb row. |
| Platform | No new REST resource, no Prisma schema change, no new Docker service. |

---

## 4. Technical notes for in-scope cases

### Case 1 — Year

- Initial state: `String(new Date().getFullYear())` (browser local time).
- Year options = `all` + current year + years found on loaded items, unique, descending.

### Case 2 and Case 3 — Sort field

- Compare recency with `updatedAt`.
- Items without `updatedAt` sort as oldest.
- Due-date hover: items with no due date last inside On track.

### Case 5 — Date boundaries

- Compare due dates on the **local calendar date**, not UTC clock time.
- Overdue: due date **&lt; today**.
- Near due: due date **≥ today** and **same calendar month as today**.
- On track: incomplete, not overdue, not near due.

### Case 6 — File

- Change `components/page/work-items/work-item-view-dialog.tsx` only for the metadata row.

### Case 7 — Expand / tree

- Reuse `components/ui/collapsible.tsx` (Radix). No new service.
- First visible subgroup = first non-empty Case 5 bucket on that project.
- Opening a collapsed project also opens that project’s first visible subgroup.
- Tree lines are CSS (`border` spine + elbow), not monospace `├──` characters.
- Nested scale = smaller type/padding/indent, not `transform: scale` / CSS `zoom`.

### Case 8 — Sticky headers

- CSS `position: sticky` inside the scrolling `main` (`top: 0` for project, `top: <project header height>` for subgroup). App header stays a sibling, so bars sit under it.
- Do not wrap sticky headers in `overflow: hidden` (avoid Radix `CollapsibleContent` clipping).
- Stuck background/shadow only when the bar has reached its sticky offset (scroll listener on `main`).
- Sticky only when that collapsible is open.

---

## 5. Files expected to change

| Area | Path |
| --- | --- |
| Page (year, groups, hover sort) | `app/work-items/page.tsx` |
| Sort helpers | `components/page/work-items/work-item-export.ts` |
| Types (`updatedAt`) | `components/page/work-items/types.ts` |
| View modal | `components/page/work-items/work-item-view-dialog.tsx` |
| Hover menu (reuse) | `components/ui/dropdown-menu.tsx` / `components/ui/tooltip.tsx` |
| Expand / tree | `components/page/work-items/work-item-grouped-list.tsx` |
| Compact nested cards | `components/page/work-items/work-item-card.tsx` |
| Collapsible (reuse) | `components/ui/collapsible.tsx` |

No new API route if Prisma already serializes `updatedAt` on `WorkItem`.

---

## 6. Decisions that bound this scope

| Q# | Bound |
| --- | --- |
| 1a | Recency = `updatedAt` only. |
| 2a | All kinds; project then item by latest activity. |
| 3a | Hover menu for due date and project title. |
| 4a | Always default to current year; always list it. |
| 5a | View modal only. |
| 6b | Project group headers. |
| 7d | Menu includes reset to default (not a full filter clear). |
| 8d / 9a | Subgroups Overdue → Near due → On track → Complete; cancelled in Complete. |
| 10c | Near due = remainder of this calendar month (including today). |
| 11a | Subgroups in every sort mode. |
| 12b | Project and urgency subgroups collapsible. |
| 13c | First project expanded; only first visible subgroup expanded. |
| 14b | Nested levels slightly smaller; same chevron pattern. |
| 15a | CSS file-tree spine and T/L connectors. |
| 16a | Reset expand state when filters, kind tab, or sort change. |
| 17a | Cards are tree leaves; not collapsible. |
| 18a | Stick under the app top bar only. |
| 19a | Two stacked rows: project, then indented subgroup. |
| 20c | Project stays until its last card is gone, then the next project takes over. |
| 21a | Sticky only while the section is expanded. |
| 22a | Opaque/blur background and shadow only while stuck. |
