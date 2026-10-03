# Owner settings

## ภาพรวม

`GET` and `PATCH /api/settings/me` อ่านและแก้ profile กับ preferences ของ owner ที่ server resolve ได้ ใช้โดยหน้า Settings และ header theme control.

| Method | Endpoint | พฤติกรรมหลัก |
| --- | --- | --- |
| `GET` | `/api/settings/me` | อ่าน profile และ preferences ของ owner; ตอบ `Cache-Control: no-store` |
| `PATCH` | `/api/settings/me` | แก้เฉพาะ profile/preference fields ที่ส่งมา แล้วคืน settings ปัจจุบัน |

ทั้งสอง method ใช้ `User` เดียวกัน; API ไม่รับ ID สำหรับเลือกบัญชีและ never returns the `User.password` field. Theme มี `light`, `dark`, `special-dark`; locale มี `th`, `en`; Timezone เป็น read-only `Asia/Bangkok` คงที่.

## สิทธิ์ที่มองเห็น

ต้องผ่าน HTTP Basic owner gate ของ runtime และ Next.js middleware จากนั้น Route Handler เรียก `getOwner()` เพื่อ resolve owner ฝั่ง server. รองรับ owner หนึ่งบัญชี ไม่มี Required Role หรือ permission จาก `User.role`. Request ไม่สามารถเลือก owner ด้วย `userId`.

Request ที่ไม่มีหรือใช้ Basic credentials ไม่ถูกต้องตอบ `401`. สำหรับ `PATCH`, runtime gate ต้องได้รับ `Origin` ที่ตรงกับ `APP_ORIGIN`; origin ไม่ตรงหรือตกหล่นตอบ `403 ACCESS_DENIED`. Internal proof ถูกสร้างและตรวจภายใน runtime; client ไม่ควรส่ง internal headers เอง. อ่าน [Owner access](../../operations/owner-access.md) สำหรับ gate และการตั้งค่า environment.

## ดึงข้อมูลจากตารางไหน

| Table | Operation | เหตุผล |
| --- | --- | --- |
| `User` | Read | `getOwner()` resolve owner; `GET` อ่าน profile และ preferences ด้วย `User.id` ของ owner |
| `User` | Update | `PATCH` เขียนเฉพาะ profile/theme/locale fields ที่ผ่าน validation โดยใช้ owner ID เดิม |

ไม่มีการ insert/delete หรืออ่านตารางอื่นใน flow นี้. Resolver ไม่ select `password`; settings service เลือกเฉพาะ `id`, `name`, `email`, `phone`, `avatar`, `theme`, `locale`.

## Request

### Path และ Query Parameters

ไม่มี path หรือ query parameters.

### Headers

| Header | Method | Required | รายละเอียด |
| --- | --- | --- | --- |
| `Authorization: Basic …` | ทั้งสอง | Required โดย owner gate | ใช้ credentials ที่ provision ให้ environment; ห้ามบันทึก credentials จริงในเอกสารหรือ shell history |
| `Origin` | `PATCH` | Required โดย owner gate | ต้องตรงกับ `APP_ORIGIN`; request ที่มี Origin ไม่ตรงถูกปฏิเสธ |
| `Content-Type: application/json` | `PATCH` | Recommended | ระบุชนิด JSON ของ body; Route Handler parse body เป็น JSON |

### `GET` Body

ไม่มี request body.

### `PATCH` Body

ส่ง `profile`, `preferences` หรือทั้งคู่ก็ได้ แต่ต้องส่งอย่างน้อยหนึ่ง object และ object ที่ส่งมาต้องไม่ว่าง. ระดับบนยอมรับเฉพาะ `profile` และ `preferences`; field ที่ไม่รองรับ รวมถึง `userId`, `timezone`, security และ notification fields ตอบ `400 VALIDATION_ERROR`.

