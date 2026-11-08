# Database data model

ใช้ [schema.sql](../../../database/schema.sql) เป็น DDL หลัก และ [Database workflow](../../../database/README.md) สำหรับ initialize/seed/backup. ชื่อตาราง/คอลัมน์จริงกับ constraints/comments อยู่ใน SQL โดยตรง

Company → Project → WorkItem → TimeEntry (work_logs). มี owner หนึ่งคนที่ resolve จาก users.public_id; numeric PK/FKs อยู่ภายในเท่านั้น. WorkItem status กับ theme ใช้ค่า hyphenated ทั้ง SQL/API/UI. Developer/infra/SA เป็น functional role ของ Work Item

วันที่เป็น Bangkok calendar date และ timestamps เป็น Bangkok wall-clock. เงิน/ชั่วโมงใช้ DECIMAL(65,30), pg คืน numeric เป็น string เพื่อรักษาความละเอียด. Public IDs เป็น immutable random UUIDv4 จาก database

Project issue sync ใช้ external_project_mappings, external_work_item_references, issue_sync_configs และ issue_sync_runs. Provider IDs แยกจาก local IDs; token_env_var เก็บชื่อตัวแปรใน .env เท่านั้น

Repositories อยู่ใน lib/database/repositories; API serializers คืน explicit DTOs. Project/WorkItem/Company deletion ป้องกันการทำลายประวัติ. GET /api/company ยัง provision Dhas ผ่าน reviewed configuration; ไม่มี historical backfill script บน startup

Verification: pnpm test:database-docker, pnpm test:issue-sync, pnpm test:auth. ไม่ทดสอบกับ production volumes หรือ token จริง
