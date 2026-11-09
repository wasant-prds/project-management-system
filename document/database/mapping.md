# Database mapping

DDL ทั้งหมดอยู่ที่ [schema.sql](../../database/schema.sql); รายละเอียด operations อยู่ใน [Database workflow](../../database/README.md)

- `lib/database/repositories/users.ts`: owner resolution และ Settings
- `companies.ts`: Company registry, Dhas identity และ aggregate summaries
- `projects.ts`: Project CRUD, selectors, summaries และ deletion history guards
- `work-items.ts`: Work Item CRUD, public lookups, import UUIDs, pagination และ row locks
- `work-logs.ts`: Daily Work, owned relations และ exact hours
- `reports.ts`: Dashboard/Analysis aggregates และ source rows
- `issue-sync.ts`: provider mappings, scoped configs, conditional leases, source references และ durable run history

HTTP handlers validate public UUIDs แล้ว resolve เป็น authorized records ฝั่ง server. SQL joins ใช้ numeric IDs; serializers ส่งเฉพาะ UUIDs และ explicit nested fields. Provider IDs ใช้ external_* fields และไม่แทนที่ local IDs

Dashboard, Board และ Analysis เป็น projections ของ Work Items/Daily Work ชุดเดียวกัน ไม่มีตาราง metric สำเนาหรือ fake KPI ใน production
