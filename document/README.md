# เอกสาร Project Management System

สารบัญกลางสำหรับข้อกำหนด สถาปัตยกรรม คู่มือ API และการดูแลระบบ เอกสารใช้ภาษาไทยเป็นหลัก และคงชื่อ model, field และ route เป็นภาษาอังกฤษ

## เริ่มอ่าน

1. [ข้อกำหนดทางธุรกิจ](requirements/business-requirement.md) และ [ขอบเขตระบบ](requirements/scope.md)
2. [สถาปัตยกรรม](architecture/overview.md) และ [Engineering spec](architecture/engineering-spec.md)
3. [API contracts](api/overview.md) และ [มาตรฐาน public identifiers](database/public-identifiers.md)
4. [การพัฒนาและทดสอบ](development/README.md) หรือ [การติดตั้งและดูแลระบบ](operations/README.md)

## หมวดเอกสาร

- [Requirements](requirements/README.md) — ข้อกำหนดรวมและเอกสารรายเมนูภาษาไทย/อังกฤษ
- [Architecture](architecture/README.md) — โครงสร้างระบบ แนวทางวิศวกรรม และภาพรวม implementation
- [API](api/README.md) — สัญญา HTTP, identifiers และคู่มือ endpoint แยกตาม resource
- [Database](database/README.md) — data model, schema dictionary, repository mapping และ rollout
- [Decisions](decisions/README.md) — ข้อตัดสินใจที่มีผลต่อข้อกำหนดและ implementation
- [Development](development/README.md) — คำสั่งทดสอบ Docker ฐานข้อมูล และ GitHub tooling
- [Frontend](frontend/README.md) — ระบบสี visual system และ accessibility
- [Integrations](integrations/README.md) — Project Issue Sync และ GitLab/GitHub
- [Operations](operations/README.md) — deployment, security, runtime, HTTPS และงานตามกำหนดเวลา
- [Archive](archive/README.md) — เอกสารที่ถูกแทนที่และบันทึก implementation ในอดีต

## โครงสร้างและการตั้งชื่อ

```text
document/
├── README.md
├── requirements/features/<menu>/
├── architecture/
├── api/<resource>/
├── database/
├── decisions/
├── development/
├── frontend/
├── integrations/
├── operations/jobs/
└── archive/
```

- ตั้งชื่อไฟล์และโฟลเดอร์ด้วยตัวพิมพ์เล็กแบบ `kebab-case`; ใช้ `README.md` เป็นสารบัญของแต่ละหมวด
- เอกสารสองภาษาใช้ชื่อเรื่องเดียวกันและลงท้าย `.th.md` / `.en.md`
- เก็บเอกสารตามหัวข้อ โดยใช้ชื่อที่อธิบายเนื้อหา และเชื่อมโยง issue ภายในเอกสารเมื่อจำเป็น
- ใช้ relative links และปรับลิงก์ในเอกสาร กฎโครงการ scripts และ tests เมื่อย้ายไฟล์
- เมื่อเพิ่มหรือย้ายเอกสาร ให้ปรับสารบัญหมวดที่เกี่ยวข้องด้วย
- รายงานผลทดสอบ ภาพจาก browser และ build logs เก็บใน `artifacts/` ที่ root ซึ่งไม่อยู่ใน version control; สคริปต์ frontend performance ใช้ `artifacts/frontend-performance/`
- ย้ายเนื้อหาที่ถูกแทนที่ไป `archive/` พร้อมบอกสถานะและลิงก์ไปยังข้อกำหนดปัจจุบัน

## หลักอ้างอิง

เอกสารรายเมนูใน `requirements/features/` บางส่วนบันทึกงาน UI เดิม สถานะ “done” ไม่ได้ยืนยันว่า data/API ปัจจุบันครบแล้ว ให้ยึดข้อกำหนดรวม ข้อตัดสินใจ และ contract ปัจจุบันเมื่อมีข้อความขัดกัน เอกสารใน `archive/` และผลทดสอบที่อ้างในอดีตไม่ใช่คำยืนยันสถานะของเวอร์ชันปัจจุบัน

DDL หลักอยู่ที่ [database/schema.sql](../database/schema.sql) และขั้นตอนฐานข้อมูลปัจจุบันอยู่ที่ [Database workflow](../database/README.md) ทุกตารางใช้ BIGINT ภายในและ immutable UUIDv4 ที่ database สร้างสำหรับ API/UI/URL โดยยังต้องตรวจ owner authorization เวลาและวันที่ของระบบใช้ `Asia/Bangkok` การเปลี่ยนฐานข้อมูลที่มีผู้ใช้งานต้องผ่าน baseline, backup/restore rehearsal และการอนุมัติ live cutover ตามคู่มือ
