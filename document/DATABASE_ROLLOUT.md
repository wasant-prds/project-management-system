# Used database changes

เครื่องมือปัจจุบันตั้งใจรองรับ fresh initialization จาก [schema.sql](../database/schema.sql) เท่านั้น. ไม่มีอัตโนมัติ migrate/reset ฐานที่มีข้อมูลหรือแปลง legacy schema. การเริ่ม migration history ใหม่ใน repository ไม่ใช่คำสั่งล้างฐานจริง

ก่อน cutover ฐานใช้งาน ต้องระบุ environment และหยุด writes, ทำ backup ใหม่ด้วย `scripts/database/backup.mjs`, ตรวจ checksum/inventory และ restore ใน container แยก. ซ้อมการเปลี่ยนที่ review แล้วกับสำเนานั้น ตรวจ exact IDs/public UUIDs, FK/owner authorization, decimals และ Bangkok timestamps. หลังผลตรวจครบจึงขอ explicit approval สำหรับ live cutover พร้อม recovery plan

`bash scripts/db-manage.sh restore <archive>` ซ้อมในฐานแยกและไม่เขียนทับฐานจริง. เก็บ archives กับ .pin ตาม retention policy. ไม่ใช้ seed dataset ทับฐานใช้งาน และไม่ต่อ build นี้กับ legacy CUID database

ขั้นตอนใหม่และคำสั่งที่ยังใช้งานอยู่: [Database workflow](../database/README.md), [DB commands](process/db.md), [Testing](process/testing.md)
