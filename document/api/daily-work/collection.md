# Daily Work collection

## Overview

อ่านรายการหรือสร้าง Daily Work (`TimeEntry`) ของ owner. วันและช่วงวันที่อิง `Asia/Bangkok` calendar date; persisted timestamps ใช้ Bangkok local wall-clock semantics และไม่แปลงเป็น UTC. ชั่วโมงรับเป็น positive decimal และสร้างรายการโดยผูก WorkItem ของ owner พร้อม derive Project จาก WorkItem.

| Method | Endpoint | พฤติกรรม |
| --- | --- | --- |
| `GET` | `/api/work-logs` | อ่านรายการของ owner เรียง `date` และ `id` จากใหม่ไปเก่า; ไม่มี pagination |
| `POST` | `/api/work-logs` | สร้าง TimeEntry ของ owner ใน serializable transaction |

การรวมชั่วโมงเป็นอีก operation: [Work log summary](./summary.md).

## สิทธิ์ที่มองเห็น

ต้องผ่าน Node owner gate ด้วย HTTP Basic และ middleware internal proof. Unsafe request ต้องส่ง `Origin` ที่ตรงกับ `APP_ORIGIN`; หากส่ง `Origin` ใน request ใดก็ต้องตรงกัน. Route เรียก `getOwner()` ซึ่ง resolve User หนึ่งรายการ (เลือกด้วย `OWNER_USER_ID` เมื่อกำหนด หรือใช้เมื่อมี User เพียงหนึ่งรายการ); implementation นี้ไม่ได้ใช้ `User.role` เป็น permission.

`userId` ที่ส่งเป็น compatibility field ต้องเป็น public UUIDv4 ของ owner; owner ที่บันทึกจริงมาจาก server. `workItemId` ต้องเป็น public UUIDv4 ของ WorkItem ในขอบเขต owner. `projectId` เป็น optional compatibility field ที่หากส่งต้องเป็น public UUIDv4 ของ Project ที่ WorkItem อ้างถึง และ Project ที่บันทึกจะ derive จาก WorkItem เสมอ.

## ดึงข้อมูลจากตารางไหน

| Table | Operation | การใช้งาน |
| --- | --- | --- |
| `User` | Read | resolve owner และอ่าน User relation ใน response |
| `TimeEntry` | Read / Insert | อ่านรายการหรือสร้าง Daily Work |
| `work_items` | Read / row lock | ตรวจ owner และ Project ของ WorkItem; include WorkItem ใน response |
| `Project` | Read | include Project relation ใน response |

## Request

### Headers

| Header | Type | Required | เงื่อนไข |
| --- | --- | --- | --- |
| `Authorization` | HTTP Basic | Yes | ตรวจโดย Node owner gate; ใช้ credential ที่ provision ให้ environment และห้ามใส่ credential จริงในเอกสารหรือ shell history |
| `Content-Type` | media type | No | เมื่อส่ง body ให้ใช้ `application/json`; route parse JSON body โดยไม่ได้ตรวจ header นี้ |
| `Origin` | URL | Conditional | `POST` ต้องส่งและต้องตรงกับ `APP_ORIGIN`; request อื่นที่ส่ง header นี้ต้องใช้ origin เดียวกัน |

### GET query parameters

| Parameter | Type | Required | Validation / behavior |
| --- | --- | --- | --- |
| `date` | `YYYY-MM-DD` | No | เลือก Bangkok calendar day; ใช้พร้อม `startDate`/`endDate` ไม่ได้ |
| `startDate` | `YYYY-MM-DD` | Conditional | ต้องส่งคู่กับ `endDate`; inclusive date range |
| `endDate` | `YYYY-MM-DD` | Conditional | ต้องส่งคู่กับ `startDate`; ต้องไม่ก่อน `startDate` |
| `userId` | string | No | compatibility filter แบบ public UUIDv4; เมื่อไม่ว่างและไม่ตรง owner ตอบ `400 VALIDATION_ERROR`; ค่าว่างถูกละไว้ |

เมื่อไม่ส่งตัวกรองวันที่ จะอ่านรายการของ owner ทุกวัน. Range query ใช้วันเริ่มต้นแบบ `>=` และวันหลัง `endDate` แบบ `<` ตาม Bangkok wall-clock semantics.

```bash
curl -i -u "$OWNER_GATE_USERNAME:$OWNER_GATE_PASSWORD" \
  "$APP_ORIGIN/api/work-logs?startDate=2026-09-01&endDate=2026-09-30"
```

GET response มี top-level `workLogs` array; เมื่อไม่มีรายการจะเป็น array ว่าง:

