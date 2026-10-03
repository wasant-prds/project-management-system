# Dashboard Summary

## Overview

| รายการ | ค่า |
| --- | --- |
| Purpose | อ่าน KPI, WorkItems, Projects และชั่วโมงที่บันทึกของ owner ตามช่วงวันที่และ filters |
| HTTP Method | `GET` |
| Endpoint | `/api/dashboard/summary` |
| การเขียนข้อมูล | ไม่มี; คำนวณจากข้อมูลปัจจุบันทุก request |

Contract: `GET /api/dashboard/summary`.

Dashboard ใช้ `lib/dashboard.ts` คำนวณข้อมูลชุดเดียวกับหน้า `/`. API ตอบ `Cache-Control: no-store` ทั้ง success และ error. วันที่และขอบเขตวันใช้ `Asia/Bangkok`; timestamp ใน response serialize เป็น Bangkok local wall-clock พร้อม offset `+07:00` โดยไม่แปลงค่าที่บันทึกเป็น UTC.

## สิทธิ์ที่มองเห็น

- ต้องผ่าน owner access gate ด้วย HTTP Basic credentials ที่ provision ไว้. Request ที่ส่ง `Origin` ต้องใช้ origin ที่ตรงกับ `APP_ORIGIN`.
- Middleware ตรวจ internal proof และ Handler เรียก `getOwner()` เพื่อ resolve owner `User` หนึ่งรายการ. ถ้าไม่มี proof จะตอบ `401`; ถ้า resolve `User` ได้ไม่เท่ากับหนึ่งรายการจะตอบ `503`.
- API นี้ไม่มี Required Role หรือ Required Permission เพิ่มเติม. `Developer`, `infra` และ `SA` เป็น functional role ของ WorkItem สำหรับ filter ไม่ใช่สิทธิ์ API.
- Client ไม่สามารถเลือก owner ผ่าน query parameter; WorkItems และ TimeEntries ถูกกรองด้วย owner ที่ resolve ฝั่ง server.
- รายละเอียด HTTP Basic, middleware proof และ owner resolution: [Owner access gate](../../operations/owner-access.md).

## ดึงข้อมูลจากตารางไหน

ทุกตารางด้านล่างเป็นการอ่านเท่านั้น; API นี้ไม่มี `INSERT`, `UPDATE` หรือ `DELETE` และไม่มี transaction สำหรับเขียนข้อมูล.

| Prisma model / PostgreSQL table | การใช้งาน | R / I / U / D |
| --- | --- | --- |
| `User` / `User` | `getOwner()` resolve owner หนึ่งแถวก่อนคำนวณ; select เฉพาะ identity/profile fields และไม่ select password | R / – / – / – |
| `Company` / `Company` | ตรวจ `companyId`, สร้าง Company filter options และอ่าน Company relation ของ Project ในรายการ | R / – / – / – |
| `Project` / `Project` | ตรวจ `projectId`, สร้าง Project filter options, อ่าน recent Projects และ Company relation | R / – / – / – |
| `WorkItem` / `work_items` | นับ/เลือก WorkItems และ group status เพื่อคำนวณ KPI, preview และ progress; จำกัด WorkItem ด้วย `assigneeId` ของ owner | R / – / – / – |
| `TimeEntry` / `TimeEntry` | รวม `hours` และ group ตาม `date`; จำกัดแถวด้วย `userId` ของ owner และ filters ที่สัมพันธ์กับ WorkItem/Project เมื่อระบุ | R / – / – / – |

Schema ปัจจุบันกำหนด `Project.companyId` เป็น required; serializer ของ Dashboard ระบุ Company relation เป็น nullable จึงอาจส่ง `null` หาก relation ที่อ่านได้ไม่มีค่า. สภาพข้อมูลและ constraints ของ database แต่ละ environment **ไม่พบข้อมูลที่ยืนยันได้จาก implementation ปัจจุบัน**. ดู [Database data model](../../database/data-model.md).

