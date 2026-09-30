# WorkItem detail

## Overview

อ่าน แก้ไข หรือลบ WorkItem ของ owner ตาม ID. Detail response รวม Company ผ่าน Project และ Daily Work ของ owner ที่ผูกกับ WorkItem เดียวกัน.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| `GET` | `/api/work-items/{id}` | อ่าน WorkItem พร้อม owner, Project/Company และ Daily Work ของ owner |
| `PATCH` | `/api/work-items/{id}` | ใช้ shared parser เดียวกับ create; validate partial fields และ Project ก่อน update |
| `DELETE` | `/api/work-items/{id}` | ลบได้เมื่อไม่มี Daily Work อ้างอยู่; history conflict ตอบ 409 |

## สิทธิ์ที่มองเห็น

ต้องผ่าน owner gate และ resolver. GET กรอง owner ใน query; PATCH ตรวจ owner ก่อน update; DELETE ใช้ `deleteMany` filter ด้วย owner. Resource ของ owner อื่นแสดงเป็น 404.

## ดึงข้อมูลจากตารางไหน

| Table | Operation | เหตุผล |
| --- | --- | --- |
| `User` | Read | owner และ assignee relation |
| `work_items` | Read/Update/Delete | item หลัก; mutation scope เป็น owner |
| `Project`, `Company` | Read | relation response; PATCH ตรวจ Project ใหม่; Company มาจาก Project relation |
| `TimeEntry` | Read | Daily Work ของ owner ที่มี `workItemId` ตรงกับ WorkItem นี้ |

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
| `title` | string | trim แล้วต้องไม่ว่าง |
| `description` | string \| null | set เมื่อระบุ; ค่าว่าง normalize เป็น null |
| `kind` | enum | `Incident`, `Issue`, `Task` |
| `priority` | enum | `none`, `low`, `medium`, `high`, `urgent` |
| `role` | enum \| null \| `''` | `Developer`, `infra`, `SA`; null/empty clears role |
| `status` | enum | public statuses; accepts both public hyphen and Prisma underscore status values |
| `types` | string[] \| null | allowed WorkItem type list; null becomes empty list |
| `workDate`, `dueDate` | `YYYY-MM-DD` \| null | ต้องเป็นวันที่ปฏิทินที่ถูกต้อง; null/empty clears field |
| `projectId` | string | connect to another Project; database relation enforces existence |
| `assigneeId` | string | must equal authenticated owner; server resolves owner |
| `id` | any | rejected; record identity cannot be changed |

```json
{"status":"in-progress","priority":"high"}
```

## Response

GET/PATCH ตอบ `200` `{workItem}`. Business dates เป็น `YYYY-MM-DD`; timestamps เป็น Bangkok local wall-clock พร้อม `+07:00`. `workItem.project.company` มี Company ID/name/display name; `workItem.timeEntries[]` มีรายการ Daily Work ของ owner พร้อม `id`, `date`, `hours`, `description`, `remarks`.

| Field | Description |
| --- | --- |
| `workItem.id`, `title`, `description`, `kind`, `priority`, `role`, `types`, `status` | WorkItem identity/classification/state; status ใช้ public hyphen form |
| `workItem.workDate`, `dueDate` | business date `YYYY-MM-DD`; nullable |
| `workItem.submittedAt`, `createdAt`, `updatedAt` | Bangkok local wall-clock timestamps พร้อม `+07:00`; `submittedAt` nullable |
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
| `workItem.project.company` | Company ที่ Project นี้สังกัด |
| `workItem.timeEntries[]` | Daily Work ที่ผูกกับ WorkItem และ owner นี้; ชั่วโมงส่งเป็น decimal string |
| DELETE `message` | `Work item deleted successfully` เมื่อมีการลบ 1 record |

## Error Responses

| HTTP | Body/code | Cause |
| ---: | --- | --- |
| `400` | `VALIDATION_ERROR` | invalid title/enum/date/role/types/assignee/project input |
| `401` | `OWNER_UNAUTHENTICATED` | ไม่มี owner authentication |
| `403` | `ACCESS_DENIED` | origin policy ไม่ผ่าน |
| `404` | `Work item not found` | ID ไม่มีหรือไม่ได้เป็นของ owner |
| `404` | `NOT_FOUND` | Project ที่ระบุไม่มีอยู่ |
| `409` | `HISTORY_CONFLICT` | มี Daily Work ที่อ้างถึง WorkItem; ไม่มีข้อมูลถูกลบ |
| `500` | `Failed to ... work item` | DB/server error รวมถึง relation/database constraint failure ที่ไม่ได้ map เฉพาะ |
| `503` | `DEPENDENCY_UNAVAILABLE` | resolver ไม่พบ owner ที่แน่นอน |

## Processing Flow

GET: resolve owner → find item with `id + assigneeId` → include Company และ owner-scoped TimeEntries → serialize enums/dates/timestamps. PATCH: resolve owner → shared partial parser → verify WorkItem and optional Project → update canonical record. DELETE: resolve owner → check TimeEntry relation → delete เฉพาะเมื่อไม่มี history; database `Restrict` เป็น race-condition backstop.

## Verification

`pnpm test:work-items` ตรวจ GET detail/Company/Daily Work, PATCH shared validation และ missing Project ที่ไม่เกิด write, DELETE history conflict และ owner scoping. `pnpm test:auth` ตรวจ owner access contract ร่วม.
