# Project Issue Sync — GitLab / GitHub

## ขอบเขตที่ implement

เจ้าของระบบกด Sync จากหน้า PMS Project → Integrations เพื่อดึง GitLab Project หรือ GitHub Repository เข้า Work Items ทางเดียว ไม่มี scheduler, webhook หรือ write-back. PMS Project หนึ่งรับหลายต้นทางได้ แต่ provider + instance + stable external project ID หนึ่งชุดมี PMS Project ปลายทางเดียว. รองรับ GitHub.com, GitLab.com และ GitLab Self-Managed ผ่าน HTTPS; GitHub Projects board และ GitHub Enterprise Server อยู่นอกขอบเขต.

ทุก config ต้องมี assignee usernames 1–50 รายการ ตรงอย่างน้อยหนึ่งคนแบบ OR. ไม่มี wildcard, ไม่มีค่าเริ่มต้นเป็นทุกคน และไม่นำเข้า unassigned issues. Service query แยก username เพื่อรองรับ GitLab CE แล้วรวมผลโดย stable issue ID พร้อมตรวจ assignees ซ้ำฝั่ง server. GitHub Pull Requests ไม่ถูกนำเข้า. อ่านทั้ง Open/Closed และ map เป็น `todo`/`completed` ตามลำดับ.

## Service และ config

ใช้ Next.js Route Handlers, `lib/issue-sync.ts` และ provider adapters ใน `lib/issue-sync-provider.ts` เรียก REST APIs ด้วย GET เท่านั้น. ไม่ต้องเพิ่มบริการภายนอกสำหรับขอบเขตไม่เกิน 1,000 issues ต่อ config. ปุ่ม Sync ทั้ง Project เรียก configs ที่เปิดใช้ตามลำดับ; ผลแต่ละ config มี run history แยกกัน. รอบหนึ่งมี provider request budget 90 วินาที, request timeout สูงสุด 15 วินาที และ retry network/5xx/short rate limits สูงสุดสาม attempts. `Retry-After` ที่ยาวกว่า 2 วินาทีจะจบรอบให้ retry ภายหลังแทนการส่งคำขอก่อนกำหนด. งานที่ commit แล้วไม่ rollback เพราะหน้าถัดไปล้มเหลว.

`issue_sync_configs` เป็นตารางใหม่สำหรับ assignees, `token_env_var`, enabled, source path, revision และ lease; เชื่อม numeric FK กับ `external_project_mappings`. ใช้ mapping และ external identity เดิมเพื่อไม่สร้าง Work Item ซ้ำเมื่อเพิ่ม config ให้ mapping เก่า. `issue_sync_runs` เก็บ config snapshot ที่ไม่มี secret, start/finish, lifecycle, counts, per-issue outcomes/warnings และ run-level error. ทุกตารางมี internal BIGINT identity และ immutable database-generated UUIDv4; API ใช้ public UUID เท่านั้น. วันที่และ timestamps ในฐานข้อมูลเป็น Asia/Bangkok wall-clock และ API timestamps ใช้ `+07:00`.

Repository fields ใช้ชื่อกลาง instanceUrl, externalProjectId, externalIssueId และ externalIssueNumber สำหรับทั้งสอง provider. Source identity ถูกตรวจใหม่ทุก run; การเปลี่ยนชื่อ/ย้ายต้นทางที่ redirect ต้องตรวจ mapping ก่อน.

## Credentials

แต่ละ row ใน `issue_sync_configs.token_env_var` กำหนดชื่อตัวแปรที่เก็บ token จริงใน root `.env` โดยตรง. Provider และ instance URL อยู่ใน mapping ของ row นั้น; ไม่มี JSON credential registry และไม่เก็บ token จริงใน DB, request body, DTO, run snapshot หรือ logs.

```dotenv
GITLAB_PROJECT_A_TOKEN=<provision-token-A-on-server>
GITLAB_PROJECT_B_TOKEN=<provision-token-B-on-server>
GITHUB_PROJECT_C_TOKEN=<provision-token-C-on-server>
```

