# GitLab Issue Import Contract

> **Owner decision 2026-09-29:** GitLab Project mapping still targets a PMS Project, but its parent context is Company Dhas. Customer references in this historical contract are superseded by [Company → Project decision](./COMPANY_PROJECT_DECISION.md).

| รายการ | ค่า |
| --- | --- |
| Issue | #14 — Specify One-Way GitLab Issue Import |
| Role | SA |
| สถานะ | Contract ที่ implement ใน repository โดย Issue #20; ยังไม่ได้เชื่อม/ทดสอบกับ GitLab instance จริง |
| แหล่งข้อมูล | [ENGINEERING_SPEC.md](./ENGINEERING_SPEC.md) · [DATABASE.md](./DATABASE.md) · [DATABASE_MAPPING.md](./DATABASE_MAPPING.md) · [API.md](./API.md) · [Customer/Project Migration Contract](./CUSTOMER_PROJECT_MIGRATION.md) |

เอกสารนี้กำหนดสัญญาสำหรับการนำ GitLab Issues เข้า `WorkItem` ในระบบแบบตรวจสอบได้ การกำหนดนี้ไม่ใช่การยืนยัน GitLab instance, Project, credentials หรือข้อมูล production ใด ๆ.

## 1. ขอบเขตและเงื่อนไขก่อนเปิดใช้

1. ทิศทางเป็น GitLab → PMS เท่านั้น; แก้ `WorkItem` ใน PMS แล้วห้ามเขียนกลับ GitLab.
2. เจ้าของที่ยืนยันตัวตนแล้วเท่านั้นเป็นผู้เริ่ม sync แบบ manual. Route ทั้งหมดใช้ owner authentication ที่มีอยู่.
3. ต้องมี mapping ที่เจ้าของอนุมัติก่อน: GitLab Project หนึ่งรายการต่อ Project ใน PMS หนึ่งรายการ; Customer สืบทอดจาก PMS Project. เก็บ `approvedLabelMap` กับ mapping นั้น; GitLab Project ที่ไม่มี mapping/ยังไม่อนุมัติ map จะเริ่ม sync ไม่ได้.
4. ก่อน sync ครั้งแรกของ mapping ต้องยืนยัน instance/base path, GitLab Project, mapping ของ labels และนโยบายรายการ PMS ที่อาจมีอยู่แล้ว. UI บันทึก owner approval ต่อ mapping; การแก้ Project ปลายทางหรือ label map จะ reset approval. ห้ามใช้ข้อมูลตัวอย่างหรือเดาค่าจริงแทน.
5. ถ้า `ExternalWorkItemReference` มี identity ตรงกัน ให้ใช้ `WorkItem` ที่อ้างถึง. ห้ามจับคู่ด้วย title, IID, URL หรือ label อย่างคลุมเครือ. Issue ที่ไม่มี reference สร้าง `WorkItem` ใหม่ตามนโยบาย first-sync ที่เจ้าของอนุมัติ; ถ้าต้องผูก WorkItem เก่า ต้องทำ exact identity reconciliation ที่ตรวจสอบได้ก่อน sync.
6. ระยะแรกไม่รวม write-back/two-way sync, Merge Requests, commits, CI, webhook, scheduled sync, GitLab time tracking หรือระบบบริการแยก.

การถอน Project mapping ลบได้เฉพาะ mapping นั้น และต้องคง `WorkItem`, `ExternalWorkItemReference`, `TimeEntry` และ Project/Customer เดิมไว้. เปลี่ยนปลายทางที่มี references เป็น conflict จนกว่าจะมีการย้ายข้อมูลที่ผ่านการอนุมัติและรักษาประวัติ.

## 2. Identity และ Project mapping

External identity ของ Issue คือ tuple นี้; ห้ามใช้ title หรือ URL เป็น unique key:

```text
(provider = "gitlab", canonical instance URL, GitLab Project ID, global Issue ID)
```

