# Analysis — Business requirement

| Field | Value |
| --- | --- |
| Feature | `/analysis` reports and charts |
| Document | Business requirement (EN) |
| Thai version | [business-requirement.th.md](./business-requirement.th.md) |
| Related | [scope.en.md](./scope.en.md) |
| **Status** | **done** |
| Date | 2026-09-04 |

This document describes **what the product must do**. Technical boundaries are in the [scope](./scope.en.md).

---

## Case 1 — Review performance

Users open `/analysis` to see summary cards, tabs, and charts for project, team, and work trends.

---

## Case 2 — Page and menu must scroll

The analysis page and the left menu must scroll inside the app shell. Tall chart stacks must remain reachable.

---

## Case 3 — Button and fill contrast

Filled controls use **light or white text on a dark fill**, and **dark or black text on a light or white fill**. Export / download actions must stay readable.

---

## Case 4 — Responsive layout

| Device | Width |
| --- | --- |
| Phone | below 640px |
| Tablet | 640px through 1023px |
| Desktop / notebook | 1024px and up |

Summary cards are **2×2** on the phone and **four across** from tablet. Tabs scroll horizontally. Charts must not overflow the page.

---

## Acceptance criteria

| Case | Done when |
| --- | --- |
| 1 | Analysis tabs, stats, and charts are visible. |
| 2 | Main pane and sidebar scroll when content is taller than the viewport. |
| 3 | Solid buttons (including export) use white labels on dark fills. |
| 4 | Phone/tablet/desktop layouts match Case 4. |
