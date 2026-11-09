# GitLab configuration status

## Overview

ตรวจว่ามี GitLab configuration ฝั่ง server ที่ใช้งานได้หรือไม่ โดยไม่เปิดเผย URL, token หรือ metadata ของ secret.

| Method | Endpoint | Success |
| --- | --- | --- |
| GET | `/api/integrations/gitlab/status` | 200 |

## สิทธิ์ที่มองเห็น

ต้องผ่าน HTTP Basic owner gate, middleware proof และ `getOwner()`; ไม่มี role/permission แยก. Owner ที่ resolve ไม่ได้พอดีหนึ่ง `User` ใช้งานไม่ได้. ดู [Owner access](../../operations/owner-access.md).

## ดึงข้อมูลจากตารางไหน

| Table / source | Operation | เหตุผล |
| --- | --- | --- |
| `User` | Read | `getOwner()` ยืนยัน owner ก่อนอ่าน configuration |
| Server environment | Read | ตรวจ `GITLAB_BASE_URL` และ `GITLAB_TOKEN` ผ่าน configuration validator |

Route นี้ไม่ query GitLab และไม่อ่านหรือเขียน mapping.

## Request

ไม่มี path, query หรือ body parameters. เรียกผ่าน owner gate; GitLab configuration อ่านจาก server เท่านั้น.

```bash
curl -i -u "$OWNER_GATE_USERNAME:$OWNER_GATE_PASSWORD" \
  "$APP_ORIGIN/api/integrations/gitlab/status"
```

ห้ามใส่ GitLab token ใน request หรือ browser.

## Response

```json
{
  "configured": true
}
```

| Field | Description |
| --- | --- |
| `configured` | `true` เมื่อ base URL แบบ HTTPS และ token ฝั่ง server ผ่าน validation ครบคู่; มิฉะนั้น `false` |

ทุก response มี `Cache-Control: no-store`.

## Error Responses

| HTTP | Code | Cause |
| ---: | --- | --- |
| 401 | `OWNER_UNAUTHENTICATED` | ยังไม่ผ่าน owner authentication |
| 403 | `ACCESS_DENIED` | Request origin ไม่ตรงกับ `APP_ORIGIN` ตาม runtime gate |
| 503 | `DEPENDENCY_UNAVAILABLE` | ระบบ resolve owner `User` ได้ไม่เท่ากับหนึ่งรายการ |
| 500 | `INTERNAL_ERROR` | เกิดข้อผิดพลาดระหว่างตรวจสถานะ; response ไม่เปิดเผยรายละเอียดภายใน |

Error ใช้ envelope `{ "error": { "code", "message" } }`.

## Processing Flow

Owner gate → `getOwner()` → validate server configuration → ส่งเฉพาะ boolean `configured`. Route จงใจไม่ทำ outbound request ไป GitLab.

## Verification

เตรียม owner สำหรับ environment และเรียก curl ด้านบน. เมื่อ config ถูกต้องคาดหวัง `200` และ `configured: true`; เมื่อขาดหรือไม่ผ่าน validation คาดหวัง `200` และ `configured: false`. เรียกโดยไม่มี owner credentials คาดหวัง `401`. ใช้ `pnpm test:gitlab` สำหรับ route tests แบบ mock; ไม่มีการใช้ secret จริงหรือเชื่อมต่อ GitLab.
