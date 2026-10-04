# Project Handbook

## Overview

คู่มือนี้สรุป API, access gate, data model และงานปฏิบัติการจาก implementation ปัจจุบันของ Project Management System (PMS). ใช้ source code และ Prisma schema เป็นหลัก; เอกสารนี้ไม่ถือว่า API ที่ยังเป็น target contract เปิดใช้งานแล้ว.

ระบบเป็น Next.js App Router + Prisma + PostgreSQL สำหรับ owner หนึ่งคน ใช้ Company → Project → WorkItem → TimeEntry และยึด Asia/Bangkok สำหรับวันและเวลา อ่าน [Owner access](./operations/owner-access.md), [Database model](./database/data-model.md) และ [Runtime operations](./operations/runtime.md) ก่อนเปลี่ยนแปลงระบบ.

Issue #19 ใช้ WorkItem record เดียวร่วมกันระหว่างเมนู Work Items, Board, Projects, Dashboard และ Analysis; มี CRUD, filters, cursor pagination, JSON import แบบรายแถว และ CSV/Markdown/JSON export ที่สร้างใน browser. Detail API แสดง Company ผ่าน Project และ Daily Work ที่ผูกกับ WorkItem.

Issue #21 บังคับให้ Daily Work ที่สร้าง/แก้ไขผูกกับ WorkItem ของ owner และ derive Project จาก WorkItem; ชั่วโมงเป็น positive Decimal, date เป็น Bangkok calendar day และ summary ใช้ exact Decimal aggregate. Dashboard/Analysis แสดงเฉพาะ logged-hours metric ที่อ่านจาก TimeEntry ตามขอบเขต issue. Prisma schema source เปลี่ยนแล้วแต่ยังต้องผ่าน verified environment rollout ก่อน sync.

Issue #22 เชื่อม Board กับ WorkItem status ชุดเดียวกับ Work Items; Board ใช้ API เดิมสำหรับ cards, filters และ status update. ไม่มี Board-specific status, API หรือ table. ดู [Board workflow](./board/workflow.md).

Issue #24 เพิ่ม Analysis จาก WorkItem/TimeEntry จริงพร้อม shared filters/metrics, owner-only summary API, source tables, Bangkok-grouped logged-hour trends และ CSV export; ไม่มี status history หรือ historical throughput.

Issue #25 เพิ่ม owner-only [Settings API](./api/settings/me.md) และ persistent owner profile/theme/locale. `OwnerSettingsProvider` แชร์ canonical settings state ระหว่าง Settings กับ header theme control; `User.theme`/`User.locale` มี schema defaults และ rollout ต้องผ่าน database gates.

สำหรับ Issue #18 ระบบรองรับหลาย Company แต่ Project แต่ละรายการต้องอ้าง Company หนึ่งรายการผ่าน companyId. Prisma schema ปัจจุบันไม่มี Customer model; รายละเอียด Dhas, Company APIs และ Project APIs อยู่ในหน้า Company/Projects และ [Database model](./database/data-model.md). Handbook ยืนยันพฤติกรรมจาก repository; สถานะข้อมูลในฐานข้อมูล environment จริงต้องตรวจจาก environment นั้นแยกต่างหาก.

## API

Route Handler ปัจจุบันมีดังนี้:

### System

- [Health check](./api/system/health.md)

### Users

- [List owner](./api/users/list-owner.md)

### Company

- [Company collection](./api/company/collection.md) — list, create
- [Company detail](./api/company/detail.md) — update, delete

### Projects

- [Project collection](./api/projects/collection.md) — list, create
- [Project detail](./api/projects/detail.md) — read, update, delete

### Work Items — Issue #19

- [WorkItem collection](./api/work-items/collection.md) — filters, cursor pagination, summary และ create; Work Items UI ใช้ collection นี้ดึงข้อมูลเพื่อ export
- [WorkItem detail](./api/work-items/detail.md) — read, update, delete; detail read แสดง Company และ Daily Work
- [WorkItem import](./api/work-items/import.md) — JSON bulk import พร้อมผลลัพธ์รายแถว

### Dashboard — Issue #23