- Canonical URL เป็น absolute URL ของ scheme + host + optional base path; normalize scheme/host เป็น lowercase และตัด trailing slash โดยคง base path ของ self-managed instance. ปฏิเสธ URL ที่มี credentials, query หรือ fragment. รายละเอียดใช้ร่วมกับ [Customer/Project Migration Contract §2.3](./CUSTOMER_PROJECT_MIGRATION.md).
- ใช้ global Issue `id` เป็น identity; `iid` ใช้แสดงผล/diagnostics เท่านั้น. เก็บ IDs แบบไม่สูญเสีย precision, `externalUrl`, `remoteUpdatedAt` และเวลา sync ตาม target schema ใน [DATABASE.md](./DATABASE.md).
- `GitLabProjectMapping` unique ที่ `(canonicalGitLabInstanceUrl, gitLabProjectId)` และชี้ `Project.id` ที่มี Customer ตาม rollout contract. เก็บ `approvedLabelMap` เป็น JSONB map จากชื่อ GitLab label แบบ exact/case-sensitive ไปยัง `WorkItem.types` ที่อนุญาต; validate target ทุกค่าฝั่ง server. Mapping ที่ไม่มีอยู่, ยังไม่อนุมัติ หรือชี้ Project ที่อ่านไม่ได้หยุด sync โดยไม่เขียน WorkItem.
- `ExternalWorkItemReference` unique ที่ `(provider, canonicalGitLabInstanceUrl, gitLabProjectId, gitLabGlobalIssueId)` และ `workItemId` unique ใน phase one. เก็บ `remoteCreatedAt`, `remoteUpdatedAt`, `lastSyncedAt` เป็น Bangkok local wall-clock. Exact tuple เดิมที่ชี้ WorkItem คนละรายการเป็น conflict; ห้ามย้าย reference หรือสร้างรายการที่สองอัตโนมัติ.
- ใช้ unique constraint ร่วมกับ transactional upsert. เมื่อ concurrent insert ชน unique constraint ให้โหลด reference ของ tuple เดิมแล้ว upsert WorkItem เดิม; ถ้า relation ขัดกันให้คืน conflict แบบปลอดภัย.

## 3. Field mapping และ ownership

| GitLab source | PMS target | กฎ |
| --- | --- | --- |
| GitLab Project ID | `GitLabProjectMapping` → `WorkItem.projectId` | ต้องมี mapping ก่อน; Customer มาจาก Project relation ไม่ copy ลง WorkItem |
| Global Issue `id`, project ID, canonical instance URL | `ExternalWorkItemReference` | identity และ idempotency key |
| `iid`, `web_url` | `ExternalWorkItemReference.gitLabIssueIid`, `externalUrl` | สำหรับ display และ source link; ไม่ใช่ identity |
| `title`, `description` | `WorkItem.title`, `WorkItem.description` | GitLab เป็นเจ้าของ; ค่าที่หายตาม schema ให้เป็น null เฉพาะ field optional |
| Issue type | `WorkItem.kind` | `Issue` เสมอ |
| `state` | `WorkItem.status` | `opened → todo`; `closed → completed`; ไม่สร้าง status ใหม่ |
| `labels` | `WorkItem.types` | ใช้ `approvedLabelMap` แบบ exact/case-sensitive ไปยังค่า `bug`, `data`, `documentation`, `epic`, `feature`, `maintenance`, `opl`, `ops`, `support`, `task`; ค่าที่ไม่ map ให้ข้ามและรายงาน |
| `due_date` | `WorkItem.dueDate` | `YYYY-MM-DD` เป็น Bangkok calendar date; null/ไม่กำหนดล้าง due date ที่มาจาก GitLab |
| `created_at`, `updated_at` | `ExternalWorkItemReference.remoteCreatedAt`, `remoteUpdatedAt` | Parse source offset แล้วเก็บเป็น Bangkok local wall-clock; ไม่แทน `WorkItem.createdAt`/`updatedAt` |
| GitLab assignee | — | ไม่สร้าง User; assignee เป็น owner ที่ resolve ฝั่ง server |

