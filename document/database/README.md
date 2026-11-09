# Database

- [ภาพรวมฐานข้อมูล](overview.md)
- [Public identifiers](public-identifiers.md) — BIGINT PK/FK ภายในและ immutable public UUIDv4
- [Data model ปัจจุบัน](data-model.md)
- [Schema dictionary](schema-dictionary.md) — ตาราง คอลัมน์ และ field mapping
- [SQL design decisions](decisions.md)
- [Repository mapping](mapping.md)
- [Shared data model](shared-data-model.md) — เก็บกติกาข้อมูลร่วม โดย Company relation ใช้ตามข้อตัดสินใจปัจจุบัน
- [Used database rollout](rollout.md)

DDL หลักอยู่ที่ [database/schema.sql](../../database/schema.sql) ขั้นตอน initialize, seeds, backup และ restore อยู่ที่ [Database workflow](../../database/README.md) และ [คำสั่งฐานข้อมูล](../development/database.md)

[กลับสารบัญกลาง](../README.md)
