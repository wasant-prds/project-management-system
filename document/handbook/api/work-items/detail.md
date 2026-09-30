# WorkItem detail

## Overview

อ่าน แก้ไข หรือลบ WorkItem ตาม ID. GET detail แสดง Company ผ่าน Project และ Daily Work (TimeEntry) ที่ผูกกับ WorkItem และ owner. PATCH ใช้ shared validation และรักษา Project/TimeEntry invariant.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| GET | /api/work-items/{id} | อ่าน WorkItem, Project/Company และ Daily Work ของ owner |
| PATCH | /api/work-items/{id} | แก้ fields ที่ส่งมา; ไม่เปลี่ยน owner |
| DELETE | /api/work-items/{id} | ลบได้เมื่อไม่มี Daily Work อ้างถึง |

## สิทธิ์ที่มองเห็น

ต้องผ่าน owner gate, middleware proof และ getOwner(). GET/PATCH จำกัด WorkItem ด้วย owner assigneeId; DELETE จำกัดการลบด้วย id และ assigneeId. Resource ของ owner อื่นแสดงเป็น 404. User.role และ WorkItem.role ไม่ใช่ permission; ดู [Owner access](../../../handbook/operations/owner-access.md).

## ดึงข้อมูลจากตารางไหน

| Table | Operation | เหตุผล |
| --- | --- | --- |
| User | Read | resolve owner และเติม assignee relation |
| work_items | Read/Update/Delete | record หลักที่ scope ด้วย owner |
| Project | Read | relation response และตรวจ Project ใหม่ตอน PATCH |
| Company | Read | relation response ผ่าน Project |
| TimeEntry | Read | detail อ่าน Daily Work; PATCH ตรวจประวัติก่อนย้าย Project; DELETE ป้องกันการลบ history |

## Request

### Path parameter

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| id | string | Yes | WorkItem ID |

GET และ DELETE ไม่มี query/body.

### PATCH body

ส่งเฉพาะ fields ที่ต้องการแก้. Field ที่ละไว้คงค่าเดิม.

| Field | Type | Required | Validation / behavior |
| --- | --- | --- | --- |
| title | string | No | เมื่อส่งต้อง trim แล้วไม่ว่าง |
| description | string or null | No | เมื่อส่งต้องเป็น string/null; empty string กลายเป็น null |
| kind | enum | No | Incident, Issue หรือ Task |
| status | enum | No | backlog, todo, in-progress, blocked, sa-testing, pm-testing, completed, cancelled; รับ Prisma underscore form และ response ใช้ hyphen |
| priority | enum | No | none, low, medium, high, urgent |
| role | enum, null or empty string | No | Developer, infra, SA; null/empty ล้างค่า |
| types | string array or null | No | ค่าต้องอยู่ใน WorkItem type list; null กลายเป็น [] และค่าซ้ำถูกตัด |
| workDate | YYYY-MM-DD, null or empty string | No | valid Bangkok calendar date; null/empty ล้างค่า |
| dueDate | YYYY-MM-DD, null or empty string | No | valid Bangkok calendar date; null/empty ล้างค่า |
| projectId | string | No | ต้องไม่ว่าง; เมื่อเปลี่ยน Project จะตรวจ Project และ TimeEntry ใน transaction |
| assigneeId | string | No | ถ้าส่งต้องเท่ากับ owner ID; ไม่สามารถเปลี่ยน owner |
| id | any | No | ไม่อนุญาตให้เปลี่ยน identity; ถ้ามี key นี้จะตอบ 400 |

Unknown fields ไม่ได้ถูกนำไป update. ตัวอย่าง:

    {
      "status": "in-progress",
      "priority": "high",
      "dueDate": "2026-10-02"
    }

Project ที่เปลี่ยนได้ต้องมีอยู่จริงและ WorkItem ต้องไม่มี TimeEntry ผูกอยู่; ถ้ามี Daily Work จะตอบ 409 RELATION_MISMATCH และไม่ย้าย WorkItem เพื่อให้ Project ของ history ตรงกัน.

## Response

GET และ PATCH ตอบ HTTP 200 ด้วย {workItem}. PATCH response ไม่มี timeEntries; GET detail เท่านั้นที่ include timeEntries. DELETE ตอบ HTTP 200 ด้วย {message}.

| Response field | Description |
| --- | --- |
| workItem | WorkItem ที่อ่านหรือแก้ไข |
| workItem.id | Primary key |
| workItem.title | ชื่องาน |
| workItem.description | รายละเอียด หรือ null |
| workItem.kind | Incident, Issue หรือ Task |
| workItem.priority | none, low, medium, high, urgent |
| workItem.role | functional role หรือ null; ไม่ใช่ permission |
| workItem.status | สถานะ public แบบ hyphen |
| workItem.types | WorkItem types |
| workItem.workDate | Bangkok calendar date YYYY-MM-DD หรือ null |
| workItem.dueDate | Bangkok calendar date YYYY-MM-DD หรือ null |
| workItem.submittedAt | Bangkok wall-clock timestamp +07:00 หรือ null |
| workItem.createdAt | เวลาสร้าง Bangkok wall-clock +07:00 |
| workItem.updatedAt | เวลาแก้ล่าสุด Bangkok wall-clock +07:00 |
| workItem.projectId | Foreign key ของ Project |
| workItem.assigneeId | Foreign key ของ owner User |
| workItem.assignee | Owner relation |
| workItem.assignee.id | Primary key ของ owner |
| workItem.assignee.name | ชื่อ owner |
| workItem.assignee.email | Email owner |
| workItem.assignee.avatar | Avatar URL หรือ null |
| workItem.project | Project relation |
| workItem.project.id | Primary key ของ Project |
| workItem.project.name | ชื่อ Project |
| workItem.project.colorProject | สี Project หรือ null |
| workItem.project.company | Company ของ Project |
| workItem.project.company.id | Primary key ของ Company |
| workItem.project.company.name | ชื่อ Company |
| workItem.project.company.displayName | ชื่อแสดง Company หรือ null |
| workItem.timeEntries | Array ของ Daily Work; มีเฉพาะ GET detail |
| workItem.timeEntries[].id | Primary key ของ TimeEntry |
| workItem.timeEntries[].date | Bangkok calendar date YYYY-MM-DD |
| workItem.timeEntries[].hours | Decimal ชั่วโมงที่ serialize เป็น string |
| workItem.timeEntries[].description | รายละเอียด Daily Work หรือ null |
| workItem.timeEntries[].remarks | หมายเหตุ Daily Work หรือ null |
| message | ข้อความยืนยันเมื่อลบ WorkItem สำเร็จ |

