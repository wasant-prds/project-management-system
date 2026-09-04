# Settings — Scope

| Field | Value |
| --- | --- |
| Feature | `/settings` account and preferences |
| Document | Scope (EN) |
| Thai version | [scope.th.md](./scope.th.md) |
| Related | [business-requirement.en.md](./business-requirement.en.md) |
| **Status** | **done** |
| Date | 2026-09-04 |

This document describes **what is in or out of this work** and which service implements it. Product behavior is in the [business requirement](./business-requirement.en.md).

---

## 1. Service

| Item | In this work |
| --- | --- |
| Runtime | Next.js **`app`** only (`pms-app-dev`). No new microservice. |
| Page | `app/settings/page.tsx` |
| Theme | Existing `ThemeProvider` (`storageKey="project-management-theme"`). |
| New API / Docker service / migration | **No.** |

---

## 2. In scope

| Business case | In scope |
| --- | --- |
| Case 1 — Preferences | Existing tabs and forms. |
| Case 2 — Scroll | Shared sidebar shell + `PAGE_MAIN`. |
| Case 3 — Contrast | Shared button tokens and theme CSS variables. |
| Case 4 — Responsive | Scrollable tabs and stacked forms. |

---

## 3. Out of scope

| Item | Out of scope |
| --- | --- |
| Persist profile | Do not add a new user-profile API in this pass if the form is still local UI. |
| Auth provider | Do not change login/SSO. |
| Platform | No new REST resource, no Prisma schema change, no new Docker service. |

---

## 4. Technical notes

- Breakpoints: phone `< 640`, tablet `640–1023`, desktop `1024+`.
- Light/dark/special-dark all follow the same contrast rule on solid buttons.

---

## 5. Files expected to change

| Area | Path |
| --- | --- |
| Page | `app/settings/page.tsx` |
| Shell / contrast | `components/ui/sidebar.tsx`, `components/ui/button.tsx`, `app/globals.css` |