ตัวอย่าง row A ใช้ `token_env_var=GITLAB_PROJECT_A_TOKEN` กับ GitLab instance A; row B ใช้ `GITLAB_PROJECT_B_TOKEN` กับ GitLab อีก instance; row C ใช้ `GITHUB_PROJECT_C_TOKEN` กับ GitHub.com. หลาย rows ใช้ชื่อตัวแปรเดียวกันได้เมื่อต้องการใช้ token ร่วมกัน. เมื่อเพิ่ม row ที่ใช้ token ใหม่ ให้เพิ่มตัวแปรชื่อตรงกันใน `.env`; ไม่ต้องแก้ Compose หรือ config registry. SQL ตัวอย่างอยู่ใน `database/seeds/sql-master/120_issue_sync_configs.sql` และยังไม่ลงทะเบียนใน checksummed seed manifest.

ชื่อตัวแปรยาวไม่เกิน 128 ตัวอักษร ใช้อักษรใหญ่/ตัวเลข/underscore, ขึ้นต้น `GITLAB_`, `GITHUB_` หรือ `ISSUE_SYNC_` และลงท้าย `TOKEN` หรือ `TOKEN_ชื่อเพิ่มเติม` เช่น `GITLAB_TEAM_TOKEN`, `GITHUB_TOKEN_PROJECT_A`, `ISSUE_SYNC_TOKEN_TEAM_B`. จำกัดชื่อสำหรับ token ของ feature นี้เพื่อไม่ให้ config อ้าง `OWNER_GATE_PASSWORD`, `DATABASE_URL`, Cloudflare credentials หรือ `NEXT_PUBLIC_*`. Runtime launcher redact ทุกตัวแปรตามรูปแบบนี้โดยไม่ต้องอ่าน DB.

ใช้ token ที่อ่าน project และ issues ได้ เช่น GitLab `read_api` และ GitHub fine-grained PAT ที่เลือก repository กับ Issues: read. Server ตรวจ HTTPS URL และยอมรับเฉพาะ GitHub.com สำหรับ GitHub; GitLab host มาจาก mapping ที่ owner กำหนด. ทุก request ผูกกับ instance ของ config และไม่ตาม redirects. Config ที่ไม่มีตัวแปร/ค่า token พร้อมใช้จะล้มเหลวก่อนส่ง request ไป provider.

Local runtime อ่าน root `.env`. Docker app รับตัวแปรจาก root `.env` ผ่าน `env_file` อัตโนมัติและยังคง internal port 3000; หากใช้ไฟล์ environment อื่น ให้ตั้ง `PMS_ENV_FILE` เป็น path ของไฟล์นั้นพร้อม `--env-file`. หลังเพิ่มหรือหมุน token ให้ recreate app เพื่อโหลด environment ใหม่. Token อยู่เฉพาะ runtime ไม่ถูก COPY เข้า image หรือ browser bundle. ชื่อตัวแปรใน DB คงเดิมได้เมื่อหมุนค่า token จึงไม่เปลี่ยน source identity หรือ public UUID.

Config ต้องกำหนด `token_env_var` ก่อนเปิด sync; NULL อนุญาตเฉพาะ config ที่หยุด. ใช้ `database/schema.sql` สำหรับ fresh initialization ตาม workflow ฐานข้อมูล ไม่มี migration history เดิมให้รัน.

## การอัปเดตและรักษาประวัติ

