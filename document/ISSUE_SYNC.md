# Project Issue Sync — GitLab / GitHub

## ขอบเขตที่ implement

เจ้าของระบบกด Sync จากหน้า PMS Project → Integrations เพื่อดึง GitLab Project หรือ GitHub Repository เข้า Work Items ทางเดียว ไม่มี scheduler, webhook หรือ write-back. PMS Project หนึ่งรับหลายต้นทางได้ แต่ provider + instance + stable external project ID หนึ่งชุดมี PMS Project ปลายทางเดียว. รองรับ GitHub.com, GitLab.com และ GitLab Self-Managed ผ่าน HTTPS; GitHub Projects board และ GitHub Enterprise Server อยู่นอกขอบเขต.

ทุก config ต้องมี assignee usernames 1–50 รายการ ตรงอย่างน้อยหนึ่งคนแบบ OR. ไม่มี wildcard, ไม่มีค่าเริ่มต้นเป็นทุกคน และไม่นำเข้า unassigned issues. Service query แยก username เพื่อรองรับ GitLab CE แล้วรวมผลโดย stable issue ID พร้อมตรวจ assignees ซ้ำฝั่ง server. GitHub Pull Requests ไม่ถูกนำเข้า. อ่านทั้ง Open/Closed และ map เป็น `todo`/`completed` ตามลำดับ.

## Service และ config

ใช้ Next.js Route Handlers, `lib/issue-sync.ts` และ provider adapters ใน `lib/issue-sync-provider.ts` เรียก REST APIs ด้วย GET เท่านั้น. ไม่ต้องเพิ่มบริการภายนอกสำหรับขอบเขตไม่เกิน 1,000 issues ต่อ config. ปุ่ม Sync ทั้ง Project เรียก configs ที่เปิดใช้ตามลำดับ; ผลแต่ละ config มี run history แยกกัน. รอบหนึ่งมี provider request budget 90 วินาที, request timeout สูงสุด 15 วินาที และ retry network/5xx/short rate limits สูงสุดสาม attempts. `Retry-After` ที่ยาวกว่า 2 วินาทีจะจบรอบให้ retry ภายหลังแทนการส่งคำขอก่อนกำหนด. งานที่ commit แล้วไม่ rollback เพราะหน้าถัดไปล้มเหลว.

`issue_sync_configs` เป็นตารางใหม่สำหรับ assignees, `token_env_var`, enabled, source path, revision และ lease; เชื่อม numeric FK กับ `external_project_mappings`. ใช้ mapping และ external identity เดิมเพื่อไม่สร้าง Work Item ซ้ำเมื่อเพิ่ม config ให้ mapping เก่า. `issue_sync_runs` เก็บ config snapshot ที่ไม่มี secret, start/finish, lifecycle, counts, per-issue outcomes/warnings และ run-level error. ทุกตารางมี internal BIGINT identity และ immutable database-generated UUIDv4; API ใช้ public UUID เท่านั้น. วันที่และ timestamps ในฐานข้อมูลเป็น Asia/Bangkok wall-clock และ API timestamps ใช้ `+07:00`.

ชื่อ Prisma fields เดิม เช่น `GitLabProjectMapping.gitLabProjectId` และ `ExternalWorkItemReference.gitLabGlobalIssueId` ยังคงไว้เพื่อ compatibility; SQL columns เป็น provider-neutral `external_project_id` และ `external_issue_id` อยู่แล้ว. GitHub ใช้ stable numeric repository ID ที่ API ส่งมาเป็น source text identity; `owner/repository` ใช้เรียก API และต้อง resolve ID ตรงเดิมก่อนทุก run. เปลี่ยนชื่อ/ย้ายต้นทางแล้วเกิด redirect จะหยุดอย่างปลอดภัย ให้ผู้ดูแลตรวจ mapping ก่อนแก้ด้วยขั้นตอนที่ review แล้ว.

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

Migration `0003_issue_sync_token_env.sql` เปลี่ยนจาก credential reference เป็น `token_env_var` โดยคง config IDs, mappings, Work Items และ historical run snapshots. Config เดิมถูกหยุด, ล้าง lease, เพิ่ม revision และ reset first-sync approval; ชื่อตัวแปรเป็น NULL จน operator กำหนดเอง เพราะไม่สามารถเดาว่า credential เดิมผูกกับ token ไหน. รอบที่ยัง running ถูกจบเป็น failed พร้อมเหตุผล setup required โดยรักษา counts/results/snapshot. ตั้งชื่อตัวแปรที่ถูกต้องและเปิด config ใหม่ก่อน approve sync ครั้งแรก. NULL อนุญาตเฉพาะ config ที่หยุด.

## การอัปเดตและรักษาประวัติ

- ต้นทางควบคุม title, description, status, mapped types และ GitLab due date. GitHub ไม่มี issue due date จึงไม่เขียนทับ due date ใน PMS.
- PMS ควบคุม priority, role, work date, owner และ Daily Work; assignee ต้นทางเป็น filter ไม่ใช่บัญชี PMS. ไม่สร้าง Users หรือ TimeEntries อัตโนมัติ.
- Labels map แบบตรงตัวเฉพาะ types ที่รองรับ; unmapped labels เป็น warnings ไม่เปลี่ยน role.
- Issues ที่เคยนำเข้าแต่หายจาก filtered list ต้องอ่านรายตัวเพื่อยืนยัน assignee. เมื่อไม่ตรงจริง ให้ `external_work_item_references.in_scope=false`, คง Work Item เดิมและหยุดอัปเดต business fields. Source version ที่ตรวจแล้วถูกบันทึกเพื่อป้องกัน stale payload ย้อนสถานะ. เมื่อ assignee กลับมาตรง จะอัปเดต UUID เดิมและแสดง in-scope อีกครั้ง.
- ถ้าอ่าน issue เดิมไม่ได้หรือ provider ล้มเหลว ห้ามอนุมานว่าหลุด filter หรือถูกลบ. เก็บข้อมูลไว้และแสดง run error. Work Item detail แสดง source link ทั้งสอง providers และข้อความเมื่ออยู่นอก filter.
- การหยุด config ไม่ลบ mapping, Work Item, external identity, TimeEntries หรือ run history. Config ที่มีประวัติไม่ถูกลบผ่าน UI; ใช้ปุ่มหยุด sync.