## Request

### Path และ body

- Path parameters: ไม่มี.
- Request body: ไม่มี (`GET`).

### Headers

| Header | Required | คำอธิบาย |
| --- | --- | --- |
| `Authorization` | Required ที่ runtime owner gate | ส่ง HTTP Basic credentials ที่ provision ไว้; ห้ามส่ง credential จริงในเอกสารหรือ shell history. |
| `Origin` | Optional | หากส่งมา ต้องตรงกับ `APP_ORIGIN`; origin ไม่ตรงถูกปฏิเสธด้วย `403 ACCESS_DENIED` ที่ owner gate. |

ไม่ต้องส่ง `x-pms-owner-proof` จาก client; middleware/runtime เป็นผู้จัดการ internal proof.

### Query parameters

ทุก parameter เป็น optional. หากไม่ส่ง `startDate` และ `endDate` ระบบใช้เดือนปัจจุบันเต็มเดือนตาม `Asia/Bangkok`.

Period filters: `startDate`, `endDate`.

| Name | Type | Required | Validation / behavior |
| --- | --- | --- | --- |
| `startDate` | string (`YYYY-MM-DD`) | Optional; ต้องส่งคู่กับ `endDate` | วันเริ่มต้นแบบ Bangkok calendar date; ต้องเป็นวันที่มีอยู่จริงและไม่อยู่หลัง `endDate`. รวมวันเริ่มในการคำนวณ. |
| `endDate` | string (`YYYY-MM-DD`) | Optional; ต้องส่งคู่กับ `startDate` | วันสิ้นสุดแบบ Bangkok calendar date; ต้องเป็นวันที่มีอยู่จริงและไม่น้อยกว่า `startDate`. รวมวันสิ้นสุดในการคำนวณ. |
| `companyId` | string | Optional | จำกัด WorkItems, TimeEntries ที่สัมพันธ์กับ WorkItem ใน Company นี้ และรายการ Projects; ID ที่ไม่มีอยู่ตอบ `404`. ค่าว่างหรือ whitespace หมายถึงไม่กรอง. |
| `projectId` | string | Optional | จำกัด WorkItems, TimeEntries ที่สัมพันธ์กับ WorkItem ใน Project นี้ และรายการ Projects; ID ที่ไม่มีอยู่ตอบ `404`. ค่าว่างหรือ whitespace หมายถึงไม่กรอง. |
| `role` | `Developer`, `infra`, `SA`, `none` | Optional | จำกัด WorkItem functional role; `none` เลือก WorkItem ที่ `role` เป็น `null`. ค่าว่างหรือ whitespace หมายถึงไม่กรอง; ค่าอื่นตอบ `400`. |
| `kind` | `Incident \| Issue \| Task` | Optional | จำกัด WorkItem kind. ค่าว่างหรือ whitespace หมายถึงไม่กรอง; ค่าอื่นตอบ `400`. |

`companyId` และ `projectId` ที่ส่งพร้อมกันต้องอ้างความสัมพันธ์ที่ตรงกัน; หาก Project ไม่ได้อยู่ใน Company ที่เลือกจะตอบ `400 RELATION_MISMATCH`. เมื่อ filter มีผลกับ TimeEntry จะใช้ relation `TimeEntry → WorkItem → Project → Company`; หากไม่ส่ง relation filters, TimeEntry ของ owner ที่อยู่ในช่วงวันยังถูกรวมได้.

ตัวอย่าง request (ใช้ owner credentials จาก environment ที่ได้รับอนุญาต):

```bash
curl -i -u "$OWNER_GATE_USERNAME:$OWNER_GATE_PASSWORD" \
  "$APP_ORIGIN/api/dashboard/summary?startDate=2026-10-01&endDate=2026-10-31&companyId=company-id&role=Developer&kind=Task"
```

## Response

### Success — `200 OK`

