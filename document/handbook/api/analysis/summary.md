# Analysis Summary

## Overview

| รายการ | ค่า |
| --- | --- |
| Purpose | อ่านรายงาน WorkItem, TimeEntry, breakdown และรายการต้นทางของ owner ตามช่วงวันที่และ filters |
| HTTP Method | `GET` |
| Endpoint | `/api/analysis/summary` |
| การเขียนข้อมูล | ไม่มี; query ข้อมูลปัจจุบันใหม่ทุก request |

Contract: `GET /api/analysis/summary`.

หน้า `/analysis` และ Route Handler ใช้ `lib/analysis.ts`; query parser, date anchor, relation filters และสูตร KPI ใช้ชุดเดียวกับ `lib/dashboard.ts`. API ตอบ `Cache-Control: no-store`. ช่วงวันที่เป็น Bangkok business dates แบบ inclusive; เมื่อไม่ส่งวันที่จะใช้เดือนปัจจุบันของ `Asia/Bangkok`. รายงานกรอง Company, Project, WorkItem functional role และ kind.

Company คือ Company relation ปัจจุบันของ Project; ไม่มี `Customer` model หรือ Customer API. ทุกค่าชั่วโมง serialize เป็น Decimal string แบบ exact.

## สิทธิ์ที่มองเห็น

- ต้องผ่าน owner access gate และ Handler เรียก `getOwner()` เพื่อ resolve `User` เจ้าของหนึ่งรายการ.
- ไม่รับ owner ID จาก query. `WorkItem.assigneeId` และ `TimeEntry.userId` ถูกจำกัดด้วย owner ที่ resolve ฝั่ง server.
- `Developer`, `infra` และ `SA` เป็น functional role สำหรับ filter ไม่ใช่ API permission.
- รายละเอียด gate: [Owner access gate](../../operations/owner-access.md).

## ดึงข้อมูลจากตารางไหน

API นี้อ่านข้อมูลเท่านั้น ไม่มี `INSERT`, `UPDATE` หรือ `DELETE`.

| Prisma model / table | การใช้งาน |
| --- | --- |
| `User` | `getOwner()` อ่านเพื่อ resolve owner; ถ้ากำหนด `OWNER_USER_ID` จะจำกัดด้วย ID และอ่านได้ไม่เกิน 2 แถวเพื่อยืนยันว่ามี owner เพียงหนึ่งคน. เลือกเฉพาะ `id`, `name`, `email`, `avatar`, `role`, `status`. |
| `Company` | ตรวจ `companyId` ด้วย `findUnique`; อ่านรายการ Company สำหรับ `filterOptions.companies`. |
| `Project` | ตรวจ `projectId` และความสัมพันธ์กับ Company; อ่านรายการ Project สำหรับ `filterOptions.projects`; relation ของ WorkItem/TimeEntry ใช้อ่านชื่อ Project และ Company. |
| `WorkItem` (`work_items`) | อ่าน source rows ของ owner ด้วย `assigneeId`, date anchor, Company/Project/role/kind filters; ใช้คำนวณ KPI และ breakdowns. Prisma schema ระบุ `@@map("work_items")`. |
| `TimeEntry` | อ่าน source rows ของ owner ด้วย `userId`, date และ filters ของ WorkItem ที่เชื่อมอยู่; ใช้รวมและจัดกลุ่มชั่วโมง. legacy entry ที่ไม่มี WorkItem ยังอยู่ใน logged-hours report ถ้าเข้าเงื่อนไขอื่น. |

ชื่อในตารางเป็น Prisma model; ระบุ physical table mapping เฉพาะ `WorkItem` ที่ schema ประกาศ `@@map` ไว้โดยตรง.

## Request

### Path parameters

ไม่มี.

### Query parameters

ทุก parameter เป็น string ใน query string และเป็น Optional. ส่ง `startDate` กับ `endDate` เป็นคู่ หรือไม่ส่งทั้งคู่.

