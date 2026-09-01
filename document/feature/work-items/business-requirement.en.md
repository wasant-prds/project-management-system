# Work Items — Business requirement

| Field | Value |
| --- | --- |
| Feature | `/work-items` list and view modal |
| Document | Business requirement (EN) |
| Thai version | [business-requirement.th.md](./business-requirement.th.md) |
| Related | [scope.en.md](./scope.en.md) |
| **Status** | **waiting — start code** |
| Date | 2026-09-01 |

This document describes **what the product must do**. Technical boundaries are in the [scope](./scope.en.md).

---

## Case 1 — Default year is the current year

When a user opens `/work-items`, the year filter must already be the **current calendar year** (the user’s local date).

- The year dropdown always includes that current year, even if no work items match.
- The dropdown also keeps **All years** and every other year that exists on loaded items (newest year first).
- Month and project filters stay **All** unless the user changes them.
- Changing year/month still uses the existing “focus date” of each item (work date, else due date, else created date).

**Example:** On 1 Sep 2026 the page opens with year **2026**. If 2026 has no items, the list can be empty, but **2026** remains in the year list.

---

## Case 2 — Default order: newest project activity, then newest item

Until the user picks another sort (Case 3), the list is ordered as follows:

1. **Projects** with the most recent action appear first. “Most recent action” means the latest **updated** time among that project’s visible items.
2. Under a project, items still follow the urgency subgroups in Case 5. Inside **On track**, newer updates appear first.

All kinds (Incident, Issue, Task) use this rule. The Issues tab is not forced as the default tab.

---

## Case 3 — Hover sort (due date or project title) and reset

The sort control shows the **current** sort name (for example “Recent activity” while Case 2 is active).

When the pointer **hovers** the sort control (click and keyboard must also open the same menu), these options appear:

| Option | What the user gets |
| --- | --- |
| Due date ↑ | Projects ordered by due date, earliest first. Incomplete items inside a project ordered by due date, earliest first. Complete items stay A–Z by title. |
| Due date ↓ | Same grouping; due dates latest first. Complete items stay A–Z by title. |
| Project title A–Z | Projects ordered by name A–Z. Subgroups and default item order inside each subgroup stay as in Case 5. |
| Project title Z–A | Projects ordered by name Z–A. Subgroups unchanged. |
| **Reset to default** | Return to Case 2. Do **not** clear year, month, project, or search. |

Hover sorts do **not** remove project headers or the four urgency subgroups (Case 4 and Case 5). They only change project order and/or order inside those subgroups.

---

## Case 4 — List is always grouped by project

Every matching work item is shown under its **project group header**, then the cards for that project.

This grouping is always on: default sort and every hover sort.

---

## Case 5 — Four urgency subgroups under each project

Under **every** project header, cards are split into these subgroups **in this order**. Hide a subgroup when it has no cards. Color the subgroup header bar to match the condition.

| # | Subgroup | Business rule | Default order of cards | Header bar |
| --- | --- | --- | --- | --- |
| 5.1 | **Overdue** | Not finished, due date **before today**. Due **today** is not overdue. | By due date, most overdue first | Red |
| 5.2 | **Near due** | Not finished, not overdue, due date from **today through the end of this calendar month**. Due today is near due. | By due date, soonest first | Amber |
| 5.3 | **On track** | Not finished, and not overdue or near due (no due date, or due after this month). | By most recent update, newest first | Blue |
| 5.4 | **Complete** | Status **completed** or **cancelled**. | By title A–Z | Green |

**Finished vs not finished:** Cancelled counts as Complete (5.4), not On track.

**Example on 1 Sep 2026**

| Due date | Status | Subgroup |
| --- | --- | --- |
| 31 Aug 2026 or earlier | not completed, not cancelled | Overdue |
| 1 Sep 2026 – 30 Sep 2026 | not completed, not cancelled | Near due |
| Oct 2026 or later, or no due date | not completed, not cancelled | On track |
| any | completed or cancelled | Complete |

These four subgroups stay in place for **every** sort mode (Case 3).

---

## Case 6 — View modal: metadata on one row

When the user **views** a work item (not create/edit):

- **Assignee**, **Work date**, **Due date**, and **Submitted** sit on **one row** (they may wrap on a narrow screen).
- The **Details** box uses the vertical space this frees.

Create and edit modals are unchanged (see scope).

---

## Acceptance criteria

| Case | Done when |
| --- | --- |
| 1 | Opening the page selects the current year; that year stays in the dropdown even if the list is empty. |
| 2 | With default sort, project groups with newer updates appear first. |
| 3 | Hover (or equivalent) shows due date ↑/↓, project title A–Z/Z–A, and Reset to default. Reset restores Case 2 without clearing filters. |
| 4 | Cards sit under project headers. |
| 5 | Under each project: Overdue → Near due → On track → Complete; empty subgroups hidden; bar colors match the table. |
| 6 | View modal metadata is one row; Details has more height. |
