# Owner access

## ภาพรวม

ระบบปัจจุบันรองรับ owner หนึ่งคน ไม่ได้ใช้ RBAC หรือ role matrix. Browser เข้าสู่ระบบผ่าน `/login` ด้วย `OWNER_GATE_USERNAME` และ `OWNER_GATE_PASSWORD` ที่ provision ไว้เดิม. Node owner gate ตรวจ credential แล้วออก opaque session cookie ก่อนส่ง request ที่ยืนยันตัวตนไปยัง Next.js ที่ bind กับ loopback; middleware ตรวจ internal proof และ Route Handler เรียก `getOwner()` เพื่อ resolve `User` จาก PostgreSQL. HTTP Basic ยังรองรับสำหรับ scripts/API clients โดยไม่แสดง browser authentication dialog

## Browser login

- `GET /login` และ read-only `/_next/static/*`, `/favicon.ico`, `/icon.svg` เป็น public สำหรับแสดงหน้า login; gate ลบ internal proof/marker ของ request เหล่านี้เสมอ. หน้า login ไม่โหลด owner settings หรือข้อมูลธุรกิจ
- `POST /api/auth/login` รับ JSON `{ username, password, next? }`; ต้องมี `Origin` ตรงกับ `APP_ORIGIN`. การเข้าสู่ระบบผิดตอบ generic `401`; จำกัด 10 attempts ต่อ connection IP ภายใน 60 วินาที แล้วตอบ `429` พร้อม `Retry-After`. ไม่เชื่อ `X-Forwarded-For`
- Cookie `pms_owner_session` ใช้ token สุ่ม 256 bits, `HttpOnly`, `SameSite=Strict`, `Path=/` และ `Secure` เมื่อ `APP_ORIGIN` เป็น HTTPS. มีอายุ 8 ชั่วโมง; gate เก็บเฉพาะ SHA-256 ของ token ใน memory. Logout, login ที่แทน session เดิม และ runtime restart ทำให้ session เก่าใช้ไม่ได้. ไม่สร้าง table หรือเปลี่ยนฐานข้อมูล
- Request หน้าเว็บที่ยังไม่เข้าสู่ระบบ redirect ไป `/login?next=…`; login สำเร็จคืน `redirectTo` เฉพาะ relative workspace URL ที่ผ่าน server validation. Request API ยังคงตอบ `401` JSON
- `POST /api/auth/logout` ต้องผ่าน same-origin policy; revoke session และล้าง cookie. UI อยู่ในเมนูโปรไฟล์ด้านขวาบน
- Password และ session token ไม่ถูกส่งเข้า Next.js, client storage หรือ audit log. UI ใช้ password-manager autocomplete และแสดง loading/error โดยไม่เก็บ credential

## การยืนยันตัวตนและสิทธิ์

| ชั้น | พฤติกรรมที่ยืนยันจาก implementation |
| --- | --- |
| Runtime gate | ตรวจ opaque session หรือ HTTP Basic; credential เดิมใช้ `OWNER_GATE_USERNAME` และ `OWNER_GATE_PASSWORD` ซึ่งต้องยาวอย่างน้อย 32 ตัวอักษร; เปรียบเทียบแบบ timing-safe |
| Request origin | Unsafe methods และ request ที่มี `Origin` ต้องตรงกับ `APP_ORIGIN`; มิฉะนั้นตอบ `403 ACCESS_DENIED` |
| Next.js middleware | ยอมรับ internal proof ที่ launcher สร้างต่อ process; ปฏิเสธ private page/API ที่ไม่มี proof ด้วย `401`; ยกเว้น read-only `/login` และ `GET /api/health` |
| Owner resolver | ต้องมี authenticated marker และ proof ถูกต้อง; เลือก `User` เดียว หรือเลือกตาม `OWNER_USER_ID`; ไม่ได้ใช้ `User.role` เป็น permission |
| Owner row count | หาก resolve ไม่ได้หนึ่ง User พอดี จะ fail closed ด้วย `503 DEPENDENCY_UNAVAILABLE` |
| API | ทุก business API ใน handbook ต้องผ่าน gate และเรียก `getOwner()`; `GET /api/health` เป็น public infrastructure probe |

Browser ไม่สามารถเลือก owner ด้วย `userId` หรือ `assigneeId`. Work Items และ TimeEntry ใช้ owner ที่ resolver คืนมา; client IDs ที่ต่างจาก owner ถูกปฏิเสธใน route ที่รองรับการส่ง field ดังกล่าว

## Response เมื่อปฏิเสธ

Gate ตอบ JSON `{ "error": { "code", "message" } }` พร้อม `Cache-Control: no-store`; ไม่ส่ง `WWW-Authenticate` เพื่อให้ browser ใช้หน้า login ของระบบ. Middleware ตอบ 401 สำหรับ API ด้วย `OWNER_UNAUTHENTICATED`. Owner row ผิดเงื่อนไขตอบ 503 จาก resolver. ไม่มี password, proof หรือ Basic credentials ใน response/log ที่ gate สร้าง

## Verification

1. ใช้ root `.env` ของ environment ที่ต้องการ และตรวจค่าด้วย `node scripts/runtime-launch.mjs --check` ซึ่งแสดงเฉพาะ safe summary.
2. เรียก API ด้วย Basic credential ที่ provision แล้ว ห้ามใส่ credential จริงในเอกสารหรือ shell history:

```bash
curl -i -u "$OWNER_GATE_USERNAME:$OWNER_GATE_PASSWORD" "$APP_ORIGIN/api/users"
curl -i "$APP_ORIGIN/api/users"
```

Request แรกควรผ่าน access gate เมื่อ owner User ถูก resolve ได้; request ที่สองควรเป็น 401. ทดสอบ Origin mismatch เฉพาะ environment ทดสอบ: ส่ง `Origin` ที่ไม่ตรงกับ `APP_ORIGIN` ไปยัง `POST` แล้วคาดหวัง 403.

Focused tests: `pnpm test:auth` และ `pnpm test:runtime-security`. ดูรายละเอียด credential และ network assumptions ใน [Runtime Security](./runtime-security.md).
