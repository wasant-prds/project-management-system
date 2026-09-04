# Board — Business requirement

| Field | Value |
| --- | --- |
| Feature | `/board` Kanban board |
| Document | Business requirement (EN) |
| Thai version | [business-requirement.th.md](./business-requirement.th.md) |
| Related | [scope.en.md](./scope.en.md) |
| **Status** | **done** |
| Date | 2026-09-04 |

This document describes **what the product must do**. Technical boundaries are in the [scope](./scope.en.md).

---

## Case 1 — Visual workflow

Users see work in columns on `/board` and can scan cards without the page overflowing the viewport.

---

## Case 2 — Page, menu, and board must scroll

The left menu scrolls if it is taller than the viewport. The board area scrolls **inside** the main pane (horizontal columns and vertical cards) so columns remain usable on phone and tablet.

---

## Case 3 — Button and fill contrast

Filled controls use **light or white text on a dark fill**, and **dark or black text on a light or white fill**.

---

## Case 4 — Responsive layout

| Device | Width |
| --- | --- |
| Phone | below 640px |
| Tablet | 640px through 1023px |
| Desktop / notebook | 1024px and up |

Toolbar actions may shorten on the phone. Columns stay a readable width and scroll sideways rather than squeezing until labels vanish.

---

## Acceptance criteria

| Case | Done when |
| --- | --- |
| 1 | The Kanban columns and cards are visible. |
| 2 | Sidebar and board scroll independently of a locked window height. |
| 3 | Solid buttons remain readable in light and dark themes. |
| 4 | Phone/tablet/desktop layouts do not clip the toolbar or hide the board. |
