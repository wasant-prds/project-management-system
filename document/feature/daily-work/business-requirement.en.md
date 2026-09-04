# Daily Work — Business requirement

| Field | Value |
| --- | --- |
| Feature | `/daily-work` time logs |
| Document | Business requirement (EN) |
| Thai version | [business-requirement.th.md](./business-requirement.th.md) |
| Related | [scope.en.md](./scope.en.md) |
| **Status** | **done** |
| Date | 2026-09-04 |

This document describes **what the product must do**. Technical boundaries are in the [scope](./scope.en.md).

---

## Case 1 — Log and review hours

Users pick a date (or period), see work logs, add or edit a log, and can open a grouped “view all” dialog for the selected range.

---

## Case 2 — Page and menu must scroll

The daily-work page and the left menu must scroll inside the app shell so the calendar, stats, and log list stay reachable.

---

## Case 3 — Button and fill contrast

Filled controls use **light or white text on a dark fill**, and **dark or black text on a light or white fill**. Success (green) export actions must use white labels, never black on green.

---

## Case 4 — Modals match work-items readability

Create, edit, view, and “view all” dialogs use the same family of shells as `/work-items`: near-full-screen on phone/tablet, viewport-capped on desktop, opaque card surface, inner scroll, readable field panels. Wide forms use `DIALOG_SHELL_WIDE_CLASS`.

**Details and Remarks** in the **card** (single log) modal:

- Follow the **view all** layout: compact metadata (title, kind, status, user, date, hours). Do not repeat those fields in a second column of panels.
- Remarks is about **70%** of the remaining height; Details is about **30%**. Both stay inner-scroll panels with the work-items Details chrome.
- Markdown in Details and Remarks renders like a `.md` preview, including **GFM tables** (`| col |` + `| --- |`).

The grouped **view all** modal keeps the same markdown preview for Details and Remarks (natural height per card).

---

## Case 5 — Responsive layout

| Device | Width |
| --- | --- |
| Phone | below 640px |
| Tablet | 640px through 1023px |
| Desktop / notebook | 1024px and up |

Primary actions may shorten on the phone. Dialog field columns stack on the phone.

---

## Acceptance criteria

| Case | Done when |
| --- | --- |
| 1 | Users can list, add, edit, and view work logs for a date or period. |
| 2 | Main pane and sidebar scroll when content is taller than the viewport. |
| 3 | Solid buttons (including Export Markdown) use white labels on dark fills. |
| 4 | Work-log dialogs stay on-screen and readable. Card view uses compact metadata plus Details ~30% / Remarks ~70%. Markdown tables render as formatted tables. |
| 5 | Phone/tablet/desktop layouts match Case 5. |
