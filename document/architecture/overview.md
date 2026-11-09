# Architecture

ระบบเป็น modular Next.js monolith: React pages/components เรียก Route Handlers ซึ่งตรวจ owner, input และ public references ก่อนเรียก business services กับ PostgreSQL repositories

Browser → owner gate → Next.js middleware/Route Handler → service → `lib/database/repositories` → `pg` pool → PostgreSQL 16

- Owner gate ตรวจ Basic credentials/Origin และส่ง per-process proof ให้ Next.js child บน loopback
- Route Handlers คืน explicit DTOs; internal BIGINT IDs ไม่ออกไปยัง browser
- Repository รับ numeric authorized relations และ parameterized SQL. Transaction ใช้ connection เดียวและ serializable isolation
- Shared domain helpers รักษา status, exact hours และ Bangkok date semantics ระหว่าง Work Items, Daily Work, Board, Dashboard และ Analysis
- Project issue sync แยก provider reads ออกจาก per-issue transactions, ตรวจ assignees ซ้ำ, รักษา immutable source identity และ run checkpoints/lease
- DDL มีเพียง [database/schema.sql](../../database/schema.sql). Operational tools อยู่ใน scripts/database และไม่แก้ used schema อัตโนมัติ

Development/UAT/production ใช้ Dockerfile คนละ target โดยใช้ dependency lockfile ร่วมกัน. `database-tools` ไม่มี Next build และ application images ไม่มี schema generator. ดู [Database workflow](../../database/README.md), [Deployment](../operations/deployment.md), [API contracts](../api/overview.md) และ [Issue sync](../integrations/project-issue-sync.md)
