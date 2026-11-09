# GitLab Project mappings

## Overview

ดูหรือสร้าง mapping จาก GitLab Project ไปยัง PMS Project พร้อม `approvedLabelMap`. การสร้างต้องมี server configuration แต่ไม่เรียก GitLab.

| Method | Endpoint | Success |
| --- | --- | --- |
| GET | `/api/integrations/gitlab/projects` | 200 |
| POST | `/api/integrations/gitlab/projects` | 201 |

## สิทธิ์ที่มองเห็น

ทั้งสอง method ต้องผ่าน HTTP Basic owner gate, middleware proof และ `getOwner()`; ไม่มี role/permission แยก. `POST` ต้องมี `GITLAB_BASE_URL` และ `GITLAB_TOKEN` ที่ valid ฝั่ง server. ดู [Owner access](../../operations/owner-access.md).

## ดึงข้อมูลจากตารางไหน

| Table | Operation | เหตุผล |
| --- | --- | --- |
| `User` | Read | resolve owner |
| `GitLabProjectMapping` | GET: Read; POST: Insert | แสดงหรือบันทึก project mapping |
| `Project` | Read | ตรวจ PMS Project และใส่ Project context ในผลลัพธ์ |
| `Company` | Read | แสดง Company ที่เชื่อมกับ Project ในผลลัพธ์ |
| `ExternalWorkItemReference` | POST: Read | ป้องกัน GitLab Project ที่มี imported history ของ PMS Project อื่น |

POST ปฏิเสธ mapping ที่มี duplicate `(canonicalGitLabInstanceUrl, gitLabProjectId)` หรือขัดกับ reference ที่มีอยู่.

## Request

### GET

ไม่มี path, query หรือ body parameters.

### POST

`Content-Type: application/json`; รับเฉพาะ fields ต่อไปนี้และปฏิเสธ unknown fields.

| Field | Type | Required | Validation / behavior |
| --- | --- | --- | --- |
| `gitLabProjectId` | string | Yes | เลขฐานสิบที่มากกว่า 0; ไม่รับค่าจาก URL หรือจาก GitLab โดยตรง |
| `projectId` | string | Yes | public UUIDv4 ของ PMS Project ที่มีอยู่ |
| `approvedLabelMap` | object ของ string → string | Yes | ไม่เกิน 100 entries; label ต้องไม่ว่างและยาวไม่เกิน 255 ตัวอักษร; target ต้องเป็น WorkItem type ที่รองรับ: `bug`, `data`, `documentation`, `epic`, `feature`, `maintenance`, `opl`, `ops`, `support`, `task`. `{}` ใช้ได้ |

ตัวอย่าง:

```bash
curl -i -u "$OWNER_GATE_USERNAME:$OWNER_GATE_PASSWORD" \
  -H 'Content-Type: application/json' \
  -d '{"gitLabProjectId":"42","projectId":"pms-project-id","approvedLabelMap":{"bug":"bug","customer feedback":"support"}}' \
  "$APP_ORIGIN/api/integrations/gitlab/projects"
```

ห้ามส่ง `instanceUrl`, token หรือข้อมูล credentials ใน body; instance URL ถูกกำหนดจาก server configuration.

## Response

### GET — 200

```json
{
  "mappings": [
    {
      "id": "mapping-id",
      "instanceUrl": "https://gitlab.example.test/base",
      "gitLabProjectId": "42",
      "projectId": "pms-project-id",
      "approvedLabelMap": { "bug": "bug" },
      "firstSyncApprovedAt": null,
      "createdAt": "2026-09-30T12:00:00.000+07:00",
      "updatedAt": "2026-09-30T12:00:00.000+07:00",
      "project": {
        "id": "pms-project-id",
        "name": "Example Project",
        "company": { "id": "company-id", "name": "Example Company", "displayName": null }
      }
    }
  ]
}
```

### POST — 201

