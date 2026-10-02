# Daily Work detail

## Overview

อ่าน แก้ไข หรือลบ Daily Work (`TimeEntry`) ของ owner ตาม ID. วันอิง `Asia/Bangkok` calendar date; persisted timestamps ใช้ Bangkok local wall-clock semantics และไม่แปลงเป็น UTC.

| Method | Endpoint | พฤติกรรม |
| --- | --- | --- |
| `GET` | `/api/work-logs/{id}` | อ่านรายการของ owner พร้อม User, Project และ WorkItem relations |
| `PATCH` | `/api/work-logs/{id}` | แก้ fields ที่ส่งมา โดยคง owner เดิมและตรวจ WorkItem/Project consistency |
| `DELETE` | `/api/work-logs/{id}` | ลบเฉพาะ TimeEntry ของ owner |

## สิทธิ์ที่มองเห็น

ต้องผ่าน Node owner gate ด้วย HTTP Basic และ middleware internal proof. Unsafe method (`PATCH`, `DELETE`) ต้องมี `Origin` ตรงกับ `APP_ORIGIN`; หากส่ง `Origin` ใน request ใดก็ต้องตรงกัน. Route เรียก `getOwner()` เพื่อ resolve User หนึ่งรายการ (เลือกด้วย `OWNER_USER_ID` เมื่อกำหนด หรือใช้เมื่อมี User เพียงหนึ่งรายการ); implementation นี้ไม่ได้ใช้ `User.role` เป็น permission. Record ของ User อื่นอ่าน/แก้/ลบไม่ได้และถูกตอบเป็น `404`.

`userId` ใน PATCH หากส่งต้องตรง owner. `workItemId` ใน next-state ต้องเป็น WorkItem ของ owner และ Project ที่ persist จะ derive จาก WorkItem เสมอ. PATCH legacy record ที่ไม่มี WorkItem ต้องส่ง WorkItem ใหม่ก่อนแก้ไข.

## ดึงข้อมูลจากตารางไหน

| Table | Operation | การใช้งาน |
| --- | --- | --- |
| `User` | Read | resolve owner และ include User relation ใน GET/PATCH response |
| `TimeEntry` | Read / Update / Delete | อ่าน, แก้ไข และลบ record โดย scope `id + userId` |
| `work_items` | Read / row lock | ตรวจ WorkItem ของ owner และ derive `projectId`; include relation ใน response |
| `Project` | Read | include Project relation ใน GET/PATCH response |

## Request

### Headers

| Header | Type | Required | เงื่อนไข |
| --- | --- | --- | --- |
| `Authorization` | HTTP Basic | Yes | ตรวจโดย Node owner gate; ใช้ credential ที่ provision ให้ environment |
| `Content-Type` | media type | No | เมื่อส่ง PATCH body ให้ใช้ `application/json`; route parse JSON body โดยไม่ได้ตรวจ header นี้ |
| `Origin` | URL | Conditional | `PATCH` และ `DELETE` ต้องส่งและต้องตรงกับ `APP_ORIGIN`; request อื่นที่ส่ง header นี้ต้องใช้ origin เดียวกัน |

### Path parameter

| Name | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | string | Yes | primary key ของ TimeEntry |

`GET` และ `DELETE` ไม่มี query parameter หรือ request body.

### PATCH body

ส่ง JSON object ที่มีอย่างน้อยหนึ่ง field ที่แก้ไขได้:

| Field | Type | Required | Validation / behavior |
| --- | --- | --- | --- |
| `description` | string \| null | No | แทนค่าคำอธิบายเมื่อส่ง |
| `remarks` | string \| null | No | แทนค่ารายละเอียดเพิ่มเติมเมื่อส่ง |
| `hours` | number หรือ string | No | API ตรวจ positive finite decimal และขอบเขต `DECIMAL(65,30)` (จำนวนเต็มไม่เกิน 35 หลัก, ทศนิยมไม่เกิน 30 หลัก); ไม่พบข้อมูลที่ยืนยันได้จาก implementation ปัจจุบันเกี่ยวกับ per-day cap; ใช้ string เพื่อรักษาความแม่นยำ |
| `date` | string | No | `YYYY-MM-DD` หรือ Bangkok timestamp ที่ลงท้าย `+07:00`; บันทึกเฉพาะ Bangkok calendar date |
| `workItemId` | string | No | next-state ต้องเป็น WorkItem ของ owner; Project จะ derive จาก WorkItem |
| `projectId` | string | No | compatibility field; หากส่งต้องตรงกับ Project ของ WorkItem ใน next-state |
| `status` | string \| null | No | แทนค่า legacy status ตรง ๆ; ไม่ตรวจ enum |
| `userId` | string | No | compatibility field; หากส่งต้องตรง owner |

