# Health check

## Overview

ตรวจว่า API process เข้าถึง PostgreSQL ได้และ session timezone เป็น `Asia/Bangkok`. ใช้โดย Docker/monitoring ไม่ใช่เมนูธุรกิจ

| Property | Value |
| --- | --- |
| Method | `GET` |
| Endpoint | `/api/health` |

## สิทธิ์ที่มองเห็น

ไม่ต้องใช้ owner credential; runtime owner gate อนุญาตเฉพาะ `GET /api/health` เป็น probe สาธารณะ. Next.js middleware มี exception สำหรับ path/method นี้. นอกเหนือจาก gate API ยัง bind กับ host/port ตาม Compose ซึ่งปัจจุบันใช้ loopback.

## ดึงข้อมูลจากตารางไหน

ไม่อ่าน table. รัน `SELECT current_setting('TimeZone') AS timezone` ผ่าน Prisma เพื่อเช็ก PostgreSQL session.

## Request

ไม่มี path parameter, query parameter, header เฉพาะ หรือ request body.

```bash
curl -i http://localhost:3777/api/health
```

## Response

HTTP `200` เมื่อ query สำเร็จและ timezone ถูกต้อง; HTTP `503` เมื่อ DB query ล้มเหลวหรือ timezone ไม่ใช่ Bangkok.

| Field | คำอธิบาย |
| --- | --- |
| `status` | `healthy` เมื่อ DB ใช้งานได้; `unhealthy` เมื่อ probe ล้มเหลว |
| `timestamp` | เวลาที่ probe ทำงาน แสดง offset `+07:00` |
| `database` | `connected` หรือ `disconnected` |
| `uptime` | วินาทีที่ Node.js process ทำงาน; มีเฉพาะ success response |

```jsonc
{
  "status": "healthy", // ผลรวมของ health probe
  "timestamp": "2026-09-30T12:00:00.000+07:00", // เวลา probe ใน Bangkok
  "database": "connected", // ผลการเชื่อมต่อ PostgreSQL
  "uptime": 3600 // ระยะเวลาที่ process ทำงาน หน่วยวินาที
}
```

503 response มี `status`, `timestamp`, `database`; ไม่มี `uptime` หรือ raw error. ไม่มี error code/message ใน body.

## Processing Flow

GET request → owner gate health exception → Prisma query current session timezone → compare กับ `Asia/Bangkok` → JSON 200 หรือ 503.

## Verification

1. เรียก `/api/health` ใน environment ที่เริ่มแล้ว; คาดหวัง 200 และ `database: connected`.
2. ตรวจ PostgreSQL readiness และ timezone ใน environment ทดสอบเพื่อวิเคราะห์ 503.
3. Automated coverage: `pnpm test:runtime-security`, `pnpm test:runtime-docker`, `pnpm test:database-rollout-docker` (Docker tests อาจเป็น opt-in).