```jsonc
{
  "workLogs": [] // Daily Work ที่ตรงกับ owner และ filters; array item มี field ตามตาราง Response
}
```

### POST body

| Field | Type | Required | Validation / behavior |
| --- | --- | --- | --- |
| `hours` | number หรือ string | Yes | API ตรวจ positive finite decimal และขอบเขต `DECIMAL(65,30)` (จำนวนเต็มไม่เกิน 35 หลัก, ทศนิยมไม่เกิน 30 หลัก); ไม่พบข้อมูลที่ยืนยันได้จาก implementation ปัจจุบันเกี่ยวกับ per-day cap; ส่ง string เมื่อต้องรักษาความแม่นยำของเลขทศนิยม |
| `workItemId` | string | Yes | public UUIDv4 ของ WorkItem ในขอบเขต owner; Project จะ derive จากรายการนี้ |
| `date` | string | Yes | `YYYY-MM-DD` หรือ Bangkok timestamp ที่ลงท้าย `+07:00`; บันทึกเฉพาะ Bangkok calendar date |
| `projectId` | string | No | compatibility field แบบ public UUIDv4; หากส่งต้องไม่ว่างและตรงกับ Project ของ WorkItem |
| `description` | string \| null | No | คำอธิบาย Daily Work |
| `remarks` | string \| null | No | รายละเอียดเพิ่มเติม |
| `status` | string \| null | No | legacy status; route รับข้อความโดยไม่ตรวจ enum |
| `userId` | string | No | compatibility field แบบ public UUIDv4; หากส่งต้องตรง owner |

Body ต้องเป็น JSON object; `description`, `remarks`, `status` ต้องเป็น string หรือ `null`.

```json
{
  "workItemId": "work-item-id",
  "hours": "2.5",
  "date": "2026-09-30",
  "description": "Review"
}
```

## Response

`GET` ตอบ `200` พร้อม `Cache-Control: no-store`; `POST` ตอบ `201`. GET คืน `workLogs` เป็น array (ว่างได้) และ POST คืนรายการเดียวใน `workLog`. แต่ละรายการมีโครงสร้างเดียวกัน:

| Field | Description |
| --- | --- |
| `workLogs` | array ของ TimeEntry ที่ตรงกับ owner และ filters; มีเฉพาะใน GET |
| `workLog` | TimeEntry ที่เพิ่งสร้าง; มีเฉพาะใน POST |
| `id` | Public UUIDv4 ของ TimeEntry |
| `description` | คำอธิบาย หรือ `null` |
| `remarks` | รายละเอียดเพิ่มเติม หรือ `null` |
| `hours` | ชั่วโมงในรูป Decimal string จาก `TimeEntry.hours` |
| `date` | Bangkok calendar date รูปแบบ `YYYY-MM-DD` |
| `status` | legacy status string หรือ `null`; ไม่ได้แปลง enum |
| `createdAt` | เวลาสร้างที่ serialize เป็น Bangkok wall-clock ISO timestamp พร้อม `+07:00` |
| `updatedAt` | เวลาแก้ไขล่าสุดที่ serialize เป็น Bangkok wall-clock ISO timestamp พร้อม `+07:00` |
| `user` | User relation ของ owner ที่เลือกมาใน response |
| `user.id` | Public UUIDv4 ของ User |
| `user.name` | ชื่อ owner |
| `user.email` | email ของ owner |
| `user.avatar` | avatar URL หรือ `null` |
| `project` | Project relation หรือ `null` สำหรับ legacy record |
| `project.id` | Public UUIDv4 ของ Project |
| `project.name` | ชื่อ Project |
| `project.colorProject` | สี Project หรือ `null` |
| `workItem` | WorkItem ของ owner หรือ `null` สำหรับ legacy record/WorkItem ที่ไม่ใช่ของ owner |
| `workItem.id` | Public UUIDv4 ของ WorkItem |
| `workItem.title` | ชื่อ WorkItem |
| `workItem.kind` | ประเภท WorkItem |
| `workItem.status` | สถานะ WorkItem ใน public format เช่น `in-progress` |