GET detail response example:

    {
      "workItem": {
        "id": "work-item-id", // Primary key ของ WorkItem
        "title": "Review login", // ชื่องาน
        "description": null, // รายละเอียดหรือ null
        "kind": "Issue", // WorkItem kind
        "priority": "high", // WorkItem priority
        "role": "Developer", // functional role หรือ null
        "status": "in-progress", // public status แบบ hyphen
        "types": ["bug"], // WorkItem types
        "workDate": "2026-09-30", // Bangkok calendar date หรือ null
        "dueDate": "2026-10-02", // Bangkok calendar date หรือ null
        "submittedAt": null, // Bangkok wall-clock timestamp +07:00 หรือ null
        "createdAt": "2026-09-29T10:00:00.000+07:00", // เวลาสร้าง Bangkok
        "updatedAt": "2026-09-30T12:00:00.000+07:00", // เวลาแก้ล่าสุด Bangkok
        "projectId": "project-id", // Project foreign key
        "assigneeId": "owner-id", // Owner foreign key
        "assignee": {
          "id": "owner-id", // User primary key
          "name": "Owner", // ชื่อ owner
          "email": "owner@example.invalid", // Email owner
          "avatar": null // Avatar URL หรือ null
        },
        "project": {
          "id": "project-id", // Project primary key
          "name": "Website", // ชื่อ Project
          "colorProject": null, // สี Project หรือ null
          "company": {
            "id": "company-id", // Company primary key
            "name": "Example Company", // ชื่อ Company
            "displayName": null // ชื่อแสดง Company หรือ null
          }
        },
        "timeEntries": [
          {
            "id": "time-entry-id", // TimeEntry primary key
            "date": "2026-09-30", // Bangkok calendar date
            "hours": "1.5", // Decimal ชั่วโมง string
            "description": "Code review", // รายละเอียดหรือ null
            "remarks": null // หมายเหตุหรือ null
          }
        ]
      }
    }

TimeEntry list จำกัดเฉพาะ owner เรียง date ใหม่ไปเก่าแล้ว id ใหม่ไปเก่า. WorkItem dates serialize เป็น date-only values; timestamps ใช้ Bangkok wall-clock values และ +07:00. Stored timestamps are not converted to UTC.

## Error Responses

| HTTP | Response | Cause |
| ---: | --- | --- |
| 400 | error.code = VALIDATION_ERROR | invalid JSON, title, enum, date, role, types, assigneeId หรือ Project input |
| 401 | error.code = OWNER_UNAUTHENTICATED | ยังไม่ผ่าน owner gate |
| 403 | error.code = ACCESS_DENIED | Origin ของ request ไม่ตรง APP_ORIGIN |
| 404 | error.code = NOT_FOUND | WorkItem ไม่มี/ไม่ใช่ของ owner หรือ Project ที่ระบุไม่มี |
| 409 | error.code = RELATION_MISMATCH, field = projectId | มี Daily Work ผูกอยู่ จึงย้าย Project ไม่ได้ |
| 409 | error.code = HISTORY_CONFLICT | มี Daily Work ผูกอยู่ จึงลบ WorkItem ไม่ได้ |
| 500 | error.code = INTERNAL_ERROR | database/server error; รายละเอียดถูกซ่อนไว้ |
| 503 | error.code = DEPENDENCY_UNAVAILABLE | resolve owner User ให้ได้หนึ่งรายการไม่ได้ |

## Processing Flow

GET: resolve owner → query id + assigneeId → include Company และ owner-scoped TimeEntry → serialize status/date/timestamp.

PATCH: parse JSON → shared partial parser → serializable transaction และ lock WorkItem → ตรวจ record ของ owner → ตรวจ Project ใหม่และ count TimeEntry เมื่อจะย้าย → update record และ submittedAt เมื่อจำเป็น. Database TimeEntry.workItem foreign key ใช้ Restrict เป็น race-condition guard.

DELETE: resolve owner → ตรวจ WorkItem ของ owner → ตรวจ TimeEntry → ลบเฉพาะเมื่อไม่มี history; database Restrict คุ้มกันช่วง race ก่อนลบ. History conflict ไม่ลบ WorkItem หรือ TimeEntry.

## Verification

ใช้ Project และ WorkItem ใน test database เท่านั้น.

- pnpm test:work-items — detail Company/Daily Work, partial update, Project move conflict, delete guard และ owner scoping.
- pnpm test:auth — owner gate และ API access.
- pnpm test — regression suite.
- pnpm lint และ pnpm typecheck — static checks.

ตรวจ GET ของ ID ที่ไม่มีหรือเป็นของ owner อื่นได้ 404; PATCH enum/date/assignee ที่ไม่ถูกต้องต้องไม่เขียน; ย้าย Project ที่มี Daily Work และ DELETE ที่มี history ต้องตอบ 409 โดยไม่เปลี่ยน history.
