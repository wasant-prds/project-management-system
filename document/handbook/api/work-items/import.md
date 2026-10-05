# Bulk WorkItem import

## Overview

นำเข้า WorkItem จาก JSON ผ่าน API โดยตรวจและเขียนทีละแถว. ใช้ WorkItem และ Project จริงใน PMS; ไม่ใช่ GitLab integration. แถวที่ผิดหรือซ้ำมีผลลัพธ์แยกกัน และไม่ rollback แถวอื่นที่สำเร็จ.

| Method | Endpoint | Success status |
| --- | --- | --- |
| POST | /api/work-items/import | 200 |

## สิทธิ์ที่มองเห็น

ต้องผ่าน HTTP Basic owner gate, middleware proof และ getOwner(). assigneeId ที่บันทึกมาจาก owner User ที่ server resolve; client ไม่สามารถเปลี่ยน owner ได้. ดู [Owner access](../../../handbook/operations/owner-access.md).

## ดึงข้อมูลจากตารางไหน

| Table | Operation | เหตุผล |
| --- | --- | --- |
| User | Read | resolve owner และกำหนด assigneeId |
| Project | Read | ตรวจ Project ต่อแถว |
| work_items | Read/Insert | ตรวจ id ซ้ำและสร้าง WorkItem ของแต่ละแถว |

แต่ละแถวทำ Project lookup, ตรวจ id ถ้ามี และ create แยกกัน; ไม่มี transaction ครอบทั้ง array. Failure ของ lookup/create ภายในแถวจะถูกแปลงเป็นผล failed ของแถวนั้นและทำแถวถัดไปต่อ.

## Request

