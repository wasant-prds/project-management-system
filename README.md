# Project Management System

ระบบจัดการ Project และ Work Item สำหรับ owner คนเดียว ใช้ Next.js 15, React 19, TypeScript, PostgreSQL 16 และ Docker Compose

เมนูหลัก: Dashboard, Company, Projects, Work Items, Kanban Board, Analysis, Daily Work และ Settings. Incident, Issue และ Task เป็นชนิดของ Work Item เดียวกัน. GitLab/GitHub sync ตั้งค่าต่อ Project และรับเฉพาะ assignees ที่กำหนด

## เริ่มต้น

1. ติดตั้ง Node.js 22+ และ pnpm ตาม `packageManager` ใน package.json
2. รัน `pnpm install` แล้วคัดลอก `.env.example` เป็น `.env` และกรอกค่าจริง
3. เตรียม PostgreSQL 16. สำหรับฐานว่าง ตั้ง `DB_SCHEMA_SYNC_APPROVED=true` แล้วรัน `pnpm db:initialize`; ถ้าทำบน host ให้กำหนด `DATABASE_URL` ไปยัง PostgreSQL ที่ต้องการ
4. วาง SQL seeds ส่วนตัวใน `database/seeds/sql-master` และรัน `pnpm db:seed` เฉพาะฐานที่ยังไม่มีข้อมูล
5. ตั้ง `OWNER_USER_ID` เป็น users.public_id ของ owner แล้วรัน `pnpm dev`

Docker development ใช้ `docker compose up -d --build`. UAT/production ใช้ compose file ของ environment นั้น. `database-init` อ่าน `database/schema.sql` ก่อน app เริ่ม; ฐานที่ schema ไม่ตรงจะถูกปฏิเสธ. การติดตั้งใหม่ไม่ลบหรืออัปเกรดฐานเดิมอัตโนมัติ. ดู [ขั้นตอนฐานข้อมูล](./database/README.md) ก่อนใช้กับฐานที่มีข้อมูล

## โครงสร้าง

```text
app/api/                      HTTP validation, authorization และ public DTOs
components/                   UI แยกตามหน้าและ shared controls
lib/database/client.ts        pg connection pool, type parsers และ transactions
lib/database/sql.ts           parameterized SQL composition
lib/database/projections.ts   explicit SQL result aliases
lib/database/repositories/    queries แยกตามข้อมูลและหน้าที่
lib/integrations/             validation สำหรับ external sources
lib/issue-sync*.ts            project sync และ provider adapters
database/schema.sql           authoritative DDL, constraints, indexes, comments, triggers
database/seeds/sql-master/     SQL seeds ส่วนตัว; gitignored ทั้ง directory
scripts/database/             initialize, seed และ verified backup/restore
scripts/github-create-*.py    issue/label tooling
```

ทุกตารางใช้ BIGINT identity สำหรับ PK/FK ภายใน และ immutable UUIDv4 สำหรับ API/UI. วันที่และ timestamps ใช้ Asia/Bangkok; ชั่วโมงและยอดเงินรักษาความละเอียด DECIMAL(65,30)

## ตรวจคุณภาพ

```sh
pnpm quality
# PostgreSQL/API/backup/standalone HTTP integration บน containers ชั่วคราว
# สร้าง images ตามคู่มือก่อนรัน
pnpm test:database-docker
python -B -m unittest discover -s scripts/tests -p "test_github_*.py" -v
```

Unit suite รวม provider tests แบบจำลองและ UI regressions. Database suite ไม่อ่าน private seeds หรือ token จริง. ดู [testing](./document/development/testing.md)

## คู่มือ

- [สารบัญเอกสารทั้งหมด](./document/README.md)
- [Database workflow](./database/README.md)
- [Project Issue Sync และ token variables](./document/integrations/project-issue-sync.md)
- [API contracts](./document/api/overview.md)
- [Database commands](./document/development/database.md)
- [Docker commands](./document/development/docker.md)
- [Runtime security](./document/operations/runtime-security.md)
- [Public identifiers](./document/database/public-identifiers.md)
- [Engineering spec](./document/architecture/engineering-spec.md)
- [GitHub issue script](./document/development/github-create-tasks.md)

เอกสารประวัติเก็บใน [Archive](./document/archive/README.md); รายงานผลทดสอบใหม่เก็บใน `artifacts/`. สำหรับ database tooling ปัจจุบันให้ใช้ schema.sql และ scripts/database ตามคู่มือนี้
