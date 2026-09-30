# WorkItem collection

## Overview

อ่าน WorkItems ของ owner พร้อม Project/Company/assignee, ค้นหาและกรองตาม period, kind, status, priority, functional role หรือสร้าง WorkItem ใหม่.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| `GET` | `/api/work-items` | owner-scoped list และ option `years` |
| `POST` | `/api/work-items` | validate payload/Project แล้วสร้าง WorkItem ให้ owner |

## สิทธิ์ที่มองเห็น

ต้องผ่าน owner gate, middleware proof และ `getOwner()`. `User.role`, ProjectMember และ WorkItem role ไม่ใช่ API permission. List ถูกกรอง `assigneeId` เป็น owner.

## ดึงข้อมูลจากตารางไหน

| Table | Operation | เหตุผล |
| --- | --- | --- |
| `User` | Read | owner resolver และ assignee relation |
| `work_items` | Read/Insert | list/create canonical WorkItems |
| `Project` | Read | filter/search/project include และตรวจ Project ก่อน insert |

## Request

### GET query parameters

| Parameter | Type | Required | Validation / behavior |
| --- | --- | --- | --- |
| `projectId` | string | No | filter Project ID |
| `companyId` | string | No | filter Company ผ่าน Project |
| `assigneeId` | string | No | legacy; หากส่งต้องเท่ากับ owner ID มิฉะนั้น 400 |
| `kind` | enum | No | `Incident`, `Issue`, `Task` |
| `status` | enum | No | `backlog`, `todo`, `in-progress`, `blocked`, `sa-testing`, `pm-testing`, `completed`, `cancelled` |
| `priority` | enum | No | `none`, `low`, `medium`, `high`, `urgent` |
| `role` | enum or `none` | No | `Developer`, `infra`, `SA`; `none` กรอง role ว่าง |
| `year` | `YYYY` or `all` | No | default = ปีปัจจุบันใน `Asia/Bangkok`; `all` แสดงทุกปี |
| `month` | `1`–`12` or `all` | No | default `all` |
| `search` | string | No | ค้น title, description, Project name, assignee name และ substring ของ kind/status |
| `includeYears` | boolean text | No | `true` ขอ year options; กรณี year=all + month เฉพาะเดือนจะรวม years โดยอัตโนมัติ |

ไม่มี pagination ใน implementation ปัจจุบัน.

```bash
curl -u "$OWNER_GATE_USERNAME:$OWNER_GATE_PASSWORD" \
  "$APP_ORIGIN/api/work-items?status=in-progress&year=2026&month=9&includeYears=true"
```

### POST body

| Field | Type | Required | Description / constraints |
| --- | --- | --- | --- |
| `title` | string | Yes | trim แล้วต้องไม่ว่าง |
| `projectId` | string | Yes | Project ID ที่มีอยู่ |
| `kind` | enum | Yes | `Incident`, `Issue`, `Task` |
| `status` | enum | No | default `backlog`; public hyphen statuses ข้างต้น |
| `priority` | enum | No | default `none`; `none`, `low`, `medium`, `high`, `urgent` |
| `role` | enum \| null | No | `Developer`, `infra`, `SA` หรือ null |
| `types` | string[] | No | default `[]`; แต่ละค่าเป็น `bug`, `data`, `documentation`, `epic`, `feature`, `maintenance`, `opl`, `ops`, `support`, `task`; duplicates ถูกตัดออก |
| `description` | string \| null | No | description; ว่าง normalize เป็น null |
| `workDate`, `dueDate` | `YYYY-MM-DD` \| null | No | วันที่ปฏิทิน `Asia/Bangkok`; ปฏิเสธวันที่ผิด/รูปแบบอื่น; empty/null กลายเป็น null |
| `assigneeId` | string \| null | No | legacy compatibility; หากส่งค่าอื่นที่ไม่ใช่ owner จะถูกปฏิเสธ; ค่าเขียนจริงมาจาก owner |
| `id` | string | No | parser รับ non-empty ID แต่ POST ลบ field นี้ก่อน insert จึงไม่ได้ใช้ ID จาก request |