| ชื่อ | Type | Required | ความหมายและ validation |
| --- | --- | --- | --- |
| `startDate` | string (`YYYY-MM-DD`) | Optional* | วันแรกของช่วงแบบ inclusive; ต้องเป็นวันที่จริงและไม่เกิน `endDate`. |
| `endDate` | string (`YYYY-MM-DD`) | Optional* | วันสุดท้ายแบบ inclusive; ต้องเป็นวันที่จริงและไม่น้อยกว่า `startDate`. |
| `companyId` | string | Optional | จำกัด WorkItems และ TimeEntries ที่สัมพันธ์กับ Project ของ Company นี้; trim ช่องว่างหัวท้าย; Company ที่ไม่มีอยู่ตอบ `404 NOT_FOUND`. |
| `projectId` | string | Optional | จำกัด Project; trim ช่องว่างหัวท้าย; Project ที่ไม่มีอยู่ตอบ `404 NOT_FOUND`; หากไม่อยู่ใน Company ที่เลือกตอบ `400 RELATION_MISMATCH`. |
| `role` | string enum | Optional | WorkItem role: `Developer`, `infra`, `SA`; `none` เลือก WorkItem ที่ role เป็น `null`; ค่าอื่นตอบ `400 VALIDATION_ERROR`. |
| `kind` | string enum | Optional | WorkItem kind: `Incident`, `Issue`, `Task`; ค่าอื่นตอบ `400 VALIDATION_ERROR`. |

\* หากส่งวันที่ ต้องส่งทั้งสองค่า; หากไม่ส่ง API ใช้เดือนปัจจุบันตาม `Asia/Bangkok`.

### Headers และ Request Body

- ไม่มี custom header หรือ Request Body สำหรับ endpoint นี้. Request ต้องผ่าน owner access gate; internal proof ถูกเพิ่ม/ตรวจโดย runtime และ middleware ไม่ใช่ค่าที่ client ควรกำหนดเอง.

ตัวอย่างเรียกจากหน้าเว็บที่ผ่าน owner gate แล้ว:

```js
const response = await fetch(
  '/api/analysis/summary?startDate=2026-10-01&endDate=2026-10-31&companyId=company-id',
)
const result = await response.json()
console.log(response.status, result)
```

## Response

Response body มี field comments ภาษาไทยตาม contract handbook:

