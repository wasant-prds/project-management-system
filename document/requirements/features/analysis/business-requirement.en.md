# Analysis — Business requirement

| Field | Value |
| --- | --- |
| Feature | `/analysis` reports and charts |
| Document | Business requirement (EN) |
| Thai version | [business-requirement.th.md](./business-requirement.th.md) |
| Related | [scope.en.md](./scope.en.md) |
| **Status** | **Live data implemented in Issue #24** |
| Date | 2026-10-03 |

This document describes **what the product must do**. Technical boundaries are in the [scope](./scope.en.md).

---

## Case 1 — Review performance

The owner opens `/analysis` to see KPIs, breakdowns, and charts from real `WorkItem` and `TimeEntry` rows, filtered by reporting period, Company, Project, functional role, and kind. It does not report on a multi-user team. Periods and grouping use `Asia/Bangkok`; current status is not presented as historical throughput.

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

Summary cards are **2×2** on the phone and **four across** from tablet. Tabs scroll horizontally. Charts, axes, legend, tooltip, and labels must stay inside the chart component without causing page-level horizontal scrolling.

---

## Acceptance criteria

| Case | Done when |
| --- | --- |
| 1 | KPIs, breakdowns, charts, WorkItem/TimeEntry source tables, and CSV export are visible and use the same filters. |
| 2 | Main pane and sidebar scroll when content is taller than the viewport. |
| 3 | Solid buttons (including export) use white labels on dark fills. |
| 4 | Phone/tablet/notebook layouts match Case 4; chart elements stay inside the component frame. |
