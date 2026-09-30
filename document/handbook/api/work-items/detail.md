# WorkItem detail

## Overview

อ่าน แก้ไข หรือลบ WorkItem ของ owner ตาม ID.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| `GET` | `/api/work-items/{id}` | อ่าน WorkItem พร้อม owner และ Project |
| `PATCH` | `/api/work-items/{id}` | validate/update เฉพาะ fields ที่ส่ง |
| `DELETE` | `/api/work-items/{id}` | ลบ WorkItem ของ owner เท่านั้น |

## สิทธิ์ที่มองเห็น

ต้องผ่าน owner gate และ resolver. GET กรอง owner ใน query; PATCH ตรวจ owner ก่อน update; DELETE ใช้ `deleteMany` filter ด้วย owner. Resource ของ owner อื่นแสดงเป็น 404.

## ดึงข้อมูลจากตารางไหน

| Table | Operation | เหตุผล |
| --- | --- | --- |
| `User` | Read | owner และ assignee relation |
| `work_items` | Read/Update/Delete | item หลัก; mutation scope เป็น owner |
| `Project` | Read | relation response; PATCH อาจ connect Project ใหม่ |

## Request

### Path parameter

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | WorkItem ID |

GET/DELETE ไม่มี query/body.

### PATCH body

รับ field แบบ partial; field ที่ไม่ส่งคงเดิม. `assigneeId` ใช้ได้เฉพาะ owner ID; ค่าอื่นตอบ 400. `title`, `description`, `kind`, `priority`, `role`, `status`, `types`, `workDate`, `dueDate`, `projectId` เป็น fields ที่ handler ประมวลผล.

| Field | Type | Validation |
| --- | --- | --- |
| `title` | string | ถูกกำหนดตรง ๆ; parser นี้ไม่ validate ว่าไม่ว่าง |
| `description` | string \| null | set เมื่อระบุ |
| `kind` | enum | `Incident`, `Issue`, `Task` |
| `priority` | enum | `none`, `low`, `medium`, `high`, `urgent` |
| `role` | enum \| null \| `''` | `Developer`, `infra`, `SA`; null/empty clears role |
| `status` | enum | public statuses; accepts both public hyphen and Prisma underscore status values |
| `types` | string[] \| null | allowed WorkItem type list; null becomes empty list |
| `workDate`, `dueDate` | string/number/Date \| null | passed to JavaScript `Date`; falsy values clear to null |
| `projectId` | string | connect to another Project; database relation enforces existence |
| `assigneeId` | string | must equal authenticated owner |

```json
{"status":"in-progress","priority":"high"}
```

## Response

GET/PATCH ตอบ `200` `{workItem}` โดย scalar fields และ relation เหมือน [WorkItem collection](./collection.md#response); JSON DateTime fields serialize เป็น ISO `Z`.

| Field | Description |
| --- | --- |
| `workItem.id`, `title`, `description`, `kind`, `priority`, `role`, `types`, `status` | WorkItem identity/classification/state; status ใช้ public hyphen form |
| `workItem.workDate`, `dueDate`, `submittedAt`, `createdAt`, `updatedAt` | DateTime values ของ Prisma ผ่าน JSON serializer; nullable values อาจเป็น null |
| `workItem.projectId`, `assigneeId` | Foreign keys |
| `workItem.assignee` | Owner User relation |
| `workItem.assignee.id` | User primary key |
| `workItem.assignee.name` | ชื่อ owner |
| `workItem.assignee.email` | Email owner |
| `workItem.assignee.avatar` | Avatar URL หรือ null |
| `workItem.project` | Project relation |
| `workItem.project.id` | Project primary key |
| `workItem.project.name` | ชื่อ Project |
| `workItem.project.colorProject` | สี Project หรือ null |
| DELETE `message` | `Work item deleted successfully` เมื่อมีการลบ 1 record |

## Error Responses

| HTTP | Body/code | Cause |
| ---: | --- | --- |
| `400` | `VALIDATION_ERROR` หรือ `{error: ...}` | foreign assignee หรือ invalid enum/types |
| `401` | `OWNER_UNAUTHENTICATED` | ไม่มี owner authentication |
| `403` | `ACCESS_DENIED` | origin policy ไม่ผ่าน |
| `404` | `Work item not found` | ID ไม่มีหรือไม่ได้เป็นของ owner |
| `500` | `Failed to ... work item` | DB/server error รวมถึง relation/database constraint failure ที่ไม่ได้ map เฉพาะ |
| `503` | `DEPENDENCY_UNAVAILABLE` | resolver ไม่พบ owner ที่แน่นอน |

## Processing Flow

GET: resolve owner → find item with `id + assigneeId` → include relations → serialize status. PATCH: resolve owner → reject foreign assignee field → verify existing owner → validate fields → update. DELETE: resolve owner → delete by `id + assigneeId` → 404 หากไม่มี row.

## Verification

`pnpm test:auth`. ตรวจ GET foreign/missing ID, PATCH invalid enum และ foreign assignee ที่ไม่เกิด write, DELETE foreign ID ไม่ลบข้อมูล. ตรวจ Project relation update ด้วย test DB ที่ปลอดภัยก่อนใช้จริง.