```jsonc
{
  "meta": { // ช่วงเวลา, filters และนิยาม metric ที่ใช้จริง
    "period": { // Bangkok calendar date range แบบ inclusive
      "startDate": "2026-10-01", // วันแรกของช่วงรายงาน
      "endDate": "2026-10-31" // วันสุดท้ายของช่วงรายงาน
    },
    "timezone": "Asia/Bangkok", // timezone คงที่สำหรับ period และ grouping
    "filters": { // filters ที่ใช้ร่วมกับ KPI, charts, tables และ export
      "companyId": null, // Company ID หรือ null เมื่อเลือกทั้งหมด
      "projectId": null, // Project ID หรือ null เมื่อเลือกทั้งหมด
      "role": null, // WorkItem role, none หรือ null เมื่อเลือกทั้งหมด
      "kind": null // WorkItem kind หรือ null เมื่อเลือกทั้งหมด
    },
    "metricDefinitions": { // นิยามสูตรและฐานข้อมูลของตัวเลขรายงาน
      "total": "Owner WorkItems matching the selected date anchor and filters", // WorkItems ที่ตรงเงื่อนไขทั้งหมด
      "open": "total - completed - cancelled", // งานเปิด โดยตัด completed และ cancelled
      "completed": "Owner WorkItems with status=completed", // นับเฉพาะ completed
      "cancelled": "Owner WorkItems with status=cancelled", // นับแยกจาก completed
      "overdue": "dueDate before the current Asia/Bangkok date and status not in completed,cancelled", // เลย due date ตาม Bangkok วันนี้และยังไม่ปิด
      "completionRate": "completed / (total - cancelled) * 100; zero denominator returns 0", // อัตราสำเร็จ; ตัวหารศูนย์คืน 0
      "loggedHours": "Exact SUM(TimeEntry.hours) for the owner and selected period/filters", // ชั่วโมง Decimal รวมแบบไม่ปัด
      "workItemDateAnchor": "workDate ?? dueDate ?? createdAt", // วันที่ใช้เลือก WorkItem เข้า report
      "statusBreakdown": "Count of matching WorkItems by their current status; not historical throughput", // breakdown สถานะปัจจุบัน ไม่ใช่ throughput ย้อนหลัง
      "kindBreakdown": "Count of matching WorkItems by kind", // breakdown ตามชนิดงาน
      "priorityBreakdown": "Count of matching WorkItems by priority", // breakdown ตามความสำคัญ
      "loggedHoursGrouping": "Exact SUM(TimeEntry.hours) grouped by Bangkok calendar day, week, or month" // วิธีจัดกลุ่มชั่วโมง
    },
    "metricVersion": "shared-work-v1", // เวอร์ชันนิยาม metric ที่ใช้ร่วมกัน
    "loggedHoursGrouping": "day" // grouping ที่เลือก: day, week หรือ month
  },
  "summary": { // KPI จากข้อมูล owner ที่ตรง filters
    "total": 12, // WorkItems ทุก status
    "open": 8, // WorkItems ที่ไม่ completed/cancelled
    "completed": 3, // WorkItems สถานะ completed
    "cancelled": 1, // WorkItems สถานะ cancelled; แสดงแยกจาก completed
    "overdue": 2, // งานเกินกำหนดตาม Asia/Bangkok
    "completionRate": 27.27, // completed ÷ (total - cancelled) × 100; ตัวหารศูนย์คืน 0
    "loggedHours": "18.75" // ผลรวม Decimal TimeEntry.hours แบบ exact
  },
  "breakdowns": { // จำนวน WorkItems ที่แยกตามมิติและใช้ filters เดียวกัน
    "status": [{ // breakdown ตาม status ปัจจุบัน
      "value": "completed", // WorkItem status
      "count": 3 // จำนวน WorkItems ของ status นี้
    }],
    "kind": [{ // breakdown ตามชนิดงาน
      "value": "Task", // WorkItem kind
      "count": 8 // จำนวน WorkItems ของ kind นี้
    }],
    "priority": [{ // breakdown ตามความสำคัญ
      "value": "high", // WorkItem priority
      "count": 2 // จำนวน WorkItems ของ priority นี้
    }]
  },
  "loggedHoursByPeriod": [{ // ชั่วโมงที่ group ตาม loggedHoursGrouping
    "startDate": "2026-10-01", // วันเริ่ม bucket หลังตัดกับช่วงรายงาน
    "endDate": "2026-10-01", // วันจบ bucket หลังตัดกับช่วงรายงาน
    "hours": "2.5" // ผลรวม Decimal ของ bucket
  }],
  "workItems": [{ // WorkItem ต้นทางทั้งหมดที่ตรงกับ filter; ไม่จำกัด preview
    "id": "work-item-id", // canonical WorkItem ID สำหรับ traceability
    "title": "Update report view", // ชื่องานจาก WorkItem
    "kind": "Task", // ชนิดงาน
    "priority": "high", // ความสำคัญ
    "role": "Developer", // functional role หรือ null
    "status": "in-progress", // status สาธารณะใช้รูปแบบ hyphen
    "workDate": "2026-10-02", // Bangkok calendar date หรือ null
    "dueDate": "2026-10-10", // Bangkok calendar date หรือ null
    "createdAt": "2026-10-01T09:00:00.000+07:00", // Bangkok wall-clock timestamp
    "updatedAt": "2026-10-02T10:00:00.000+07:00", // Bangkok wall-clock timestamp
    "project": { // Project/Company relation ต้นทาง
      "id": "project-id", // canonical Project ID
      "name": "PMS", // Project name
      "company": { // Company ที่ Project อ้างถึง หรือ null
        "id": "company-id", // canonical Company ID
        "name": "Company", // Company name
        "displayName": null // ชื่อแสดงผล หรือ null
      }
    }
  }],
  "timeEntries": [{ // TimeEntry ต้นทางทั้งหมดที่ตรงกับ date/filter
    "id": "time-entry-id", // canonical TimeEntry ID
    "date": "2026-10-02", // Bangkok calendar date
    "hours": "1.25", // Decimal string ไม่ปัดเศษ
    "description": "Review", // Daily Work description หรือ null
    "remarks": null, // Daily Work remarks หรือ null
    "workItem": { // WorkItem/Project relation; null สำหรับ legacy row ที่ไม่ผูกงาน
      "id": "work-item-id", // canonical WorkItem ID
      "title": "Update report view", // WorkItem title
      "project": { // Project ของ WorkItem
        "id": "project-id", // canonical Project ID
        "name": "PMS", // Project name
        "company": { // Company ที่ Project อ้างถึง หรือ null
          "id": "company-id", // canonical Company ID
          "name": "Company", // Company name
          "displayName": null // ชื่อแสดงผล หรือ null
        }
      }
    }
  }],
  "filterOptions": { // ตัวเลือก Company และ Project ของ form
    "companies": [{ // Company options ที่อ่านจากฐานข้อมูล
      "id": "company-id", // canonical Company ID
      "name": "Company", // Company name
      "displayName": null // ชื่อแสดงผล หรือ null
    }],
    "projects": [{ // Project options ทั้งหมดที่อ่านจากฐานข้อมูล; UI filter ด้วย Company ที่กำลังเลือก
      "id": "project-id", // canonical Project ID
      "name": "PMS", // Project name
      "companyId": "company-id" // Company ID ของ Project
    }]
  }
}
```

