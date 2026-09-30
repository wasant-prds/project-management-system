# Bulk WorkItem import

## Overview

ตรวจ WorkItem rows ทั้งชุดก่อนบันทึกเป็น bulk `createMany`. API นี้นำข้อมูลเข้า PMS โดยตรง; ไม่ได้เชื่อม GitLab.

| Property | Value |
| --- | --- |
| Method | `POST` |
| Endpoint | `/api/work-items/import` |

## สิทธิ์ที่มองเห็น

ต้องผ่าน owner gate และ `getOwner()`. ทุก WorkItem ได้ `assigneeId` จาก server-resolved owner; client เปลี่ยน owner ไม่ได้.

## ดึงข้อมูลจากตารางไหน

| Table | Operation | เหตุผล |
| --- | --- | --- |
| `User` | Read | resolve owner และ set assignee ID |
| `Project` | Read | ตรวจว่า Project IDs ทุกตัวมีอยู่ก่อน insert |
| `work_items` | Insert | bulk create หลัง validate rows ทั้งหมด |

## Request

Body เป็น non-empty array ของ WorkItem objects หรือ object `{ "workItems": [...] }`. แต่ละ row ใช้ fields/validation เดียวกับ [WorkItem create](./collection.md#post-body); ต้องมี `title`, `projectId`, `kind`. `id` ที่ให้มาจะถูกใช้ใน bulk import หาก non-empty. `assigneeId` หากส่งต้องเท่ากับ owner (หรือเป็น null/empty).

```json
{
  "workItems": [
    {"id":"external-1","title":"Fix login","projectId":"project-id","kind":"Issue","status":"todo"}
  ]
}
```

## Response

HTTP `201`:

| Field | Description |
| --- | --- |
| `imported` | จำนวน WorkItem ที่ `createMany` insert สำเร็จ |

```jsonc
{"imported": 1 // จำนวน rows ที่สร้างสำเร็จ}
```

## Error Responses

| HTTP | Body/code | Cause |
| ---: | --- | --- |
| `400` | `{error}` | body ไม่ใช่ array ที่รองรับ, array ว่าง หรือ row แรกที่ validation ไม่ผ่าน |
| `401` | `OWNER_UNAUTHENTICATED` | owner gate/resolver ปฏิเสธ |
| `403` | `ACCESS_DENIED` | Origin ไม่ผ่าน |
| `404` | `{error, row}` | Project ใน row ไม่มี; `row` เป็น index เริ่มจาก 1 |
| `409` | `{error}` | ID ซ้ำ (`P2002`); message ระบุว่าไม่มีการ import |
| `500` | `{error: "Failed to import work items"}` | bulk insert/DB error |
| `503` | `DEPENDENCY_UNAVAILABLE` | owner resolve ไม่ได้ |

Error validation ระดับ row ตอบ `row` และข้อความ prefix `Row N:`. ตรวจทุก row และ Project ก่อนเรียก `createMany`; ไม่มี row-success response แบบ partial.

## Processing Flow

Gate → resolve owner → parse envelope → validate each row และ force owner → ตรวจ Project IDs → set submittedAt สำหรับ status ที่กำหนด → `createMany` → imported count.

## Verification

`pnpm test:auth`. ใช้ test DB/fixture; ตรวจ array และ wrapper input, invalid row index, foreign assignee, missing Project, duplicate IDs ที่ atomic ไม่สร้าง partial data และ valid count. ห้ามใช้ข้อมูล production/GitLab credential เป็น fixture.