ไม่พบการปฏิเสธ unknown fields ใน parser; อย่าพึ่งพา unknown field ว่าจะมีผล.

```json
{"title":"Fix login","projectId":"project-id","kind":"Issue","priority":"high","status":"todo","types":["bug"]}
```

## Response

GET ตอบ `200` `{workItems, years?}`; POST ตอบ `201` `{workItem}`. WorkItem object มี scalar fields ตาม Prisma model และ relation:

| Field | Description |
| --- | --- |
| `workItems` / `workItem` | WorkItem records หรือ record เดียว |
| `id`, `title`, `description`, `kind`, `priority`, `role`, `types` | ID และ business fields; description/role nullable; `types` เป็น array |
| `status` | Public status; underscore Prisma enums ถูก serialize เป็น hyphen |
| `workDate`, `dueDate` | business date `YYYY-MM-DD`; null ได้; ไม่มีการเลื่อนวันตาม timezone ของ browser |
| `submittedAt`, `createdAt`, `updatedAt` | timestamp ที่แสดง Bangkok local wall-clock พร้อม offset `+07:00`; nullable `submittedAt` ได้ |
| `projectId`, `assigneeId` | Foreign keys |
| `assignee` | User relation ของ owner |
| `assignee.id` | User primary key |
| `assignee.name` | ชื่อ owner |
| `assignee.email` | Email owner |
| `assignee.avatar` | Avatar URL หรือ null |
| `project` | Project relation |
| `project.id` | Project primary key |
| `project.name` | ชื่อ Project |
| `project.colorProject` | สี Project หรือ null |
| `project.company` | Company ของ Project: `id`, `name`, `displayName` |
| `years` | Optional array ของปีเป็น string, มาจาก owner WorkItem date anchor |

เมื่อ status เป็น `sa-testing` หรือ `completed`, create จะกำหนด `submittedAt` เป็น Bangkok local wall-clock. Collection ไม่รวม TimeEntries; ใช้ detail endpoint เพื่ออ่าน Daily Work ที่ผูกกับ WorkItem.

## Error Responses

| HTTP | Body/code | Cause |
| ---: | --- | --- |
| `400` | `VALIDATION_ERROR` | invalid year/month/kind/status/priority/role/types/title/date/assignee input |
| `401` | `OWNER_UNAUTHENTICATED` | owner access ไม่ผ่าน |
| `403` | `ACCESS_DENIED` | origin policy ปฏิเสธ request |
| `404` | `{ "error": "Project not found" }` | Project ID ที่ส่งไม่มีอยู่ |
| `500` | `{ "error": "Failed to ... work item(s)" }` | database/server failure |
| `503` | `DEPENDENCY_UNAVAILABLE` | owner resolver ไม่พบ owner ที่กำหนดได้แน่ชัด |

## Processing Flow

GET: resolve owner → validate filters/period → build owner-scoped query → load WorkItems and optional years → serialize status. POST: resolve owner → parse input with server owner ID → verify Project → create WorkItem → set `submittedAt` for selected statuses → return include.

## Verification

`pnpm test:work-items` ตรวจ owner scoping, invalid enum/year/month/role/date, foreign `assigneeId`, Project ไม่มี, defaults และ Bangkok serialization. `pnpm test:auth` ตรวจ owner access contract ร่วม.

## Import

`POST /api/work-items/import` รับ JSON array หรือ `{ "workItems": [...] }`. เมื่อ envelope ถูกต้องจะตอบ `200` พร้อม `imported` และ `rows[]`; แต่ละผลมี `row` (เริ่ม 1), `outcome` (`created`, `skipped` หรือ `failed`) และ `workItemId?` หรือ `error: { code, message, field? }`. Invalid enum/date/Project เป็นผลรายแถวและไม่หยุดแถวอื่น; duplicate ID ถูก skip โดยไม่แก้ข้อมูลเดิม. JSON/envelope ที่ผิดตอบ `400`.
