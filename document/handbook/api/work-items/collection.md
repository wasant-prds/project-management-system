# WorkItem collection

## Overview

Collection API สำหรับอ่านรายการ WorkItem แบบแบ่งหน้าและสร้าง WorkItem ใหม่ WorkItem เป็น record กลางที่เมนู Work Items, Board, Projects, Dashboard และ Analysis ใช้ร่วมกัน Project และ Company ใน response มาจาก relation จริง.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | /api/work-items | อ่านรายการตาม owner, period, filters และ cursor page พร้อม summary |
| POST | /api/work-items | ตรวจ input และ Project ก่อนสร้าง WorkItem ของ owner |

หน้า Work Items สร้าง CSV, Markdown และ JSON ใน browser โดยอ่าน GET ทีละหน้า ไม่มี export API แยก ดู [WorkItem import](./import.md).

## สิทธิ์ที่มองเห็น

ต้องผ่าน HTTP Basic owner gate, middleware proof และ getOwner() ซึ่ง resolve User เพียงหนึ่งรายการ ไม่ใช้ User.role หรือ WorkItem.role เป็น permission; role เป็น functional role ของงานเท่านั้น ทุก list และ create ผูก assigneeId กับ owner ที่ server resolve ได้ ดู [Owner access](../../../handbook/operations/owner-access.md).

## ดึงข้อมูลจากตารางไหน

| Table | Operation | เหตุผล |
| --- | --- | --- |
| User | Read | resolve owner และคืน assignee relation |
| work_items | Read/Insert | อ่านหรือสร้าง WorkItem canonical record |
| Project | Read | ตรวจ Project ตอนสร้าง, filter/list และเติม Project relation |
| Company | Read | เติม Company relation ของ Project ใน response |

GET summary คำนวณจาก WorkItem ที่ตรงกับ owner และ filters เดียวกัน ไม่รวม TimeEntry. Daily Work ที่ผูกกับ WorkItem แสดงใน detail API.

## Request

### GET query parameters

ทุก query parameter เป็น optional.

| Parameter | Type | Validation / behavior |
| --- | --- | --- |
| projectId | string | จำกัดรายการตาม Project ID; ID ที่ไม่มีผลเป็นรายการว่าง |
| companyId | string | จำกัดตาม Company ของ Project |
| assigneeId | string | Compatibility filter; หากส่งต้องเท่ากับ owner ID |
| kind | enum | Incident, Issue หรือ Task |
| status | enum | backlog, todo, in-progress, blocked, sa-testing, pm-testing, completed หรือ cancelled; parser รับ Prisma underscore form ด้วย |
| priority | enum | none, low, medium, high หรือ urgent |
| role | enum or none | Developer, infra หรือ SA; none กรอง WorkItem ที่ไม่มี role |
| year | YYYY or all | default เป็นปีปัจจุบันตาม Asia/Bangkok; all รวมทุกปี |
| month | 1–12 or all | default all |
| search | string | trim ก่อนค้น title, description, Project name, Company name/displayName, assignee name และ kind/status/priority/role/types |
| limit | integer | default 50; ช่วง 1–200 |
| cursor | opaque string | cursor จาก response ก่อนหน้า; ใช้กับ filters ชุดเดิม มิฉะนั้นตอบ validation error |
| includeYears | text boolean | ค่า true ขอปีสำหรับ dropdown; year=all กับ month เฉพาะเดือนจะคืน years ให้อัตโนมัติ |

ตัวกรองปี/เดือนเลือก date anchor ตามลำดับ: workDate เมื่อมีค่า, มิฉะนั้น dueDate, มิฉะนั้น createdAt. รายการเรียง createdAt ใหม่ไปเก่า แล้วเรียง id ใหม่ไปเก่าเพื่อให้ cursor คงที่.

    curl -u "$OWNER_GATE_USERNAME:$OWNER_GATE_PASSWORD" "$APP_ORIGIN/api/work-items?year=2026&month=9&status=in-progress&limit=50&includeYears=true"

### POST body