```jsonc
{
  "workLog": { // TimeEntry ที่สร้างสำเร็จ
    "id": "time-entry-id", // public UUIDv4 ของ TimeEntry
    "description": "Review", // คำอธิบาย หรือ null
    "remarks": null, // รายละเอียดเพิ่มเติม หรือ null
    "hours": "2.5", // ชั่วโมงในรูป Decimal string
    "date": "2026-09-30", // Bangkok calendar date
    "status": null, // legacy status หรือ null
    "createdAt": "2026-09-30T12:00:00.000+07:00", // เวลาสร้าง Bangkok
    "updatedAt": "2026-09-30T12:00:00.000+07:00", // เวลาแก้ไขล่าสุด Bangkok
    "user": { // User relation ของ owner
      "id": "owner-id", // public UUIDv4 ของ owner
      "name": "Owner", // ชื่อ owner
      "email": "owner@example.invalid", // email ของ owner
      "avatar": null // avatar URL หรือ null
    },
    "project": { // Project relation หรือ null ใน legacy record
      "id": "project-id", // public UUIDv4 ของ Project
      "name": "Website", // ชื่อ Project
      "colorProject": null // สี Project หรือ null
    },
    "workItem": { // WorkItem relation ของ owner หรือ null ใน legacy record
      "id": "work-item-id", // public UUIDv4 ของ WorkItem
      "title": "Review", // ชื่อ WorkItem
      "kind": "Task", // ประเภท WorkItem
      "status": "in-progress" // สถานะ public ของ WorkItem
    }
  }
}
```

`serializeWorkLog` ไม่ส่ง scalar `userId`, `projectId` หรือ `workItemId` ใน response; ใช้ nested relation objects ที่มี public UUID แทน.

## Error Responses

| HTTP | Code | Cause |
| ---: | --- | --- |
| `400` | `VALIDATION_ERROR` | filter/body/date/hours ไม่ถูกต้อง, ช่วงวันไม่ครบหรือเรียงกลับ, `userId` ไม่ตรง owner หรือ `workItemId` ขาด |
| `400` | `RELATION_MISMATCH` | `projectId` ที่ส่งไม่ตรง Project ของ WorkItem |
| `401` | `OWNER_UNAUTHENTICATED` | Basic authentication หรือ internal owner proof ไม่ผ่าน |
| `403` | `ACCESS_DENIED` | owner gate ปฏิเสธ `Origin` ที่ไม่ตรง `APP_ORIGIN` |
| `404` | `NOT_FOUND` | WorkItem ไม่มีอยู่หรือไม่ใช่ของ owner |
| `500` | `INTERNAL_ERROR` | database หรือ server operation ล้มเหลว; ไม่ส่งรายละเอียดภายในกลับไป |
| `503` | `DEPENDENCY_UNAVAILABLE` | resolve owner ไม่ได้หนึ่ง User หรือ owner gate เชื่อมต่อ Next.js ไม่ได้ |

ตัวอย่าง validation error ที่มี `field`:

```jsonc
{
  "error": { // รายละเอียด error ที่ API ส่งกลับ
    "code": "VALIDATION_ERROR", // รหัสสาเหตุ
    "message": "hours must be a positive finite decimal", // คำอธิบาย validation
    "field": "hours" // field ที่ไม่ผ่าน; อาจไม่มีใน error บางชนิด
  }
}
```

## Processing Flow

`GET`: owner gate ตรวจ Basic/Origin → middleware ตรวจ internal proof → resolve owner จาก `User` → validate filters → query `TimeEntry` ด้วย `userId` และ Bangkok date range → include relations และ serialize date/hour/time → response. `POST`: ผ่าน gate และ resolve owner → parse JSON/validate fields → serializable transaction ล็อกและ resolve WorkItem ของ owner → ตรวจ optional `projectId` → insert TimeEntry ด้วย owner และ Project ที่ derive จาก WorkItem → response.

## Verification

รัน `pnpm test:daily-work` เพื่อทดสอบ collection, owner scope/spoofing, validation, WorkItem/Project consistency, Decimal/date parsing และ safe errors ด้วย test doubles. รัน `pnpm test:auth` เพื่อทดสอบ Basic, Origin และ internal proof ที่ owner gate. ชุดทดสอบใช้ doubles และไม่ได้เขียนข้อมูลไปยังฐานข้อมูล environment จริง; ขั้นตอนตรวจ environment ดู [Owner access](../../operations/owner-access.md).

Manual check ใน environment ที่ provision owner access แล้ว:

```bash
curl -i -u "$OWNER_GATE_USERNAME:$OWNER_GATE_PASSWORD" \
  "$APP_ORIGIN/api/work-logs?date=2026-09-30"

curl -i -u "$OWNER_GATE_USERNAME:$OWNER_GATE_PASSWORD" \
  -H "Origin: $APP_ORIGIN" \
  -H "Content-Type: application/json" \
  --data '{"workItemId":"work-item-id","hours":"2.5","date":"2026-09-30"}' \
  "$APP_ORIGIN/api/work-logs"
```

คาดหวัง `200` พร้อม `workLogs` สำหรับ GET และ `201` พร้อม `workLog` สำหรับ POST; ตรวจ record ที่สร้างว่ามี owner `userId`, WorkItem และ Project ที่สัมพันธ์กัน.