- ชื่อใช้ `[#เลข issue] [Role] ชื่อเรื่อง` เช่น `[#5] [SA] DHAS Grand Rally — campaign portal for eligible stores`. นำ Markdown heading และ issue prefix เดิมออกก่อนจัดรูปแบบ จึงไม่มี prefix ซ้ำ. Role มาจาก label, prefix ต้นทาง หรือ role เดิมตามลำดับ; ถ้าไม่มีข้อมูล role จะไม่เติม role ที่เดาขึ้นเอง.
- ต้นทางควบคุม title, description, status, type labels และ GitLab due date. GitHub ไม่มี issue due date จึงไม่เขียนทับ due date ใน PMS. `status::` ที่รองรับระบุสถานะละเอียดได้; เมื่อไม่มี ใช้ Open/Closed เป็น todo/completed.
- `kind::task` หรือ `type::task` แสดง Task; รองรับ Incident/Issue เช่นกัน. `priority::high` แสดง High, `role::SA` แสดง System Analyst, `type::documentation` แสดง documentation. Labels มาตรฐานแปลงเป็น field/badge ที่ตรงกัน; `approvedLabelMap` ยังใช้กำหนด type แบบตรงตัวได้. Labels อื่นเก็บใน type_labels และแสดงเป็น badge พร้อม warning ไม่ทิ้งข้อมูล. ถ้า standard labels ระบุค่าขัดกัน เช่น priority สองค่า จะ fail issue นั้นด้วย `SOURCE_LABEL_CONFLICT`.
- ถ้าไม่มี label kind/priority/role และไม่มี role prefix ให้รักษาค่าท้องถิ่นเดิม. Work date, owner และ Daily Work ยังคงเดิม; assignee ต้นทางเป็น filter ไม่ใช่บัญชี PMS. ไม่สร้าง Users หรือ TimeEntries อัตโนมัติ. Labels ที่ถูกลบจากต้นทางจะหายจาก type badges เมื่อ sync ใหม่. หน้าแก้ไขเก็บ custom labels ที่นำเข้าแล้วได้ แต่ไม่เปิดรับ custom labels ใหม่ผ่าน ordinary create/patch.
- ตัวจับคู่หลักคือ provider + instance + external project ID + stable issue ID. Sync ซ้ำหรือเปลี่ยนชื่อ/รายละเอียดจะ update UUID เดิม รวมถึงซ่อม format, description, labels และ submittedAt ที่ขาด แม้ source timestamp เท่าเดิม. ไม่ใช้ชื่อแทน identity ของรายการที่มี mapping แล้ว.
- สำหรับรายการเก่าที่ยังไม่มี mapping ตรวจเฉพาะ owner/Project เดียวกันและยังไม่ผูกต้นทางอื่น. Canonical source URL เดียวกัน หรือชื่อที่ตรงกันพร้อมเลข issue เดียวกันสามารถยืนยันรายการเดิมได้. เลข issue ในชื่อ/metadata หรือ source URL ที่ระบุชัดว่าเป็นคนละ issue จะไม่เปิด alert และไม่จับคู่กัน. Source ID ใหม่ที่ใช้เลข/URL ที่ผูกไว้แล้ว fail `SOURCE_IDENTITY_CONFLICT`.
- ถ้ายังยืนยัน identity ไม่ได้และชื่อคล้ายกัน **มากกว่า 60%** จะเก็บ outcome `pending` เหตุผล `confirmation_required` ใน `issue_sync_runs.results` โดยยังไม่สร้าง/แก้ Work Item ของ issue นั้น. คำนวณ multiset Sørensen–Dice ของ Unicode character bigrams หลังตัด issue/role prefixes, normalize NFC, case และเครื่องหมาย/ช่องว่าง; ใช้ค่าจริงเทียบ `> 0.6` ไม่ใช้เปอร์เซ็นต์ที่ปัดเศษ. ชื่อเหมือนกัน 100% แต่ไม่มี identity ก็ต้องให้ owner เลือก. ที่ 60% พอดีไม่ถาม.
- Sync ทั้ง Project รวบรวม pending จากทุก config ที่เลือกและเปิด modal เดียว เรียงแหล่งต้นทางและ issues พร้อมรายการปลายทาง ชื่อ รายละเอียดสั้น เปอร์เซ็นต์ และลิงก์ดูข้อมูล. เลือกให้ครบว่าแต่ละ issue ตรงกับ Work Item ใด หรือเป็นคนละ issue กับทุกตัวเลือก. ห้ามใช้ Work Item เดียวกับหลาย source issues. ปิด modal แล้วยืนยันภายหลังได้จากประวัติ run.
- การยืนยันอัปเดต UUID เดิมและสร้าง durable source mapping เมื่อเลือก “เดียวกัน”; เลือก “คนละ” จึงสร้างใหม่. Sync ถัดไปใช้ source identity ที่บันทึกแล้วและไม่ถามซ้ำ. การยืนยันต่อ config เป็น Serializable transaction เดียวภายใต้ lease; ตรวจ config version, owner/Project, candidate UUIDs และ fingerprints ที่ server เก็บไว้ซ้ำ. ถ้ารายการ/คู่เปรียบเทียบเปลี่ยน ให้ `409 REVIEW_STALE` และ Sync เพื่อตรวจใหม่. Retry คำยืนยันเดิมไม่สร้างซ้ำ. Snapshot สำหรับยืนยันเก็บฝั่ง server ใน JSONB เดิม ไม่รับ source payload หรือ fingerprint จาก client และไม่ส่ง snapshot เต็มใน DTO.
- Issues ที่เคยนำเข้าแต่หายจาก filtered list ต้องอ่านรายตัวเพื่อยืนยัน assignee. เมื่อไม่ตรงจริง ให้ `external_work_item_references.in_scope=false`, คง Work Item เดิมและหยุดอัปเดต business fields. Source version ที่ตรวจแล้วถูกบันทึกเพื่อป้องกัน stale payload ย้อนสถานะ. เมื่อ assignee กลับมาตรง จะอัปเดต UUID เดิมและแสดง in-scope อีกครั้ง.
- ถ้าอ่าน issue เดิมไม่ได้หรือ provider ล้มเหลว ห้ามอนุมานว่าหลุด filter หรือถูกลบ. เก็บข้อมูลไว้และแสดง run error. Work Item detail แสดง source link ทั้งสอง providers และข้อความเมื่ออยู่นอก filter.
- การหยุด config ไม่ลบ mapping, Work Item, external identity, TimeEntries หรือ run history. Config ที่มีประวัติไม่ถูกลบผ่าน UI; ใช้ปุ่มหยุด sync.

