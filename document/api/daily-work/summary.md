# Daily Work summary

## Overview

รวมชั่วโมง Daily Work (`TimeEntry.hours`) ของ owner ทั้งหมด หรือเฉพาะ inclusive Bangkok date range ด้วย PostgreSQL aggregate.

| Method | Endpoint | พฤติกรรม |
| --- | --- | --- |
| `GET` | `/api/work-logs/summary` | คืนยอดชั่วโมงเป็น Decimal string; หากไม่มีรายการคืน `"0"` |

## สิทธิ์ที่มองเห็น

ต้องผ่าน Node owner gate ด้วย HTTP Basic และ middleware internal proof. หากส่ง `Origin` ต้องตรงกับ `APP_ORIGIN`. Route เรียก `getOwner()` เพื่อ resolve User หนึ่งรายการ (เลือกด้วย `OWNER_USER_ID` เมื่อกำหนด หรือใช้เมื่อมี User เพียงหนึ่งรายการ); implementation นี้ไม่ได้ใช้ `User.role` เป็น permission. Aggregate จำกัด `TimeEntry.userId` เป็น owner เสมอ และไม่มี parameter สำหรับเลือก owner อื่น.

## ดึงข้อมูลจากตารางไหน

| Table | Operation | การใช้งาน |
| --- | --- | --- |
| `User` | Read | resolve owner ก่อน aggregate |
| `TimeEntry` | Read / aggregate | รวม `hours` ของ owner และใช้ `date` เมื่อระบุช่วง |

ไม่มี Project หรือ WorkItem relation ใน query summary.

## Request

### Headers

| Header | Type | Required | เงื่อนไข |
| --- | --- | --- | --- |
| `Authorization` | HTTP Basic | Yes | ตรวจโดย Node owner gate; ใช้ credential ที่ provision ให้ environment |
| `Origin` | URL | No | หากส่งต้องตรงกับ `APP_ORIGIN` |

### Query parameters

| Parameter | Type | Required | Validation / behavior |
| --- | --- | --- | --- |
| `startDate` | `YYYY-MM-DD` | Conditional | ต้องส่งพร้อม `endDate`; วันเริ่มต้นรวมอยู่ในช่วง |
| `endDate` | `YYYY-MM-DD` | Conditional | ต้องส่งพร้อม `startDate`; วันสิ้นสุดรวมอยู่ในช่วงและต้องไม่ก่อน `startDate` |

GET ไม่มี path parameter หรือ request body.

หากไม่ส่งทั้งคู่ จะรวมทุกวันของ owner. การกรองใช้ Bangkok calendar dates และ database predicate `date >= startDate`, `date < วันหลัง endDate`.

```bash
curl -i -u "$OWNER_GATE_USERNAME:$OWNER_GATE_PASSWORD" \
  "$APP_ORIGIN/api/work-logs/summary?startDate=2026-09-01&endDate=2026-09-30"
```

## Response

ตอบ `200` พร้อม `Cache-Control: no-store`:

| Field | Description |
| --- | --- |
| `summary` | object ของยอดรวมและช่วงวันที่ที่ใช้ |
| `summary.hours` | ผลรวม `TimeEntry.hours` เป็น exact Decimal string; `"0"` เมื่อไม่มีรายการ |
| `summary.timezone` | timezone คงที่ `Asia/Bangkok` สำหรับ calendar date semantics |
| `summary.startDate` | วันที่เริ่มต้น inclusive ที่ echo จาก query; มีเมื่อส่ง range ครบ |
| `summary.endDate` | วันที่สิ้นสุด inclusive ที่ echo จาก query; มีเมื่อส่ง range ครบ |

ตัวอย่าง range response:

```jsonc
{
  "summary": { // ผลรวมของ TimeEntry ที่อยู่ใน scope ของ owner
    "hours": "1.375", // exact sum ของชั่วโมง หรือ "0" เมื่อไม่มีรายการ
    "timezone": "Asia/Bangkok", // timezone สำหรับขอบเขต calendar date
    "startDate": "2026-09-01", // วันเริ่มต้น inclusive ที่รับจาก query
    "endDate": "2026-09-30" // วันสิ้นสุด inclusive ที่รับจาก query
  }
}
```

เมื่อรวมทุกวัน `summary.startDate` และ `summary.endDate` จะไม่มีใน response:

```jsonc
{
  "summary": { // ผลรวมตลอดช่วงข้อมูลของ owner
    "hours": "0", // exact sum; zero เมื่อไม่พบ TimeEntry
    "timezone": "Asia/Bangkok" // timezone สำหรับ calendar date semantics
  }
}
```

## Error Responses

| HTTP | Code | Cause |
| ---: | --- | --- |
| `400` | `VALIDATION_ERROR` | ส่ง `startDate`/`endDate` ไม่ครบ, รูปแบบหรือวันที่ไม่ถูกต้อง, หรือ `endDate` อยู่ก่อน `startDate` |
| `401` | `OWNER_UNAUTHENTICATED` | Basic authentication หรือ internal owner proof ไม่ผ่าน |
| `403` | `ACCESS_DENIED` | owner gate ปฏิเสธ `Origin` ที่ไม่ตรง `APP_ORIGIN` |
| `500` | `INTERNAL_ERROR` | database aggregate หรือ server operation ล้มเหลว; error ถูกแทนด้วยข้อความปลอดภัยและไม่ถูกนับเป็นศูนย์ |
| `503` | `DEPENDENCY_UNAVAILABLE` | resolve owner ไม่ได้หนึ่ง User หรือ owner gate เชื่อมต่อ Next.js ไม่ได้ |

Error response ใช้ envelope `{error:{code,message,field?}}`: `error` คือ object ของ error, `code` คือรหัสสาเหตุ, `message` คือคำอธิบาย และ `field` (ถ้ามี) ระบุ request field ที่เกี่ยวข้อง.

## Processing Flow

owner gate ตรวจ Basic/Origin → middleware ตรวจ internal proof → resolve owner จาก `User` → สร้าง `TimeEntryWhereInput` ด้วย `userId` ของ owner และ optional Bangkok range → Prisma aggregate `_sum.hours` → serialize Decimal เป็น string พร้อม timezone/ช่วงวันที่ → response. Query error คืน `500` แทนการรายงานยอดศูนย์.

## Verification

รัน `pnpm test:daily-work` เพื่อทดสอบ owner-scoped aggregate, inclusive date boundaries, empty result, exact decimal sum, incomplete/invalid range, unauthenticated access และ safe `500` โดย test doubles. รัน `pnpm test:auth` เพื่อทดสอบ Basic, Origin และ internal proof ที่ owner gate; ขั้นตอนตรวจ environment ดู [Owner access](../../operations/owner-access.md). ชุดทดสอบไม่ได้เขียนข้อมูลไปฐานข้อมูล environment จริง.

คาดหวัง `200` และ Decimal string สำหรับ query ปกติ, `hours: "0"` เมื่อ owner ไม่มี TimeEntry และ `400 VALIDATION_ERROR` เมื่อส่ง range ไม่ครบหรือไม่ถูกต้อง.
