# Daily Work collection

## Overview

อ่านหรือบันทึก `TimeEntry` (Daily Work) ของ owner. API ใช้ Bangkok date range/serialization ที่ `lib/bangkok-datetime.ts` กำหนด.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| `GET` | `/api/work-logs` | list ตามวันหรือ inclusive date range, ใหม่สุดก่อน |
| `POST` | `/api/work-logs` | create TimeEntry โดยกำหนด User จาก owner |

## สิทธิ์ที่มองเห็น

ต้องผ่าน owner gate และ owner resolver. `userId` หากส่งต้องตรงกับ owner; ค่าที่เขียนจริงมาจาก resolver. WorkItem relation ต้องเป็นของ owner และอยู่ใน Project ที่เลือก.

## ดึงข้อมูลจากตารางไหน

| Table | Operation | เหตุผล |
| --- | --- | --- |
| `User` | Read | owner และ user relation |
| `TimeEntry` | Read/Insert | list/create Daily Work |
| `Project` | Read | project relation ของ WorkLog |
| `work_items` | Read | ตรวจ WorkItem ID + Project + owner และ response relation |

## Request

### GET query parameters

| Parameter | Type | Required | Validation / behavior |
| --- | --- | --- | --- |
| `date` | `YYYY-MM-DD` | No | อ่าน Bangkok calendar day; เมื่อส่ง จะมี precedence เหนือ start/end |
| `startDate` | `YYYY-MM-DD` | Conditional | ต้องส่งพร้อม `endDate`; inclusive day range |
| `endDate` | `YYYY-MM-DD` | Conditional | ต้องส่งพร้อม `startDate`; ต้องไม่น้อยกว่า startDate |
| `userId` | string | No | legacy filter; หากไม่ใช่ owner ตอบ 400 |

Query ช่วงวันใช้ `date >= start of startDate` และ `< start of day หลัง endDate`, ทั้งหมดตาม Bangkok wall-clock semantics. ไม่มี pagination ปัจจุบัน.

```bash
curl -u "$OWNER_GATE_USERNAME:$OWNER_GATE_PASSWORD" \
  "$APP_ORIGIN/api/work-logs?startDate=2026-09-01&endDate=2026-09-30"
```

### POST body

| Field | Type | Required | Behavior |
| --- | --- | --- | --- |
| `hours` | number/string | Yes | truthy value เป็นเงื่อนไข required; handler ใช้ `parseFloat` และ DB รับ Decimal |
| `projectId` | string | Yes | Project ID; required |
| `workItemId` | string | Yes | WorkItem ที่ต้องเป็นของ owner และ Project เดียวกัน |
| `date` | string | No | date-only `YYYY-MM-DD` หรือ ISO timestamp ที่ลงท้าย `+07:00`; omitted ใช้ current Bangkok wall-clock date/time |
| `description` | string \| null | No | Daily Work description |
| `remarks` | string \| null | No | รายละเอียดเพิ่มเติม |
| `status` | string \| null | No | สถานะ legacy; route ไม่ validate enum |
| `userId` | string | No | legacy compatibility; หากส่งต้องตรง owner |

```json
{"projectId":"project-id","workItemId":"work-item-id","hours":2.5,"date":"2026-09-30","description":"Review"}
```

## Response

GET ตอบ `200` `{workLogs: [...]}`; POST ตอบ `201` `{workLog: ...}`. TimeEntry object รวม scalar model fields และ relation ที่ query เลือกไว้:

