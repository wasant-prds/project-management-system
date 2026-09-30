# GitLab integration status

## สถานะปัจจุบัน

ไม่พบ GitLab client, GitLab API request, webhook handler หรือ scheduled sync implementation ใน `app/`, `lib/` และ runtime scripts ปัจจุบัน. `GITLAB_BASE_URL`/`GITLAB_TOKEN` ถูกตรวจและส่งต่อแบบ server-side โดย runtime config เท่านั้น; ไม่มี endpoint ปัจจุบันที่เรียก GitLab. `POST /api/work-items/import` เป็น JSON bulk import เข้า PMS ไม่ใช่ GitLab API import.

## Configuration ที่ตรวจได้

`scripts/runtime-config.mjs` ยอมรับ GitLab config เมื่อ `GITLAB_BASE_URL` และ `GITLAB_TOKEN` ถูกตั้งคู่กัน. Base URL ต้องเป็น HTTPS และไม่มี username/password/query/fragment; token ต้องไม่เป็น placeholder หรือมี newline. Config ที่ผิดทำให้ runtime launcher ปฏิเสธการเริ่มระบบ. Runtime safe summary แสดงเพียง `configured` หรือ `disabled`; launcher redact token จาก output.

ห้ามใช้ `NEXT_PUBLIC_*` สำหรับ token หรือแสดง secret ใน handbook, command output, browser bundle หรือ logs. ค่า token จริงไม่อยู่ในเอกสารนี้

## Scope ที่ยังไม่ implement

GitLab issue import contract ใน [document/GITLAB_ISSUE_IMPORT.md](../../GITLAB_ISSUE_IMPORT.md) เป็น target contract. จาก implementation ปัจจุบันยังยืนยันไม่ได้ว่ามี GitLab Project mapping, field/label mapping, remote pagination, retry, conflict reconciliation, webhook หรือ time tracking import. ห้ามถือว่า config alone เปิด integration ได้

## Verification

Runtime config checks: `pnpm test:runtime-security` และ `pnpm test:runner`. Tests เหล่านี้ตรวจ validation/redaction behavior; ไม่ได้เรียก GitLab instance. การตรวจสัญญา GitLab ที่ยังเป็นเอกสารทำได้ด้วย `pnpm test:contracts` และไม่พิสูจน์ว่ามี remote integration.
