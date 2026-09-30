# Project collection

## Overview

อ่าน Project ตาม filter/cursor หรือสร้าง Project ภายใต้ Company.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| `GET` | `/api/projects` | list Projects หรือคืนตัวเลือก Project แบบ `options=work-items` |
| `POST` | `/api/projects` | validate Company/date แล้วสร้าง Project โดยบันทึก owner เป็น creator |

## สิทธิ์ที่มองเห็น

ต้องผ่าน owner proof middleware และ owner resolution; resolver ต้องพบ owner User เพียงหนึ่งคน. ไม่มี role หรือ permission เพิ่มเติม. API เป็น single-owner และไม่ได้ใช้ ProjectMember เป็น permission.

## ดึงข้อมูลจากตารางไหน

| Table | Operation | เหตุผล |
| --- | --- | --- |
| `User` | Read | ยืนยัน owner; POST เก็บ `creatorId` |
| `Project` | Read/Insert | list/create |
| `Company` | Read | filter/list relation และ validate `companyId` ก่อน create |
| `work_items` | Read | aggregate summary ต่อ Project |
| `TimeEntry` | Read | aggregate hours ต่อ Project |

## Request

### GET query

| Parameter | Type | Required | Validation / behavior |
| --- | --- | --- | --- |
| `status` | enum string | No | `Planning`, `In Progress`, `Review`, `Completed`, `On Hold` |
| `companyId` | string | No | กรองตาม Company ID |
| `search` | string | No | contains case-insensitive ในชื่อ Project |
| `limit` | integer | No | default 50; ช่วง 1–200 |
| `cursor` | string | No | cursor จาก `page.nextCursor`, ใช้ต่อกับ filter เดิม |
| `options` | string | No | ถ้าเท่ากับ `work-items` ให้คืน `{ id, name, colorProject }` แบบไม่ paginate; branch นี้ตรวจ `status` ก่อน |

```bash
curl -u "$OWNER_GATE_USERNAME:$OWNER_GATE_PASSWORD" \
  "$APP_ORIGIN/api/projects?companyId=company-id&limit=50"
```

### POST body

JSON object ต้องมี `name`, `companyId`, `startDate`, `dueDate`. วันที่รับ `YYYY-MM-DD`; `startDate` ต้องไม่หลัง `dueDate`. Unknown fields และ body เสียถูกปฏิเสธ.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | Yes | Project name; trim แล้วห้ามว่าง |
| `companyId` | string | Yes | Company ที่มีอยู่ |
| `startDate`, `dueDate` | `YYYY-MM-DD` | Yes | วันเริ่มและกำหนดเสร็จ; start ≤ due |
| `description` | string \| null | No | รายละเอียด |
| `status` | string | No | หนึ่งใน Project status ข้างต้น |
| `priority` | string | No | `Low`, `Medium`, `High`, `Critical` |
| `colorProject` | string \| null | No | สีของ Project |

```json
{"name":"Website","companyId":"company-id","startDate":"2026-09-01","dueDate":"2026-12-31"}
```

## Response

GET ปกติตอบ `200` และ POST ตอบ `201`. GET selector `options=work-items` ตอบ `200` โดยไม่รวม `page`.

| Field | Description |
| --- | --- |
| `projects` | Project records ในหน้าปัจจุบัน; selector mode มีเพียง `id`, `name`, `colorProject` |
| `projects[].id`, `name`, `description` | Identity/name/detail; description เป็น nullable |
| `projects[].status`, `priority` | ค่าสถานะและ priority ที่บันทึกใน Project |
| `projects[].startDate`, `dueDate` | Calendar date `YYYY-MM-DD` |
| `projects[].budget`, `spent` | Decimal จาก Project หรือ null |
| `projects[].progress` | Derived completion percentage จาก WorkItems; แทน persisted progress ใน response |
| `projects[].colorProject` | สี Project หรือ null |
| `projects[].createdAt`, `updatedAt` | ISO timestamp ที่ serializer ต่อท้าย `+07:00` |
| `projects[].creatorId` | Foreign key ของ User ผู้สร้าง; nullable |
| `projects[].companyId` | Required foreign key ของ Company |
| `projects[].company` | Company relation; schema ปัจจุบันกำหนดว่ามีเสมอ |
| `projects[].company.id` | Company primary key |
| `projects[].company.name` | ชื่อ Company |
| `projects[].company.displayName` | ชื่อแสดง Company หรือ null |
| `projects[].summary` | Derived summary ดู fields ด้านล่าง |
| `projects[].summary.statusCounts` | Map ที่ key เป็น public status และ value เป็นจำนวน WorkItem ใน status นั้น |
| `projects[].summary.roles` | จำนวน WorkItem แยกตาม role; keys คือ `Developer`, `infra`, `SA` |
| `projects[].summary.total`, `completed`, `cancelled`, `open` | จำนวน WorkItem รวมและแบ่งสถานะ; open ไม่รวม completed/cancelled |
| `projects[].summary.progress` | completed / (total - cancelled) × 100; denominator 0 คืน 0 |
| `projects[].summary.hours` | TimeEntry hours รวม เป็น Decimal string |
| `page` | Pagination metadata; ไม่มีใน `options=work-items` response |
| `page.limit` | Page size ที่ใช้ |
| `page.nextCursor` | Cursor ต่อ หรือ `null` เมื่อหน้าสุดท้าย |
| `project` (POST) | Project object fields เหมือน `projects[]` โดยไม่มี wrapper `page` |

