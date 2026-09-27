# API

| รายการ | ค่า |
| --- | --- |
| Framework | Next.js 15 App Router Route Handlers |
| Base URL | `http://localhost:<app-port>/api` |
| รูปแบบ | JSON; methods use `GET`, `POST`, `PATCH`, `DELETE` |
| สถานะ | Inventory ปัจจุบันและ target endpoints; target endpoints are proposals |
| เอกสารเชื่อมโยง | [DATABASE.md](./DATABASE.md) · [DATABASE_MAPPING.md](./DATABASE_MAPPING.md) · [ENGINEERING_SPEC.md](./ENGINEERING_SPEC.md) |

## 1. API conventions

- Response content type เป็น JSON สำหรับ routes ที่คืนข้อมูล
- Current APIs ส่วนใหญ่คืน wrapper เช่น `{ "workItems": [...] }`, `{ "workItem": {...} }`, `{ "projects": [...] }`, `{ "workLogs": [...] }`
- Work Item status ที่ API ส่งออกใช้รูปแบบ hyphenated (`in-progress`, `sa-testing`, `pm-testing`) แม้ Prisma enum ใช้ underscore ในบางค่า
- `POST` create ปกติคืน 201; `GET` คืน 200; bad input คืน 400; missing record คืน 404; server failure คืน 500; Health คืน 503 เมื่อ DB ไม่พร้อม
- Current API ไม่พบ authentication middleware; endpoint examples เป็น baseline ไม่ใช่ security sign-off. Product scope มีเจ้าของระบบคนเดียว จึงต้องปกป้อง owner access แต่ไม่ต้องมี role-based authorization สำหรับผู้ใช้หลายคน
- Pagination/limit contract ยังไม่พบใน list APIs ปัจจุบัน; ต้องเพิ่มก่อนข้อมูลโตหรือกำหนด operational limit

## 2. Current endpoint inventory

| Method | Endpoint | ทำอะไร | Data source |
| --- | --- | --- | --- |
| `GET` | `/api/health` | ตรวจ DB connection และคืน status/timestamp/uptime | Prisma `$queryRaw SELECT 1` |
| `GET` | `/api/users` | list Active users (legacy selector; target เหลือ owner identity เดียว อาจไม่ต้องโหลดเป็น list) | `User` |
| `GET` | `/api/projects` | list Projects; `?status=<value>` กรอง status | `Project`, creator, counts of WorkItems/legacy memberships |
| `GET` | `/api/projects?options=work-items` | lightweight Project options (`id`, `name`, `colorProject`) | `Project` |
| `POST` | `/api/projects` | create Project; requires `name`, `startDate`, `dueDate` | `Project` |
| `GET` | `/api/projects/{id}` | Project detail | `Project` and related data per handler |
| `PATCH` | `/api/projects/{id}` | update Project fields accepted by handler | `Project` |
| `DELETE` | `/api/projects/{id}` | delete Project (schema cascades to dependent rows) | `Project` |
| `GET` | `/api/work-items` | list/filter Work Items | `WorkItem` with Project and owner assignee; `WorkItem.role` indicates Developer/Infra/SA functional role |
| `POST` | `/api/work-items` | validate and create Work Item | `WorkItem` |
| `GET` | `/api/work-items/{id}` | Work Item detail | `WorkItem` with relations |
| `PATCH` | `/api/work-items/{id}` | update Work Item | `WorkItem` |
| `DELETE` | `/api/work-items/{id}` | delete Work Item | `WorkItem`; TimeEntry.workItemId uses SetNull |
| `POST` | `/api/work-items/import` | bulk/import Work Items after checking referenced Project/User | `WorkItem`, `Project`, `User` |
| `GET` | `/api/work-logs` | list Time Entries with optional date range and legacy user filter | `TimeEntry` with owner User, Project, WorkItem |
| `POST` | `/api/work-logs` | create Daily Work/TimeEntry | `TimeEntry` |
| `GET` | `/api/work-logs/{id}` | read one work log | `TimeEntry` |
| `PATCH` | `/api/work-logs/{id}` | update work log | `TimeEntry` |
| `DELETE` | `/api/work-logs/{id}` | delete work log | `TimeEntry` |

No current Customer, Analysis, Dashboard aggregate, Company mutation, Project team mutation, Settings, login/session, notification, or GitLab integration endpoints were found under `app/api`.

## 3. Current query parameters

### `GET /api/work-items`

| Parameter | Behavior |
| --- | --- |
| `projectId` | Filter by Project |
| `assigneeId` | Legacy API filter; target product has one owner assignee, so this is not a user-facing filter |
| `kind` | Incident / Issue / Task; invalid value returns 400 |
| `status` | Public status enum spelling; invalid value returns 400 |
| `priority` | none / low / medium / high / urgent; invalid value returns 400 |
| `year` | Four-digit year or `all`; date match uses workDate, else dueDate, else createdAt |
| `month` | 1–12 or `all`; validated |
| `search` | Case-insensitive match over title, description, Project name, assignee name, kind/status terms |
| `includeYears` | `true` includes available years |

Response: `{ "workItems": WorkItemWithProjectAndAssignee[], "years"?: string[] }`.

### `GET /api/work-logs`