ทุก field ในตัวอย่างมีคำอธิบายภาษาไทย. `recentWorkItems`, `urgentWorkItems` และ `overdueWorkItems` เป็น array ของ WorkItem shape เดียวกัน; API จำกัดแต่ละรายการไว้ไม่เกิน 5 แถว.

```jsonc
{
  "meta": { // เงื่อนไข, timezone และนิยาม metrics ที่ใช้สร้างผลลัพธ์
    "period": { // ช่วง Bangkok calendar dates ที่ใช้คำนวณ โดยรวมวันต้นและวันท้าย
      "startDate": "2026-10-01", // วันเริ่มต้นที่มีผล รูปแบบ YYYY-MM-DD
      "endDate": "2026-10-31" // วันสิ้นสุดที่มีผล รูปแบบ YYYY-MM-DD
    },
    "timezone": "Asia/Bangkok", // timezone สำหรับ date boundary และการจัดกลุ่มวัน
    "filters": { // filters หลัง normalize ค่าว่างเป็น null
      "companyId": null, // Company ID ที่กรอง หรือ null เมื่อไม่กรอง
      "projectId": null, // Project ID ที่กรอง หรือ null เมื่อไม่กรอง
      "role": null, // WorkItem role ที่กรอง หรือ null เมื่อไม่กรอง; ค่า none ใช้เลือก role ว่าง
      "kind": null // WorkItem kind ที่กรอง หรือ null เมื่อไม่กรอง
    },
    "metricDefinitions": { // สูตร/ความหมายของ metrics ซึ่งส่งเป็น string
      "total": "Owner WorkItems matching the selected date anchor and filters", // จำนวน WorkItems ของ owner ที่ตรงช่วงและ filters
      "open": "total - completed - cancelled", // จำนวนรายการที่ไม่ completed และไม่ cancelled
      "completed": "Owner WorkItems with status=completed", // จำนวนรายการที่ status เป็น completed
      "overdue": "dueDate before the current Asia/Bangkok date and status not in completed,cancelled", // รายการในชุดที่เลือกซึ่งเลยกำหนดและยังไม่ปิด
      "completionRate": "completed / (total - cancelled) * 100; zero denominator returns 0", // เปอร์เซ็นต์ความสำเร็จ; ตัวหารศูนย์คืน 0
      "loggedHours": "Exact SUM(TimeEntry.hours) for the owner and selected period/filters", // ผลรวม Decimal ของชั่วโมงในช่วงและ filters
      "workItemDateAnchor": "workDate ?? dueDate ?? createdAt", // ลำดับวันที่เลือกใช้จัด WorkItem เข้า report period
      "recentProjectProgress": "completed / (total - cancelled) across all owner WorkItems in the Project" // progress ของ owner ใน Project โดยไม่จำกัด report period
    },
    "metricVersion": "shared-work-v1" // version ของนิยาม metrics กลาง
  },
  "summary": { // KPI และ preview lists ที่คำนวณจากข้อมูลปัจจุบัน
    "total": 8, // จำนวน WorkItems ของ owner ที่ตรงกับ date anchor, period และ filters
    "open": 6, // total ลบ completed และ cancelled
    "completed": 1, // จำนวน WorkItems ที่ status เป็น completed ในชุดที่เลือก
    "overdue": 1, // จำนวน WorkItems ที่เลยกำหนดก่อนวันนี้ใน Bangkok และยังไม่ปิด
    "completionRate": 12.5, // completed / (total - cancelled) × 100; ตัวหารศูนย์ได้ 0
    "loggedHours": "5.25", // ผลรวม TimeEntry.hours แบบ Decimal string ไม่ปัดแต่ละแถวก่อนรวม
    "recentWorkItems": [ // WorkItem ล่าสุดเรียง updatedAt ใหม่ไปเก่า แล้ว ID ใหม่ไปเก่า; สูงสุด 5 รายการ
      {
        "id": "work-item-id", // WorkItem ID
        "title": "Review", // ชื่องาน
        "kind": "Task", // ชนิดงาน: Incident, Issue หรือ Task
        "priority": "high", // priority: none, low, medium, high หรือ urgent
        "role": "Developer", // functional role หรือ null เมื่อไม่ได้กำหนด
        "status": "in-progress", // public WorkItem status แบบ hyphenated
        "workDate": "2026-10-01", // Bangkok calendar date หรือ null
        "dueDate": "2026-10-05", // Bangkok calendar date หรือ null
        "createdAt": "2026-10-01T09:00:00.000+07:00", // เวลา create แบบ Bangkok wall-clock และ offset +07:00
        "updatedAt": "2026-10-01T09:00:00.000+07:00", // เวลา update แบบ Bangkok wall-clock และ offset +07:00
        "project": { // Project ที่ WorkItem สังกัด
          "id": "project-id", // Project ID
          "name": "Project One", // ชื่อ Project
          "company": { // Company ของ Project หรือ null หาก relation คืนค่าเป็น null
            "id": "company-id", // Company ID
            "name": "Company One", // ชื่อ Company
            "displayName": null // ชื่อแสดงผล หรือ null
          }
        }
      }
    ],
    "urgentWorkItems": [], // WorkItem shape เดียวกับ recentWorkItems; priority urgent, ยังไม่ completed/cancelled; dueDate เก่าก่อน, tie-break updatedAt/ID ใหม่ก่อน; สูงสุด 5 รายการ
    "overdueWorkItems": [], // WorkItem shape เดียวกับ recentWorkItems; dueDate ก่อนวันนี้ Bangkok และยังไม่ปิด; dueDate เก่าก่อนแล้ว ID เก่าก่อน; สูงสุด 5 รายการ
    "recentProjects": [ // Projects ล่าสุดตาม createdAt ใหม่ไปเก่า แล้ว ID ใหม่ไปเก่า; filters เฉพาะ Company/Project; สูงสุด 5 รายการ
      {
        "id": "project-id", // Project ID
        "name": "Project One", // ชื่อ Project
        "status": "In Progress", // สถานะ Project ปัจจุบัน
        "priority": "High", // priority Project ปัจจุบัน
        "dueDate": "2026-10-31", // Project due date แบบ Bangkok calendar date
        "createdAt": "2026-09-01T09:00:00.000+07:00", // เวลา create แบบ Bangkok wall-clock และ offset +07:00
        "company": null, // Company relation หรือ null หาก relation คืนค่าเป็น null
        "progress": 12.5 // completed / (total - cancelled) จาก owner WorkItems ทั้งหมดใน Project; ตัวหารศูนย์ได้ 0
      }
    ],
    "loggedHoursByDate": [ // TimeEntry hours รวมต่อวัน เรียง date จากเก่าไปใหม่; ไม่มี entry คือ array ว่าง
      {
        "date": "2026-10-01", // Bangkok calendar date ของ TimeEntry
        "hours": "5.25" // ผลรวม Decimal ของวันนั้นเป็น string
      }
    ]
  },
  "filterOptions": { // ข้อมูลสำหรับสร้าง Company และ Project filters
    "companies": [ // Company ทั้งหมด เรียง name แล้ว ID
      {
        "id": "company-id", // Company ID
        "name": "Company One", // ชื่อ Company
        "displayName": null // ชื่อแสดงผล หรือ null
      }
    ],
    "projects": [ // Projects ตาม Company/Project filters เรียง name แล้ว ID
      {
        "id": "project-id", // Project ID
        "name": "Project One", // ชื่อ Project
        "companyId": "company-id" // Company ID ที่ Project นี้อ้างถึง
      }
    ]
  }
}
```