Body รองรับ JSON array ที่ไม่ว่าง หรือ object ที่มี workItems เป็น array ที่ไม่ว่าง. แต่ละ row ใช้ validation และ fields เดียวกับ [WorkItem create](./collection.md#post-body).

| Field | Type | Required | Validation / behavior |
| --- | --- | --- | --- |
| title | string | Yes | trim แล้วต้องไม่ว่าง |
| projectId | string | Yes | public UUIDv4 ของ Project หรือ legacy nonnumeric source ID ที่มี exact live mapping |
| kind | enum | Yes | Incident, Issue หรือ Task |
| status | enum | No | default backlog; sa-testing/completed ประทับ submittedAt |
| priority | enum | No | default none |
| role | enum, null or empty string | No | Developer, infra, SA หรือ null |
| types | string array or null | No | ใช้ allowed WorkItem type list; null/duplicates normalize เป็น []/unique list |
| description | string or null | No | empty/null กลายเป็น null |
| workDate, dueDate | YYYY-MM-DD, null or empty string | No | valid Bangkok calendar date; null/empty กลายเป็น null |
| id | non-empty string | No | public UUIDv4 ที่คงไว้ หรือ legacy nonnumeric source ID ที่มี exact live mapping; duplicate public identity จะ skip โดยไม่แก้ record เดิม |
| assigneeId | string, null or empty string | No | ถ้าเป็น string ต้องตรง owner public UUIDv4; ค่าเขียนจริงมาจาก server |

Unknown fields ไม่ได้ถูกนำไปบันทึก.

    [
      {
        "id": "import-row-1",
        "title": "Fix login",
        "projectId": "project-id",
        "kind": "Issue",
        "status": "todo",
        "priority": "high",
        "types": ["bug"]
      }
    ]

Import เป็น exception สำหรับ identity ที่ผ่านการตรวจ: `id` ที่เป็น canonical public UUIDv4 จะถูกใช้ซ้ำเพื่อให้ retry คง public identity; legacy nonnumeric source ID ใช้ได้ต่อเมื่อ resolve ได้แบบ exact จาก live identity map ซึ่ง default อยู่ที่ `database/live-identity/mappings.json` หรือกำหนด path ผ่าน `OWNER_IDENTITY_MAP`. Numeric internal IDs และ legacy IDs ที่ไม่มี mapping ถูกปฏิเสธ. หากละ `id`, database จะสร้าง UUIDv4 ใหม่ ดังนั้น retry แถวนั้นอาจสร้าง record ซ้ำ.

## Response

เมื่อ envelope ถูกต้อง API ตอบ HTTP 200 แม้มีบาง row failed หรือ skipped.

| Response field | Description |
| --- | --- |
| imported | จำนวนแถวที่สร้างสำเร็จ |
| rows | ผลลัพธ์ต่อแถว เรียงตาม request |
| rows[].row | ลำดับแถวเริ่มจาก 1 |
| rows[].outcome | created, skipped หรือ failed |
| rows[].workItemId | WorkItem public UUIDv4; มีเมื่อมี record สร้างหรือ duplicate ที่มีอยู่แล้ว |
| rows[].error | เหตุผลของ skipped/failed; optional |
| rows[].error.code | VALIDATION_ERROR, NOT_FOUND, DUPLICATE หรือ IMPORT_FAILED |
| rows[].error.message | สาเหตุแบบปลอดภัยสำหรับแสดงผู้ใช้ |
| rows[].error.field | field ที่ผิด เช่น projectId; optional |

Example ที่มีหนึ่งแถวสร้างสำเร็จ, หนึ่งแถว ID ซ้ำ และหนึ่งแถว Project ไม่มี:

    {
      "imported": 1, // จำนวน WorkItem ที่สร้าง
      "rows": [
        {
          "row": 1, // ลำดับใน request
          "outcome": "created", // แถวนี้สร้างสำเร็จ
          "workItemId": "work-item-id" // public UUIDv4 ของ WorkItem ใน PMS
        },
        {
          "row": 2, // ลำดับใน request
          "outcome": "skipped", // ไม่แก้ existing WorkItem
          "error": {
            "code": "DUPLICATE", // ID ซ้ำ
            "message": "Work Item ID already exists; existing data was left unchanged." // ข้อความผลลัพธ์
          }
        },
        {
          "row": 3, // ลำดับใน request
          "outcome": "failed", // Project ไม่พบ
          "error": {
            "code": "NOT_FOUND", // ไม่พบ relation ที่อ้าง
            "message": "Project not found", // สาเหตุ
            "field": "projectId" // field ที่อ้างถึง Project
          }
        }
      ]
    }

row error field เป็น optional; validation ที่ parser รายงานเป็นข้อความรวมจะไม่มี field.

## Error Responses

| HTTP | Response | Cause |
| ---: | --- | --- |
| 400 | error.code = VALIDATION_ERROR | JSON เสีย, body ไม่ใช่ array/envelope ที่รองรับ หรือ array ว่าง |
| 401 | error.code = OWNER_UNAUTHENTICATED | ยังไม่ผ่าน owner gate |
| 403 | error.code = ACCESS_DENIED | Origin ของ request ไม่ตรง APP_ORIGIN |
| 500 | error.code = INTERNAL_ERROR | failure นอกขอบเขตประมวลผลรายแถว |
| 503 | error.code = DEPENDENCY_UNAVAILABLE | resolve owner User ให้ได้หนึ่งรายการไม่ได้ |

เมื่อ envelope ผ่านแล้ว Project missing, validation error, duplicate ID และ row-level lookup/write failure อยู่ใน rows[] พร้อม HTTP 200; Project missing มี code NOT_FOUND, duplicate เป็น skipped/DUPLICATE, และ unexpected per-row database error เป็น failed/IMPORT_FAILED. API ทำต่อจนจบแถวที่รับมา.

## Processing Flow

owner gate → resolve owner → parse JSON/envelope → วนทุก row ตามลำดับ → shared parser และบังคับ owner → ตรวจ Project → ตรวจ duplicate ID ถ้าส่งมา → create WorkItem และ submittedAt → เก็บผลแถว → ส่ง imported และ rows.

Import เป็น partial-success operation. ห้ามสมมติว่า failed หนึ่งแถว rollback แถวก่อนหน้า; ใช้ UUIDv4 หรือ source reference ที่มี durable mapping สำหรับ retry-safe rows. Public UUID ในผลลัพธ์เป็น local PMS identity; legacy source IDs ใช้เพียง lookup ผ่าน mapping และไม่ถูกส่งกลับแทน UUID.

## Verification

ใช้ disposable test database และ Project ID จาก fixture เท่านั้น.

- pnpm test:work-items — valid/invalid rows, Project FK race, Project/duplicate-ID lookup failure และ importable JSON export.
- pnpm test:auth — owner access และ import endpoint.
- pnpm test — regression suite.

Negative cases: JSON ไม่ถูกต้อง, envelope ว่าง, invalid enum/date, foreign assigneeId, missing Project, duplicate ID และ row lookup failure. ยืนยันว่าผล rows[] ครบตาม input และแถวอื่นยังถูกประมวลผล.