## API และ validation

ทุก route ใช้ owner authentication เดิม, ตรวจ public UUIDv4 และตรวจว่า config อยู่ภายใน Project ใน URL. Reject unknown fields รวม token, internal IDs และ client-chosen public IDs.

- `GET /api/projects/{projectId}/issue-sync`: configs พร้อมชื่อตัวแปร token และ mapping เดิมที่ยังไม่มี config; ไม่ enumerate server environment หรือส่งรายชื่อ credentials.
- `POST /api/projects/{projectId}/issue-sync`: create/adopt source mapping โดยรับ `provider`, `instanceUrl`, `sourceProject`, `assignees`, `tokenEnvVar`, `approvedLabelMap` optional. Resolve stable source identity บน server; คืน 201.
- `PATCH /api/projects/{projectId}/issue-sync/{configId}`: แก้ `assignees`, `tokenEnvVar`, `approvedLabelMap`, `enabled`. เปลี่ยน filter/labels/token variable จะ reset first-sync approval. ไม่ย้าย source หรือ PMS destination ผ่าน route นี้.
- `POST /api/projects/{projectId}/issue-sync/{configId}/sync`: รับเฉพาะ `approveFirstSync` boolean optional. ครั้งแรกหรือหลังเปลี่ยน policy ต้องเป็น true. คืน run DTO; ให้ตรวจ status/counts/runError แม้ HTTP 200 เพราะอาจเป็น partial หรือ failed run.
- `POST /api/projects/{projectId}/issue-sync/{configId}/confirm`: `{ runId: publicUUID, decisions: [{ issueId: sourceIssueId, workItemId: publicUUID | null }] }`. ต้องเลือกครบ pending issues ของ run นั้น; null หมายถึงเป็นคนละ issue กับทุก candidate. ไม่เรียก provider ใหม่ ใช้ snapshot ที่ owner ได้ตรวจแล้ว. คืน run DTO ล่าสุดพร้อม `counts.pending`; run ที่มี pending ใช้ status partial และไม่นับ pending เป็น failed/skipped.
- `GET /api/projects/{projectId}/issue-sync/{configId}/runs?limit=10&before={runPublicUuid}`: ประวัติเรียงใหม่ไปเก่า, limit 1–50, nextBefore เป็น public UUID ที่ resolve เฉพาะ config เดียวกัน ไม่ส่ง internal cursor.

Response ใช้ `{ error: { code, message } }` สำหรับ request errors: 400 validation, 401 owner auth, 404 project/config/run missing, 409 source/lease/approval conflict, 503 credential/provider unavailable, 500 generic failure. ทุก response ของ sync API ใช้ no-store.

Source writes และ per-issue history checkpoint commit ใน Serializable transaction เดียวกัน. Unique identity และ retry persistence collision ป้องกันรายการซ้ำ. Lease จำกัดให้ config เดียวมีหนึ่ง run; config edit ระหว่าง run ถูกปฏิเสธ. Revision, mapping timestamp และ lease token ตรวจซ้ำก่อน business writes. Lease หมดอายุ 5 นาที; run ถัดไปบันทึกรอบค้างเป็น interrupted ก่อนเริ่มใหม่.

