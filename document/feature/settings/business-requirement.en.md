# Settings — Business requirement

| Field | Value |
| --- | --- |
| Feature | `/settings` account and preferences |
| Document | Business requirement (EN) |
| Thai version | [business-requirement.th.md](./business-requirement.th.md) |
| Related | [scope.en.md](./scope.en.md) |
| **Status** | **done** |
| Date | 2026-09-04 |

This document describes **what the product must do**. Technical boundaries are in the [scope](./scope.en.md).

---

## Case 1 — Manage preferences

Users open `/settings` to edit profile, notifications, security, and appearance (including light / dark / special-dark).

---

## Case 2 — Page and menu must scroll

The settings page and the left menu must scroll inside the app shell so long forms stay reachable.

---

## Case 3 — Button and fill contrast

Filled controls use **light or white text on a dark fill**, and **dark or black text on a light or white fill**. Save and similar primary actions must stay readable in every theme.

---

## Case 4 — Responsive layout

| Device | Width |
| --- | --- |
| Phone | below 640px |
| Tablet | 640px through 1023px |
| Desktop / notebook | 1024px and up |

Tabs scroll horizontally. Forms stack on the phone and must not overflow.

---

## Case 5 — Future modals

Confirm dialogs (if any) use the same opaque card contrast as `/work-items`.

---

## Acceptance criteria

| Case | Done when |
| --- | --- |
| 1 | Settings tabs and forms are visible. |
| 2 | Main pane and sidebar scroll when content is taller than the viewport. |
| 3 | Solid buttons use white labels on dark fills in light and dark themes. |
| 4 | Phone/tablet/desktop layouts match Case 4. |
