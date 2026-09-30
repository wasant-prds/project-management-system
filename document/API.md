# API

> **Owner decision 2026-09-29:** Customer API และ `customerId` ที่กล่าวในสัญญาเดิมถูกยกเลิก ใช้ Company หลายรายกับ `Project.companyId`; Projects เดิมผูก Dhas. ดู [Company → Project decision](./COMPANY_PROJECT_DECISION.md). ข้อความ Customer ด้านล่างเป็นประวัติข้อเสนอเดิม ไม่ใช่ contract ที่ใช้พัฒนาใหม่.

| รายการ | ค่า |
| --- | --- |
| Framework | Next.js 15 App Router Route Handlers |
| Base URL | `http://localhost:<app-port>/api` |
| รูปแบบ | JSON; methods ใช้ `GET`, `POST`, `PATCH`, `DELETE` เว้นแต่ระบุว่าเป็นไฟล์ |
| สถานะเอกสาร | แยก endpoint ที่พบใน repository (As-Is) ออกจากสัญญาเป้าหมาย (Target proposal) |
| ขอบเขตข้อมูล | ยึด [Company → Project decision](./COMPANY_PROJECT_DECISION.md); GitLab import ยึด [GitLab Issue Import Contract](./GITLAB_ISSUE_IMPORT.md) |
| เอกสารเชื่อมโยง | [ENGINEERING_SPEC.md](./ENGINEERING_SPEC.md) · [ARCHITECTURE.md](./ARCHITECTURE.md) · [BUSINESS_REQUIREMENT.md](./BUSINESS_REQUIREMENT.md) · [SCOPE.md](./SCOPE.md) · [DATABASE.md](./DATABASE.md) · [DATABASE_MAPPING.md](./DATABASE_MAPPING.md) · [DEPLOYMENT.md](./DEPLOYMENT.md) |

> **ขอบเขต As-Is:** inventory อิง source code ใน repository โดยมี baseline 2026-09-27 และส่วนที่ implement เพิ่มใน #17–#18; ไม่ใช่ผลตรวจ production database. **Target:** endpoint ที่ระบุว่าเป้าหมายยังไม่ถือว่าถูก implement หรือเปิดใช้งานแล้ว.

## 1. Endpoint ที่มีอยู่ใน repository (As-Is)

