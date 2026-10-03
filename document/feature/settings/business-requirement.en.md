# Settings — Business requirement

| Field | Value |
| --- | --- |
| Feature | `/settings` account and preferences |
| Document | Business requirement (EN) |
| Thai version | [business-requirement.th.md](./business-requirement.th.md) |
| Related | [scope.en.md](./scope.en.md) |
| **Status** | **Issue #25 implemented in source; schema rollout pending** |
| Date | 2026-09-04 |

This document describes **what the product must do**. Technical boundaries are in the [scope](./scope.en.md).

---

## Case 1 — Manage preferences

The owner opens `/settings` to read and update the single account's name, email, phone, theme (`light` / `dark` / `special-dark`), and locale (`th` / `en`). Show `Asia/Bangkok` as a fixed read-only system timezone. Omit password/2FA and notification controls until a supported provider or channel is integrated.

The saved theme is shared by Settings, the header, and the ThemeProvider; the saved locale sets the HTML language. The interface remains Thai-first; this issue does not translate all menu copy. Appearance uses the system-wide Neumorphism visual language through shared tokens; do not add a separate Neumorphism preference.

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
| 1 | Owner profile and preferences load, persist, and remain saved after reload. |
| 2 | Main pane and sidebar scroll when content is taller than the viewport. |
| 3 | Buttons remain readable in every theme; Neumorphism does not reduce contrast or replace visible keyboard focus. |
| 4 | Phone/tablet/desktop layouts match Case 4. |