## API และ validation

ทุก route ใช้ owner authentication เดิม, ตรวจ public UUIDv4 และตรวจว่า config อยู่ภายใน Project ใน URL. Reject unknown fields รวม token, internal IDs และ client-chosen public IDs.

- `GET /api/projects/{projectId}/issue-sync`: configs พร้อมชื่อตัวแปร token และ mapping เดิมที่ยังไม่มี config; ไม่ enumerate server environment หรือส่งรายชื่อ credentials.
- `POST /api/projects/{projectId}/issue-sync`: create/adopt source mapping โดยรับ `provider`, `instanceUrl`, `sourceProject`, `assignees`, `tokenEnvVar`, `approvedLabelMap` optional. Resolve stable source identity บน server; คืน 201.
- `PATCH /api/projects/{projectId}/issue-sync/{configId}`: แก้ `assignees`, `tokenEnvVar`, `approvedLabelMap`, `enabled`. เปลี่ยน filter/labels/token variable จะ reset first-sync approval. ไม่ย้าย source หรือ PMS destination ผ่าน route นี้.
- `POST /api/projects/{projectId}/issue-sync/{configId}/sync`: รับเฉพาะ `approveFirstSync` boolean optional. ครั้งแรกหรือหลังเปลี่ยน policy ต้องเป็น true. คืน run DTO; ให้ตรวจ status/counts/runError แม้ HTTP 200 เพราะอาจเป็น partial หรือ failed run.
- `GET /api/projects/{projectId}/issue-sync/{configId}/runs?limit=10&before={runPublicUuid}`: ประวัติเรียงใหม่ไปเก่า, limit 1–50, nextBefore เป็น public UUID ที่ resolve เฉพาะ config เดียวกัน ไม่ส่ง internal cursor.

Response ใช้ `{ error: { code, message } }` สำหรับ request errors: 400 validation, 401 owner auth, 404 project/config/run missing, 409 source/lease/approval conflict, 503 credential/provider unavailable, 500 generic failure. ทุก response ของ sync API ใช้ no-store.

Source writes และ per-issue history checkpoint commit ใน Serializable transaction เดียวกัน. Unique identity และ retry persistence collision ป้องกันรายการซ้ำ. Lease จำกัดให้ config เดียวมีหนึ่ง run; config edit ระหว่าง run ถูกปฏิเสธ. Revision, mapping timestamp และ lease token ตรวจซ้ำก่อน business writes. Lease หมดอายุ 5 นาที; run ถัดไปบันทึกรอบค้างเป็น interrupted ก่อนเริ่มใหม่.

## Legacy และ rollout

`POST /api/integrations/gitlab/sync` เดิมถูกปิดด้วย `409 PROJECT_SYNC_REQUIRED` หลังตรวจ owner; ไม่มี unfiltered fallback. Mapping เดิมยังเก็บไว้ และเพิ่ม config จากหน้า Project ด้วย source เดิมเพื่อใช้ histories เดิม. ก่อนมี config และ assignees จะ sync ไม่ได้.

`database/schema.sql` เป็น schema หลักฉบับล่าสุด รวมสองตารางและ `in_scope` แล้ว. Baseline เดิมเก็บใน `database/migrations/0001_initial_schema.sql` โดยคง checksum เดิม; migration additive `0002_issue_sync.sql` และ `0003_issue_sync_token_env.sql` ใช้อัปเกรดฐานเดิมโดยไม่สร้าง business rows หรือ regenerate UUIDs. Empty bootstrap สร้างจาก schema หลักและบันทึก migration history ภายใน transaction เดียว ส่วนฐานข้อมูลที่มี history รันเฉพาะ pending migrations. ดู [SQL migration history](../database/migrations/README.md). ฐาน Docker local `pms-postgres-prod` apply `0002` แล้วหลัง verified backup/restore และ rehearsal ตามคำอนุญาตของเจ้าของ; ดูหลักฐานใน `database/rollout/issue-sync-live-migration.json`. ไม่ได้ seed หรือทดสอบด้วย token จริง. การ rollout ครั้งถัดไปยังต้อง fresh verified baseline/backup และ explicit approval ตาม [Database Rollout](./DATABASE_ROLLOUT.md).

## Verification

`pnpm test:issue-sync` หรือ `node tests/run.mjs issue-sync` ใช้ synthetic fixtures ไม่เรียก providers จริง. SQL integration opt-in: PowerShell `$env:PMS_RUN_ISSUE_SYNC_DOCKER_TESTS='1'` แล้ว `node tests/run.mjs issue-sync` ใช้ PostgreSQL container สุ่มชื่อ, network none, ไม่มี host ports หรือ volumes และลบเฉพาะ container นั้นหลังทดสอบ.