การสร้างครั้งแรกตั้ง `priority=none`, `role=null`, `workDate=null`, `status` ตาม mapping และ owner เป็น assignee. ใช้ WorkItem service เดียวกับ PMS status changes; `submittedAt` (ถ้าถูก stamp ตาม status contract) คือเวลา PMS ณ import/status update ไม่ใช่ GitLab `closed_at` หรือเวลา throughput ย้อนหลัง. ใน sync ทุกครั้ง GitLab เป็นเจ้าของ `title`, `description`, `status`, `types` ที่ map แล้ว, `dueDate` และ source URL/metadata; ค่าจาก PMS คือ `role`, `priority`, `workDate`, owner/assignee และ `TimeEntry` ต้องคงเดิม. การ sync labels แทนที่ `WorkItem.types` ด้วยชุด mapped ล่าสุดทั้งหมด (รวม `[]` เมื่อไม่มี label ที่ map) ไม่ใช่ append. ห้าม map label ไป `role`.

`WorkItem.projectId` ต้องตรงกับ PMS Project ของ mapping: Work Item ที่มี GitLab identity ย้ายไป Project อื่นไม่ได้. Sync จะคืน conflict แทนการเขียนทับรายการที่อยู่นอก Project mapping.

Label ที่ไม่รองรับเป็น warning ต่อ Issue; ไม่ทำให้ฟิลด์อื่นของ Issue ต้อง rollback. หาก field ที่ GitLab เป็นเจ้าของไม่ผ่าน validation ให้ mark Issue เป็น `failed` และไม่แก้ WorkItem/reference ของ Issue นั้น.

## 4. Date/time semantics

- `due_date` เป็น calendar date ไม่มีเวลา; ตรวจว่าเป็นวันที่ปฏิทินจริงแล้วเก็บวันเดิมใน `DATE` / Prisma `@db.Date`. ห้าม parse เป็นเที่ยงคืนของ browser หรือเลื่อนวันจาก timezone.
- GitLab `created_at`/`updated_at` เป็น timestamp จากต้นทางที่มี offset (เช่น `Z`). Parse instant ด้วย offset ต้นทาง แล้วแปลงอย่างชัดเจนเป็น `Asia/Bangkok` ก่อนเก็บ timestamps ใน PostgreSQL `TIMESTAMP WITHOUT TIME ZONE` / Prisma `@db.Timestamp`. เก็บเป็น Bangkok local wall-clock; ห้าม persist หรือ normalize ค่าเป็น UTC.
- Target API timestamp ที่ตอบกลับต้องใส่ `+07:00`; ค่าใน database เป็น Bangkok local wall-clock. `WorkItem.createdAt`/`updatedAt` เป็นเวลาของ PMS และห้ามเขียนทับด้วย remote timestamp.
- timezone ระบบ, application และ PostgreSQL session เป็น `Asia/Bangkok` ทุก environment; Settings เปลี่ยนค่านี้ไม่ได้.

## 5. Manual sync และผลลัพธ์

