# Company collection

## Overview

อ่าน Company แบบค้นหาและ cursor pagination หรือสร้าง Company ใหม่. `GET` เรียก `getOrCreateDhasCompany()` ก่อน list จึงอาจผูก `code=dhas` กับ Company เดิมหรือสร้าง Dhas Company ระหว่างอ่าน.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| `GET` | `/api/company` | Ensure Dhas Company, list/filter Company, คำนวณ summary |
| `POST` | `/api/company` | Validate และสร้าง Company |

## สิทธิ์ที่มองเห็น

ทั้งสอง method ต้องยืนยัน owner ผ่าน access gate และ `getOwner()`. ไม่มี role เพิ่มเติม.

## ดึงข้อมูลจากตารางไหน

| Table | Operation | เหตุผล |
| --- | --- | --- |
| `User` | Read | resolve owner ผ่าน `getOwner()` |
| `Company` | Read/Insert/Update | GET ensure Dhas; list/create Company |
| `Project` | Read | Company summary project count |
| `WorkItem` / `work_items` | Read | Company summary ใช้ raw SQL identifier `"WorkItem"`; Prisma model ระบุ `@@map("work_items")` ซึ่งเป็นชื่อ physical table ตาม schema |
| `TimeEntry` | Read | รวมชั่วโมงต่อ Company |

## Request

### GET

| Parameter | Type | Required | Validation / behavior |
| --- | --- | --- | --- |
| `search` | string | No | trim แล้วค้นหาแบบ case-insensitive ใน `name` หรือ `displayName` |
| `limit` | integer | No | default `50`; ช่วง `1–200` |
| `cursor` | opaque string | No | cursor จาก `page.nextCursor`; ผูกกับ search เดิม |

```bash
curl -u "$OWNER_GATE_USERNAME:$OWNER_GATE_PASSWORD" \
  "$APP_ORIGIN/api/company?search=dhas&limit=50"
```

### POST

JSON body รับ field ต่อไปนี้; มีเพียง `name` ที่ required. Field text อื่นรับ string หรือ `null`; string ว่างถูก normalize เป็น `null`. Unknown fields ถูกปฏิเสธ.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `name` | string | Yes | ชื่อ Company หลัง trim ต้องไม่ว่าง; ชื่อ Dhas ที่สงวนไว้สร้างซ้ำไม่ได้ |
| `displayName` | string \| null | No | ชื่อแสดง |
| `location` | string \| null | No | ที่ตั้ง |
| `industry` | string \| null | No | อุตสาหกรรม |
| `email` | string \| null | No | Email ติดต่อ; implementation ตรวจชนิด ไม่ตรวจรูปแบบ email |
| `phone` | string \| null | No | โทรศัพท์ |
| `address` | string \| null | No | ที่อยู่ |
| `website` | string \| null | No | Website |
| `logo` | string \| null | No | Logo value/URL ตามข้อมูลที่ caller จัดเตรียม |
| `description` | string \| null | No | รายละเอียด |

```bash
curl -u "$OWNER_GATE_USERNAME:$OWNER_GATE_PASSWORD" \
  -H 'Content-Type: application/json' -H "Origin: $APP_ORIGIN" \
  -d '{"name":"Example Company","industry":"Software"}' \
  "$APP_ORIGIN/api/company"
```

## Response

GET ตอบ `200`, POST ตอบ `201`.

### GET response

| Field | Type | คำอธิบาย |
| --- | --- | --- |
| `companies` | array | Company ในหน้าปัจจุบัน เรียงตาม `name`, แล้ว `id` |
| `companies[].id` | string | Company primary key |
| `companies[].code` | string \| null | รหัสเฉพาะของ Company; Dhas ใช้ `dhas` |
| `companies[].displayName` | string \| null | ชื่อแสดง |
| `companies[].location` | string \| null | ที่ตั้ง |
| `companies[].name` | string | ชื่อ Company |
| `companies[].industry` | string \| null | อุตสาหกรรม |
| `companies[].email` | string \| null | Email ติดต่อ |
| `companies[].phone` | string \| null | เบอร์โทรศัพท์ |
| `companies[].address` | string \| null | ที่อยู่ |
| `companies[].website` | string \| null | Website |
| `companies[].logo` | string \| null | ค่า Logo |
| `companies[].description` | string \| null | รายละเอียด Company |
| `companies[].createdAt`, `companies[].updatedAt` | string | ISO timestamp ที่ serializer ต่อท้าย `+07:00` |
| `companies[].summary` | object | Summary ของ Project ที่อ้าง Company นี้ |
| `companies[].summary.projects` | integer | จำนวน Project ของ Company |
| `companies[].summary.workItems` | integer | จำนวน WorkItem ใต้ Projects ของ Company |
| `companies[].summary.hours` | string | ผลรวมชั่วโมง TimeEntry ใต้ Projects; Decimal string |
| `page` | object | Pagination metadata |
| `page.limit` | integer | ขนาดหน้าที่ใช้ |
| `page.nextCursor` | string \| null | Cursor สำหรับหน้าถัดไป หรือ `null` เมื่อไม่มี |

