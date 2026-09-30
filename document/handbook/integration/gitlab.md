# GitLab Issue import

## สถานะปัจจุบัน

Issue #20 เพิ่ม manual one-way pull ของ GitLab Issues เข้า Work Items. Route ทั้งหมด owner-only; service เรียก GitLab Issues REST API ด้วย `GET` เท่านั้น. ไม่มี write-back, scheduler, webhook หรือ background sync job. Config ที่พร้อมไม่ได้ยืนยันว่า schema, mapping หรือ GitLab credentials ใน environment จริงพร้อมแล้ว.

API แยกตาม operation:

- [Configuration status](../api/integrations/gitlab-status.md)
- [List/create Project mappings](../api/integrations/gitlab-projects.md)
- [Edit/delete Project mapping](../api/integrations/gitlab-project-mapping.md)
- [Manual Issue sync](../api/integrations/gitlab-sync.md)

## Configuration และ access

`GITLAB_BASE_URL` และ `GITLAB_TOKEN` ต้องตั้งคู่กันเป็น server environment/secret. URL ต้องเป็น HTTPS, ไม่มี username/password/query/fragment และคง base path ของ self-managed instance; token ห้ามอยู่ใน browser body, response, bundle หรือ log. Status endpoint คืนแค่ `configured` หลัง owner authentication. ดู [Runtime Security](../../RUNTIME_SECURITY.md) สำหรับ secret provisioning.

Owner สร้าง mapping ระหว่าง GitLab Project ID กับ PMS Project และ exact label map ก่อน sync. Sync แรกต้องได้รับ owner approval; เปลี่ยน Project ปลายทางหรือ label map จะ reset approval. Service ขอทุก Issue (`scope=all`, `state=all`, `per_page=100`), ตรวจ same-instance pagination/source URLs ก่อนส่ง token, ปิด automatic redirects ด้วย `redirect: 'manual'`, และคืน `created`, `updated`, `skipped`, `failed` พร้อม source link, reason, warnings และ run-level pagination error ตามความเหมาะสม. Per-Issue database writes ใช้ transaction แยกกันเพื่อรักษา partial progress.

Identity ใช้ canonical instance URL + GitLab Project ID + global Issue ID; `iid` ใช้แสดงผลเท่านั้น. IDs เก็บเป็น string โดยไม่สูญเสีย precision. GitLab ควบคุม title, description, status, mapped types, due date และ external metadata; PMS คง role, priority, work date, owner และ Daily Work. Optional source values ที่ไม่มีให้เป็น `null`. การถอน mapping เก็บ WorkItems, external references และ TimeEntries ไว้; Work Item ที่เชื่อม external identity ลบไม่ได้. ดู [Database data model](../database/data-model.md) สำหรับตารางและความสัมพันธ์.

การ retry network/5xx จำกัดไว้สาม attempts และมี request timeout 15 วินาที. `429` ใช้ `Retry-After`; เมื่อ provider/page ล้มเหลวหลังมีผลต่อ Issue แล้ว API ส่ง partial results พร้อม `runError`. Labels ที่ไม่ได้ map เป็น warning; invalid Issue หรือ identity conflict เป็น failed result เฉพาะ Issue นั้น.

## Scope ที่ยังไม่ implement

Phase one ไม่รวม write-back/two-way sync, Merge Requests, commits, CI, webhook, scheduled sync หรือ GitLab time tracking. ไม่สร้าง Users จาก assignees ของ GitLab.

## Rollout และ verification

Repository ยังไม่ยืนยัน credentials, GitLab instance/Project จริง หรือ schema rollout ใน environment ใด. ก่อนใช้กับข้อมูลจริง ให้ provision secret ตาม [Runtime Security](../../RUNTIME_SECURITY.md), review schema และผ่าน verified backup/isolated restore/schema approval gates ใน [Database Rollout](../../DATABASE_ROLLOUT.md), แล้วตรวจ health และ authenticated APIs ก่อนอนุมัติ first sync.

`pnpm test:gitlab` และ `pnpm test:gitlab-contracts` ใช้ synthetic fixtures/mocks เท่านั้น; ไม่อ่าน credentials จริงและไม่เรียก GitLab. `pnpm test:runtime-security` ครอบคลุม runtime config validation/redaction แต่ไม่ยืนยัน remote access.
