# Database

Source of truth คือ [database/schema.sql](../../database/schema.sql). ตารางจริงใช้ plural snake_case และทุกคอลัมน์มี PostgreSQL comment. ขั้นตอนติดตั้ง/seed/backup อยู่ที่ [Database workflow](../../database/README.md)

Application อ่านและเขียนผ่าน `pg` ใน `lib/database` โดยแยก connection, parameterized SQL, explicit projections และ repositories. TypeScript result types ไม่ใช่ schema generator

- Company → Project → Work Item → Daily Work ใช้ BIGINT PK/FK ภายใน
- API/UI อ้าง public UUIDv4 เท่านั้น; owner authorization และ explicit nested DTOs อยู่ที่ server
- users เก็บ profile/theme/locale; password_hash ไม่อยู่ใน response
- work_items เก็บ Incident/Issue/Task ร่วมกัน; role เป็นหน้าที่ของงาน ไม่ใช่สิทธิ์ user
- work_logs รักษา DECIMAL(65,30) และ Bangkok business date; API resolve WorkItem ของ owner แล้ว derive Project
- external_project_mappings / external_work_item_references เก็บ source identity แยกจาก local identity
- issue_sync_configs / issue_sync_runs รองรับ GitLab/GitHub ต่อ Project, assignees และประวัติ run
- project_members, project_milestones, project_documents, activity_logs รักษาประวัติที่ทำให้ Project ถูกป้องกันการลบ

วันที่ใช้ DATE และ timestamps ใช้ TIMESTAMP(3) WITHOUT TIME ZONE ตาม Asia/Bangkok. pg type parsers รักษา bigint เป็น bigint และ numeric เป็น string. ต้องใช้ shared serializers ที่ API boundary

ไม่มี migration history ใน schema ใหม่. การจัด repository ใหม่ไม่ใช่การล้างฐานข้อมูลจริง; ฐานที่ใช้งานอยู่ต้องผ่าน verified backup/rehearsal และ explicit cutover approval แยกต่างหาก