### POST response

| Field | Type | คำอธิบาย |
| --- | --- | --- |
| `company` | object | Company ที่สร้าง มี fields ตั้งแต่ `id` ถึง `updatedAt` ตามตาราง GET ข้างต้น; ไม่รวม `summary` |

```jsonc
{
  "companies": [ // records ในหน้าปัจจุบัน
    {
      "id": "company-id", // primary key
      "code": null, // reserved code หรือ null
      "displayName": null, // ชื่อแสดงหรือ null
      "location": null, // ที่ตั้งหรือ null
      "name": "Example Company", // ชื่อ Company
      "industry": "Software", // อุตสาหกรรมหรือ null
      "email": null, // email หรือ null
      "phone": null, // โทรศัพท์หรือ null
      "address": null, // ที่อยู่หรือ null
      "website": null, // website หรือ null
      "logo": null, // logo หรือ null
      "description": null, // รายละเอียดหรือ null
      "createdAt": "2026-09-30T12:00:00.000+07:00", // เวลา createdAt ที่ serialize ด้วย +07:00
      "updatedAt": "2026-09-30T12:00:00.000+07:00", // เวลา updatedAt ที่ serialize ด้วย +07:00
      "summary": {
        "projects": 2, // จำนวน Projects
        "workItems": 12, // จำนวน WorkItems รวม
        "hours": "42.5" // ชั่วโมงรวม เป็น Decimal string
      }
    }
  ],
  "page": { // pagination ของ Company collection
    "limit": 50, // page size
    "nextCursor": null // cursor ต่อ หรือ null เมื่อหน้าสุดท้าย
  }
}
```

POST response ใช้ `{ "company": <Company> }`; fields ของ `company` อธิบายในตาราง GET response ข้างต้น.

## Error Responses

| HTTP | Code/body | Cause |
| ---: | --- | --- |
| `400` | `VALIDATION_ERROR` | body/field/JSON หรือ pagination ไม่ถูกต้อง; pagination error ส่ง `field: "cursor"` รวมถึงกรณี `limit` ผิด |
| `401` | `OWNER_UNAUTHENTICATED` | middleware หรือ `getOwner()` ไม่ได้รับ owner proof ที่ถูกต้อง |
| `409` | `CONFLICT` | พบ Dhas Company ซ้ำ/ขัดแย้ง หรือพยายามสร้างชื่อ Dhas ซ้ำ |
| `500` | `INTERNAL_ERROR` | อ่านหรือสร้าง Company ไม่สำเร็จจากข้อผิดพลาดที่ไม่จัดประเภทไว้ |
| `503` | `DEPENDENCY_UNAVAILABLE` | ไม่พบ owner User ที่กำหนดได้เพียงหนึ่งรายการ |

Error response fields:

| Field | Type | คำอธิบาย |
| --- | --- | --- |
| `error` | object | รายละเอียดข้อผิดพลาด |
| `error.code` | string | รหัส error เช่น `VALIDATION_ERROR` |
| `error.message` | string | ข้อความอธิบาย error |
| `error.field` | string, optional | Request field ที่เกี่ยวข้อง; ไม่มีเมื่อระบุไม่ได้ |

```jsonc
{"error":{"code":"VALIDATION_ERROR","message":"Invalid cursor","field":"cursor"}}
```

## Processing Flow

GET: access gate → resolve owner → ensure Dhas Company → validate cursor → query Company page → aggregate Project/WorkItem/TimeEntry → serialize. Raw summary query อ้าง `"WorkItem"`; ดูข้อสังเกตเรื่องชื่อ table ด้านล่าง. POST: gate → resolve owner → parse allow-listed fields → reject reserved Dhas name → insert Company.

### ข้อสังเกตการยืนยัน query

Handler ใช้ raw SQL อ้าง table `"WorkItem"` แต่ Prisma schema map model ไป `work_items`. `pnpm test:company-projects` ตรวจ bounded summary ผ่าน mocked query; ไม่ได้ยืนยันชื่อ table บน PostgreSQL จริง. หาก physical schema ตรงกับ Prisma mapping ชื่อดังกล่าวไม่ตรงกัน. Physical table ของ environment เป้าหมาย **ไม่พบข้อมูลที่ยืนยันได้จาก implementation ปัจจุบัน**; ตรวจด้วย PostgreSQL ก่อนยืนยัน Company GET summary ใน environment นั้น.

## Verification

ใช้ `pnpm test:company-projects`. ตรวจ GET cursor ต่อได้และผูกกับ search เดิม; GET ครั้งแรกอาจ ensure Dhas; POST ชื่อว่างหรือ unsupported field ต้อง 400 และ Dhas name ซ้ำต้อง 409. การตรวจ aggregate query กับ PostgreSQL จริงยังต้องตรวจ physical table mapping ตามข้อสังเกตข้างต้น.
