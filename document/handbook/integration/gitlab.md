# GitLab integration status

## สถานะปัจจุบัน

Issue #20 เพิ่ม manual one-way pull ของ GitLab Issues ใน Work Items. Owner-only routes สำหรับ status, Project mapping และ sync อยู่ใน `app/api/integrations/gitlab/`; `lib/gitlab-issue-import.ts` เรียก GitLab Issues API แบบ `GET` เท่านั้น. Config ที่พร้อมไม่ได้หมายความว่า schema หรือ mapping จริงถูกตั้งค่าแล้ว.

## Configuration และ access

`GITLAB_BASE_URL` และ `GITLAB_TOKEN` ต้องตั้งคู่กันเป็น server environment/secret. URL ต้องเป็น HTTPS, ไม่มี username/password/query/fragment และคง base path ของ self-managed instance; ห้ามส่ง token หรือ URL connector ผ่าน browser body. Status endpoint คืนแค่ `configured` หลัง owner authentication.

Owner สร้าง mapping ระหว่าง GitLab Project ID กับ PMS Project และ exact label map ก่อน sync. Sync แรกต้องได้รับ owner approval. Service ขอทุก Issue (`scope=all`, `state=all`), ตรวจ same-instance pagination/source URLs ก่อนส่ง token, และคืน `created`, `updated`, `skipped`, `failed` พร้อม source link, เหตุผล, warnings และ run-level pagination error ตามความเหมาะสม.

Identity ใช้ canonical instance URL + GitLab Project ID + global Issue ID. GitLab ควบคุม title, description, status, mapped types, due date และ external metadata; PMS คง role, priority, work date, owner และ Daily Work. การถอน mapping เก็บ WorkItems, external references และ TimeEntries ไว้; Work Item ที่เชื่อม external identity ลบไม่ได้.

## Scope ที่ยังไม่ implement

Phase one ไม่รวม write-back/two-way sync, Merge Requests, commits, CI, webhook, scheduled sync หรือ GitLab time tracking. ไม่สร้าง Users จาก assignees ของ GitLab.

## Rollout และ verification

Repository ยังไม่ยืนยัน credentials, GitLab instance/Project จริง หรือ schema rollout ใน environment ใด. ก่อนใช้กับข้อมูลจริง ให้ provision secret ตาม [Runtime Security](../RUNTIME_SECURITY.md), review schema และผ่าน verified backup/isolated restore/schema approval gates ใน [Database Rollout](../DATABASE_ROLLOUT.md), แล้วตรวจ health และ authenticated APIs ก่อนอนุมัติ first sync.

`pnpm test:gitlab` และ `pnpm test:gitlab-contracts` ใช้ synthetic fixtures/mocks เท่านั้น; ไม่อ่าน credentials จริงและไม่เรียก GitLab. `pnpm test:runtime-security` ครอบคลุม runtime config validation/redaction แต่ไม่ยืนยัน remote access.