1. รับเฉพาะ mapping ID ที่มีอยู่และเป็นของ canonical instance ที่ configure ฝั่ง server; ห้ามให้ client ส่ง base URL/token เพื่อกำหนด outbound host. ตรวจ owner, mapping, PMS Project/Customer, token availability และ first-sync gate ก่อนเรียก GitLab.
2. ใช้ Project Issues endpoint แบบ read-only โดยระบุ `scope=all`, `state=all`, `per_page=100`; เดินหน้าตาม validated `Link rel=next` ของ GitLab จนหมด. ถ้า instance ไม่ส่ง pagination link ให้ใช้ page offsets จนได้หน้าว่าง; deduplicate global Issue identity เพื่อรองรับ page overlap. ตรวจ `project_id` และ `web_url` ของ response ให้ตรง mapped project/instance ก่อนเขียน.
3. ทำ upsert ต่อ Issue ใน transaction เดียวที่ครอบ `WorkItem` และ external reference. หนึ่ง Issue ที่ผิดพลาดต้องไม่ rollback Issue อื่นที่ commit ไปแล้ว; ห้ามใช้ transaction ครอบทั้ง run.
4. เทียบ remote `updated_at` เพื่อป้องกัน snapshot ที่เก่ากว่าเขียนทับ source version ใหม่. Retry/page overlap ใช้ identity เดิมและไม่สร้าง WorkItem ซ้ำ. การ replay ที่ไม่มี field เปลี่ยนเป็น no-op.
5. เคารพ `Retry-After` และใช้ bounded retry/backoff สำหรับ timeout, rate limit และ provider 5xx. หาก wait/retry budget หมด ให้หยุดขอ page ใหม่, เก็บผลที่ commit แล้ว และคืน partial result ที่ระบุ retryable failure; manual retry เริ่ม scan ใหม่ได้อย่างปลอดภัย.
6. Response สรุป `created`, `updated`, `skipped`, `failed` โดยผลรวมต่อจำนวน unique Issues ที่ประมวลผล. `skipped` ใช้กับ no-op หรือรายการที่ข้ามตาม policy; `created`/`updated` ยังส่ง warning ของ unmapped labels ได้. ทุกผลต่อ Issue มี `outcome` และเหตุผลที่อ่านได้; `failed` เพิ่ม safe error code และ `retryable`. ไม่คืน raw GitLab/DB response, token, stack trace หรือ request headers.
7. ถ้า pagination ล้มเหลวก่อนเห็น Issue ถัดไป ให้แนบ run-level failure/`nextPage` context ใน partial result โดยไม่แต่ง outcome ราย Issue ที่ยังไม่รับมา; sync ครั้งถัดไปอ่านได้ซ้ำ. ตรวจทุก next-page URL ว่าอยู่บน configured GitLab instance ก่อนส่ง token ไปด้วย. เมื่อมี per-Issue outcomes ให้คืน HTTP `200` พร้อมผล partial; ถ้า provider ใช้ไม่ได้ก่อนประมวลผล Issue ใด ให้คืน request-level `503`.

ผลลัพธ์ item ต้องเปิด source URL และ canonical PMS `workItemId` เมื่อมีรายการแล้ว. `created`/`updated` ระบุผลการเขียน, `skipped` ระบุเหตุผล เช่น `no_changes` หรือ policy ที่ข้าม; `failed` ใช้ code/message ปลอดภัย เช่น `SOURCE_IDENTITY_CONFLICT`, `INVALID_REMOTE_ISSUE`, `RATE_LIMITED`, `PROVIDER_UNAVAILABLE`. บอก `retryable=true` เฉพาะกรณีที่การ retry อาจสำเร็จ. ห้ามใช้การยกเลิก mapping หรือ token rotation เป็นเหตุลบ imported history.

## 6. Implemented API

ทุก route ด้านล่างต้องผ่าน owner authentication และอยู่ใน As-Is inventory ของ [API.md](./API.md). Token/base URL มาจาก server configuration เท่านั้น. `POST /sync` รับ `{ mappingId, approveFirstSync? }`; first sync ต้องส่ง `approveFirstSync: true`. Mapping body รับ numeric string `gitLabProjectId`, `projectId`, และ exact `approvedLabelMap`; client URL/token fields ถูกปฏิเสธ.

