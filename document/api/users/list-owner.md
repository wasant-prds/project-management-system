# List owner

## Overview

คืน User ของ owner ที่ยืนยันแล้วหนึ่งรายการใน wrapper `users` สำหรับ legacy consumers.

| Property | Value |
| --- | --- |
| Method | `GET` |
| Endpoint | `/api/users` |

## สิทธิ์ที่มองเห็น

ต้องผ่าน HTTP Basic owner gate, origin policy (เมื่อมี Origin), Next.js middleware proof และ owner resolution. ไม่มี role เพิ่มเติม; API ไม่อนุญาตให้เลือก User ผ่าน request.

## ดึงข้อมูลจากตารางไหน

| Table | Operation | เหตุผล |
| --- | --- | --- |
| `User` | Read | `getOwner()` resolve owner หนึ่งแถว; password/phone ไม่ถูก select ใน owner resolver |

## Request

ไม่มี path/query/body. ส่ง Basic Authorization ให้ runtime gate:

```bash
curl -u "$OWNER_GATE_USERNAME:$OWNER_GATE_PASSWORD" "$APP_ORIGIN/api/users"
```

## Response

HTTP `200`. `users` เป็น array ที่ implementation เติม owner เพียงหนึ่งรายการ.

| Field | คำอธิบาย |
| --- | --- |
| `users` | รายการ owner ที่รับรองแล้ว; ปัจจุบันมีหนึ่งรายการ |
| `users[].id` | User ID |
| `users[].name` | ชื่อที่แสดง |
| `users[].email` | Email ของ User |
| `users[].avatar` | Avatar URL หรือ `null` |
| `users[].role` | ค่า legacy `User.role`; ไม่ใช่ permission ของระบบ |
| `users[].status` | สถานะ User ตามข้อมูลใน DB |

`password` และ `phone` ไม่ถูกส่งออก.

```jsonc
{
  "users": [ // owner ที่ API resolve ได้
    {
      "id": "user-id", // public UUIDv4 ของ owner
      "name": "Owner", // display name
      "email": "owner@example.invalid", // account email
      "avatar": null, // avatar URL หรือ null
      "role": "member", // legacy role field; ไม่ใช้ authorize API
      "status": "Active" // สถานะ User
    }
  ]
}
```

## Error Responses

| HTTP | Body/code | Cause |
| ---: | --- | --- |
| `401` | `OWNER_UNAUTHENTICATED` หรือ gate unauthorized envelope | ไม่มี/ผิด Basic credential, internal proof หรือ owner marker |
| `403` | `ACCESS_DENIED` | Origin ไม่ตรงกับ `APP_ORIGIN` |
| `503` | `DEPENDENCY_UNAVAILABLE` | Owner resolver พบ User ไม่ใช่หนึ่งแถวพอดี |
| `500` | `{ "error": "Failed to fetch users" }` | error ที่ไม่ใช่ owner error ระหว่าง handler |

## Processing Flow

Owner gate → middleware ตรวจ proof → `getOwner()` อ่าน User ตาม `OWNER_USER_ID` หรือจำนวนแถว → ห่อ owner เป็น `[owner]` → ตอบ JSON.

## Verification

- เรียก API โดยมี owner credential แล้วตรวจว่า `users` มี owner เดียวและไม่มี `password`.
- ไม่มี credential ต้องได้ 401; owner row count ผิดต้อง fail closed ด้วย 503.
- Automated coverage: `pnpm test:auth`.