รายละเอียดการคำนวณและการเรียง:

- WorkItem period anchor เลือก `workDate`, ถ้าไม่มีเลือก `dueDate`, ถ้าไม่มีทั้งคู่เลือก `createdAt`. วันที่เริ่ม/สิ้นสุดเป็น inclusive; query ใช้ขอบเขตเริ่มรวมและวันถัดจาก `endDate` แบบไม่รวม.
- `total`, `completed`, `open`, `overdue`, `completionRate` และ WorkItem preview ใช้ owner + period + filters. `overdue` ต้องมี `dueDate` ก่อน Bangkok วันนี้และ status ไม่ใช่ `completed`/`cancelled`.
- TimeEntry ใช้ `TimeEntry.date` อยู่ใน report period และ `userId` เป็น owner. Company/Project/role/kind filters ส่งผ่าน relation ไปยัง WorkItem/Project. `loggedHours` และ `loggedHoursByDate.hours` เป็น Decimal strings; grouping คืนเฉพาะวันที่มี TimeEntry.
- `recentWorkItems` เรียง `updatedAt` ใหม่ไปเก่า แล้ว ID ใหม่ไปเก่า; `urgentWorkItems` เลือก priority `urgent` ที่ยังเปิดและเรียง `dueDate` เก่าไปใหม่, `updatedAt` ใหม่ไปเก่า, ID ใหม่ไปเก่า; `overdueWorkItems` เรียง `dueDate` เก่าไปใหม่ แล้ว ID เก่าไปใหม่. ทั้งสามชุดมีไม่เกิน 5 รายการ.
- `recentProjects` และ `filterOptions.projects` ใช้ Company/Project filters; ไม่จำกัด report period หรือ WorkItem role/kind. `recentProjects.progress` รวม WorkItems ของ owner ใน Project ทั้งช่วงเวลาและทุก role/kind.
- `filterOptions.companies` แสดง Company ทั้งหมด เรียง `name` และ ID; projects เรียง `name` และ ID. Collections เป็น read-only projections.

