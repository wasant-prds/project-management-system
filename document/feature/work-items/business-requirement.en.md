# Work Items — Business requirement

| Field | Value |
| --- | --- |
| Feature | `/work-items` list and view modal |
| Document | Business requirement (EN) |
| Thai version | [business-requirement.th.md](./business-requirement.th.md) |
| Related | [scope.en.md](./scope.en.md) |
| **Status** | **done** |
| Date | 2026-09-04 |

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

- **Assignee**, **Work date**, **Due date**, and **Submitted** sit on **one row** on tablet and desktop (they wrap to a compact 2×2 grid on a phone).
- The **Details** box uses the vertical space this frees. Markdown in Details (headings, lists, **bold**, `code`, and **GFM tables**) renders like a `.md` preview.

Create and edit **fields** are unchanged. The dialog **shell** (size, scroll, close control) follows Case 9.

---

## Case 7 — Expandable groups with a file-tree path

Project headers and urgency subgroups (Case 4 and Case 5) can **expand and collapse** (click and keyboard). Cards do not collapse.

- **Default:** the **first** project in the current visible list is expanded. Only that project’s **first visible** subgroup is expanded (first in Case 5 order among subgroups that have cards). Every other project starts collapsed. Other subgroups start collapsed.
- Nested levels use the **same** expand control (chevron on the header). Subgroups and cards are **slightly smaller** than the project header (indent + type/card size), not a CSS zoom.
- A CSS **tree** (vertical spine + T/L connectors) shows the path: project → subgroup → card, like the README Project Structure `├──` / `│` / `└──` diagram. Cards are **leaves**; click still opens the view modal.
- Changing year, month, project, search, kind tab, or sort **resets** expand state to the default above. Export still uses the full visible list, not only expanded rows.

**Example:** Three projects Alpha, Beta, Gamma (in that list order). Alpha is open. If Alpha has Overdue and On track, only **Overdue** is open. Beta and Gamma show the project header only until the user expands them. Expanding Beta then opens Beta’s first visible subgroup.

---

## Case 8 — Sticky group and subgroup headers while scrolling

While scrolling the work-items list, the **project header** and the **current subgroup header** stay on screen so the reader still knows which group they are in.

- They stick **just under the app top bar** (search / theme / profile). They must not cover that bar. Page title, stats, filters, and kind tabs are **not** pinned.
- Two stacked rows: project on top; subgroup **directly under it**, indented and slightly smaller (same chevron / tree look). The subgroup must not cover the project row.
- The current project stays pinned **until its last card has scrolled away**, then the next project takes the slot.
- Sticky applies only while that project or subgroup is **expanded** and its cards are scrolling. Collapsed headers scroll away normally.
- While stuck, the bars use a solid (or light blur) background plus a bottom border/shadow so cards do not show through.

---

## Case 9 — Responsive layout (phone, tablet, notebook)

`/work-items` must work as a responsive web app on phone, tablet, and notebook.

| Device | Width |
| --- | --- |
| Phone | below 640px |
| Tablet | 640px through 1023px |
| Desktop / notebook | 1024px and up |

**Summary cards.** Four separate cards remain (Total, In Progress, Completed, Overdue). Padding is compact. Phone is a **2×2** grid. Tablet and desktop are **four across**.

**Page chrome.** On the phone, Export CSV and Export Markdown are **icon-only** (full labels from tablet). “New Work Item” may shorten to “New”. Search and filters are full-width on the phone (year/month share a row; project and sort use the full row). Kind tabs keep their labels and **scroll horizontally** instead of clipping.

**Modals (view, create, and edit).** On phone and tablet the dialog is **near-full-screen**: height follows `100dvh` with a small edge margin, content scrolls **inside** the dialog, and the overlay must not overflow the viewport. On desktop the dialog is centered with a max width that still fits the viewport (about `54.6rem`). The close (X) control must not cover the project name. View metadata still follows Case 6.

**Cards.** The same fields stay on each work-item card. Titles and assignee names truncate or wrap so the project tree does not overflow the screen.

---

## Acceptance criteria

| Case | Done when |
| --- | --- |
| 1 | Opening the page selects the current year; that year stays in the dropdown even if the list is empty. |
| 2 | With default sort, project groups with newer updates appear first. |
| 3 | Hover (or equivalent) shows due date ↑/↓, project title A–Z/Z–A, and Reset to default. Reset restores Case 2 without clearing filters. |
| 4 | Cards sit under project headers. |
| 5 | Under each project: Overdue → Near due → On track → Complete; empty subgroups hidden; bar colors match the table. |
| 6 | View modal metadata is one row on tablet/desktop and a compact 2×2 wrap on phone; Details has more height. |
| 7 | Project and subgroup headers expand/collapse; first project + first visible subgroup open by default; tree connectors; nested size is slightly smaller; filter/sort/tab reset expand state; cards stay leaves. |
| 8 | While scrolling an expanded section, project then subgroup stay stacked under the app bar without overlapping; they unpin after the last card; stuck bars stay opaque and readable. |
| 9 | Phone/tablet/desktop layouts match Case 9: compact 2×2 then 4-across stats; icon export on phone; full-width filters; scrollable tabs; near-full-screen dialogs without overflow; cards do not overflow. |
