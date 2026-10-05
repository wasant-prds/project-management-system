# API identifiers — Issue #33

## ขอบเขตและหลักการ

Issue #33 แยก identity สำหรับฐานข้อมูลออกจาก identity ที่ API เปิดเผย: ตารางของข้อมูลที่แอปเป็นเจ้าของใช้ `id BIGINT` เป็น internal primary key และ `public_id UUIDv4` ที่ database สร้างเป็น public identity. Foreign key และ SQL join ใช้ numeric `id` ภายในฐานข้อมูล; request และ response ใช้ public UUID เท่านั้น. กติกานี้ใช้กับ API ใน [Project Handbook](../README.md) และอ้างอิง [มาตรฐาน record identifiers](../../database/PUBLIC_IDENTIFIERS.md).

| ตำแหน่ง | รูปแบบ identifier | วิธีใช้ |
| --- | --- | --- |
| SQL primary key / foreign key / join | `BIGINT` ภายใน | query และ relation ระหว่างตารางเท่านั้น; ห้ามส่งให้ client |
| API path, query, relationship field และ response identity | public UUIDv4 | ใช้ค้นหา record ผ่าน `public_id`; ไม่มี fallback ไปยัง numeric ID |
| GitLab ID, IID และ source reference | ค่าของ provider/source | คงไว้เป็น external identity; ไม่ใช้แทน local PMS ID |
| Pagination cursor | opaque token | server ผูก cursor กับ owner และ filters; client ส่งกลับตามเดิม |

คอลัมน์ identity ใน schema คือ `id` และ `public_id`; Prisma ใช้ชื่อ `publicId` ฝั่ง application. Response DTO ใช้ชื่อ `id` สำหรับ public UUID เพื่อให้รูปแบบ API คงเดิม. ความหมายของ `id` ใน JSON จึงเป็น public UUID ไม่ใช่ database primary key. Nested `companyId`, `projectId`, `workItemId`, `userId` หรือ `assigneeId` ที่ API รองรับก็ต้องเป็น public UUID; บาง response เลือกส่ง relation object แทน scalar field.

## การแปลง request และ authorization

สำหรับ relationship ที่เขียนได้ server ตรวจรูปแบบ public UUID, หา row ด้วย `public_id`, ตรวจ owner/access scope แล้วจึงนำ numeric `id` ที่ resolve ได้ไปเขียน foreign key. ห้ามรับ numeric internal ID เป็น public lookup fallback. UUID ช่วยทำให้ identifier คาดเดายาก แต่ไม่แทน owner authentication หรือ object-level authorization; API ธุรกิจยังต้อง resolve owner และจำกัด record ตามสิทธิ์ของ owner.

ตัวอย่าง `POST /api/projects` ใช้ `companyId` เป็น public UUID. Server resolve Company จาก `public_id` แล้วเก็บ `company.id` เป็น numeric foreign key ภายใน. `POST /api/work-logs` ใช้ public `workItemId`; server resolve WorkItem ของ owner และ derive Project กับ numeric foreign keys จาก record นั้น.

Ordinary create ไม่รับ client-chosen `id`; database สร้าง internal ID และ UUIDv4 ให้. ข้อยกเว้นที่ตรวจสอบแล้วคือ `POST /api/work-items/import`: นำเข้าอาจใช้ public UUID ที่คงที่เพื่อให้ retry รักษา identity หรือใช้ legacy nonnumeric source ID เมื่อพบ exact mapping ใน `database/live-identity/mappings.json`. Numeric IDs ถูกปฏิเสธ; legacy mapping ต้อง durable และ scoped ต่อ source. ดู [Bulk WorkItem import](./work-items/import.md) และ [SQL runtime / upgrade](../database/issue-33-sql-runtime.md).

## รูปแบบ response

Handlers ใช้ explicit serializers/DTOs แทนการ spread ORM row. ตัวอย่างรูปแบบ identity ใน Project response (UUID ในตัวอย่างเป็นค่าประกอบเพื่อแสดงรูปแบบเท่านั้น):