ข้อความที่ส่งใน `description`, `remarks`, `status` ต้องเป็น string หรือ `null`. `workItemId` และ `projectId` หากส่งต้องเป็น string ที่ไม่ว่าง. Body ที่ไม่มี mutable field ตอบ validation error. แม้แก้เฉพาะ description/hours/date ก็ตรวจ WorkItem ใน next-state; หากรายการเดิมไม่มี WorkItem ต้องส่ง `workItemId` ใหม่.

```json
{
  "hours": "1.25",
  "date": "2026-09-30T13:30:00+07:00",
  "description": "Review"
}
```

## Response

GET/PATCH ตอบ `200` พร้อม `{workLog}`. Fields ของ `workLog`:

| Field | Description |
| --- | --- |
| `workLog` | TimeEntry ที่อ่านหรือแก้สำเร็จ |
| `workLog.id` | primary key ของ TimeEntry |
| `workLog.description` | คำอธิบาย หรือ `null` |
| `workLog.remarks` | รายละเอียดเพิ่มเติม หรือ `null` |
| `workLog.hours` | ชั่วโมงจาก `TimeEntry.hours` ในรูป Decimal string |
| `workLog.date` | Bangkok calendar date รูปแบบ `YYYY-MM-DD` |
| `workLog.status` | legacy status string หรือ `null` |
| `workLog.createdAt` | เวลาสร้างใน Bangkok wall-clock ISO format พร้อม `+07:00` |
| `workLog.updatedAt` | เวลาแก้ไขล่าสุดใน Bangkok wall-clock ISO format พร้อม `+07:00` |
| `workLog.userId` | foreign key ของ owner |
| `workLog.projectId` | foreign key ของ Project; derive จาก WorkItem สำหรับ record ที่แก้ผ่าน route นี้ |
| `workLog.workItemId` | foreign key ของ WorkItem; อาจเป็น `null` ใน legacy record ที่ยังไม่ได้แก้ |
| `workLog.user` | User relation ของ owner |
| `workLog.user.id` | primary key ของ User |
| `workLog.user.name` | ชื่อ owner |
| `workLog.user.email` | email ของ owner |
| `workLog.user.avatar` | avatar URL หรือ `null` |
| `workLog.project` | Project relation หรือ `null` ใน legacy record |
| `workLog.project.id` | primary key ของ Project |
| `workLog.project.name` | ชื่อ Project |
| `workLog.project.colorProject` | สี Project หรือ `null` |
| `workLog.workItem` | WorkItem relation ของ owner หรือ `null` สำหรับ legacy/foreign-owner relation |
| `workLog.workItem.id` | primary key ของ WorkItem |
| `workLog.workItem.title` | ชื่อ WorkItem |
| `workLog.workItem.kind` | ประเภท WorkItem |
| `workLog.workItem.status` | สถานะ WorkItem ใน public format เช่น `in-progress` |
| `message` | ข้อความยืนยันการลบ; มีเฉพาะใน DELETE response |

```jsonc
{
  "workLog": { // TimeEntry ที่อ่านหรือแก้สำเร็จ
    "id": "time-entry-id", // primary key ของ TimeEntry
    "description": "Review", // คำอธิบาย หรือ null
    "remarks": null, // รายละเอียดเพิ่มเติม หรือ null
    "hours": "1.25", // ชั่วโมงในรูป Decimal string
    "date": "2026-09-30", // Bangkok calendar date
    "status": null, // legacy status หรือ null
    "createdAt": "2026-09-30T12:00:00.000+07:00", // เวลาสร้าง Bangkok
    "updatedAt": "2026-09-30T13:30:00.000+07:00", // เวลาแก้ไขล่าสุด Bangkok
    "userId": "owner-id", // foreign key ของ owner
    "projectId": "project-id", // Project ที่ derive จาก WorkItem
    "workItemId": "work-item-id", // foreign key ของ WorkItem หรือ null ใน legacy record
    "user": { // User relation ของ owner
      "id": "owner-id", // primary key ของ User
      "name": "Owner", // ชื่อ owner
      "email": "owner@example.invalid", // email ของ owner
      "avatar": null // avatar URL หรือ null
    },
    "project": { // Project relation หรือ null ใน legacy record
      "id": "project-id", // primary key ของ Project
      "name": "Website", // ชื่อ Project
      "colorProject": null // สี Project หรือ null
    },
    "workItem": { // WorkItem relation ของ owner หรือ null ใน legacy record
      "id": "work-item-id", // primary key ของ WorkItem
      "title": "Review", // ชื่อ WorkItem
      "kind": "Task", // ประเภท WorkItem
      "status": "in-progress" // สถานะ public ของ WorkItem
    }
  }
}
```