| Method / path | Purpose |
| --- | --- |
| `GET /api/integrations/gitlab/status` | คืน `configured`; ไม่คืน token, token fragment หรือ secret metadata |
| `GET`, `POST /api/integrations/gitlab/projects` | ดูและสร้าง mapping พร้อม Project context/`approvedLabelMap`; duplicate source identity เป็น `409 CONFLICT` |
| `PATCH`, `DELETE /api/integrations/gitlab/projects/{mappingId}` | แก้ PMS Project/label map หรือถอน mapping; destination เปลี่ยนไม่ได้เมื่อมี references; ถอน mapping ไม่ลบ WorkItems หรือ TimeEntries |
| `POST /api/integrations/gitlab/sync` | Manual read-only sync; คืน counts และ per-Issue `outcome`, `sourceUrl`, `workItemId`/error/warnings; partial run อาจมี `runError` |

Request-level errors ใช้ error envelope มาตรฐานตาม §2.2 พร้อมรหัส `400 VALIDATION_ERROR`, `401 OWNER_UNAUTHENTICATED`, `403 ACCESS_DENIED`, `404 NOT_FOUND`, `409 CONFLICT`, `500 INTERNAL_ERROR`, `503 DEPENDENCY_UNAVAILABLE`. Partial import ที่เริ่มประมวลผลแล้วคืนผลลัพธ์ที่ปลอดภัยพร้อม per-Issue failures; ไม่แปลงเป็น success count เทียม และไม่ retry mutation แบบที่สร้าง duplicate ได้.

## 7. Security, operational gates และ acceptance

- Token ต้องเป็น server-side secret/environment ที่มีสิทธิ์อ่านเฉพาะ Project ที่อนุมัติ; ไม่อยู่ใน Prisma, browser bundle, `NEXT_PUBLIC_*`, API response, docs หรือ logs. URL ของ GitLab ต้องมาจาก server configuration/allowlist เพื่อป้องกัน client เลือก outbound host.
- Token ถูกอ่านจาก `GITLAB_TOKEN`, base URL จาก `GITLAB_BASE_URL`; runtime ปฏิเสธ URL/token ที่ตั้งไม่ครบคู่และ URL ที่ไม่ใช่ HTTPS. Sync ตรวจ origin/path ของทุก pagination link และ Issue source URL ก่อนส่ง token หรือสร้างข้อมูล และปิดการตาม HTTP redirects อัตโนมัติเพื่อไม่ให้ token ถูกส่งไป host อื่น. ห้ามยิง request ไปยัง GitLab จริงในการทดสอบอัตโนมัติ.
- Repository นี้ไม่ได้ยืนยัน GitLab instance, Project mappings, label maps หรือ credentials จริง. ก่อนใช้กับข้อมูลจริง owner ต้องตรวจ target environment, backup/rollout gate และอนุมัติ first sync ใน UI.
- **Acceptance:** มี mapping สำหรับ Project/Issue/fields/status/labels; sync ซ้ำ upsert identity เดิมและคง PMS-owned fields/TimeEntries; results แยก created/updated/skipped/failed พร้อมเหตุผล; pagination, rate limit, partial failure และ retry ไม่สร้าง duplicate; ยกเลิก mapping ไม่ลบ history; date/time และ token ตรงตาม policy ข้างต้น.
- ใช้ `pnpm test:gitlab` สำหรับ service/API tests ที่ใช้ mocked GitLab/Prisma และ `pnpm test:gitlab-contracts` สำหรับ document/API inventory regressions. Tests ใช้ synthetic credentials เท่านั้นและไม่เชื่อม GitLab จริง.

## 8. GitLab API references

ใช้ GitLab REST API แบบ read-only ตาม [Issues API](https://docs.gitlab.com/api/issues/) และ [REST API pagination](https://docs.gitlab.com/api/rest/). GitLab ระบุ `id` เป็น global ID และ `iid` เป็นเลขภายใน Project; maximum `per_page` คือ 100 และ `429` มี `Retry-After` ให้เคารพตาม [REST API authentication and rate limits](https://docs.gitlab.com/api/rest/authentication/). เอกสารทางการตรวจทวนวันที่ 2026-09-30; ให้ยืนยัน compatibility กับ instance/version จริงก่อนเปิดใช้งาน.