ใน `GET ?options=work-items`, `projects` เป็น array ที่แต่ละ item มีเฉพาะ `id` (Project ID), `name` (Project name), และ `colorProject` (สีหรือ `null`); response นี้ไม่มี `page`.

```jsonc
{
  "projects": [{
    "id": "project-id", // primary key
    "name": "Website", // Project name
    "description": null, // Project detail
    "status": "Planning", // Project status
    "priority": "Medium", // Project priority
    "startDate": "2026-09-01", // วันเริ่ม
    "dueDate": "2026-12-31", // วันกำหนดเสร็จ
    "budget": null, // budget หรือ null
    "spent": "0", // spent หรือ null ตาม DB serialization
    "progress": 0, // completion percentage ที่คำนวณจาก WorkItem
    "colorProject": null, // สีหรือ null
    "createdAt": "2026-09-30T12:00:00.000+07:00", // createdAt ที่ serialize ด้วย +07:00
    "updatedAt": "2026-09-30T12:00:00.000+07:00", // updatedAt ที่ serialize ด้วย +07:00
    "creatorId": "owner-id", // User ผู้สร้าง
    "companyId": "company-id", // Company foreign key
    "company": { // Company relation
      "id": "company-id", // Company primary key
      "name": "Example", // ชื่อ Company
      "displayName": null // ชื่อแสดง หรือ null
    },
    "summary": {
      "statusCounts": {}, // จำนวนต่อ WorkItem status
      "roles": { "Developer": 0, "infra": 0, "SA": 0 }, // จำนวนต่อ role
      "total": 0, // WorkItem ทั้งหมด
      "completed": 0, // completed WorkItems
      "cancelled": 0, // cancelled WorkItems
      "open": 0, // WorkItems ที่ยังไม่ completed/cancelled
      "progress": 0, // derived completion percentage
      "hours": "0" // TimeEntry hours รวม
    }
  }],
  "page": { // pagination metadata
    "limit": 50, // ขนาดหน้าที่ใช้
    "nextCursor": null // cursor ต่อ หรือ null เมื่อหน้าสุดท้าย
  }
}
```

## Error Responses

| HTTP | Code/body | Cause |
| ---: | --- | --- |
| `400` | `VALIDATION_ERROR` | status/date/body/field/pagination ไม่ผ่าน validation, Company ไม่มี หรือ JSON เสีย |
| `401` | `OWNER_UNAUTHENTICATED` | middleware หรือ `getOwner()` ไม่ได้รับ owner proof ที่ถูกต้อง |
| `409` | `COMPANY_CONFLICT` | Company ถูกลบ/ใช้ไม่ได้ระหว่างการเขียน |
| `500` | `INTERNAL_ERROR` | DB operation ล้มเหลว |
| `503` | `DEPENDENCY_UNAVAILABLE` | resolve owner ไม่ได้ |

Error body ใช้ `{ "error": { "code", "message", "field?" } }`: `error` คือ object ข้อผิดพลาด, `code` คือรหัส error, `message` คือข้อความ, และ `field` เป็นชื่อ request field เมื่อ handler ระบุได้. `field` ไม่มีใน error ทุกกรณี; invalid pagination ส่ง `field: "cursor"` รวมถึงกรณี `limit` ผิด.

## Processing Flow

GET: gate → resolve owner → parse filters/cursor → query Project/Company → aggregate WorkItem/TimeEntry → serialize. POST: gate → resolve owner → validate allow-list/date range → verify Company → insert Project with `creatorId` → query summary for response.

## Verification

- `pnpm test:company-projects`; Project tests also run under `pnpm test:auth` for owner flows.
- Invalid date/order, unknown fields, missing Company and invalid cursor should not create data.
- List cursor must be used with the same filter; check summary is derived from WorkItems/TimeEntries.
