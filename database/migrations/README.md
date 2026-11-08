# SQL schema และ migration history

`database/schema.sql` เป็น schema หลักฉบับล่าสุดสำหรับโครงสร้างฐานข้อมูลทั้งหมด. `prisma/schema.prisma` ต้อง map ตรงกับ SQL นี้. ทุก feature ที่เปลี่ยนฐานข้อมูลต้องปรับ schema หลักและเพิ่ม migration delta สำหรับฐานที่มีข้อมูลแล้ว.

Baseline เดิมย้ายไป `0001_initial_schema.sql` โดยคง bytes และ checksum เดิมเพื่อรักษา migration history. `0002_issue_sync.sql` เพิ่ม `issue_sync_configs`, `issue_sync_runs` และ `external_work_item_references.in_scope`; `0003_issue_sync_token_env.sql` เปลี่ยน config ให้ระบุชื่อตัวแปร token โดยตรง และหยุด config เดิมจน operator ตั้งค่าใหม่โดยคง IDs กับ run history. Schema หลักรวมโครงสร้างปัจจุบันแล้ว. Manifest บันทึก checksum ของ schema หลักและ `throughVersion` ที่ snapshot ครอบคลุม แยกจาก checksums ของ archived migrations.

ติดตั้งฐานข้อมูลว่างผ่าน `empty-bootstrap` หรือ approved SQL runtime จะสร้างจาก schema.sql, บันทึก versions ที่ snapshot ครอบคลุม และรันเฉพาะ deltas ที่ใหม่กว่า snapshot ภายใน transaction เดียว. หากขั้นใดล้มเหลวจะ rollback ทั้งการติดตั้ง. ฐานข้อมูลที่มี history แล้วใช้ `upgrade` ซึ่งตรวจ checksum เดิมและรันเฉพาะ versions ที่ยังไม่ apply. Catalog ของ snapshot และ historical replay ต้องตรงกันในการทดสอบ PostgreSQL แยก.

ห้ามรัน CREATE TABLE จาก schema.sql ทับฐานข้อมูลที่มีข้อมูล. การ apply กับฐานข้อมูลที่ใช้งานอยู่ต้อง verified baseline/backup, isolated rehearsal และ explicit approval ตาม [Database Rollout](../../document/DATABASE_ROLLOUT.md).
