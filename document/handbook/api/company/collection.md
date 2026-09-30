# Company collection

## Overview

อ่าน Company แบบค้นหาและ cursor pagination หรือสร้าง Company ใหม่. `GET` เรียก `getOrCreateDhasCompany()` ก่อน list จึงอาจ migrate/promote/สร้าง Dhas Company ระหว่างอ่าน.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| `GET` | `/api/company` | Ensure Dhas Company, list/filter Company, คำนวณ summary |
| `POST` | `/api/company` | Validate และสร้าง Company |

## สิทธิ์ที่มองเห็น

ทั้งสอง method ต้องยืนยัน owner ผ่าน access gate และ `getOwner()`. ไม่มี role เพิ่มเติม.

## ดึงข้อมูลจากตารางไหน

| Table | Operation | เหตุผล |
| --- | --- | --- |
| `User` | Read | owner authentication |
| `Company` | Read/Insert/Update | GET ensure Dhas; list/create Company |
| `Project` | Read | Company summary project count |
| `work_items` | Read | Company summary WorkItem count |
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

| Field | คำอธิบาย |
| --- | --- |
| `companies` | Company ในหน้าปัจจุบัน เรียง `name`, แล้ว `id` |
| `companies[].id` | Company primary key |
| `companies[].code` | รหัสเฉพาะ เช่น `dhas`; null ได้ |
| `companies[].displayName` | ชื่อแสดง; null ได้ |
| `companies[].location`, `industry`, `email`, `phone`, `address`, `website`, `logo`, `description` | ข้อมูล Company ตาม field; แต่ละค่า null ได้ |
| `companies[].name` | ชื่อ Company |
| `companies[].createdAt`, `companies[].updatedAt` | Timestamp ที่ serialize เป็น `+07:00` |
| `companies[].summary.projects` | จำนวน Project ของ Company ใน DB |
| `companies[].summary.workItems` | จำนวน WorkItem ใต้ Projects ของ Company |
| `companies[].summary.hours` | ชั่วโมงรวมจาก TimeEntry ใต้ Projects; เป็น Decimal string |
| `page.limit` | ขนาดหน้าที่ใช้ |
| `page.nextCursor` | Cursor สำหรับหน้าถัดไป หรือ `null` เมื่อไม่มี |
| `company` (POST) | Company ที่สร้าง; มี fields/format เดียวกับ Company model ด้านบน แต่ไม่มี `summary` |

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
      "createdAt": "2026-09-30T12:00:00.000+07:00", // เวลาสร้าง Bangkok
      "updatedAt": "2026-09-30T12:00:00.000+07:00", // เวลาแก้ล่าสุด Bangkok
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

POST response ใช้ `{ "company": <Company> }`; ทุก field ใน Company มีคำอธิบายในตารางด้านบน.

## Error Responses

| HTTP | Code/body | Cause |
| ---: | --- | --- |
| `400` | `VALIDATION_ERROR` | body/field ไม่ถูกต้อง, JSON เสีย หรือ pagination ไม่ถูกต้อง |
| `401` | `OWNER_UNAUTHENTICATED` | ไม่มี owner authentication |
| `403` | `ACCESS_DENIED` | Origin ถูกปฏิเสธที่ gate |
| `409` | `CONFLICT` | Dhas Company ซ้ำ/ผิดรูปแบบ |
| `500` | `INTERNAL_ERROR` | อ่านหรือสร้าง Company ไม่สำเร็จ |
| `503` | `DEPENDENCY_UNAVAILABLE` | resolve owner ไม่ได้ |

## Processing Flow

GET: access gate → resolve owner → ensure Dhas Company → validate cursor → query Company page → aggregate Project/WorkItem/TimeEntry → serialize. POST: gate → resolve owner → parse allow-listed fields → reject reserved Dhas name → insert Company.

## Verification

ใช้ `pnpm test:company-projects`. ตรวจ GET cursor ต่อได้และผูกกับ search เดิม; GET ครั้งแรกอาจ ensure Dhas; POST ชื่อว่างหรือ unsupported field ต้อง 400 และ Dhas name ซ้ำต้อง 409.