```json
{
  "mapping": {
    "id": "mapping-id",
    "instanceUrl": "https://gitlab.example.test/base",
    "gitLabProjectId": "42",
    "projectId": "pms-project-id",
    "approvedLabelMap": { "bug": "bug" },
    "firstSyncApprovedAt": null,
    "createdAt": "2026-09-30T12:00:00.000+07:00",
    "updatedAt": "2026-09-30T12:00:00.000+07:00",
    "project": {
      "id": "pms-project-id",
      "name": "Example Project",
      "company": { "id": "company-id", "name": "Example Company", "displayName": null }
    }
  }
}
```

| Response field | Description |
| --- | --- |
| `mappings` | รายการ mapping ตามลำดับ `createdAt`, แล้ว `id`; มีเฉพาะ GET |
| `mapping` | mapping ที่เพิ่งสร้าง; มีเฉพาะ POST |
| `id` | Public UUIDv4 ของ mapping ใน PMS |
| `instanceUrl` | Canonical GitLab base URL ที่มาจาก server config |
| `gitLabProjectId` | GitLab Project numeric ID ในรูป string เพื่อคง precision |
| `projectId` | Public UUIDv4 ของ PMS Project ปลายทาง |
| `approvedLabelMap` | JSON object ที่จับคู่ GitLab label แบบ exact กับ WorkItem type |
| `firstSyncApprovedAt` | เวลา owner อนุมัติ first sync ในรูป `+07:00`; `null` ก่อนอนุมัติ |
| `createdAt` | เวลาสร้าง mapping ใน Bangkok offset `+07:00` |
| `updatedAt` | เวลาแก้ mapping ล่าสุดใน Bangkok offset `+07:00` |
| `project` | PMS Project context ที่ route เลือกส่งคืน |
| `project.id` | Public UUIDv4 ของ PMS Project |
| `project.name` | ชื่อ Project |
| `project.company` | Company ที่เชื่อมกับ Project |
| `project.company.id` | Public UUIDv4 ของ Company |
| `project.company.name` | ชื่อ Company |
| `project.company.displayName` | ชื่อแสดงผลของ Company; เป็น string หรือ `null` |

ทุก success response ใช้ `Cache-Control: no-store`.

## Error Responses

| HTTP | Code | Cause |
| ---: | --- | --- |
| 400 | `VALIDATION_ERROR` | body/field ไม่ถูกต้อง หรือ `projectId` ไม่พบ |
| 401 | `OWNER_UNAUTHENTICATED` | ยังไม่ผ่าน owner authentication |
| 403 | `ACCESS_DENIED` | Request origin ไม่ตรงกับ `APP_ORIGIN` |
| 409 | `CONFLICT` | GitLab Project มี mapping ซ้ำ หรือมี external reference ไปยัง PMS Project อื่น |
| 503 | `DEPENDENCY_UNAVAILABLE` | POST แต่ GitLab server configuration ยังไม่พร้อม หรือ owner `User` resolve ไม่ได้ |
| 500 | `INTERNAL_ERROR` | database/route failure; response ไม่เปิดเผยข้อมูลภายใน |

ข้อผิดพลาดส่ง `{ "error": { "code", "message", "field?" } }`; `field` จะปรากฏเมื่อ route ระบุ field ที่ผิด.

## Processing Flow

ทุก request ผ่าน owner gate. GET อ่าน mapping พร้อม Project และ Company. POST ตรวจ configuration → validate body → อ่าน Project และ reference ที่ขัดกัน → insert mapping → คืน safe serialization; token ไม่ออกจาก server.

## Verification

ใช้ test environment ที่มี owner และ PMS Project fixture. `GET` ควรคืน `200` พร้อม `mappings`; POST ด้วย Project ที่มีอยู่และ ID ใหม่ควรคืน `201`. ทดลอง mapping ซ้ำ, Project ที่ไม่มีอยู่, label target ที่ไม่รองรับ, GitLab configuration ที่หาย และ unauthenticated request. ตรวจ `pnpm test:gitlab` สำหรับ mocked route tests; ไม่เรียก GitLab จริง.
