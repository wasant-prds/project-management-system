# Projects — Business requirement

| Field | Value |
| --- | --- |
| Feature | `/projects` list and `/projects/[id]` detail |
| Document | Business requirement (EN) |
| Thai version | [business-requirement.th.md](./business-requirement.th.md) |
| Related | [scope.en.md](./scope.en.md) |
| **Status** | **done** |
| Date | 2026-09-04 |

This document describes **what the product must do**. Technical boundaries are in the [scope](./scope.en.md).

---

## Case 1 — Browse and open projects

Users can list projects on `/projects`, open a project on `/projects/[id]`, and create or edit a project (and manage team) from the existing dialogs.

---

## Case 2 — Page and menu must scroll

The project list, project detail, and the left menu must scroll inside the app shell so long lists and detail sections stay reachable.

---

## Case 3 — Button and fill contrast

Filled controls use **light or white text on a dark fill**, and **dark or black text on a light or white fill**. Primary (green) actions must stay readable.

---

## Case 4 — Modals match work-items readability

Create, edit, and team dialogs must fit the viewport (near-full-screen on phone/tablet, capped width on desktop), use an opaque card surface, and keep labels readable. Inner content scrolls when the form is long. Format follows `/work-items` (`DIALOG_SHELL_SCROLL_CLASS`).

---

## Case 5 — Responsive layout

| Device | Width |
| --- | --- |
| Phone | below 640px |
| Tablet | 640px through 1023px |
| Desktop / notebook | 1024px and up |

Toolbar actions may shorten on the phone. Cards and filters must not overflow.

---

## Acceptance criteria

| Case | Done when |
| --- | --- |
| 1 | Users can list, open, create, and edit projects with the existing flows. |
| 2 | List, detail, and sidebar scroll when content is taller than the viewport. |
| 3 | Primary and other solid buttons use white labels on dark fills. |
| 4 | Project dialogs stay on-screen, opaque, and readable like work-items. |
| 5 | Phone/tablet/desktop layouts do not clip the page. |