## Legacy และ rollout

`POST /api/integrations/gitlab/sync` เดิมถูกปิดด้วย `409 PROJECT_SYNC_REQUIRED` หลังตรวจ owner; ไม่มี unfiltered fallback. Mapping เดิมยังเก็บไว้ และเพิ่ม config จากหน้า Project ด้วย source เดิมเพื่อใช้ histories เดิม. ก่อนมี config และ assignees จะ sync ไม่ได้.

`database/schema.sql` เป็น DDL หลักเพียงไฟล์เดียว. Fresh initialization ใช้ scripts/database/initialize.mjs; ไม่ใช้ migration history เดิม. ฐานใช้งานจริงไม่มีการ reset/upgrade ใน case cleanup นี้. ดู [Database workflow](../../database/README.md); live cutover ต้องมี verified baseline และ approval แยก.

## Verification

`pnpm test:issue-sync` หรือ `node tests/run.mjs issue-sync` ใช้ synthetic fixtures ไม่เรียก providers จริง. `pnpm test:database-docker` ตรวจ persistence/API ด้วย PostgreSQL container สุ่มชื่อ ไม่มี host ports หรือ production volumes และลบเฉพาะ containers ของชุดทดสอบหลังเสร็จ.

## Provider ปฏิเสธคำขอ

GitLab project Issues API ใช้ `order_by=created_at&sort=asc` ตาม [Issues API](https://docs.gitlab.com/api/issues/#list-all-project-issues). ไม่ใช้ `order_by=id` ซึ่งไม่อยู่ในค่าที่ API ระบุว่ารองรับ. ยังคง query ทีละ `assignee_username[]` แล้วรวมผลและตรวจ assignees ซ้ำ

ข้อความ error ของ run ใหม่ระบุ provider, HTTP status และขั้นตอนที่ล้มเหลว: ตรวจสอบ Project, อ่านรายการ Issues หรืออ่าน Issue เดิม. `runError.providerFailure` และ request error มี metadata `{ provider, operation, httpStatus? }` โดยไม่คืน response body, request URL, redirect destination หรือ token จริง. Network failure ไม่มี HTTP status. ประวัติเดิมยังเก็บไว้ตามเดิม; ไม่สามารถเดา HTTP status ย้อนหลังจาก `PROVIDER_UNAVAILABLE` เดิมได้

- `PROVIDER_BAD_REQUEST` (400/422): provider ไม่ยอมรับพารามิเตอร์/รูปแบบคำขอ
- `PROVIDER_UNAUTHORIZED` (401): ตรวจค่าของตัวแปร token ที่ระบุในข้อความว่าเป็น token ของ instance ที่ถูกต้อง ยังไม่หมดอายุหรือถูกเพิกถอน
- `PROVIDER_FORBIDDEN` (403): ตรวจ token scope, project membership/permissions และสำหรับ GitLab ตรวจว่าเปิด Issues. Token สำหรับ GET API ควรมี `read_api`
- `SOURCE_NOT_FOUND` (404): ไม่พบ Project/Issue หรือ token ไม่มีสิทธิ์มองเห็น resource นั้น; ไม่สรุปว่า resource ถูกลบ
- `PROVIDER_REDIRECT` (3xx): ตรวจ instance URL/การย้ายหรือเปลี่ยนชื่อต้นทาง. ระบบไม่ส่ง token ตาม redirect
- `RATE_LIMITED` (429 หรือ rate-limit 403): รอตามนโยบาย Retry-After ก่อนลองใหม่
- `PROVIDER_UNAVAILABLE`: network/5xx หรือ status อื่น; ข้อความแยก HTTP failure ออกจากปัญหาการเชื่อมต่อ

Provider authentication failures ใช้ HTTP 503 ของ PMS พร้อม provider-specific code เพื่อไม่ปะปนกับ HTTP 401 ของ owner gate. เมื่อแก้ `.env` ต้อง recreate app จึงโหลดค่าใหม่; ไม่เก็บ token ใน table. คำแนะนำสถานะอ้างอิง [GitLab authentication](https://docs.gitlab.com/api/rest/authentication/) และ [REST troubleshooting](https://docs.gitlab.com/api/rest/troubleshooting/)
