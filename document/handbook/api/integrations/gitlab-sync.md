# Manual GitLab Issue sync

## Overview

ดึง Issues แบบ read-only จาก GitLab Project ที่ map ไว้ แล้วสร้างหรืออัปเดต PMS WorkItems ด้วย identity ที่แน่นอน. Owner ต้องอนุมัติ sync ครั้งแรกของ mapping.

| Method | Endpoint | Success |
| --- | --- | --- |
| POST | `/api/integrations/gitlab/sync` | 200; 503 เมื่อ provider ใช้ไม่ได้ก่อนประมวลผล Issue |

เป็น manual API operation; ไม่มี scheduled sync, webhook หรือ background job.

## สิทธิ์ที่มองเห็น

ต้องผ่าน HTTP Basic owner gate, middleware proof และ `getOwner()`; ไม่มี role/permission แยก. `ownerId` จาก server เป็น WorkItem assignee. ดู [Owner access](../../operations/owner-access.md).

## ดึงข้อมูลจากตารางไหน

| Table / source | Operation | เหตุผล |
| --- | --- | --- |
| `User` | Read | resolve owner และกำหนด WorkItem assignee |
| `GitLabProjectMapping` | Read/Update | resolve mapping; update `firstSyncApprovedAt` เมื่ออนุมัติครั้งแรก; ตรวจ mapping ยังไม่เปลี่ยนก่อนบันทึกแต่ละ Issue |
| `ExternalWorkItemReference` | Read/Insert/Update | หา external identity เดิมหรือบันทึก/ปรับ source metadata |
| `work_items` (`WorkItem`) | Read/Insert/Update | สร้าง WorkItem ใหม่หรือปรับเฉพาะ GitLab-owned fields |
| GitLab Issues REST API | GET | อ่าน Issues และ pagination; ไม่มี GitLab write request |

แต่ละ Issue ใช้ transaction `Serializable` แยกกัน; pagination/error หนึ่งหน้าไม่ rollback Issue ที่ commit แล้ว. Sync update ไม่เขียนทับ PMS-owned fields หรือ `TimeEntry`.

## Request

รับ `Content-Type: application/json` และ object ที่มี fields ต่อไปนี้เท่านั้น; unknown fields ถูกปฏิเสธ.

| Field | Type | Required | Validation / behavior |
| --- | --- | --- | --- |
| `mappingId` | string | Yes | public UUIDv4 ของ GitLab Project mapping ที่มีอยู่ |
| `approveFirstSync` | boolean | Optional | ต้องเป็น `true` หาก `firstSyncApprovedAt` ยัง null; `false` หรือ omitted จะได้ conflict. ไม่มีผลเป็นเงื่อนไขเมื่ออนุมัติแล้ว |

```bash
curl -i -X POST -u "$OWNER_GATE_USERNAME:$OWNER_GATE_PASSWORD" \
  -H 'Content-Type: application/json' \
  -d '{"mappingId":"mapping-id","approveFirstSync":true}' \
  "$APP_ORIGIN/api/integrations/gitlab/sync"
```

Approval timestamp จะบันทึกก่อนเรียก provider. หาก provider ล้มเหลว route ไม่ยกเลิก approval; owner สามารถ retry ด้วย mapping เดิมได้.

## Response

### 200 — sync เริ่มประมวลผลแล้ว

```json
{
  "mappingId": "mapping-id",
  "counts": { "created": 1, "updated": 0, "skipped": 0, "failed": 0 },
  "results": [
    {
      "outcome": "created",
      "issueId": "701",
      "iid": "17",
      "title": "Example Issue",
      "sourceUrl": "https://gitlab.example.test/base/group/project/-/issues/17",
      "workItemId": "work-item-id",
      "reason": "created_from_gitlab",
      "warnings": ["Unmapped GitLab label: needs-triage"]
    }
  ],
  "runError": {
    "code": "PROVIDER_UNAVAILABLE",
    "message": "GitLab rejected the Issue request",
    "retryable": true,
    "nextPage": "https://gitlab.example.test/base/api/v4/projects/42/issues?page=2"
  }
}
```

`runError` เป็น optional และตัวอย่างด้านบนสาธิต partial run; ถ้าไม่มี pagination failure จะไม่ส่ง field นี้.