| Field | Description |
| --- | --- |
| `workLogs` / `workLog` | Array หรือรายการ Daily Work |
| `id`, `description`, `remarks` | TimeEntry ID และข้อความ; nullable fields อาจเป็น null |
| `hours` | Decimal ชั่วโมง; JSON serialization ของ Prisma Decimal เป็น string |
| `date`, `createdAt`, `updatedAt` | Bangkok timestamp ที่ serialize เป็น ISO `+07:00` |
| `status` | legacy status string หรือ null; handler ไม่แปลง enum |
| `userId`, `projectId`, `workItemId` | foreign keys; workItemId nullable ตาม schema |
| `user` | Owner User relation |
| `user.id` | User primary key |
| `user.name` | ชื่อ owner |
| `user.email` | Email owner |
| `user.avatar` | Avatar URL หรือ null |
| `project` | Project relation หรือ null ตาม schema |
| `project.id` | Project primary key |
| `project.name` | ชื่อ Project |
| `project.colorProject` | สี Project หรือ null |
| `workItem` | Owned WorkItem relation หรือ null เมื่อ foreign-owner |
| `workItem.id` | WorkItem primary key |
| `workItem.title` | ชื่อ WorkItem |
| `workItem.kind` | ชนิด WorkItem |
| `workItem.status` | สถานะ WorkItem ใน public hyphen format |

```jsonc
{
  "workLog": {
    "id": "time-entry-id", // TimeEntry primary key
    "description": "Review", // description หรือ null
    "remarks": null, // remarks หรือ null
    "hours": "2.5", // Decimal hours
    "date": "2026-09-30T00:00:00.000+07:00", // Bangkok wall-clock datetime
    "status": null, // legacy status
    "createdAt": "2026-09-30T12:00:00.000+07:00", // เวลาสร้าง Bangkok
    "updatedAt": "2026-09-30T12:00:00.000+07:00", // เวลาแก้ล่าสุด Bangkok
    "userId": "owner-id", // owner foreign key
    "projectId": "project-id", // Project foreign key
    "workItemId": "work-item-id", // WorkItem foreign key หรือ null
    "user": { // owner relation
      "id": "owner-id", // User primary key
      "name": "Owner", // ชื่อ owner
      "email": "owner@example.invalid", // Email owner
      "avatar": null // Avatar URL หรือ null
    },
    "project": { // Project relation หรือ null
      "id": "project-id", // Project primary key
      "name": "Website", // ชื่อ Project
      "colorProject": null // สี Project หรือ null
    },
    "workItem": { // owned WorkItem relation หรือ null
      "id": "work-item-id", // WorkItem primary key
      "title": "Review", // ชื่อ WorkItem
      "kind": "Task", // ชนิด WorkItem
      "status": "in-progress" // สถานะ public ของ WorkItem
    }
  }
}
```

## Error Responses

| HTTP | Body/code | Cause |
| ---: | --- | --- |
| `400` | `VALIDATION_ERROR` หรือข้อความ `{error}` | foreign `userId`, invalid date/range, required field ขาด หรือ WorkItem/Project relation ไม่ตรง/foreign |
| `401` | `OWNER_UNAUTHENTICATED` | owner access ไม่ผ่าน |
| `403` | `ACCESS_DENIED` | Origin ไม่ผ่าน |
| `500` | `{error: "Failed to fetch work logs"}` หรือ `{error: "Failed to save Daily Work"}` | DB/server error |
| `503` | `DEPENDENCY_UNAVAILABLE` | owner resolver ล้มเหลว |

GET ที่ date/range ไม่ถูกต้องตอบ 400. POST relation validation ที่ `resolveWorkItemId()` ตรวจพบตอบ 400; error DB อื่นตอบ generic 500.

## Processing Flow

GET: resolve owner → validate owner/date filters → build Bangkok-exclusive end range → query TimeEntry `userId` → include relations → ownership-safe serialization. POST: resolve owner → reject foreign user → parse Bangkok date → resolve owner WorkItem/project pair → create TimeEntry with server `userId` → serialize.

## Verification

`pnpm test:auth`. ทดสอบ unauthenticated, foreign user, invalid date, date-only, `+07:00`, Bangkok boundaries เมื่อ machine timezone ต่างกัน, WorkItem foreign/project mismatch และ persisted/returned owner. ใช้ test doubles; ห้ามอ้างข้อมูลจริง.
