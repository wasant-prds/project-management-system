# Company detail

## Overview

แก้ข้อมูล Company บาง field หรือขอลบ Company ตาม ID.

| Method | Endpoint | Behavior |
| --- | --- | --- |
| `PATCH` | `/api/company/{id}` | แก้ Company แบบ partial |
| `DELETE` | `/api/company/{id}` | ลบเมื่อไม่ใช่ Dhas และไม่มี Project อ้างอิง |

## สิทธิ์ที่มองเห็น

ต้องผ่าน owner gate และ `getOwner()`. ไม่มี role เพิ่มเติม.

## ดึงข้อมูลจากตารางไหน

| Table | Operation | เหตุผล |
| --- | --- | --- |
| `User` | Read | resolve owner |
| `Company` | Read/Update/Delete | ตรวจ row, code และจำนวน Projects; update/delete row |
| `Project` | Read | ตรวจ relation count ก่อน delete; FK `Restrict` ป้องกัน race/delete conflict |

## Request

### Path parameter

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | Company ID |

### PATCH body

ส่งอย่างน้อยหนึ่ง fieldจาก [Company field list](./collection.md#post). Field ที่ไม่ส่งคงค่าเดิม; unknown field และ body ว่างถูกปฏิเสธ. `name` หากส่งมาต้องเป็น string หลัง trim ที่ไม่ว่าง. Field อื่นรับ string หรือ null. เปลี่ยนชื่อ Dhas Company ไม่ได้ และ Company อื่นใช้ชื่อสงวน Dhas ไม่ได้. Body field ที่รับ: `name`, `displayName`, `location`, `industry`, `email`, `phone`, `address`, `website`, `logo`, `description`.

```json
{"phone":"02-000-0000"}
```

DELETE ไม่มี body.

## Response

PATCH ตอบ `200` `{ "company": ... }`. Object มี Company fields ที่ระบุไว้ใน [Company collection response](./collection.md#response); timestamp เป็น `+07:00`.

DELETE ตอบ `200`:

| Field | คำอธิบาย |
| --- | --- |
| `message` | ข้อความยืนยัน `ลบ Company แล้ว` |

```jsonc
{"message":"ลบ Company แล้ว" // ข้อความยืนยันการลบสำเร็จ}
```

## Error Responses

| HTTP | Code | Cause |
| ---: | --- | --- |
| `400` | `VALIDATION_ERROR` | body/field/JSON ไม่ถูกต้อง หรือ body ว่าง |
| `401` | `OWNER_UNAUTHENTICATED` | owner authentication ขาดหาย |
| `403` | `ACCESS_DENIED` | Origin policy ไม่ผ่าน |
| `404` | `NOT_FOUND` | ไม่มี Company ID นี้ |
| `409` | `CONFLICT` | เปลี่ยนชื่อ Dhas หรือใช้ชื่อ Dhas กับ Company อื่น |
| `409` | `HISTORY_CONFLICT` | ลบ Dhas Company/Company ที่มี Projects หรือ FK conflict |
| `500` | `INTERNAL_ERROR` | DB operation ที่ไม่คาดหมายล้มเหลว |
| `503` | `DEPENDENCY_UNAVAILABLE` | resolve owner ไม่สำเร็จ |

## Processing Flow

PATCH: gate → validate allow-list → read Company → enforce Dhas name rule → update. DELETE: gate → read Company plus Project count → block reserved/referenced row → delete.

## Verification

`pnpm test:company-projects`. ทดสอบ PATCH field ที่ถูกต้อง, unknown/empty body, ID ที่ไม่มี, เปลี่ยน Dhas name และ DELETE Company ที่ยังถูก Project ใช้. ลบ Company ได้เฉพาะ record ที่ไม่ใช่ Dhas และไม่มี Project.
