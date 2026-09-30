# Owner access

## ภาพรวม

ระบบปัจจุบันรองรับ owner หนึ่งคน ไม่ได้ใช้ RBAC หรือ role matrix. HTTP Basic ถูกตรวจโดย Node owner gate ก่อนส่ง request ไปยัง Next.js ที่ bind กับ loopback; middleware ตรวจ internal proof และ Route Handler เรียก `getOwner()` เพื่อ resolve `User` จาก PostgreSQL

## การยืนยันตัวตนและสิทธิ์

| ชั้น | พฤติกรรมที่ยืนยันจาก implementation |
| --- | --- |
| Runtime gate | ตรวจ `OWNER_GATE_USERNAME` และ `OWNER_GATE_PASSWORD`; password ต้องยาวอย่างน้อย 32 ตัวอักษร; เปรียบเทียบแบบ timing-safe |
| Request origin | Unsafe methods และ request ที่มี `Origin` ต้องตรงกับ `APP_ORIGIN`; มิฉะนั้นตอบ `403 ACCESS_DENIED` |
| Next.js middleware | ยอมรับ internal proof ที่ launcher สร้างต่อ process; ปฏิเสธ page/API ที่ไม่มี proof ด้วย `401`; ยกเว้น `GET /api/health` |
| Owner resolver | ต้องมี authenticated marker และ proof ถูกต้อง; เลือก `User` เดียว หรือเลือกตาม `OWNER_USER_ID`; ไม่ได้ใช้ `User.role` เป็น permission |
| Owner row count | หาก resolve ไม่ได้หนึ่ง User พอดี จะ fail closed ด้วย `503 DEPENDENCY_UNAVAILABLE` |
| API | ทุก business API ใน handbook ต้องผ่าน gate และเรียก `getOwner()`; `GET /api/health` เป็น public infrastructure probe |

Browser ไม่สามารถเลือก owner ด้วย `userId` หรือ `assigneeId`. Work Items และ TimeEntry ใช้ owner ที่ resolver คืนมา; client IDs ที่ต่างจาก owner ถูกปฏิเสธใน route ที่รองรับการส่ง field ดังกล่าว

## Response เมื่อปฏิเสธ

Gate ตอบ JSON `{ "error": { "code", "message" } }` พร้อม `Cache-Control: no-store`; 401 เพิ่ม `WWW-Authenticate: Basic`. Middleware ตอบ 401 สำหรับ API ด้วย `OWNER_UNAUTHENTICATED`. Owner row ผิดเงื่อนไขตอบ 503 จาก resolver. ไม่มี password, proof หรือ Basic credentials ใน response/log ที่ gate สร้าง

## Verification

1. ใช้ root `.env` ของ environment ที่ต้องการ และตรวจค่าด้วย `node scripts/runtime-launch.mjs --check` ซึ่งแสดงเฉพาะ safe summary.
2. เรียก API ด้วย Basic credential ที่ provision แล้ว ห้ามใส่ credential จริงในเอกสารหรือ shell history:

```bash
curl -i -u "$OWNER_GATE_USERNAME:$OWNER_GATE_PASSWORD" "$APP_ORIGIN/api/users"
curl -i "$APP_ORIGIN/api/users"
```

Request แรกควรผ่าน access gate เมื่อ owner User ถูก resolve ได้; request ที่สองควรเป็น 401. ทดสอบ Origin mismatch เฉพาะ environment ทดสอบ: ส่ง `Origin` ที่ไม่ตรงกับ `APP_ORIGIN` ไปยัง `POST` แล้วคาดหวัง 403.

Focused tests: `pnpm test:auth` และ `pnpm test:runtime-security`. ดูรายละเอียด credential และ network assumptions ใน [Runtime Security](../../RUNTIME_SECURITY.md).