- `date=YYYY-MM-DD`: one local day using server date construction
- `startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`: inclusive day range
- `userId=<id>`: legacy filter; target product has one owner/logger, so no user selector/filter is required
- Response: `{ "workLogs": TimeEntryWithUserProjectWorkItem[] }`

Current implementation needs a documented timezone policy to ensure client/server day boundaries agree; no pagination is present.

## 4. Current request contract highlights

### Create Work Item

`POST /api/work-items` validates input through `parseWorkItemInput`, checks that Project and assignee exist, creates the Work Item, and sets `submittedAt` when status is `sa-testing` or `completed`. In the target single-owner system, `assigneeId` resolves to the owner's User record; `role` is where Developer/Infra/SA is recorded.

```json
{
  "title": "Prepare release notes",
  "description": "Summarize changes for release",
  "kind": "Task",
  "priority": "medium",
  "role": "SA",
  "status": "todo",
  "types": ["documentation"],
  "workDate": "2026-09-27T00:00:00.000Z",
  "dueDate": "2026-09-30T00:00:00.000Z",
  "projectId": "<project-id>",
  "assigneeId": "<user-id>"
}
```

### Create Daily Work

`POST /api/work-logs` currently requires `hours`, `userId`, `projectId`, and `workItemId`; it checks that the user exists and resolves the Work Item only if it belongs to the selected Project. `PATCH /api/work-logs/{id}` performs the same Work Item/Project check only when `workItemId` is included in the patch. A patch that changes `projectId` without also sending `workItemId` can therefore leave a mismatched pair; this is a current integrity gap. Existing page also submits description, remarks, date and status.

```json
{
  "description": "Review the deployment checklist",
  "remarks": "Follow up on one open item",
  "hours": "1.5",
  "date": "2026-09-27",
  "projectId": "<project-id>",
  "workItemId": "<work-item-id>",
  "status": "In Progress",
  "userId": "<user-id>"
}
```

Target API must get `userId` from authenticated identity, not trust the posted value. Never use these example placeholders as real IDs.

## 5. Target API changes required by menu scope

The list below is a proposal; route naming should be reviewed before implementation.

| Method | Proposed endpoint | Consumer / purpose |
| --- | --- | --- |
| `GET`, `POST` | `/api/customers` | Customer registry used by the owner and Project selector |
| `GET`, `PATCH`, `DELETE` | `/api/customers/{id}` | Customer detail/update/deactivate |
| `GET / POST / PATCH` | `/api/projects` and `/api/projects/{id}` | Include required `customerId`; validate Customer relation |
| `GET` | `/api/dashboard/summary` | KPI, period/filter inputs, deep-link criteria |
| `GET` | `/api/analysis` | Aggregate series/tables for WorkItem + TimeEntry |
| `GET`, `PATCH` | `/api/company` | Read/update the one company profile for this installation |
| `GET`, `PATCH` | `/api/settings/me` | Owner profile/preferences; no user selector or multi-account settings |
| `POST` | `/api/work-items/{id}/status` (or reuse PATCH) | Board status change; reuse common WorkItem service |
| `GET` | `/api/integrations/gitlab/status` | Return connection/configuration state and last-sync summary, without secrets |
| `GET`, `POST`, `DELETE` | `/api/integrations/gitlab/projects` | List/create/remove GitLab Project mapping (manual setup); removing a mapping retains imported WorkItems and TimeEntries |
| `POST` | `/api/integrations/gitlab/sync` | Pull Issues for mapped projects; return created/updated/skipped/failed counts and per-issue errors |

Prefer reusing `/api/work-items/{id}` PATCH for Board if it has sufficient validation/audit; do not create two independent status mutation implementations.

GitLab endpoints are proposed and are not present in the current application. Require owner authentication; call GitLab from the server only. The sync endpoint must paginate, respect GitLab rate limits, upsert by external identity, and return a safe retryable result. Initial delivery is manual pull only; do not add webhook or write-back routes.

## 6. Target response and validation contract

Example error envelope:

```json
{
  "error": {
    "code": "WORK_ITEM_PROJECT_MISMATCH",
    "message": "Work Item นี้ไม่ได้อยู่ใน Project ที่เลือก",
    "field": "workItemId"
  }
}
```

Recommended status codes: 400 malformed/invalid input, 401 owner unauthenticated, 403 access blocked by deployment policy, 404 missing resource, 409 uniqueness/state conflict, 422 semantically invalid request if adopted consistently, 500 unexpected failure, 503 required dependency unavailable. Maintain one standard response envelope and do not return raw exception/stack trace. No application-level role matrix is required while there is one owner.

## 7. Security and reliability gaps to close

- Add owner authentication/access control to every read/mutation; do not build multi-user roles/permissions unless the product scope changes
- Validate hours/date/status/project/customer server-side; database constraints should backstop API rules
- Restrict list size and add pagination/sorting contracts
- Prevent accidental cascade deletion of work history; use archive or explicit deletion policy
- Make import atomic or report per-row outcomes and preserve existing records on invalid batch
- Normalize timezone/day range logic, ideally using explicit UTC instants derived from business timezone
- Add dashboard/analysis response metric metadata: period, timezone, applied filters and formula version
- Add request-level logging/trace IDs without logging secrets or password fields
- Stop returning the raw database exception message from `/api/health`; return a generic dependency status and keep diagnostic details only in protected server logs

