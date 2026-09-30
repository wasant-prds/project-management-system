# GitLab Project mapping detail

## Overview

แก้ PMS Project/label map ของ mapping หรือถอน mapping. การถอน mapping ลบเฉพาะ `GitLabProjectMapping`; ไม่ลบ WorkItem, external reference หรือ TimeEntry.

| Method | Endpoint | Success |
| --- | --- | --- |
| PATCH | `/api/integrations/gitlab/projects/{mappingId}` | 200 |
| DELETE | `/api/integrations/gitlab/projects/{mappingId}` | 200 |

## สิทธิ์ที่มองเห็น

ต้องผ่าน HTTP Basic owner gate, middleware proof และ `getOwner()`; ไม่มี role/permission แยก. ดู [Owner access](../../operations/owner-access.md).

## ดึงข้อมูลจากตารางไหน

| Table | Operation | เหตุผล |
| --- | --- | --- |
| `User` | Read | resolve owner |
| `GitLabProjectMapping` | PATCH: Read/Update; DELETE: Read/Delete | อ่าน ตรวจ และแก้/ถอน mapping |
| `Project` | PATCH: Read | ตรวจ Project ปลายทางใหม่และเติม Project context |
| `ExternalWorkItemReference` | PATCH: Read/count | ห้ามย้ายปลายทางเมื่อมี Issue references อยู่แล้ว |
| `Company` | PATCH: Read | เติม Company context ใน response |

PATCH ใช้ `Serializable` transaction. DELETE ไม่ cascade ไป external references; schema แยก reference ออกจาก mapping.

## Request

### Path parameter

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `mappingId` | string | Yes | ID ของ mapping ใน PMS |

### PATCH body

ส่งอย่างน้อยหนึ่ง field; unknown fields ถูกปฏิเสธ. แก้ GitLab Project ID หรือ instance URL ผ่าน endpoint นี้ไม่ได้.

| Field | Type | Required | Validation / behavior |
| --- | --- | --- | --- |
| `projectId` | string | Optional | เมื่อระบุต้องไม่ว่างและต้องมี PMS Project อยู่; ย้ายไม่ได้หากมี external references ของ GitLab Project นี้ |
| `approvedLabelMap` | object ของ string → string | Optional | กฎเดียวกับ [สร้าง mapping](./gitlab-projects.md#post): ไม่เกิน 100 labels, label ไม่ว่าง/ยาวไม่เกิน 255 และ target ต้องเป็น WorkItem type ที่รองรับ |

เมื่อ Project ปลายทางหรือ label map เปลี่ยน `firstSyncApprovedAt` จะถูก reset เป็น `null`; ถ้าส่งค่าเดิม approval ไม่ถูก reset.

```bash
curl -i -X PATCH -u "$OWNER_GATE_USERNAME:$OWNER_GATE_PASSWORD" \
  -H 'Content-Type: application/json' \
  -d '{"approvedLabelMap":{"bug":"bug","enhancement":"feature"}}' \
  "$APP_ORIGIN/api/integrations/gitlab/projects/mapping-id"
```

### DELETE

ไม่มี query หรือ body; ระบุ `mappingId` ใน path.

```bash
curl -i -X DELETE -u "$OWNER_GATE_USERNAME:$OWNER_GATE_PASSWORD" \
  "$APP_ORIGIN/api/integrations/gitlab/projects/mapping-id"
```

## Response

### PATCH — 200

คืน `{ "mapping": ... }` ด้วย shape เดียวกับ POST ใน [GitLab Project mappings](./gitlab-projects.md#response). วันที่เป็น Bangkok offset `+07:00`.

| Response field | Description |
| --- | --- |
| `mapping` | Mapping ที่แก้สำเร็จ |
| `mapping.id` | Primary key ของ mapping ใน PMS |
| `mapping.instanceUrl` | Canonical GitLab base URL จาก server config |
| `mapping.gitLabProjectId` | GitLab Project ID ในรูป string |
| `mapping.projectId` | PMS Project ID ปลายทาง |
| `mapping.approvedLabelMap` | Exact label → WorkItem type map |
| `mapping.firstSyncApprovedAt` | เวลา first-sync approval ใน `+07:00`; reset เป็น `null` เมื่อ destination/label map เปลี่ยน |
| `mapping.createdAt` | เวลาสร้าง mapping ใน `+07:00` |
| `mapping.updatedAt` | เวลาแก้ mapping ล่าสุดใน `+07:00` |
| `mapping.project` | Project context ที่แนบกับ mapping |
| `mapping.project.id` | Project ID |
| `mapping.project.name` | ชื่อ Project |
| `mapping.project.company` | Company ที่เชื่อมกับ Project |
| `mapping.project.company.id` | Company ID |
| `mapping.project.company.name` | ชื่อ Company |
| `mapping.project.company.displayName` | ชื่อแสดงผลของ Company; string หรือ `null` |

### DELETE — 200

```json
{ "deleted": true }
```

| Field | Description |
| --- | --- |
| `deleted` | `true` เมื่อ mapping ถูกถอนสำเร็จ; operation ไม่ลบ imported WorkItems, references หรือ TimeEntries |

ทุก success response ใช้ `Cache-Control: no-store`.

## Error Responses

| HTTP | Code | Cause |
| ---: | --- | --- |
| 400 | `VALIDATION_ERROR` | body ไม่ใช่ object, มี unknown fields, ไม่มี field ที่แก้ได้ หรือค่า field ไม่ผ่าน validation |
| 401 | `OWNER_UNAUTHENTICATED` | ยังไม่ผ่าน owner authentication |
| 403 | `ACCESS_DENIED` | Request origin ไม่ตรงกับ `APP_ORIGIN` |
| 404 | `NOT_FOUND` | ไม่พบ mapping ID |
| 409 | `CONFLICT` | Project ปลายทางมี external references หรือ mapping ชน serialization/update พร้อมกัน |
| 503 | `DEPENDENCY_UNAVAILABLE` | owner `User` resolve ไม่ได้ |
| 500 | `INTERNAL_ERROR` | database/route failure ที่ไม่ได้จัดเป็นกรณีข้างต้น |

Error ใช้ `{ "error": { "code", "message", "field?" } }`; `field` optional.

## Processing Flow

PATCH: owner → validate body → transaction `Serializable` อ่าน mapping → ตรวจ Project และ references หากเปลี่ยนปลายทาง → reset first-sync approval หากค่าที่อนุมัติเปลี่ยน → update และส่ง mapping. DELETE: owner → ตรวจ mapping → delete เฉพาะ mapping → ส่ง `{deleted:true}`.

## Verification

ใช้ mapping/Project fixture. PATCH label map ใหม่คาดหวัง `200` และ approval เป็น `null`; เปลี่ยนปลายทางเมื่อมี references คาดหวัง `409`. PATCH ด้วย mapping ที่ไม่มีหรือ body ว่างคาดหวัง `404`/`400`. DELETE mapping ที่มี imported history คาดหวัง `200` แต่ยืนยันว่า WorkItem, `ExternalWorkItemReference` และ TimeEntry ยังคงอยู่. รัน `pnpm test:gitlab` สำหรับ route regression tests แบบ mock.