DELETE ตอบ `200`:

```jsonc
{
  "message": "Work log deleted successfully" // ยืนยันว่าลบ TimeEntry ของ owner แล้ว
}
```

## Error Responses

| HTTP | Code | Cause |
| ---: | --- | --- |
| `400` | `VALIDATION_ERROR` | body ไม่ถูกต้อง, ไม่มี field ที่แก้ได้, `userId` ไม่ตรง owner หรือ date/hours/WorkItem ไม่ผ่าน validation |
| `400` | `RELATION_MISMATCH` | `projectId` ที่ส่งไม่ตรง Project ของ WorkItem ใน next-state |
| `401` | `OWNER_UNAUTHENTICATED` | Basic authentication หรือ internal owner proof ไม่ผ่าน |
| `403` | `ACCESS_DENIED` | owner gate ปฏิเสธ `Origin` ที่ไม่ตรง `APP_ORIGIN` |
| `404` | `NOT_FOUND` | TimeEntry ไม่มี/ไม่ใช่ของ owner หรือ WorkItem ไม่มี/ไม่ใช่ของ owner |
| `500` | `INTERNAL_ERROR` | database หรือ server operation ล้มเหลว; ไม่ส่งรายละเอียดภายในกลับไป |
| `503` | `DEPENDENCY_UNAVAILABLE` | resolve owner ไม่ได้หนึ่ง User หรือ owner gate เชื่อมต่อ Next.js ไม่ได้ |

Error response ใช้ envelope `{error:{code,message,field?}}`: `error` คือ object ของ error, `code` คือรหัสสาเหตุ, `message` คือคำอธิบาย และ `field` (ถ้ามี) ระบุ request field ที่เกี่ยวข้อง.

## Processing Flow

GET: owner gate ตรวจ Basic/Origin → middleware ตรวจ internal proof → resolve owner → query `TimeEntry` ด้วย `id + userId` → include relations และ serialize → response. PATCH: ผ่าน gate/resolve owner → parse และ validate body → serializable transaction อ่าน TimeEntry ของ owner → lock และ resolve next WorkItem → ตรวจ optional Project → update โดย persist Project จาก WorkItem → response. DELETE: ผ่าน gate/resolve owner → delete ด้วย `id + userId` → หากไม่พบแถวตอบ `404`.

## Verification

รัน `pnpm test:daily-work` เพื่อทดสอบ detail owner scope, `userId` spoofing, positive Decimal/date validation, missing/foreign WorkItem, Project mismatch, Bangkok timestamp และไม่เขียนข้อมูลเมื่อ validation ไม่ผ่าน ด้วย test doubles. รัน `pnpm test:auth` เพื่อทดสอบ Basic, Origin และ internal proof ที่ owner gate; ขั้นตอนตรวจ environment ดู [Owner access](../../operations/owner-access.md).

Manual check ใน environment ที่ provision owner access แล้ว:

```bash
curl -i -u "$OWNER_GATE_USERNAME:$OWNER_GATE_PASSWORD" \
  "$APP_ORIGIN/api/work-logs/time-entry-id"

curl -i -u "$OWNER_GATE_USERNAME:$OWNER_GATE_PASSWORD" \
  -H "Origin: $APP_ORIGIN" \
  -X PATCH -H "Content-Type: application/json" \
  --data '{"hours":"1.25"}' \
  "$APP_ORIGIN/api/work-logs/time-entry-id"

curl -i -u "$OWNER_GATE_USERNAME:$OWNER_GATE_PASSWORD" \
  -H "Origin: $APP_ORIGIN" -X DELETE \
  "$APP_ORIGIN/api/work-logs/time-entry-id"
```

คาดหวัง `200` เมื่ออ่าน/แก้/ลบ record ของ owner ที่มีอยู่ และ `404` สำหรับ ID ที่ไม่มีหรือเป็นของ owner อื่น.
