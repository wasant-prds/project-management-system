# API

เริ่มจาก [API overview และ target contracts](overview.md) และ [Record identifiers](record-identifiers.md) ทุก endpoint ที่อ้าง record ใช้ public UUIDv4 และตรวจสิทธิ์ owner ฝั่ง server

## คู่มือ endpoint

- System: [Health](system/health.md)
- Users: [List owner](users/list-owner.md)
- Company: [Collection](company/collection.md), [Detail](company/detail.md)
- Projects: [Collection](projects/collection.md), [Detail](projects/detail.md)
- Work Items: [Collection](work-items/collection.md), [Detail](work-items/detail.md), [Import](work-items/import.md)
- Daily Work: [Collection](daily-work/collection.md), [Detail](daily-work/detail.md), [Summary](daily-work/summary.md)
- Dashboard: [Summary](dashboard/summary.md)
- Analysis: [Summary](analysis/summary.md)
- Settings: [Owner settings](settings/me.md)
- Project Issue Sync: [Contract และ endpoints ปัจจุบัน](../integrations/project-issue-sync.md)

## GitLab compatibility

- [Configuration status](integrations/gitlab-status.md)
- [Project mappings](integrations/gitlab-projects.md)
- [Project mapping detail](integrations/gitlab-project-mapping.md)
- [Legacy sync](integrations/gitlab-sync.md) — endpoint เดิมคืน `409 PROJECT_SYNC_REQUIRED`; ใช้ Project Issue Sync contract สำหรับ flow ปัจจุบัน

[กลับสารบัญกลาง](../README.md)