| Field | Type | Required | Validation / behavior |
| --- | --- | --- | --- |
| title | string | Yes | trim แล้วต้องไม่ว่าง |
| projectId | string | Yes | trim แล้วต้องเป็น Project ที่มีอยู่ |
| kind | enum | Yes | Incident, Issue หรือ Task |
| status | enum | No | default backlog; public response ใช้ hyphen; input รองรับ Prisma underscore form |
| priority | enum | No | default none; none, low, medium, high หรือ urgent |
| role | enum, null or empty string | No | Developer, infra, SA; null/empty กลายเป็น null |
| types | string array or null | No | default []; ยอมรับ bug, data, documentation, epic, feature, maintenance, opl, ops, support, task; null กลายเป็น [] และค่าซ้ำถูกตัด |
| description | string or null | No | trim; empty/null กลายเป็น null |
| workDate | YYYY-MM-DD, null or empty string | No | valid Bangkok calendar date; null/empty กลายเป็น null |
| dueDate | YYYY-MM-DD, null or empty string | No | valid Bangkok calendar date; null/empty กลายเป็น null |
| assigneeId | string, null or empty string | No | หากเป็น string ต้องตรง owner; ค่าบันทึกจริงมาจาก server |
| id | string | No | parser ตรวจค่า non-empty แต่ collection POST ลบทิ้งก่อน insert; ID ที่ส่งมาไม่ถูกใช้ |

Input ที่ไม่ระบุ id ใหม่จะได้ ID จาก Prisma. Parser ใช้เฉพาะ fields ที่ระบุในตาราง; unknown fields ไม่ถูกบันทึก.

    {
      "title": "Fix login",
      "projectId": "project-id",
      "kind": "Issue",
      "status": "todo",
      "priority": "high",
      "types": ["bug"],
      "workDate": "2026-09-30"
    }

## Response

GET ตอบ HTTP 200; POST ตอบ HTTP 201. WorkItem object ของ collection GET และ POST มี shape เดียวกัน. years จะถูกละไว้เมื่อไม่ได้ร้องขอ.

| Response field | Description |
| --- | --- |
| workItems | Array ของ WorkItem ที่ตรงกับ owner และ filters; GET เท่านั้น |
| workItems[].id | Primary key ของ WorkItem |
| workItems[].title | ชื่องาน |
| workItems[].description | รายละเอียดงาน หรือ null |
| workItems[].kind | Incident, Issue หรือ Task |
| workItems[].priority | none, low, medium, high หรือ urgent |
| workItems[].role | functional role Developer, infra, SA หรือ null; ไม่ใช่ permission |
| workItems[].status | สถานะ public; Prisma underscore ถูก serialize เป็น hyphen |
| workItems[].types | รายการ WorkItem types |
| workItems[].workDate | Bangkok calendar date YYYY-MM-DD หรือ null |
| workItems[].dueDate | Bangkok calendar date YYYY-MM-DD หรือ null |
| workItems[].submittedAt | Bangkok wall-clock timestamp ที่มี offset +07:00 หรือ null |
| workItems[].createdAt | เวลาสร้าง Bangkok wall-clock พร้อม offset +07:00 |
| workItems[].updatedAt | เวลาแก้ไขล่าสุด Bangkok wall-clock พร้อม offset +07:00 |
| workItems[].projectId | Foreign key ของ Project |
| workItems[].assigneeId | Foreign key ของ owner User |
| workItems[].assignee | Owner User relation |
| workItems[].assignee.id | Primary key ของ owner |
| workItems[].assignee.name | ชื่อ owner |
| workItems[].assignee.email | Email owner |
| workItems[].assignee.avatar | Avatar URL หรือ null |
| workItems[].project | Project relation |
| workItems[].project.id | Primary key ของ Project |
| workItems[].project.name | ชื่อ Project |
| workItems[].project.colorProject | สี Project หรือ null |
| workItems[].project.company | Company relation ของ Project |
| workItems[].project.company.id | Primary key ของ Company |
| workItems[].project.company.name | ชื่อ Company |
| workItems[].project.company.displayName | ชื่อแสดง Company หรือ null |
| workItem | WorkItem object ที่เพิ่งสร้าง; POST เท่านั้น ใช้ fields รูปแบบเดียวกับ workItems[] |
| page | ข้อมูล cursor pagination; GET เท่านั้น |
| page.limit | จำนวนสูงสุดที่ขอในหน้านี้ |
| page.nextCursor | Cursor สำหรับหน้าถัดไป หรือ null เมื่อไม่มีหน้าเพิ่ม |
| summary | จำนวน WorkItem ที่ตรงกับ filters ทั้งหมด ไม่จำกัดเฉพาะรายการในหน้านี้ |
| summary.total | จำนวนทั้งหมดทุกสถานะ รวม cancelled |
| summary.inProgress | จำนวนสถานะ in-progress |
| summary.completed | จำนวนสถานะ completed เท่านั้น ไม่รวม cancelled |
| summary.overdue | จำนวนที่ dueDate ก่อนวันนี้ใน Asia/Bangkok และสถานะไม่ใช่ completed/cancelled |
| summary.kinds | จำนวนแยกตาม WorkItem kind |
| summary.kinds.Incident | จำนวน Incident |
| summary.kinds.Issue | จำนวน Issue |
| summary.kinds.Task | จำนวน Task |
| years | Array ของปีเป็น string จาก WorkItem ของ owner; มีเมื่อ includeYears=true หรือ year=all และ month เป็นเดือนเฉพาะ |

