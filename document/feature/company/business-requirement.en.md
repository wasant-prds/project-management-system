# Company — Business requirement

| Field | Value |
| --- | --- |
| Feature | `/company` organization and team |
| Document | Business requirement (EN) |
| Thai version | [business-requirement.th.md](./business-requirement.th.md) |
| Related | [scope.en.md](./scope.en.md) |
| **Status** | **done** |
| Date | 2026-09-04 |

This document describes **what the product must do**. Technical boundaries are in the [scope](./scope.en.md).

---

## Case 1 — View company and team

Users open `/company` to see organization summary cards, team members, and company settings tabs.

---

## Case 2 — Page and menu must scroll

The company page and the left menu must scroll inside the app shell so member grids and settings forms stay reachable.

---

## Case 3 — Button and fill contrast

Filled controls use **light or white text on a dark fill**, and **dark or black text on a light or white fill**. “Add Member” and similar primary actions must stay readable.

---

## Case 4 — Responsive layout

| Device | Width |
| --- | --- |
| Phone | below 640px |
| Tablet | 640px through 1023px |
| Desktop / notebook | 1024px and up |

Summary cards are **2×2** on the phone and **four across** from tablet. Tabs scroll horizontally. Member cards wrap instead of overflowing.

---

## Case 5 — Future modals

If this page adds create/edit dialogs, they must follow the `/work-items` shell (viewport cap, opaque card, inner scroll, readable labels).

---

## Acceptance criteria

| Case | Done when |
| --- | --- |
| 1 | Company stats, team tab, and settings tab are visible. |
| 2 | Main pane and sidebar scroll when content is taller than the viewport. |
| 3 | Solid buttons use white labels on dark fills. |
| 4 | Phone/tablet/desktop layouts match Case 4. |