สถานะและ priority breakdown มีค่าแยกครบตาม enum รวมค่าที่มีจำนวนศูนย์. `loggedHoursByPeriod` จัดกลุ่มเป็นวันเมื่อช่วง ≤31 วัน, สัปดาห์เมื่อช่วง ≤120 วัน และเดือนเมื่อยาวกว่านั้น; สัปดาห์เริ่มวันอาทิตย์ของ Bangkok calendar และช่วง bucket ถูกตัดให้อยู่ใน report period. ไม่มีการคำนวณ historical completion จาก status ปัจจุบัน.

## Error Responses

Error body ใช้ `{ error: { code, message, field? } }`; `field` มีเฉพาะ validation/relation errors ที่ระบุ field. ทุก response ของ Route Handler ตั้ง `Cache-Control: no-store`; owner gate ใช้ no-store เช่นกัน.

| HTTP | Code | สาเหตุ |
| --- | --- | --- |
| `400` | `VALIDATION_ERROR` | วันที่ไม่ถูกต้อง, ส่งวันที่ไม่ครบคู่, ช่วงวันกลับด้าน หรือ `role`/`kind` ไม่รองรับ. `field` ระบุ parameter ที่ผิด. |
| `400` | `RELATION_MISMATCH` | `projectId` ไม่ได้อยู่ใน `companyId` ที่ส่งมาด้วย; `field` คือ `projectId`. |
| `401` | `OWNER_UNAUTHENTICATED` | Request ไม่มี owner authentication/proof ที่ runtime gate ต้องการ. |
| `403` | `ACCESS_DENIED` | Owner gate ปฏิเสธ request ที่มี `Origin` ไม่ตรงกับ `APP_ORIGIN`; พฤติกรรมนี้กำหนดที่ gate. |
| `404` | `NOT_FOUND` | `companyId` หรือ `projectId` ไม่มีอยู่; `field` ระบุ ID ที่หาไม่พบ. |
| `503` | `DEPENDENCY_UNAVAILABLE` | `getOwner()` resolve `User` ได้ไม่เท่ากับหนึ่งรายการ. |
| `500` | `INTERNAL_ERROR` | เกิด database หรือ unexpected error; response ไม่เปิดเผย raw dependency details. |