GET response example:

    {
      "workItems": [], // รายการ WorkItem หน้านี้
      "page": {
        "limit": 50, // ขนาดหน้าที่ใช้
        "nextCursor": null // ไม่มีหน้าถัดไป
      },
      "summary": {
        "total": 0, // จำนวน WorkItem ที่ตรง filters
        "inProgress": 0, // จำนวน in-progress
        "completed": 0, // จำนวน completed ไม่รวม cancelled
        "overdue": 0, // จำนวน overdue ที่ยังไม่เสร็จ/ยกเลิก
        "kinds": {
          "Incident": 0, // จำนวน Incident
          "Issue": 0, // จำนวน Issue
          "Task": 0 // จำนวน Task
        }
      },
      "years": ["2026"] // ปีที่ owner มี WorkItem
    }

Collection ไม่คืน timeEntries; อ่าน Company และ Daily Work ที่ผูกอยู่ผ่าน [WorkItem detail](./detail.md). submittedAt ถูกประทับตอนสร้างเมื่อ status เป็น sa-testing หรือ completed.

## Error Responses

| HTTP | Response | Cause |
| ---: | --- | --- |
| 400 | error.code = VALIDATION_ERROR | query year/month/limit/cursor หรือ enum/filter ไม่ถูกต้อง; POST body/date/type/assignee ไม่ผ่าน shared validation |
| 401 | error.code = OWNER_UNAUTHENTICATED | ยังไม่ผ่าน owner gate |
| 403 | error.code = ACCESS_DENIED | Origin ของ request ไม่ตรง APP_ORIGIN |
| 404 | error.code = NOT_FOUND, field = projectId | Project ที่ส่งตอน POST ไม่มีอยู่ |
| 500 | error.code = INTERNAL_ERROR | database หรือ server failure; message ไม่เปิดเผย exception |
| 503 | error.code = DEPENDENCY_UNAVAILABLE | resolve owner User ให้ได้หนึ่งรายการไม่ได้ |

Error envelope มี error.code และ error.message; field เป็น optional และบอก input ที่ผิด.

## Processing Flow

GET: owner gate → resolve owner → validate filters/cursor → compose Project/Company/search/period predicates → query limit+1 rows และ summary → serialize public enums, dates, timestamps.

POST: owner gate → resolve owner → shared parser → check Project → create WorkItem ด้วย owner assigneeId → stamp submittedAt ตาม status → serialize response.

UI export โหลด GET pages ต่อเนื่องด้วย limit=200 และ cursor จน nextCursor เป็น null จากนั้นสร้าง CSV, Markdown หรือ JSON ใน browser. Kind tab และ sort ใช้กับผล export; JSON เป็น array ที่ import endpoint รับได้และมี id, Project ID และ fields สำหรับสร้าง WorkItem. ไม่มี export Route Handler แยก.

## Verification

ใช้ owner gate ของ test environment และ Project ที่มีอยู่ ห้ามใส่ credentials จริงลงเอกสารหรือ shell history.

- pnpm test:work-items — filters, cursor pages, summary, Company relation, validation, history guard, import/export behavior.
- pnpm test:auth — owner access และ API behavior ที่ผูกกับ owner.
- pnpm test — regression suite ทั้ง repository.
- pnpm lint และ pnpm typecheck — static checks.

Negative cases: limit นอก 1–200, cursor จาก filter ชุดอื่น, invalid enum/date, foreign assigneeId และ Project ที่ไม่มีต้องไม่สร้าง WorkItem.
