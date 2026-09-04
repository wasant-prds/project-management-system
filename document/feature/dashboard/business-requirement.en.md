# Dashboard — Business requirement

| Field | Value |
| --- | --- |
| Feature | `/` overview dashboard |
| Document | Business requirement (EN) |
| Thai version | [business-requirement.th.md](./business-requirement.th.md) |
| Related | [scope.en.md](./scope.en.md) |
| **Status** | **done** |
| Date | 2026-09-04 |

This document describes **what the product must do**. Technical boundaries are in the [scope](./scope.en.md).

---

## Case 1 — Overview of work at a glance

When a user opens `/`, they see a summary of projects, work items, and team activity: four summary cards, recent projects, and charts.

---

## Case 2 — Page and menu must scroll

The dashboard content and the left menu must scroll **inside** the app shell. The window itself must not trap content off-screen. Long charts and lists remain reachable on phone, tablet, and desktop.

---

## Case 3 — Button and fill contrast

Filled controls use **light or white text on a dark fill**, and **dark or black text on a light or white fill**. A green (primary) button must never use black labels. Outline and ghost buttons follow the theme foreground on a light or theme surface.

---

## Case 4 — Responsive layout

| Device | Width |
| --- | --- |
| Phone | below 640px |
| Tablet | 640px through 1023px |
| Desktop / notebook | 1024px and up |

Summary cards use a **2×2** grid on the phone and **four across** from tablet. Toolbar actions may shorten on the phone. Charts and cards must not overflow horizontally.

---

## Acceptance criteria

| Case | Done when |
| --- | --- |
| 1 | The dashboard shows summary stats, recent projects, and activity charts. |
| 2 | The main pane and sidebar scroll when content is taller than the viewport. |
| 3 | Primary/success/info/neutral fills use white (or near-white) labels in light and dark themes. |
| 4 | Phone/tablet/desktop layouts match Case 4 without clipping the page. |