ตัวอย่าง validation error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Date range must use valid ordered YYYY-MM-DD dates",
    "field": "startDate"
  }
}
```

## Processing Flow

1. Runtime owner gate ตรวจ Basic authentication และ request origin; middleware ตรวจ internal proof และตอบ `401` หากไม่ผ่าน.
2. `GET /api/analysis/summary` เรียก `getOwner()` เพื่อ resolve owner จาก `User`; หาก resolve ไม่ได้หนึ่งรายการตอบ `503`.
3. `getAnalysisSummary()` ใช้ shared parser ตรวจ dates/filters และตรวจ Company/Project relation; invalid input ตอบ `400` หรือ `404` ก่อนอ่าน report rows.
4. อ่าน `WorkItem`, `TimeEntry`, `Company` และ `Project` พร้อมกัน โดยจำกัด source rows ด้วย owner และ filters.
5. คำนวณ KPI, breakdowns, Bangkok time buckets และ serialize source rows; ส่ง JSON `200` พร้อม `Cache-Control: no-store`.
6. หากเกิด error ที่ไม่รู้จัก Route Handler log ข้อความคงที่และตอบ `500 INTERNAL_ERROR` โดยไม่ส่งรายละเอียดภายในกลับ client.

## Source links และ export

- WorkItem rows เปิด `/work-items?workItemId={id}` พร้อมส่ง filters/period เดิม; Work Items page โหลดรายละเอียดผ่าน owner-only WorkItem endpoint.
- Breakdown links และจุดในกราฟสถานะส่งมิติและ filters ไป Work Items. จุดในกราฟชั่วโมงเปิด Daily Work ตาม bucket และ filters; links ในตารางยังเปิดช่วงวันที่ต้นทาง.
- ปุ่ม CSV ส่งออก summary, breakdowns, time-series buckets และ WorkItem/TimeEntry rows จาก response เดียวกันที่ผู้ใช้กำลังเห็น; CSV escape เครื่องหมายคำพูด/บรรทัดใหม่และ neutralize formula prefixes ใน source text. UI แจ้งผลสำเร็จ/ล้มเหลว.
- ไม่มี database write, background job, cache, schema หรือ migration ใหม่.

## Verification

### Preconditions และตัวอย่าง Request

- ใช้ application environment ที่เปิด owner access gate และมี owner `User` ที่ resolve ได้เพียงหนึ่งรายการ.
- ข้อมูลทดสอบควรมี Company → Project → WorkItem ของ owner และ TimeEntry ทั้งที่ผูก/ไม่ผูก WorkItem; กำหนด `workDate`, `dueDate`, status และ `date` ให้ครอบคลุมช่วงที่ทดสอบ.
- เรียกตัวอย่างในหัวข้อ Request ผ่าน browser session ที่ยืนยันตัวตนแล้ว; วันที่เป็นตัวอย่างเท่านั้นและอาจไม่มีข้อมูล.

### ผลที่คาดหวัง

- Request ที่ผ่าน gate และ filters ถูกต้องตอบ `200`, `Cache-Control: no-store` และ response ตาม schema ด้านบน.
- KPI, breakdown, source rows และ logged-hour buckets สอดคล้องกับ WorkItem/TimeEntry ของ owner และ filters; Decimal hours ยังคงเป็น string แบบ exact.
- API ไม่เปลี่ยนฐานข้อมูล. ไม่มี expected database changes.
- Request ที่ไม่มี owner authentication ตอบ `401`; owner row ที่ resolve ไม่ได้หนึ่งรายการตอบ `503`.

### Negative cases และ automated tests

ตรวจอย่างน้อย: ส่งวันที่ขาดคู่/รูปแบบผิด/ช่วงกลับด้าน, `role` หรือ `kind` ที่ไม่รองรับ (`400`); Company/Project ที่ไม่มีอยู่ (`404`); Project ไม่สัมพันธ์กับ Company (`400`); และ request ที่ไม่มี owner proof (`401`). `tests/analysis/summary.test.mjs` ครอบคลุม filters, date anchors, exact Decimal, grouping, owner scoping, source links, CSV safety และ Route Handler responses ด้วย in-memory Prisma fake/route mocks.

```powershell
pnpm test:analysis
pnpm test:dashboard
pnpm test:api-contracts
```

`pnpm test:analysis` เป็น focused suite ของ endpoint นี้. Tests ใช้ in-memory Prisma fake และ route mocks; ไม่เชื่อมต่อ PostgreSQL, Redis, Docker, network หรือ external service. คำสั่ง dashboard/API contracts ใช้ตรวจ shared query contract และ API conventions ที่เกี่ยวข้อง.

## Source references

- [Analysis Route Handler](../../../../app/api/analysis/summary/route.ts)
- [Analysis query and response builder](../../../../lib/analysis.ts)
- [Shared dashboard filters and query predicates](../../../../lib/dashboard.ts)
- [Owner resolver](../../../../lib/owner.ts)
- [Prisma schema](../../../../prisma/schema.prisma)
- [Analysis tests](../../../../tests/analysis/summary.test.mjs)