| Field | Type | Required | Validation / behavior |
| --- | --- | --- | --- |
| `profile` | Object | Optional* | ต้องมีอย่างน้อยหนึ่ง field; รับเฉพาะ fields ในตาราง profile |
| `profile.name` | String | Optional | Trim ก่อนบันทึก; ยาว 1–100 ตัวอักษรหลัง trim |
| `profile.email` | String | Optional | Trim ก่อนบันทึก; ยาวไม่เกิน 254 ตัวอักษร; ต้องมี `@` เดียว, มี `.` ในส่วนหลัง `@`, ไม่มี whitespace และต้องไม่ซ้ำ |
| `profile.phone` | String หรือ `null` | Optional | String ยาวไม่เกิน 40 ตัวอักษรหลัง trim; ค่าว่างหลัง trim หรือ `null` บันทึกเป็น `null` |
| `profile.avatar` | String หรือ `null` | Optional | ค่าที่ไม่ว่างต้อง parse เป็น HTTPS URL; ค่าว่างหลัง trim หรือ `null` บันทึกเป็น `null`; API รองรับแต่ Settings UI ไม่มี upload control |
| `preferences` | Object | Optional* | ต้องมีอย่างน้อยหนึ่ง field; รับเฉพาะ fields ในตาราง preferences |
| `preferences.theme` | String | Optional | หนึ่งใน `light`, `dark`, `special-dark` |
| `preferences.locale` | String | Optional | หนึ่งใน `th`, `en`; ใช้กำหนด `document.documentElement.lang` ฝั่ง client |

`*` ต้องส่งอย่างน้อยหนึ่ง object ระหว่าง `profile` กับ `preferences`; nested fields ทั้งหมดเป็น partial update.

ตัวอย่างแก้ theme โดยไม่ส่ง field อื่น:

```bash
curl -i -u "${OWNER_GATE_USERNAME}:${OWNER_GATE_PASSWORD}" \
  -H "Origin: ${APP_ORIGIN}" \
  -H 'Content-Type: application/json' \
  --data '{"preferences":{"theme":"dark"}}' \
  "${APP_ORIGIN}/api/settings/me"
```

ตัวอย่างแก้หลาย fields:

```json
{
  "profile": {
    "name": "Owner ใหม่",
    "email": "owner@example.test",
    "phone": "+66 80 000 0000"
  },
  "preferences": {
    "theme": "special-dark",
    "locale": "en"
  }
}
```

## Response

### `GET` และ `PATCH` สำเร็จ — `200 OK`

ทั้งสอง method คืน object รูปแบบเดียวกัน. `PATCH` คืนค่าจาก `User` หลังบันทึกแล้ว. Response ส่ง `Cache-Control: no-store`.

```jsonc
{
  "profile": { // profile ของ owner ที่ server resolve
    "name": "Owner", // ชื่อที่แสดงจาก User.name
    "email": "owner@example.test", // อีเมลจาก User.email
    "phone": null, // เบอร์ติดต่อจาก User.phone หรือ null เมื่อไม่กำหนด
    "avatar": null // HTTPS avatar URL หรือ null เมื่อไม่กำหนด
  },
  "preferences": { // preferences ที่ UI ใช้ร่วมกัน
    "theme": "light", // light, dark หรือ special-dark จาก User.theme
    "locale": "th", // th หรือ en จาก User.locale
    "timezone": "Asia/Bangkok" // timezone ระบบคงที่ ไม่ได้อ่านจาก owner preference
  }
}
```

ไม่มี ID, role, password หรือข้อมูลผู้ใช้รายอื่นใน response.

## Error Responses

Error ของ Route Handler และ runtime gate ใช้ JSON envelope; error responses จาก API ตั้ง `Cache-Control: no-store`.

| HTTP | Code | สาเหตุ |
| ---: | --- | --- |
| `400` | `VALIDATION_ERROR` | JSON ผิดรูปแบบ, body/object ว่าง, field ไม่รองรับ, หรือค่า profile/preferences ไม่ผ่าน validation |
| `401` | `OWNER_UNAUTHENTICATED` | ไม่มี/ผิด Basic credentials หรือ middleware/owner resolver ไม่ยืนยัน owner |
| `403` | `ACCESS_DENIED` | `Origin` ไม่ตรงกับ `APP_ORIGIN` ตาม owner gate |
| `404` | `NOT_FOUND` | ไม่พบ owner settings row ตอนอ่าน หรือ Prisma แจ้งว่า update row ไม่พบ |
| `409` | `CONFLICT` | Email ซ้ำ; response ระบุ `field: "email"` |
| `500` | `INTERNAL_ERROR` | Error ที่ไม่เข้ากรณีที่ map ไว้; ไม่คืน raw database error หรือ stack trace |
| `503` | `DEPENDENCY_UNAVAILABLE` | Owner resolver ไม่พบ User หนึ่งแถวพอดี, database unavailable หรือ runtime upstream ใช้งานไม่ได้ |