- [Dashboard summary](./api/dashboard/summary.md) — owner-only read projection สำหรับ KPI, WorkItems, Projects และ logged hours ตามช่วง Bangkok dates และ filters

### Analysis — Issue #24

- [Analysis summary](./api/analysis/summary.md) — owner-only report API สำหรับ WorkItem/TimeEntry KPIs, breakdowns, source rows, Bangkok-grouped hours และ filtered CSV export

### Settings — Issue #25

- [Owner settings](./api/settings/me.md) — owner-only profile/preferences read and update; fixed Bangkok timezone

### Integrations — GitLab Issue import — Issue #20

- [GitLab configuration status](./api/integrations/gitlab-status.md) — owner-only configuration readiness
- [GitLab Project mappings](./api/integrations/gitlab-projects.md) — list และ create PMS mappings
- [GitLab Project mapping detail](./api/integrations/gitlab-project-mapping.md) — edit หรือถอน mapping
- [Manual GitLab Issue sync](./api/integrations/gitlab-sync.md) — first-sync approval, outcomes และ partial failures

### Daily Work

- [Work log collection](./api/daily-work/collection.md) — list, create
- [Work log detail](./api/daily-work/detail.md) — read, update, delete
- [Work log summary](./api/daily-work/summary.md) — รวมชั่วโมงของ owner ทั้งหมดหรือช่วง Bangkok calendar dates (Issue #21)

## Jobs

- [Production database backup candidate](./jobs/database/daily-backup.md) — optional production Compose backup profile; เป็น background job/service ที่พบใน repository. Application queue/worker jobs ยังไม่ถูก implement.

## Other Components

- [Final visual audit and polish — Issue #29](./frontend/issue-29-polish.md) — KPI/state consistency, long-content wrapping, Analysis tables, modal focus และ reusable test/browser commands พร้อมข้อจำกัด quality gate.
- [Frontend motion and interaction — Issue #28](./frontend/issue-28-motion.md) — motion tokens, route/content transitions, tactile card/control states, overlay exits, toast swipe, reduced-motion support และการตรวจสอบล่าสุด.
- [Frontend design system, themes and responsive dialogs — Issue #27](./frontend/issue-27-redesign.md) — Light/Dark/Special Dark tokens, shared Select options, Work Items/Board dialogs, theme persistence and verification.
- [Frontend visual system and accessibility — Issue #26](./frontend/visual-system.md) — shared themes/components, responsive charts/dialogs, reduced motion, browser asset notes และ verification commands.
- [Board workflow — Issue #22](./board/workflow.md) — data flow, filters, status writes, date behavior และการตรวจสอบ
- [Owner access gate](./operations/owner-access.md) — Basic credential gate, origin checks, middleware proof, owner resolution.
- [Runtime operations](./operations/runtime.md) — start, health, logs และ troubleshooting; links ไปยัง Docker/DB runbooks.
- [Database data model](./database/data-model.md) — relations และ tables ที่ current APIs ใช้.
- [GitLab integration](./integration/gitlab.md) — configuration, security, data ownership, sync behavior และ rollout readiness.

## Source references

- [API inventory and target contracts](../API.md)
- [Prisma schema](../../prisma/schema.prisma)
- [Runtime security](../RUNTIME_SECURITY.md)
- [Database rollout runbook](../DATABASE_ROLLOUT.md)
- [WorkItem collection handler](../../app/api/work-items/route.ts)
- [WorkItem detail handler](../../app/api/work-items/[id]/route.ts)
- [WorkItem import handler](../../app/api/work-items/import/route.ts)
- [Shared WorkItem parser](../../lib/work-item-input.ts)
- [WorkItem response serializer](../../lib/work-item-response.ts)
- [WorkItem export UI helpers](../../components/page/work-items/work-item-export.ts)
- [Dashboard summary handler](../../app/api/dashboard/summary/route.ts)
- [Dashboard query and metrics](../../lib/dashboard.ts)
- [Owner Settings handler](../../app/api/settings/me/route.ts)
- [Owner Settings provider](../../components/layout/owner-settings-provider.tsx)
