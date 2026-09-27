# Company — Scope

| Field | Value |
| --- | --- |
| Feature | `/company` company profile and Customer registry |
| Document | Scope (EN) |
| Thai version | [scope.th.md](./scope.th.md) |
| Related | [business-requirement.en.md](./business-requirement.en.md) |
| **Status** | **done** |
| Date | 2026-09-04 |

This document describes **what is in or out of this work** and which service implements it. Product behavior is in the [business requirement](./business-requirement.en.md).

> Note: The status and “no new API” boundary below describe the earlier UI task only. The current single-owner Company/Customer target is defined in the consolidated [Thai business requirement](../../BUSINESS_REQUIREMENT.md) and [scope](../../SCOPE.md).

---

## 1. Service

| Item | In this work |
| --- | --- |
| Runtime | Next.js **`app`** only (`pms-app-dev`). No new microservice. |
| Data | Existing Prisma reads on `app/company/page.tsx`. |
| New API / Docker service / migration | **No.** |

---

## 2. In scope

| Business case | In scope |
| --- | --- |
| Case 1 — View | Company profile, Customer registry, and settings tab. |
| Case 2 — Scroll | Shared sidebar shell + `PAGE_MAIN`. |
| Case 3 — Contrast | Shared button/badge tokens. |
| Case 4 — Responsive | `STAT_GRID`, scrollable tabs, shared toolbar. |

---

## 3. Out of scope

| Item | Out of scope |
| --- | --- |
| Member/team management | No member directory, invites, or team permissions in the single-owner product scope. |
| HR workflows | No onboarding, payroll, or directory sync. |
| Platform | No new REST resource, no Prisma schema change, no new Docker service. |

---

## 4. Technical notes

- Breakpoints: phone `< 640`, tablet `640–1023`, desktop `1024+`.
- Dialogs added later must use `components/ui/responsive-dialog.ts`.

---

## 5. Files expected to change

| Area | Path |
| --- | --- |
| Page | `app/company/page.tsx` |
| Shell / contrast | `components/ui/sidebar.tsx`, `components/ui/button.tsx`, `app/globals.css` |
