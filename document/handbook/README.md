# Project Handbook

## Overview

คู่มือนี้สรุป API, access gate, data model และงานปฏิบัติการจาก implementation ปัจจุบันของ Project Management System (PMS) ใช้ source code และ Prisma schema เป็นหลัก; เอกสารนี้ไม่ถือว่า API ที่ยังเป็น target contract เปิดใช้งานแล้ว

ระบบเป็น Next.js App Router + Prisma + PostgreSQL สำหรับ owner หนึ่งคน ใช้ Company → Project → WorkItem → TimeEntry และยึด `Asia/Bangkok` สำหรับเวลา อ่านเรื่อง [Owner access](./operations/owner-access.md), [Database model](./database/data-model.md) และ [Runtime operations](./operations/runtime.md) ก่อนเปลี่ยนแปลงระบบ

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

### Work Items

- [WorkItem collection](./api/work-items/collection.md) — list, create
- [WorkItem detail](./api/work-items/detail.md) — read, update, delete
- [WorkItem import](./api/work-items/import.md) — bulk create

### Daily Work

- [Work log collection](./api/daily-work/collection.md) — list, create
- [Work log detail](./api/daily-work/detail.md) — read, update, delete

## Jobs

- [Production database backup candidate](./jobs/database/daily-backup.md) — optional production Compose `backup` profile; this is the only background service found in the repository. Application queue/worker jobs are not implemented.

## Other Components

- [Owner access gate](./operations/owner-access.md) — Basic credential gate, origin checks, middleware proof, owner resolution.
- [Runtime operations](./operations/runtime.md) — start, health, logs and troubleshooting; links to existing Docker/DB runbooks.
- [Database data model](./database/data-model.md) — relations and tables touched by current APIs.
- [GitLab integration status](./integration/gitlab.md) — configuration validation versus actual integration behavior.

## Source references

- [API inventory and target contracts](../API.md)
- [Prisma schema](../../prisma/schema.prisma)
- [Runtime security](../RUNTIME_SECURITY.md)
- [Database rollout runbook](../DATABASE_ROLLOUT.md)
