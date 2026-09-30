# Project detail

## Overview

อ่าน Project พร้อม Company, WorkItems, TimeEntries และ summary; แก้ Project; หรือลบเมื่อไม่มี child/history ที่ handler ปกป้อง.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| `GET` | `/api/projects/{id}` | อ่าน Project relation/detail |
| `PATCH` | `/api/projects/{id}` | แก้ partial fields |
| `DELETE` | `/api/projects/{id}` | ลบ Project ที่ไม่มี references/history |

## สิทธิ์ที่มองเห็น

ทุก method ต้องผ่าน owner gate และ resolver. ไม่มี role เพิ่มเติม; API เป็นระบบ owner เดียว.

## ดึงข้อมูลจากตารางไหน

| Table | Operation | เหตุผล |
| --- | --- | --- |
| `User` | Read | resolve owner |
| `Project` | Read/Update/Delete | detail, update และ history count/delete |
| `Company` | Read | company detail; PATCH ตรวจ Company ใหม่ |
| `work_items` | Read | child list และ status/role summary |
| `TimeEntry` | Read | child list และรวม hours |
| `Document`, `Milestone`, `ActivityLog`, `ProjectMember` | Read | count เพื่อป้องกันลบ Project ที่มีประวัติ/child |

## Request

### Path

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | Project ID |

GET/DELETE ไม่มี query/body.

### PATCH body

รับ Project fields แบบ partial; body ต้องมีอย่างน้อยหนึ่ง field. Field allow-list และ validation เหมือน [Project collection POST](./collection.md#post-body): `name`, `companyId`, `description`, `status`, `priority`, `startDate`, `dueDate`, `colorProject`. Company/date fields ที่ส่งมาต้องถูกต้อง; start ≤ due. Field nullable ตาม parser: `description`, `colorProject`; `companyId` ต้องเป็น non-empty string หากส่ง.

```json
{"status":"In Progress","dueDate":"2026-12-31"}
```

## Response

GET/PATCH สำเร็จตอบ `200` `{ "project": ... }`.

| Response field | Description |
| --- | --- |
| `project.id`, `name`, `description`, `status`, `priority`, `budget`, `spent`, `colorProject`, `creatorId`, `companyId` | Project model values; description/optional valuesอาจเป็น null |
| `project.startDate`, `dueDate` | Calendar date `YYYY-MM-DD` |
| `project.createdAt`, `updatedAt` | Timestamp `+07:00` |
| `project.company` | Company relation |
| `project.company.id` | Company primary key |
| `project.company.name` | ชื่อ Company |
| `project.company.displayName` | ชื่อแสดง Company หรือ null |
| `project.workItems` | WorkItems ของ Project เรียงใหม่ไปเก่า พร้อม assignee `{name, avatar}` |
| `workItems[].id`, `title`, `description`, `kind`, `priority`, `role`, `status`, `types`, `projectId`, `assigneeId` | WorkItem fields; status serialize เป็น public hyphen format |
| `workItems[].workDate`, `dueDate` | Calendar date `YYYY-MM-DD` หรือ null |
| `workItems[].submittedAt`, `createdAt`, `updatedAt` | Timestamp `+07:00`; submittedAt nullable |
| `workItems[].assignee` | ข้อมูล assignee ที่ include มา |
| `workItems[].assignee.name` | ชื่อ assignee |
| `workItems[].assignee.avatar` | Avatar URL หรือ null |
| `project.timeEntries` | TimeEntry summary rows ของ Project |
| `timeEntries[].id` | TimeEntry ID |
| `timeEntries[].hours` | Decimal hours เป็น string |
| `timeEntries[].date` | Calendar date `YYYY-MM-DD` |
| `timeEntries[].workItemId` | WorkItem ID หรือ null |
| `project.summary` | Derived counts/progress/hours ดูนิยามใน [collection](./collection.md#response) |
| `project.progress` | Alias ของ `summary.progress` |
| DELETE `message` | ยืนยันข้อความ `ลบ Project แล้ว` |

การ GET รายละเอียดไม่รวม `page`; response nested fields อธิบายในตารางด้านบน. DELETE คืน `{ "message": "ลบ Project แล้ว" }` พร้อม HTTP 200.

## Error Responses

| HTTP | Code | Cause |
| ---: | --- | --- |
| `400` | `VALIDATION_ERROR` | PATCH body/field/date/order หรือ Company ID ไม่ถูกต้อง |
| `401` | `OWNER_UNAUTHENTICATED` | ไม่มี owner authentication |
| `403` | `ACCESS_DENIED` | Origin policy ไม่ผ่าน |
| `404` | `NOT_FOUND` | Project ไม่มีอยู่ |
| `409` | `COMPANY_MAPPING_REQUIRED` | legacy Project ไม่มี Company mapping ที่จำเป็นต่อ update |
| `409` | `COMPANY_CONFLICT` | Company relation ถูกลบ/ใช้ไม่ได้ |
| `409` | `HISTORY_CONFLICT` | มี WorkItems, TimeEntries, Documents, Milestones, ActivityLogs, Members หรือ FK reference |
| `500` | `INTERNAL_ERROR` | DB operation ล้มเหลว |
| `503` | `DEPENDENCY_UNAVAILABLE` | resolver ไม่สามารถระบุ owner ได้ |

## Processing Flow

GET: resolve owner → query relations → derive summary → normalize status/date/timestamp → return. PATCH: validate input → read existing mapping → validate Company/date → update → serialize summary. DELETE: count references → reject if any → delete.

## Verification

`pnpm test:company-projects`. ตรวจ ID ไม่มี, PATCH ผิด validation, เปลี่ยน Company ที่ไม่มี, Project ที่มี child history ลบไม่ได้ และ Project ว่างลบได้. อย่าลบ Project ที่มี business history เพื่อทดสอบบนข้อมูลจริง.
