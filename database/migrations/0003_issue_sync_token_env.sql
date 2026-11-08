-- Move credential selection into each config without guessing existing secret bindings.
-- Keep config IDs, mappings, work items and historical run snapshots unchanged.
ALTER TABLE "issue_sync_configs" RENAME COLUMN "credential_ref" TO "token_env_var";
ALTER TABLE "issue_sync_configs" ALTER COLUMN "token_env_var" DROP NOT NULL;

UPDATE "issue_sync_runs"
SET "status" = 'failed',
    "run_error" = '{"code":"TOKEN_ENV_SETUP_REQUIRED","message":"Token environment configuration changed; configure the token variable before retrying.","retryable":false}'::JSONB,
    "finished_at" = public.pms_bangkok_now()
WHERE "status" = 'running';

UPDATE "external_project_mappings"
SET "first_sync_approved_at" = NULL
WHERE "id" IN (SELECT "mapping_id" FROM "issue_sync_configs");

UPDATE "issue_sync_configs"
SET "token_env_var" = NULL, "enabled" = false,
    "revision" = "revision" + 1, "lease_until" = NULL, "lease_token" = NULL;

ALTER TABLE "issue_sync_configs"
    ADD CONSTRAINT issue_sync_configs_token_env_var_check CHECK (token_env_var IS NULL OR (length(token_env_var) <= 128 AND token_env_var ~ '^(GITLAB|GITHUB|ISSUE_SYNC)_[A-Z0-9_]*TOKEN(_[A-Z0-9]+)*$')),
    ADD CONSTRAINT issue_sync_configs_enabled_token_check CHECK (NOT enabled OR token_env_var IS NOT NULL);

COMMENT ON TABLE "issue_sync_configs" IS 'Owner-managed per-project issue sync settings; each row names its server token environment variable.';
COMMENT ON COLUMN "issue_sync_configs"."token_env_var" IS 'Server environment variable holding this source token; null only for disabled configs awaiting operator setup. Never a token value.';
COMMENT ON COLUMN "issue_sync_runs"."config_snapshot" IS 'Non-secret source, assignees, label mapping and token environment variable name at start; historical credential references are retained.';
