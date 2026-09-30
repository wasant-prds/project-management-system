# Daily Work detail

## Overview

อ่าน แก้ไข หรือลบ Daily Work (`TimeEntry`) ของ owner ตาม ID.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| `GET` | `/api/work-logs/{id}` | อ่าน TimeEntry พร้อม User/Project/WorkItem relation |
| `PATCH` | `/api/work-logs/{id}` | แก้ fields ที่ส่งมา; owner ไม่เปลี่ยน |
| `DELETE` | `/api/work-logs/{id}` | ลบเฉพาะ TimeEntry ของ owner |

## สิทธิ์ที่มองเห็น

ต้องผ่าน owner gate และ `getOwner()`. ทุก read/update/delete query ตรวจ `userId` เป็น owner. `userId` foreign ใน PATCH ตอบ 400; resource ของ User อื่นเห็นเป็น 404.

## ดึงข้อมูลจากตารางไหน

| Table | Operation | เหตุผล |
| --- | --- | --- |
| `User` | Read | resolve owner และ response relation |
| `TimeEntry` | Read/Update/Delete | Daily Work record scoped to owner |
| `Project` | Read | relation response; ใช้ projectId เมื่อ link WorkItem |
| `work_items` | Read | validate WorkItem ID, selected Project และ owner |

## Request

### Path parameter

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | TimeEntry ID |

GET/DELETE ไม่มี query/body.

### PATCH body

ส่งเฉพาะ fields ที่ต้องการแก้; body fields ที่ route อ่าน:

| Field | Type | Required | Validation / behavior |
| --- | --- | --- | --- |
| `description` | string \| null | No | set เมื่อส่ง |
| `remarks` | string \| null | No | set เมื่อส่ง |
| `hours` | number หรือ numeric string | No | ต้องเป็น finite number; string ว่าง/invalid ถูกปฏิเสธ |
| `date` | date-only หรือ ISO timestamp `+07:00` | No | parse ด้วย Bangkok parser |
| `projectId` | string | No | set projectId; เมื่อส่ง workItemId ด้วย จะใช้ project นี้ตรวจ pair |
| `workItemId` | string | No | หากส่ง ต้องเป็น WorkItem ของ owner และ project ที่เลือก/current; ต้องไม่ว่าง |
| `status` | string \| null | No | set legacy status ตรง ๆ; ไม่มี enum validation |
| `userId` | string | No | legacy compatibility; หากส่งต้องตรงกับ owner |

```json
{"hours":"1.25","date":"2026-09-30T13:30:00+07:00"}
```

ข้อจำกัดที่ยืนยันได้: relation validation ทำงานเมื่อ PATCH ส่ง `workItemId`. หากส่ง `projectId` อย่างเดียว handler ไม่ได้ตรวจ WorkItem ปัจจุบันซ้ำ จึงไม่ควรใช้ request รูปแบบนั้นเพื่อย้าย Project จนกว่าจะมีการแก้ implementation.

## Response

GET/PATCH ตอบ `200` `{workLog}`. Fields เหมือน [Daily Work collection](./collection.md#response): TimeEntry scalar fields, Bangkok timestamps และ `user`, `project`, `workItem` relations.

| Field | Description |
| --- | --- |
| `workLog.id`, `description`, `remarks`, `hours`, `date`, `status`, `createdAt`, `updatedAt`, `userId`, `projectId`, `workItemId` | TimeEntry model values; ชั่วโมงเป็น Decimal string; timestamps เป็น `+07:00` |
| `workLog.user` | Owner User relation |
| `workLog.user.id` | User primary key |
| `workLog.user.name` | ชื่อ owner |
| `workLog.user.email` | Email owner |
| `workLog.user.avatar` | Avatar URL หรือ null |
| `workLog.project` | Project relation หรือ null |
| `workLog.project.id` | Project primary key |
| `workLog.project.name` | ชื่อ Project |
| `workLog.project.colorProject` | สี Project หรือ null |
| `workLog.workItem` | Owned WorkItem relation; foreign-owner คืน null |
| `workLog.workItem.id` | WorkItem primary key |
| `workLog.workItem.title` | ชื่อ WorkItem |
| `workLog.workItem.kind` | ชนิด WorkItem |
| `workLog.workItem.status` | สถานะ WorkItem ใน public hyphen format |
| DELETE `message` | `Work log deleted successfully` เมื่อพบและลบ record ของ owner |

DELETE ตอบ `200` `{ "message": "Work log deleted successfully" }`.

## Error Responses

| HTTP | Body/code | Cause |
| ---: | --- | --- |
| `400` | `VALIDATION_ERROR` หรือ `{error}` | foreign user, invalid hours/date หรือ WorkItem relation ไม่ตรง/foreign |
| `401` | `OWNER_UNAUTHENTICATED` | owner authentication ไม่ผ่าน |
| `403` | `ACCESS_DENIED` | Origin policy ไม่ผ่าน |
| `404` | `{error: "Work log not found"}` | ID ไม่มีหรือไม่ใช่ของ owner |
| `500` | `{error: "Failed to ... work log"}` / `Failed to save Daily Work` | DB/server failure |
| `503` | `DEPENDENCY_UNAVAILABLE` | owner resolver ไม่พร้อม |

## Processing Flow

GET: resolve owner → query `id + userId` → include relations → serialize. PATCH: resolve owner → reject foreign user → find owned row → validate fields → resolve WorkItem/project when requested → update → serialize. DELETE: delete by `id + userId`; ถ้าไม่มี row ตอบ 404.

## Verification

`pnpm test:auth`. ตรวจ ID ต่าง owner/ไม่มี, userId spoof, invalid hours/date, foreign WorkItem และ Bangkok `+07:00` round-trip. ตรวจว่า request ที่ไม่ผ่าน validation ไม่เรียก update/delete.