ตัวอย่าง validation error:

```jsonc
{
  "error": { // envelope สำหรับ error
    "code": "VALIDATION_ERROR", // ประเภท error ที่ client ใช้แยกกรณี
    "message": "ระบบไม่รองรับ preference นี้; timezone ใช้ Asia/Bangkok คงที่", // สาเหตุที่แสดงให้ผู้ใช้ได้
    "field": "preferences" // field ที่ validation ปฏิเสธ; อาจไม่มีใน error ทั่วไป
  }
}
```

ตัวอย่าง email conflict:

```jsonc
{
  "error": { // envelope สำหรับ error
    "code": "CONFLICT", // ระบุว่าค่าชนกับข้อมูลที่มีอยู่
    "message": "อีเมลนี้ถูกใช้แล้ว", // ข้อความที่แสดงได้อย่างปลอดภัย
    "field": "email" // field ที่มีค่าซ้ำ
  }
}
```

## Processing Flow

Request → runtime ตรวจ Basic credentials และ Origin → middleware ตรวจ owner proof → Route Handler เรียก `getOwner()` → `GET` อ่านหรือ `PATCH` parse/validate body → settings service อ่าน/แก้ `User` ตาม owner ID → คืน response แบบ `no-store`. สำหรับ PATCH, owner ถูก resolve ก่อนอ่านและ validate body.

Client `OwnerSettingsProvider` โหลด settings ด้วย GET ครั้งเดียวต่อ mount/reload แล้วแชร์ค่ากับหน้า Settings และ header theme control. ทั้งสองจุดบันทึกผ่าน PATCH; client ใช้ค่าที่ server ยืนยันแล้วปรับ ThemeProvider และ HTML language.

## Verification

### ทดสอบผ่าน owner gate

ใช้ credentials จาก environment ที่ได้รับอนุญาต โดยอย่าใส่ค่าจริงในเอกสารหรือ commit. GET ไม่มี Origin บังคับ; PATCH ต้องส่ง `Origin` ให้ตรง `APP_ORIGIN`.

```bash
curl -i -u "${OWNER_GATE_USERNAME}:${OWNER_GATE_PASSWORD}" \
  "${APP_ORIGIN}/api/settings/me"

curl -i -u "${OWNER_GATE_USERNAME}:${OWNER_GATE_PASSWORD}" \
  -H "Origin: ${APP_ORIGIN}" \
  -H 'Content-Type: application/json' \
  --data '{"preferences":{"theme":"dark"}}' \
  "${APP_ORIGIN}/api/settings/me"
```

ทั้งสอง request ควรคืน `200`; GET หลัง PATCH ควรแสดง `preferences.theme` เป็น `dark`. ใช้เฉพาะ environment ทดสอบเพื่อยืนยัน negative cases: ไม่มี Basic credentials คาดหวัง `401`, Origin ไม่ตรงคาดหวัง `403`, ส่ง `{ "preferences": { "timezone": "UTC" } }` คาดหวัง `400`, และ email ที่มีอยู่แล้วคาดหวัง `409`.

### Unit/API tests และ schema

- `pnpm test:settings` หรือ `node tests/run.mjs settings` — API tests ใช้ in-memory Prisma/owner mocks; Settings/provider tests ใช้ mocked React และ fetch ไม่ต่อ PostgreSQL หรือ external services.
- `pnpm exec prisma validate` — ตรวจ Prisma schema source.
- `GET /api/settings/me` และ `PATCH /api/settings/me` ต้องผ่าน verified backup/restore, explicit environment approval และ schema-hash rollout gate ก่อน apply schema กับ environment จริง; Issue #25 ไม่ได้ sync schema หรือแก้ database จริง.

## Source references

- [Route Handler](../../../../app/api/settings/me/route.ts)
- [Settings parser and types](../../../../lib/settings-input.ts)
- [Settings database service](../../../../lib/settings.ts)
- [Owner resolver](../../../../lib/owner.ts)
- [Prisma schema](../../../../prisma/schema.prisma)
- [Owner Settings provider](../../../../components/layout/owner-settings-provider.tsx)
- [Settings API tests](../../../../tests/settings/management.test.mjs)
- [Settings UI tests](../../../../tests/settings/ui.test.mjs)