```jsonc
{
  "project": {
    "id": "4a7c829d-885e-4a48-9f12-518d9790735a", // public UUIDv4 ของ Project
    "companyId": "ab40c81d-8145-4999-9806-22550198d0d7", // public UUIDv4 ของ Company
    "company": {
      "id": "ab40c81d-8145-4999-9806-22550198d0d7" // public UUIDv4 เดียวกัน
    }
  }
}
```

Numeric IDs และ `BigInt` ไม่อยู่ใน JSON DTO. Nested response ใช้ public identity ของ record ที่แสดง; ตัวอย่างเช่น WorkItem แสดง `projectId`, `assignee.id`, `project.id`, `project.company.id` และ TimeEntry `id` เป็น UUIDv4. Work log response แสดง `id` และ nested `user.id`, `project.id`, `workItem.id`; serializer ปัจจุบันไม่ได้ส่ง scalar `userId`, `projectId` หรือ `workItemId` ออกมา.

## Endpoint contract ที่เกี่ยวข้อง

| Endpoint | Public identity ที่รับ/ส่ง | หมายเหตุ |
| --- | --- | --- |
| `/api/company`, `/api/company/{id}` | Company public UUID | CRUD ค้นหาด้วย `public_id` |
| `/api/projects`, `/api/projects/{id}` | Project public UUID; `companyId` เป็น Company public UUID | cursor เป็น opaque token |
| `/api/work-items`, `/api/work-items/{id}` | WorkItem public UUID; `projectId` เป็น Project public UUID | `assigneeId` ที่ส่งได้ต้องตรง owner public UUID |
| `/api/work-items/import` | Optional stable public UUID หรือ mapped nonnumeric source reference; `projectId` ใช้ public UUID หรือ exact live mapping | เป็น import exception ตามกติกาข้างต้น |
| `/api/work-logs`, `/api/work-logs/{id}` | TimeEntry public UUID; `workItemId` เป็น WorkItem public UUID; optional `projectId` public UUID | `userId` compatibility input ถ้าส่งต้องเป็น owner public UUID |
| `/api/integrations/gitlab/projects/{mappingId}` | Mapping public UUID; `projectId` เป็น PMS Project public UUID | GitLab project ID/IID ยังคงเป็น provider identity |
| `/api/integrations/gitlab/sync` | `mappingId` public UUID; returned `workItemId` public UUID | GitLab Issue identifiers ยังคงเป็น provider identity |

API อาจมี filters เช่น `companyId`, `projectId` หรือ `workItemId`; ค่าเหล่านี้ใช้ public UUID. `userId` ที่เป็น compatibility field ต้องเท่ากับ UUID ของ owner ที่ server resolve และไม่ใช่ช่องทางเลือก owner อื่น. `/api/health` เป็น health check สาธารณะและไม่มี record lookup.

## Validation และการตรวจสอบ

ID ที่รูปแบบไม่ถูกต้องตอบ validation error; ID ที่ไม่มีอยู่หรืออยู่นอก owner scope ตอบ `404` ตาม endpoint contract. Import คืนผลรายแถว และจะไม่แปลง numeric ID ให้เป็น public identity. ห้าม decode หรือสร้าง cursor เอง; cursor ที่ไม่ตรง owner/filter จะถูกปฏิเสธ.

การตรวจซ้ำสำหรับ Issue #33:

- `pnpm test:identity` — UUIDv4 parsing/generation, source-reference classification และ mapping behavior.
- `pnpm test:company-projects` — public UUID resolution สำหรับ Company/Project, ownership และ API relation.
- `pnpm test:work-items` — create/update/detail/import, public UUID refs, rejection of numeric IDs และ serialization.
- `pnpm test:daily-work` — WorkItem public UUID resolution, owner scope และ WorkLog DTO.
- `pnpm test:gitlab` — public mapping IDs พร้อมรักษา external GitLab identities.
- `pnpm test` — full regression suite.

ชุดทดสอบเหล่านี้ใช้ test doubles หรือ test database ตาม runner; ห้าม reset, seed หรือ migrate ฐานข้อมูลที่ใช้งานจริงเพื่อการตรวจ API.
