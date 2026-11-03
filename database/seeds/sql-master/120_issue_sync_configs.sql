-- ตัวอย่าง issue_sync_configs 2 rows: GitLab และ GitHub อย่างละ 1 row.
-- ใช้ SEED_PATH=database/seeds/sql-master เท่านั้น.
-- แก้ public UUID ของ external_project_mappings, source path, assignees และ credential_ref ก่อนใช้.
-- Parent mappings ต้องมีอยู่แล้ว และต้องเป็น provider ที่ตรงกับแต่ละ row.
-- ไม่เก็บ token/key; id/public_id และ timestamps ใช้ database defaults.
-- enabled=false; รันซ้ำไม่แก้ข้อมูลหรือ UUID ของ config ที่มีอยู่แล้ว.

INSERT INTO "issue_sync_configs" (
    "mapping_id",
    "source_project_path",
    "assignees",
    "credential_ref",
    "enabled"
) VALUES
    -- GitLab
    (
        (
            SELECT "id" FROM "external_project_mappings"
            WHERE "public_id" = 'REPLACE_WITH_GITLAB_MAPPING_PUBLIC_UUID'::UUID
              AND "provider" = 'gitlab'
        ),
        'example-group/example-project',
        ARRAY['your-gitlab-username']::TEXT[],
        'example-gitlab',
        false
    ),
    -- GitHub
    (
        (
            SELECT "id" FROM "external_project_mappings"
            WHERE "public_id" = 'REPLACE_WITH_GITHUB_MAPPING_PUBLIC_UUID'::UUID
              AND "provider" = 'github'
        ),
        'example-owner/example-repository',
        ARRAY['your-github-username']::TEXT[],
        'example-github',
        false
    )
ON CONFLICT ("mapping_id") DO NOTHING;