| Response field | Description |
| --- | --- |
| `mappingId` | Public UUIDv4 ของ mapping ที่ sync route เลือก |
| `counts` | จำนวนผลลัพธ์ต่อ outcome ที่อยู่ใน `results` |
| `counts.created` | จำนวน WorkItems ใหม่ |
| `counts.updated` | จำนวน WorkItems/reference ที่ source changes อัปเดต |
| `counts.skipped` | จำนวน Issue ที่เป็น snapshot เก่าหรือไม่มี field เปลี่ยน |
| `counts.failed` | จำนวน Issue ที่อ่านหรือบันทึกไม่สำเร็จ |
| `results` | ผลต่อ Issue ที่ service ประมวลผลได้; เป็น array แม้ไม่มีรายการ |
| `results[].outcome` | `created`, `updated`, `skipped` หรือ `failed` |
| `results[].issueId` | GitLab global Issue ID ในรูป string; fallback เป็น `unknown` เมื่อข้อมูลผิดรูปแบบ |
| `results[].iid` | Issue IID ภายใน Project ในรูป string; fallback เป็น `unknown` เมื่อข้อมูลผิดรูปแบบ |
| `results[].title` | ชื่อ Issue; ใช้ safe fallback หาก source ไม่มี title ที่ valid |
| `results[].sourceUrl` | GitLab Issue URL ที่ตรวจแล้ว; อาจเป็น `""` เมื่อข้อมูล source URL invalid |
| `results[].workItemId` | PMS WorkItem public UUIDv4 เมื่อมี linked/created record; `null` สำหรับ Issue ที่ล้มเหลวก่อนบันทึก |
| `results[].reason` | เหตุผล machine-readable เช่น `created_from_gitlab`, `source_fields_changed`, `no_changes`, `stale_source`; optional |
| `results[].warnings` | รายการคำเตือน เช่น GitLab label ที่ไม่มี mapping; optional และไม่ทำให้ Issue ล้มเหลว |
| `results[].error` | รายละเอียด failure ต่อ Issue; มีเฉพาะ outcome `failed` |
| `results[].error.code` | Safe failure code ของ Issue เช่น `INVALID_REMOTE_ISSUE`, `SOURCE_IDENTITY_CONFLICT` หรือ persistence code |
| `results[].error.message` | ข้อความอธิบายที่ไม่ส่ง raw provider/database data |
| `results[].error.retryable` | ระบุว่าลอง sync ใหม่อาจสำเร็จหรือไม่ |
| `runError` | ความล้มเหลวระดับ pagination หลังอาจประมวลผล Issues บางส่วนแล้ว; optional |
| `runError.code` | `RATE_LIMITED` หรือ `PROVIDER_UNAVAILABLE` |
| `runError.message` | ข้อความ safe สำหรับความผิดพลาดของ pagination/provider |
| `runError.retryable` | ระบุว่า pagination run ที่หยุดไปลองใหม่ได้หรือไม่ |
| `runError.nextPage` | URL ของหน้าที่หยุด; `null` เมื่อไม่มี safe next-page URL |

## Error Responses

| HTTP | Code | Cause |
| ---: | --- | --- |
| 400 | `VALIDATION_ERROR` | JSON/body ไม่ถูกต้อง, `mappingId` ว่าง, approve flag ไม่ใช่ boolean หรือมี unknown fields |
| 401 | `OWNER_UNAUTHENTICATED` | ยังไม่ผ่าน owner authentication |
| 403 | `ACCESS_DENIED` | Request origin ไม่ตรงกับ `APP_ORIGIN` |
| 404 | `NOT_FOUND` | ไม่พบ mapping ID |
| 409 | `CONFLICT` | Mapping ชี้ไปยัง GitLab instance อื่น หรือ first sync ยังไม่ได้อนุมัติ |
| 409 | `FIRST_SYNC_APPROVAL_REQUIRED` | `firstSyncApprovedAt` ยังว่างและไม่ได้ส่ง `approveFirstSync: true` |
| 503 | `DEPENDENCY_UNAVAILABLE` | GitLab config ไม่พร้อม หรือ owner `User` resolve ไม่ได้ |
| 503 | `RATE_LIMITED` | GitLab ตอบ rate limit ก่อนมีผลต่อ Issue |
| 503 | `PROVIDER_UNAVAILABLE` | GitLab request/pagination ใช้ไม่ได้ก่อนประมวลผล Issue |
| 500 | `INTERNAL_ERROR` | ข้อผิดพลาดที่ไม่ใช่ provider/validation; response ไม่เปิดเผย trace ภายใน |

Request-level error ใช้ `{ "error": { "code", "message", "field?" } }`. หากมี per-Issue results แล้ว pagination ล้มเหลว API ยังคงตอบ 200 พร้อม `runError`; provider error ก่อนมี result ตอบ 503. Failure ของ Issue รายตัวอยู่ใน `results[].error` และนับใน `counts.failed`.

ทุก response ใช้ `Cache-Control: no-store`.

## Processing Flow

Owner → server configuration → validate body → load mapping และตรวจ instance → ยืนยัน first sync หากจำเป็น → GET Issues (`scope=all`, `state=all`, `per_page=100`) → ตรวจ origin/path ของ redirect/pagination/source URL ก่อนใช้ token → validate และ deduplicate → transaction ต่อ Issue → สรุป counts/results.

`fetch` ใช้ `redirect: 'manual'`; ไม่ตาม redirect และไม่ส่ง `PRIVATE-TOKEN` ต่อไปยัง origin ใหม่. การรอ `fetch` response ถูกกำหนด timeout 15 วินาที; retry network/5xx จำกัดสาม attempts. 429 เคารพ `Retry-After` และหยุด run หากต้องรอนานเกิน budget. ดู [GitLab integration](../../integration/gitlab.md) สำหรับ identity, field ownership และ operational gates.

## Verification

ใช้ test environment ที่มี owner, mapping และ PMS Project fixture เท่านั้น.

- `pnpm test:gitlab` — service และ route tests ที่ mock fetch/Prisma; ครอบคลุม approval, identity, create/update/skip/fail, retry, redirect และ pagination.
- `pnpm test:gitlab-contracts` — API/schema/documentation contract checks.

Positive case: first sync พร้อม approval แล้วคาดหวัง `200`, counts และ Issue result. Negative cases: approval omitted (`409`), mapping missing (`404`), wrong configured instance (`409`), provider down ก่อนผลแรก (`503`), invalid Issue (`failed` ต่อแถว), pagination failure หลังบาง Issue (`200` พร้อม `runError`) และ cross-origin redirect ที่ไม่ถูกตาม. ยืนยันว่า sync ซ้ำใช้ WorkItem เดิมและไม่เปลี่ยน PMS-owned fields/TimeEntries. Tests ใช้ synthetic fixtures; ห้ามส่ง token จริงหรือยิง GitLab จริง.
