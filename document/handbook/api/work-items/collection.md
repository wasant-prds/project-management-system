# WorkItem collection

## Overview

อ่าน WorkItems ของ owner พร้อม Project/assignee, ค้นหาและกรองตาม period หรือสร้าง WorkItem ใหม่.

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
| `assigneeId` | string | No | legacy; หากส่งต้องเท่ากับ owner ID มิฉะนั้น 400 |
| `kind` | enum | No | `Incident`, `Issue`, `Task` |
| `status` | enum | No | `backlog`, `todo`, `in-progress`, `blocked`, `sa-testing`, `pm-testing`, `completed`, `cancelled` |
| `priority` | enum | No | `none`, `low`, `medium`, `high`, `urgent` |
| `year` | `YYYY` or `all` | No | default `all`; ใช้ร่วมกับ month |
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
| `workDate`, `dueDate` | date-like string \| null | No | ส่งค่าให้ JavaScript `Date` parse; empty/null กลายเป็น null |
| `assigneeId` | string \| null | No | legacy compatibility; หากส่งค่าอื่นที่ไม่ใช่ owner จะถูกปฏิเสธ; ค่าเขียนจริงมาจาก owner |
| `id` | string | No | parser รับ non-empty ID แต่ POST ลบ field นี้ก่อน insert จึงไม่ได้ใช้ ID จาก request |

ไม่พบการปฏิเสธ unknown fields ใน parser; อย่าพึ่งพา unknown field ว่าจะมีผล.

```json
{"title":"Fix login","projectId":"project-id","kind":"Issue","priority":"high","status":"todo","types":["bug"]}
```

## Response

GET ตอบ `200` `{workItems, years?}`; POST ตอบ `201` `{workItem}`. WorkItem object มี scalar fields ตาม Prisma model และ relation สองชุด:

| Field | Description |
| --- | --- |
| `workItems` / `workItem` | WorkItem records หรือ record เดียว |
| `id`, `title`, `description`, `kind`, `priority`, `role`, `types` | ID และ business fields; description/role nullable; `types` เป็น array |
| `status` | Public status; underscore Prisma enums ถูก serialize เป็น hyphen |
| `workDate`, `dueDate`, `submittedAt`, `createdAt`, `updatedAt` | Prisma DateTime fields; JSON date serialization ของ route นี้เป็น ISO `Z`; nullable dates อาจเป็น null |
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
| `years` | Optional array ของปีเป็น string, มาจาก owner WorkItem date anchor |

เมื่อ status เป็น `sa-testing` หรือ `completed`, create จะกำหนด `submittedAt` เป็นเวลาปัจจุบัน. Response ส่ง WorkItem fields ที่ Prisma include คืนมา.

## Error Responses

| HTTP | Body/code | Cause |
| ---: | --- | --- |
| `400` | `{error: ...}` | invalid year/month/kind/status/priority/types/title/project/assignee input |
| `401` | `OWNER_UNAUTHENTICATED` | owner access ไม่ผ่าน |
| `403` | `ACCESS_DENIED` | origin policy ปฏิเสธ request |
| `404` | `{ "error": "Project not found" }` | Project ID ที่ส่งไม่มีอยู่ |
| `500` | `{ "error": "Failed to ... work item(s)" }` | database/server failure |
| `503` | `DEPENDENCY_UNAVAILABLE` | owner resolver ไม่พบ owner ที่กำหนดได้แน่ชัด |

## Processing Flow

GET: resolve owner → validate filters/period → build owner-scoped query → load WorkItems and optional years → serialize status. POST: resolve owner → parse input with server owner ID → verify Project → create WorkItem → set `submittedAt` for selected statuses → return include.

## Verification

`pnpm test:auth`. ตรวจ owner scoping, invalid enum/year/month, foreign `assigneeId`, Project ไม่มี และ default values. Date serialization ที่เห็นจริงเป็น `Z`; Bangkok policy ของ WorkItem timestamps ยังไม่ถูกทำให้สม่ำเสมอกับ WorkLog API.