### Error responses

ทุก error ใช้ envelope `{ "error": { "code", "message", "field?" } }`; `field` จะมีเมื่อ error ระบุ field. Response ไม่เปิดเผย raw database exception และใช้ `Cache-Control: no-store`.

| HTTP | Code | เงื่อนไข |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | ส่งวันที่ไม่ครบคู่, วันที่ผิดรูปแบบ/ไม่มีอยู่จริง, วันเริ่มหลังวันสิ้นสุด, หรือ `role`/`kind` ไม่อยู่ในค่าที่รองรับ. `field` ระบุ `startDate`, `role` หรือ `kind` ตามกรณี. |
| `400` | `RELATION_MISMATCH` | `projectId` ไม่ได้อ้าง Company ที่ส่งใน `companyId`; `field` คือ `projectId`. |
| `401` | `OWNER_UNAUTHENTICATED` | ไม่ผ่าน owner gate, middleware proof หรือ owner resolver; runtime gate อาจเพิ่ม `WWW-Authenticate: Basic`. |
| `403` | `ACCESS_DENIED` | Owner gate ปฏิเสธ `Origin` ที่ไม่ตรง `APP_ORIGIN`. |
| `404` | `NOT_FOUND` | `companyId` หรือ `projectId` ไม่มีอยู่; `field` ระบุ ID ที่หาไม่พบ. |
| `500` | `INTERNAL_ERROR` | เกิด error ที่ไม่คาดหมายระหว่าง resolve/query/serialize; response ใช้ข้อความทั่วไปโดยไม่คืน exception. |
| `503` | `DEPENDENCY_UNAVAILABLE` | Owner resolver หา owner `User` ได้ไม่เท่ากับหนึ่งรายการ หรือ runtime owner gate ติดต่อ Next.js upstream ไม่ได้. |

ตัวอย่าง validation error:

```jsonc
{
  "error": { // envelope ของข้อผิดพลาด
    "code": "VALIDATION_ERROR", // ประเภท error ที่ client ใช้จัดการ
    "message": "Invalid date range", // ข้อความสรุปที่ route ส่งกลับ
    "field": "startDate" // query field ที่ต้องแก้
  }
}
```

## Processing Flow

Request + HTTP Basic → owner gate ตรวจ credentials/Origin → middleware ตรวจ internal proof → Route Handler เรียก `getOwner()` → validate และ normalize query filters/Company-Project relations → query `WorkItem`, `TimeEntry`, `Project`, `Company` แบบ read-only → aggregate, sort และ serialize Bangkok dates/Decimal strings → ส่ง JSON พร้อม `Cache-Control: no-store`. Owner access failures และ query validation errors ถูกแปลงเป็น error envelope; unexpected error ตอบ safe `500`.

## Verification

### Preconditions และ happy path

1. เปิด runtime ของ environment ที่ได้รับอนุญาต; ใช้ `APP_ORIGIN` จาก environment และ credentials ผ่าน owner gate. ต้อง resolve owner `User` ได้หนึ่งรายการ.
2. เรียกตัวอย่าง `curl` ด้าน Request โดยไม่ใส่ internal proof header. คาดหวัง `200`, `Cache-Control: no-store`, `meta.timezone` เป็น `Asia/Bangkok`, period ตาม query และ response มี `summary` กับ `filterOptions`.
3. เรียก endpoint โดยไม่ใส่ query dates; คาดหวัง period เป็นเดือนปัจจุบันเต็มเดือนใน `Asia/Bangkok`.
4. ใช้ test data ที่มีหลาย WorkItem status, role/kind, Company/Project และ TimeEntry หลายวันเพื่อเทียบ metrics; Dashboard API ไม่เขียนหรือเปลี่ยนแปลงแถวใด.

### Negative cases

- ไม่ส่ง auth หรือส่ง auth ที่ไม่ถูกต้อง → `401 OWNER_UNAUTHENTICATED`.
- เลือก Company/Project ID ที่ไม่มี → `404 NOT_FOUND`; ส่ง Project ที่อยู่คนละ Company → `400 RELATION_MISMATCH`.
- ส่งวันที่ไม่ครบคู่, วันปฏิทินผิด, ช่วงกลับด้าน หรือ role/kind ที่ไม่รองรับ → `400 VALIDATION_ERROR`.
- ใน test environment เท่านั้น ตั้ง `Origin` ที่ไม่ตรง `APP_ORIGIN` → `403 ACCESS_DENIED`; ห้ามเปลี่ยน production origin เพื่อทดสอบ.
- จำลอง owner resolver ให้ไม่มี/มีหลาย owner → `503 DEPENDENCY_UNAVAILABLE`; จำลอง unexpected query failure → `500 INTERNAL_ERROR` โดย body ต้องไม่มีรายละเอียด exception.

### Reusable test runner commands

```bash
pnpm test:dashboard
pnpm test:api-contracts
pnpm test:runner
```

`pnpm test:dashboard` ใช้ fake database และ mocks ครอบคลุม summary/filter/date/Decimal/owner/error/UI source contracts; ไม่ใช้ PostgreSQL หรือ external services. `pnpm test:api-contracts` ตรวจ route inventory และ handbook contract. `pnpm test:runner` ตรวจคำสั่งที่ test runner เปิดให้เรียก. รัน regression ทั้งชุดด้วย `pnpm test`.

## Source references

- [Dashboard route](../../../../app/api/dashboard/summary/route.ts)
- [Dashboard query and metrics](../../../../lib/dashboard.ts)
- [Owner resolver](../../../../lib/owner.ts)
- [Owner middleware](../../../../middleware.ts)
- [Prisma schema](../../../../prisma/schema.prisma)
- [Dashboard unit tests](../../../../tests/dashboard/summary.test.mjs)
- [API contract tests](../../../../tests/contracts/menu-api-validation.test.mjs)