| Method | Endpoint | Consumer / พฤติกรรมปัจจุบัน | Source และ response ปัจจุบัน |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Docker/monitoring ตรวจการเชื่อมต่อฐานข้อมูล; ไม่ใช่เมนูธุรกิจ | Prisma `SELECT 1`; คืน health fields, ปัจจุบัน error response มีข้อความ exception |
| `GET` | `/api/users` | legacy user selector | `User`; wrapper `{ users }` |
| `GET`, `POST` | `/api/projects` | Projects; `GET` กรอง status/companyId/search พร้อม cursor หรือ `?options=work-items` สำหรับ selector; `POST` ตรวจ Company ที่เลือก | `{ projects, page }` / `{ project }`; Company กับ summary จาก WorkItem/TimeEntry (#18) |
| `GET`, `PATCH`, `DELETE` | `/api/projects/{id}` | Projects อ่าน/แก้/ลบ Project; delete ปฏิเสธเมื่อมีประวัติอ้างอิง | `{ project }` หรือ error envelope (#18) |
| `GET`, `POST` | `/api/company` | อ่านรายการ/เพิ่ม Company | `{ companies }` / `{ company }` (#18) |
| `PATCH`, `DELETE` | `/api/company/{id}` | แก้ Company; ลบได้เมื่อไม่มี Project และไม่ใช่ Dhas | `{ company }` หรือ error envelope (#18) |
| `GET`, `POST` | `/api/work-items` | Work Items; filter และสร้าง WorkItem ด้วย validation กลาง | WorkItem พร้อม Project/Company/owner; wrapper `{ workItems, years? }` หรือ `{ workItem }` |
| `GET`, `PATCH`, `DELETE` | `/api/work-items/{id}` | Work Items อ่าน/แก้/ลบ WorkItem; detail คืน Daily Work ที่ผูกอยู่ | WorkItem เดียว; wrapper `{ workItem }`; DELETE ปฏิเสธเมื่อมีประวัติเวลา |
| `POST` | `/api/work-items/import` | Work Items bulk import แบบแยกผลรายแถว | ตรวจ WorkItem input และ Project/owner references; valid rows ทำต่อได้เมื่อแถวอื่นผิด |
| `GET`, `POST` | `/api/work-logs` | Daily Work อ่าน/สร้าง TimeEntry | `TimeEntry` พร้อม User/Project/WorkItem; wrapper `{ workLogs }` หรือ `{ workLog }` |
| `GET`, `PATCH`, `DELETE` | `/api/work-logs/{id}` | Daily Work อ่าน/แก้/ลบ TimeEntry | TimeEntry เดียว; wrapper `{ workLog }` |

ยังไม่พบ API route สำหรับ Dashboard aggregates, Analysis หรือ Settings persistence. Board ยังไม่มี API ของตัวเอง. Baseline วันที่ 2026-09-27 ยังไม่มี authentication middleware หรือ pagination; #17 เพิ่ม middleware/owner resolver และ #18 เพิ่ม pagination ให้ Company และ Projects. Production rollout ที่บันทึกใน [Issue #18 implementation report](./COMPANY_PROJECT_IMPLEMENTATION.md) ผ่านการตรวจ Company/Project schema และ API smoke checks.

**สถานะ #17:** owner gate ตรวจ HTTP Basic และ origin ก่อน Next.js; middleware ปฏิเสธ page/API ที่ไม่มี internal proof ด้วย `401 OWNER_UNAUTHENTICATED` (หรือ gate `403 ACCESS_DENIED` เมื่อ origin ไม่ผ่าน). `GET /api/health` เป็นข้อยกเว้น. Route Handlers ของ Projects, Users, Work Items และ Work Logs ตรวจ owner ฝั่ง server. `GET /api/users` คืน owner หนึ่งคน; WorkItem create/import/update และ TimeEntry create/update ไม่ยอมรับ `assigneeId`/`userId` ที่ต่างจาก owner (`400 VALIDATION_ERROR`); list ของ Work Items/Work Logs กรอง owner. Browser ยังอาจส่ง ID owner เดิมเพื่อ compatibility แต่ server เป็นผู้กำหนดค่าเขียนจริง. Error อื่นของ legacy routes ยังมีรูปแบบเดิมและจะปรับใน issue ที่เกี่ยวข้อง.

### 1.1 Query parameters ปัจจุบัน

`GET /api/work-items` รองรับ `projectId`, `companyId`, `assigneeId` (legacy; ต้องเป็น owner), `kind`, `status`, `priority`, `role` (`none` ใช้กรอง role ว่าง), `year`, `month`, `search` และ `includeYears`. เมื่อไม่ส่ง `year` ใช้ปีปัจจุบันของ `Asia/Bangkok`; `year=all` ขอทุกปี. ปี/เดือนกรองตาม `workDate`, ถัดมา `dueDate`, แล้ว `createdAt`. Enum ที่ไม่รู้จักและปี/เดือนผิดรูปแบบตอบ 400. Public status ใช้ hyphen เช่น `in-progress`, แม้ Prisma enum บางค่าจะมี underscore.

As-Is gap ของ `GET /api/work-logs`: รองรับ `date=YYYY-MM-DD`, `startDate=YYYY-MM-DD&endDate=YYYY-MM-DD` แบบรวมวันปลายช่วง และ `userId` (legacy) แต่ handler ปัจจุบันสร้างขอบเขตวันจาก timezone ของ process จึงยังไม่รับประกัน `Asia/Bangkok`. Target implementation ต้องใช้ policy Bangkok ในข้อ 2.4; ปัจจุบันยังไม่มี cursor/limit.

Issue #19 ทำให้ Work Item API รับ `workDate`/`dueDate` เป็น business date `YYYY-MM-DD`, ใช้ Prisma `DATE`, คืน business date ในรูปแบบเดิม และคืน timestamps เป็น Bangkok `+07:00`. `submittedAt` ใช้ Bangkok local wall-clock. WorkItem GET/PATCH/POST/import ใช้ owner-side validation ชุดเดียวกัน; endpoint อื่นให้ตรวจตามสถานะ implementation ของแต่ละ issue.

`GET /api/projects` รองรับ `status`, `search`, `limit`, `cursor` และ `options=work-items`. Project/Company handlers ของ #18 ใช้ error envelope; legacy handlers อื่นบางตัวอาจยังใช้ `{ "error": "..." }` และมี validation ไม่ครบ.

## 2. กติกา API เป้าหมายร่วมกัน

### 2.1 Owner, validation และความเป็นเจ้าของข้อมูล

- ทุก target menu API ที่อ่านหรือแก้ข้อมูลธุรกิจต้องยืนยันตัวเจ้าของก่อนทำงาน; ไม่มี multi-user RBAC. `Developer`, `infra`, `SA` เป็น `WorkItem.role` ไม่ใช่ account หรือ permission.
- Resolve `WorkItem.assigneeId` และ `TimeEntry.userId` จาก owner identity ฝั่ง server. ห้ามเชื่อ client `userId`/`assigneeId` เพื่อเปลี่ยนเจ้าของ; field ที่ส่งมาให้ละเว้นหรือปฏิเสธด้วย `400 VALIDATION_ERROR`.
- Validate body, enum, date, numeric values, foreign keys และ cross-record relations ฝั่ง server ทุกครั้ง; UI validation เป็นเพียง UX.
- Project ที่สร้างหรือย้ายต้องอ้าง Company ที่มีอยู่. Company ที่ไม่มีอยู่ตอบ `400 VALIDATION_ERROR`; relation ที่ถูกลบระหว่างเขียนตอบ `409 COMPANY_CONFLICT`.
- Daily Work ทุกครั้งที่ create/update ต้องอ้าง WorkItem ที่มีอยู่; Project ต้องตรงกับ Project ของ WorkItem หรือ derive จาก WorkItem. คู่ที่ไม่ตรงต้องถูกปฏิเสธและห้ามเขียนข้อมูล.
- Board เปลี่ยน `WorkItem.status` ผ่าน WorkItem service/validation ชุดเดียวกับ Work Items. ห้ามสร้าง status field หรือ record แยกของ Board.
- Summary เป็น read projection จาก `WorkItem`, `TimeEntry`, `Project`, `Company`; ไม่รับ mutation และไม่ persist ยอดคำนวณซ้ำ.

### 2.2 รูปแบบ response และ HTTP status

API ธุรกิจที่สำเร็จคืน JSON. `GET`, `PATCH` และ `DELETE` คืน `200`; `POST` ที่สร้าง resource คืน `201`. Bulk import ที่ประมวลผล row results คืน `200` เมื่อ request envelope ถูกต้อง แม้บาง row จะไม่ผ่าน; ผลระดับ row อยู่ใน response body. Bad request ทั้ง malformed JSON และ invalid field/business validation ใช้ `400` (ไม่แยก `422`).

Target errors ใช้ envelope เดียวและ stable machine code:

```jsonc
{
  "error": { // ข้อมูล error ระดับ request
    "code": "VALIDATION_ERROR", // machine code สำหรับ UI/client
    "message": "กรุณาตรวจสอบข้อมูลที่ส่งมา", // ข้อความที่แสดงให้ผู้ใช้ได้
    "field": "dueDate" // field ที่มีปัญหา; ละได้เมื่อไม่เกี่ยวกับ field เดียว
  }
}
```

| HTTP | Code | ใช้เมื่อ |
| ---: | --- | --- |
| `400` | `VALIDATION_ERROR` | JSON/body/query/date/enum/number ไม่ถูกต้องหรือขาด field ที่จำเป็น |
| `400` | `RELATION_MISMATCH` | relation มีอยู่แต่ขัดกัน เช่น TimeEntry.projectId ไม่ตรงกับ WorkItem.projectId |
| `401` | `OWNER_UNAUTHENTICATED` | ไม่มี session/credential ของเจ้าของที่ยืนยันแล้ว |
| `403` | `ACCESS_DENIED` | deployment/access policy ปฏิเสธ request; ไม่ใช่ role matrix |
| `404` | `NOT_FOUND` | route resource หรือ required referenced record ไม่มีอยู่ |
| `409` | `CONFLICT` | unique/state conflict หรือการลบจะทำให้ข้อมูลที่อ้างอยู่/ประวัติธุรกิจสูญหาย; message ระบุวิธีแก้ได้ |
| `500` | `INTERNAL_ERROR` | ความผิดพลาดที่ไม่คาดหมาย; ห้ามคืน raw database error หรือ stack trace |
| `503` | `DEPENDENCY_UNAVAILABLE` | database หรือ dependency ที่ route นั้นต้องใช้ไม่พร้อม; คืนเฉพาะข้อมูลปลอดภัย |

ทุก error รวมถึง health `503` ใช้ `{ "error": { "code", "message", "field?" } }`; ไม่คืน password, token, connection string, SQL/provider response หรือ stack trace. ถ้ามี error ย่อยต่อรายการ (เช่น import) ให้ใช้ `code`, `message` และ `field?` แบบเดียวกันใน row result.

`/api/health` เป็น infrastructure probe แยกจาก menu API และไม่ต้องใช้ owner session สำหรับ health check ของ container. Target success คืน `200`; database unavailable คืน `503` โดยไม่เปิดเผย exception. As-Is ปัจจุบันคืน raw error message และต้องแก้ก่อนเปิดใช้งานจริง.

### 2.3 Pagination และ ordering

Company, Project, WorkItem, and TimeEntry collection reads use `limit` and opaque `cursor`: default `50`, maximum `200`; invalid bounds return `400`. Cursors continue from `page.nextCursor` and bind to the original filters/order. Responses include `page: { limit, nextCursor }`, where a null cursor means the last page. Ordering uses a deterministic ID tie-breaker. Dashboard/Analysis return aggregates and bounded previews instead of paginated resource lists.

Work Items, Projects และ Daily Work ที่เกินขนาดหน้าให้ UI ขอหน้าถัดไปแทนการคืนข้อมูลไม่จำกัด. Export ใช้ filter set และ records เดียวกับหน้ารายการ โดยไม่สร้างสำเนาข้อมูล.

### 2.4 Enum, date/time และ metrics ที่ API ใช้ร่วมกัน

| Field | ค่าที่ API รับ/ส่ง |
| --- | --- |
| `WorkItem.kind` | `Incident`, `Issue`, `Task` |
| `WorkItem.priority` | `none`, `low`, `medium`, `high`, `urgent` |
| `WorkItem.role` | `Developer`, `infra`, `SA`, `null` |
| `WorkItem.status` | `backlog`, `todo`, `in-progress`, `blocked`, `sa-testing`, `pm-testing`, `completed`, `cancelled` |
| `Project.status` (legacy field) | `Planning`, `In Progress`, `Review`, `Completed`, `On Hold` |
| `Project.priority` (legacy field) | `Low`, `Medium`, `High`, `Critical` |
| Company registry | Multiple Companies; `Project.companyId` is required after the Dhas backfill |

ทุก timestamp field ใน Target request ต้องส่ง ISO 8601 พร้อม offset `+07:00` และทุก timestamp field ใน Target response ต้องแสดง offset `+07:00`; timestamp ที่ไม่มี offset นี้หรือใช้ offset อื่นตอบ `400 VALIDATION_ERROR`. Business date ใช้ `YYYY-MM-DD` แยกจาก timestamp. Default time zone ของทั้งระบบ, application และ PostgreSQL session คือ `Asia/Bangkok`; ใช้กับ date-only input, วันเริ่ม/สิ้นสุด, period defaults, filter, grouping และทุกค่าที่เขียนลงฐานข้อมูล. บันทึก timestamp เป็น Bangkok local wall-clock semantics ห้าม normalize เป็น UTC และห้ามพึ่ง timezone ของ browser/device. Work Items ใช้ date anchor `workDate ?? dueDate ?? createdAt`; TimeEntries ใช้ `TimeEntry.date`. WorkItem completion/status ใช้ค่ากลางด้านบน; `TimeEntry.status` เป็น legacy และไม่ใช่ workflow status เป้าหมาย.

Dashboard/Analysis คืน `period`, `timezone`, `filters` และ `metricVersion` ใน metadata. ใช้สูตรเดียวกัน: `open = status != completed && status != cancelled`; `completed = status == completed`; `completionRate = completed / (total - cancelled) * 100`, ตัวหารศูนย์คืน `0`; overdue คือ due date ก่อน business date ปัจจุบันและ status ไม่ใช่ `completed`/`cancelled`; hours คือผลรวม Decimal `TimeEntry.hours` โดยไม่ปัดก่อนรวม. ห้ามคำนวณ historical throughput จาก current status หรือใช้ `submittedAt` เป็น completed timestamp.

## 3. Consumer, read/write และ source of truth รายเมนู (Target)

| Menu / consumer | Read contract และ data source | Write contract |
| --- | --- | --- |
| Dashboard `/` | `GET /api/dashboard/summary`; aggregate จาก WorkItem, TimeEntry, Project, Company; มี KPI, recent/urgent/overdue lists และ active-filter metadata | ไม่มี mutation; card/chart links เปิด records หรือ list filter เดิม |
| Projects `/projects` | `GET /api/projects`, `GET /api/projects/{id}`; Projects/Company/WorkItem/TimeEntry; Company selector อ่าน `GET /api/company` | `POST/PATCH/DELETE /api/projects[/{id}]`; ตรวจ Company, fields และ history guard; progress/counts/hours เป็น read-only derived values |
| Work Items `/work-items` | `GET /api/work-items`, `GET /api/work-items/{id}`; canonical WorkItem พร้อม Project/Company, owner และ TimeEntries; list filters ใช้ query contract ด้านล่าง | `POST/PATCH/DELETE /api/work-items[/{id}]`; `POST /api/work-items/import`; shared validation สำหรับ CRUD/import. GitLab manual import เป็น Target ของ #14, ไม่ใช่ endpoint ที่มีอยู่ |
| Board `/board` | `GET /api/work-items` พร้อม filter; group canonical rows ตาม enum `WorkItem.status` | `PATCH /api/work-items/{id}` ส่ง `status`; ต้องใช้ WorkItem service เดียวกับเมนู Work Items |
| Analysis `/analysis` | `GET /api/analysis`; query-time aggregate จาก WorkItem + TimeEntry; ใช้ filter, timezone และสูตรเดียวกับ Dashboard | ไม่มี mutation; export/drill-through ใช้ filtered result และ source IDs เดิม |
| Daily Work `/daily-work` | `GET /api/work-logs`; TimeEntry พร้อม WorkItem, Project, owner; รองรับวัน/ช่วงวันที่และ pagination | `POST/PATCH/DELETE /api/work-logs[/{id}]`; owner server-resolved, ชั่วโมงบวก, WorkItem required และ Project consistency ตรวจทุกครั้ง |
| Company `/company` | Paginated `GET /api/company`; multiple Companies with Project, WorkItem, and TimeEntry aggregate summaries | `POST/PATCH/DELETE /api/company[/{id}]`; protect Dhas and Companies referenced by Projects; ไม่มี member/team administration |
| Settings `/settings` | `GET /api/settings/me`; authenticated owner's profile และ persisted preferences | `PATCH /api/settings/me`; persist เฉพาะ field ที่ UI ใช้และระบบรองรับ; ไม่มี password/2FA หรือ notification channel ที่ยังไม่เชื่อม provider |

ตารางนี้เป็น target contract; endpoint ที่ไม่มีใน inventory section 1 เป็น proposal. Server Components สามารถเรียก shared read/service module โดยตรงได้โดยไม่สร้าง HTTP hop เพิ่ม แต่ต้องใช้ validation/query semantics เดียวกับ API.

## 4. Request/query contracts และ validation ตาม resource

### 4.1 Projects และ Companies (#18 implementation)

Issue #18 is deployed. Company is the direct parent of Project; there is no Customer API or `customerId` contract. All existing Projects were assigned to Dhas, `Project.companyId` is required in production, and Company/Project writes use the owner gate.

- `GET /api/company`: accepts `search`, `limit` (default 50, maximum 200), and opaque `cursor`; returns `{ companies, page }`. Each Company includes an aggregate summary with Project count, WorkItem count, and TimeEntry hours. Ordering is deterministic by name and ID.
- `POST /api/company`: requires a non-empty `name`; optional profile fields are `displayName`, `location`, `industry`, `email`, `phone`, `address`, `website`, `logo`, and `description`. Dhas identity is reserved.
- `PATCH /api/company/{id}`: validates supplied profile fields and preserves Dhas's canonical name. `DELETE /api/company/{id}` is allowed only when no Project refers to the Company and never for Dhas; otherwise it returns `409 HISTORY_CONFLICT`.
- `GET /api/projects`: accepts `companyId`, `status`, `search`, `limit` (default 50, maximum 200), and opaque `cursor`. `status` must be one of `Planning`, `In Progress`, `Review`, `Completed`, or `On Hold`; invalid values return `400 VALIDATION_ERROR`. Response is `{ projects, page }` with Company and derived WorkItem/TimeEntry summaries.
- `GET /api/projects?options=work-items` remains the existing selector response.
- `POST /api/projects`: requires `name`, `companyId`, `startDate`, and `dueDate`; optional fields are `description`, `status`, `priority`, and `colorProject`. The selected Company is checked server-side and `creatorId` comes from the owner. Project calendar dates use Bangkok dates and PostgreSQL `DATE`.
- `PATCH /api/projects/{id}`: accepts partial supported fields, validates Company and dates, and keeps progress and work/hour totals derived from shared records.
- `DELETE /api/projects/{id}`: returns `409 HISTORY_CONFLICT` while WorkItems, TimeEntries, or dependent business history exists. The UI confirms before submitting and displays the conflict returned by the API.

### 4.2 Work Items และ Board

- `GET /api/work-items`: target filters `projectId`, `companyId` (via Project), `kind`, `status`, `priority`, `role`, `year`, `month`, `search`, `includeYears`, `limit`, `cursor`. `assigneeId` คงไว้ได้เฉพาะ compatibility ภายใน; ไม่ใช่ owner selector.
- `year`/`month` และ `includeYears` ใช้ calendar date ตาม `Asia/Bangkok`; date anchor คือ `workDate`, ถัดมา `dueDate`, แล้ว `createdAt`. เมื่อไม่ส่ง `year` ให้ใช้ปีปัจจุบันใน timezone นี้.
- `POST /api/work-items` ต้องมี `title`, `kind`, `projectId`; defaults คือ `priority=none`, `role=null`, `status=backlog`, `types=[]`. Optional fields: `description`, `workDate`, `dueDate`. Business dates ต้องเป็นวันที่ถูกต้อง `YYYY-MM-DD`. `assigneeId` ถูก resolve เป็น owner โดย server. Invalid enum/date → `400 VALIDATION_ERROR`, missing Project → `404 NOT_FOUND`.
- `PATCH /api/work-items/{id}` รับ partial fields เดียวกับ create ผ่าน shared parser, ตรวจ input และ Project FK ก่อนเขียน. Missing WorkItem/Project → `404 NOT_FOUND`; invalid input → `400 VALIDATION_ERROR`. `status` mutation จาก Board ใช้ record เดียวกัน; `submittedAt` ไม่ใช่ completion time.
- `DELETE /api/work-items/{id}` ตอบ `409 HISTORY_CONFLICT` เมื่อมี TimeEntry อ้างอยู่; Prisma relation ใช้ `Restrict` เพื่อป้องกันการทำ Daily Work orphan แม้มีคำขอพร้อมกัน.
- `POST /api/work-items/import`: รับ JSON array หรือ `{ "workItems": [...] }`; ทุกแถวใช้ shared create validation แยกจากกัน. คืน HTTP `200` พร้อม `imported` และ `rows[]` ที่มี `row` (เริ่มนับ 1), outcome (`created`/`skipped`/`failed`), `workItemId?`, และ safe `error?`. แถว enum/Project ผิดแจ้งสาเหตุโดยแถวที่ถูกต้องยังทำต่อ; duplicate ID ถูก skip โดยไม่แก้ข้อมูลเดิม. Request envelope/JSON ที่ผิดตอบ `400`.
- Export CSV, Markdown และ importable JSON เป็น read-only projection ของชุดรายการที่มองเห็นตาม filters; ไม่เปลี่ยน WorkItem และไม่เป็นแหล่งข้อมูลอีกชุด.

#### 4.2.1 GitLab Issue import (Target proposal)

การเชื่อม GitLab เป็น manual owner-triggered pull เท่านั้น. Routes ที่เสนอคือ `GET /api/integrations/gitlab/status`, `GET/POST /api/integrations/gitlab/projects`, `PATCH/DELETE /api/integrations/gitlab/projects/{mappingId}` และ `POST /api/integrations/gitlab/sync`; **ไม่มี route เหล่านี้ใน As-Is inventory §1**. Require owner authentication, configured server-side instance/token และ approved Project mapping. Sync response แยก `created`, `updated`, `skipped`, `failed` พร้อม source URL, safe per-Issue reason/retryability และ run-level pagination failure เมื่อมี partial result. Exact identity, field ownership, `opened → todo` / `closed → completed`, label map, transaction boundary, HTTP errors, pagination/rate-limit/retry behavior และ Bangkok date/time rules เป็นของ [GitLab Issue Import Contract](./GITLAB_ISSUE_IMPORT.md); ห้ามถือ Target proposal ว่า implemented.

### 4.3 Daily Work / TimeEntry

- `GET /api/work-logs`: `date=YYYY-MM-DD` หรือ `startDate`+`endDate` (ต้องส่งเป็นคู่และ end ไม่น้อยกว่า start); ห้ามส่ง `date` พร้อม date range. รองรับ optional `projectId`, `workItemId`, `limit`, `cursor`. วันเป็นช่วง inclusive ตาม Asia/Bangkok; `userId` เป็น legacy compatibility เท่านั้น.
- `POST /api/work-logs`: target ต้องมี `workItemId`, business `date`, `hours`; `description`/`remarks` optional. ชั่วโมงต้องเป็น finite Decimal มากกว่า 0; `userId` ถูก resolve จาก owner. `projectId` ไม่จำเป็นเพราะ derive จาก WorkItem; หากส่งมาเพื่อ compatibility ต้องตรวจว่าตรงกัน.
- `PATCH /api/work-logs/{id}`: partial update แต่ตรวจ next-state ของ `workItemId` + `projectId` ทุกครั้ง แม้ส่งเฉพาะ `projectId`; ห้ามปล่อย mismatch. Missing TimeEntry/WorkItem/Project ตอบ 404; relation mismatch หรือ hours/date invalid ตอบ 400.
- `DELETE /api/work-logs/{id}` ลบ TimeEntry ที่ระบุและคืน safe success body. Successful create/update/delete ทำให้ consumer query ที่ใช้ TimeEntry refresh/invalidate.
- `TimeEntry.status` ไม่รับเป็น target workflow field. As-Is field อาจปรากฏในข้อมูลเก่าจนกว่าจะจัดการ migration.

ยังไม่มีตัวเลข cap ชั่วโมงรายวันในข้อกำหนดที่อนุมัติ; ห้ามเดา cap ใน API contract. หากกำหนด cap เพิ่มภายหลังให้ validate server-side และตอบ `400 VALIDATION_ERROR` พร้อม field.

### 4.4 Dashboard และ Analysis aggregates

`GET /api/dashboard/summary` และ `GET /api/analysis` ใช้ query parameters ชุดเดียวกัน: `startDate`, `endDate` (ทั้งคู่หรือไม่ส่งทั้งคู่; เมื่อไม่ส่งใช้เดือนปัจจุบันใน default time zone `Asia/Bangkok`), `companyId`, `projectId`, `role`, `kind`. `startDate`/`endDate` เป็น inclusive business dates. หากส่งทั้ง `companyId` และ `projectId` ที่ไม่สัมพันธ์กัน ให้ตอบ `400 RELATION_MISMATCH`; resource ID ที่ไม่มีอยู่ตอบ `404`.

ใช้ date range กับ WorkItem date anchor และ `TimeEntry.date` ตามข้อ 2.4. Response ทั้งคู่ต้องบอก effective period, timezone, filters และ metric version เพื่อให้ UI/link/export ระบุฐานคำนวณเดิม. Dashboard `summary` คืน `total`, `open`, `completed`, `overdue`, `completionRate`, `loggedHours` และ bounded `recentWorkItems`, `urgentWorkItems`, `overdueWorkItems` lists พร้อม canonical IDs/deep links. Analysis คืน KPIs เดียวกัน พร้อม `statusBreakdown`, `kindBreakdown`, `priorityBreakdown`, time-series และ filtered source rows สำหรับ drill-through กลับ WorkItem/TimeEntry IDs. ทั้งสอง response ไม่เขียน metric ที่คำนวณได้ลงเป็นข้อมูลชุดใหม่. Historical throughput ต้องรอ status history หรือ completion timestamp ที่มีความหมายชัดเจน.

ตัวอย่าง metadata ที่ response ต้องมี:

```jsonc
{
  "meta": { // บริบทที่ใช้คำนวณ response
    "period": { // business-date range แบบรวมปลายช่วง
      "startDate": "2026-09-01", // วันเริ่มต้นที่ใช้คำนวณ
      "endDate": "2026-09-30" // วันสิ้นสุดที่ใช้คำนวณ
    },
    "timezone": "Asia/Bangkok", // timezone สำหรับ date boundary และ grouping
    "filters": { // filters ที่มีผลจริง
      "companyId": null, // Company filter หรือ null
      "projectId": null, // Project filter หรือ null
      "role": null, // WorkItem role filter หรือ null
      "kind": null // WorkItem kind filter หรือ null
    },
    "metricVersion": "shared-work-v1" // สูตร metrics ที่ response ใช้
  }
}
```

### 4.5 Company และ Settings

- Company collection/create/update/delete contracts ของ #18 ระบุไว้ในข้อ 4.1; Dhas เป็น Company หลักที่ห้ามลบ และ Company ที่มี Projects ใช้งานอยู่ลบไม่ได้.
- `GET /api/settings/me`: คืน `{ profile, preferences }` ของเจ้าของที่ยืนยันแล้ว; หากยังไม่มี preferences ให้คืน default `theme=light`, `locale=th` และเพิ่ม `timezone=Asia/Bangkok` จาก system config แบบ read-only ไม่ใช่ค่าที่เจ้าของเลือก. ค่า timezone เป็นค่าระบบคงที่ทุก environment. ไม่มี identity selector. `PATCH` รับ partial updates ใน nested `profile` และ/หรือ `preferences` object เท่านั้น. `profile` รองรับ `name`, `email`, `phone`, `avatar`; `name` ต้องไม่ว่าง; email ต้องถูกต้องและ unique (`409 CONFLICT` เมื่อชน). Profile fields ที่ไม่มี backing field เช่น Bio หรือ first/last name แยกกันต้องไม่ถูกบันทึกเป็นข้อมูลใหม่.
- Target preferences จำกัดที่ theme (`light`, `dark`, `special-dark`) และ locale (`th`, `en`). Timezone แสดงเป็น `Asia/Bangkok` แบบ read-only; ห้ามตั้ง preference ที่เปลี่ยน timezone ของการ parse, persistence หรือ business-date calculations. Unknown/unintegrated security หรือ notification fields ตอบ `400 VALIDATION_ERROR` และห้ามตอบสำเร็จโดยไม่ persist.
- ตัวอย่าง target `PATCH /api/settings/me`:

```jsonc
{
  "profile": { // fields ของ User record เจ้าของ
    "name": "Owner", // ชื่อที่ระบบแสดง; แก้ไขได้
    "email": "owner@example.test" // email เจ้าของ; ต้องไม่ซ้ำ
  },
  "preferences": { // ค่าที่ระบบ persist และ UI ใช้จริง
    "theme": "dark", // theme ปัจจุบันที่รองรับ
    "locale": "th" // ภาษาที่เลือก; timezone ระบบคงที่เป็น Asia/Bangkok
  }
}
```

- Owner preference storage ยังเป็น schema decision ที่เปิดอยู่ใน [ARCHITECTURE.md](./ARCHITECTURE.md); endpoint นี้จึงเป็น Target proposal ไม่ใช่ current API.

## 5. Error cases ที่ consumer ต้องรองรับ

| Case | HTTP / code | ผลที่ UI ต้องรักษา |
| --- | --- | --- |
| Invalid enum/date/hour, body หรือ query | `400 VALIDATION_ERROR` | ไม่เปลี่ยน local record/aggregate; แสดง field/message |
| Project กับ WorkItem ไม่สัมพันธ์กัน | `400 RELATION_MISMATCH` | ไม่สร้าง/แก้ TimeEntry; เก็บค่าเดิมไว้ |
| ไม่พบ WorkItem, TimeEntry, Project หรือ Company ที่อ้าง | `404 NOT_FOUND` | แสดง not-found state; ไม่แทนด้วย empty success |
| Company/Project ถูกใช้งานหรือ unique/state conflict | `409 CONFLICT` | เก็บข้อมูลเดิม; อธิบายการรักษา/archive/retry ที่ทำได้ |
| ไม่มี owner session / access gate block | `401 OWNER_UNAUTHENTICATED` / `403 ACCESS_DENIED` | ไม่เปิดข้อมูลหรือ mutation; แสดง permission state |
| Database หรือ required provider ใช้งานไม่ได้ | `503 DEPENDENCY_UNAVAILABLE` | รักษาข้อมูลเดิม; มี retry ที่ปลอดภัยเมื่อรองรับ |
| Unexpected server error | `500 INTERNAL_ERROR` | แสดง generic error และ trace/reference ถ้ามี; ห้ามแสดง raw exception |

Mutation success คืน canonical resource หลัง server commit. UI อัปเดต/refresh หลัง success เท่านั้น; ถ้ามี optimistic status update แล้ว request ล้มเหลว ให้ rollback. Error/timeout ห้ามถูกแทนด้วยค่าศูนย์ใน Dashboard/Analysis.

## 6. การพัฒนาตาม dependency และการตรวจ contract

Route proposals ที่ยังไม่ implement ขึ้นกับ owner access, shared WorkItem/TimeEntry validation และ preference storage ตามลำดับใน [SCOPE.md](./SCOPE.md). Company/Project rollout ของ #18 ผ่านแล้ว; รายละเอียด migration เดิมเก็บไว้ใน [Customer/Project Migration Contract](./CUSTOMER_PROJECT_MIGRATION.md) เพื่ออ้างอิงย้อนหลังเท่านั้น. GitLab Issue import details, mappings, retries และ response outcomes อยู่ใน [GitLab Issue Import Contract](./GITLAB_ISSUE_IMPORT.md); route proposals ด้าน GitLab ไม่ใช่ current API.

Contract regression tests ตรวจความครบของเอกสาร, route inventory ปัจจุบัน, target menu coverage และ reusable runner commands; tests เหล่านี้ไม่ได้ยืนยันว่า target endpoints ที่ยังไม่มีถูก implement แล้ว. คำสั่งดูที่ [Testing Commands](./process/testing.md): `pnpm test:api-contracts`, `pnpm test:contracts`, `pnpm test`; GitLab contract ใช้ `pnpm test:gitlab-contracts`.

## Runtime security ที่ implement ใน #15

สถานะเพิ่มเติม ณ 2026-09-28: มี private owner access gate หน้า Next.js, server-only environment injection จาก root `.env` ของ Dev/UAT/Production, loopback host ports และ `Asia/Bangkok` สำหรับ app/PostgreSQL session แล้ว. รายละเอียดปัจจุบันและคำสั่งตรวจที่ไม่พิมพ์ secrets อยู่ใน [Runtime Security](./RUNTIME_SECURITY.md). Baseline เดิมที่กล่าวว่าไม่มี auth/session ยังใช้กับ owner User/session (#17); gate นี้ไม่ resolve User หรือเพิ่ม GitLab connector (#20), ไม่เปลี่ยน schema/records และไม่ยืนยันว่า installation จริง deploy แล้ว.

## Database operations ที่ implement ใน #16

เครื่องมือ backup/isolated restore/staged validation/health และ retention อยู่ใน [Database Rollout](./DATABASE_ROLLOUT.md). ใช้ Asia/Bangkok และตรวจ exact history โดยไม่แปลง timestamp เป็น UTC. Production Company/Project schema และ business API ของ #18 ผ่าน rollout แล้ว; ผลตรวจอยู่ใน [Issue #18 implementation report](./COMPANY_PROJECT_IMPLEMENTATION.md). Customer/GitLab contracts ที่เหลือเป็นข้อเสนอเก่าหรืออนาคต ไม่ใช่ current API.
