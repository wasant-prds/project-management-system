import { syntax } from './sql'

// Explicit SQL result aliases; database/schema.sql owns the schema.

export const userColumns = syntax(`
  u."id" AS "id",
  u."public_id" AS "publicId",
  u."email" AS "email",
  u."name" AS "name",
  u."role" AS "role",
  u."avatar_url" AS "avatar",
  u."phone" AS "phone",
  u."theme" AS "theme",
  u."locale" AS "locale",
  u."status" AS "status",
  u."joined_at" AS "joinDate",
  u."created_at" AS "createdAt",
  u."updated_at" AS "updatedAt"
`)

export const companyColumns = syntax(`
  c."id" AS "id",
  c."public_id" AS "publicId",
  c."code" AS "code",
  c."display_name" AS "displayName",
  c."location" AS "location",
  c."name" AS "name",
  c."industry" AS "industry",
  c."email" AS "email",
  c."phone" AS "phone",
  c."address" AS "address",
  c."website_url" AS "website",
  c."logo_url" AS "logo",
  c."description" AS "description",
  c."created_at" AS "createdAt",
  c."updated_at" AS "updatedAt"
`)

export const projectColumns = syntax(`
  p."id" AS "id",
  p."public_id" AS "publicId",
  p."name" AS "name",
  p."description" AS "description",
  p."status" AS "status",
  p."priority" AS "priority",
  p."start_date" AS "startDate",
  p."due_date" AS "dueDate",
  p."budget_amount" AS "budget",
  p."spent_amount" AS "spent",
  p."progress_percent" AS "progress",
  p."color" AS "colorProject",
  p."created_at" AS "createdAt",
  p."updated_at" AS "updatedAt",
  p."creator_id" AS "creatorId",
  p."company_id" AS "companyId"
`)

export const workItemColumns = syntax(`
  w."id" AS "id",
  w."public_id" AS "publicId",
  w."title" AS "title",
  w."description" AS "description",
  w."kind" AS "kind",
  w."priority" AS "priority",
  w."functional_role" AS "role",
  w."status" AS "status",
  w."type_labels" AS "types",
  w."work_date" AS "workDate",
  w."due_date" AS "dueDate",
  w."submitted_at" AS "submittedAt",
  w."created_at" AS "createdAt",
  w."updated_at" AS "updatedAt",
  w."project_id" AS "projectId",
  w."assignee_id" AS "assigneeId"
`)

export const workLogColumns = syntax(`
  l."id" AS "id",
  l."public_id" AS "publicId",
  l."description" AS "description",
  l."remarks" AS "remarks",
  l."hours" AS "hours",
  l."work_date" AS "date",
  l."status" AS "status",
  l."created_at" AS "createdAt",
  l."updated_at" AS "updatedAt",
  l."user_id" AS "userId",
  l."project_id" AS "projectId",
  l."work_item_id" AS "workItemId"
`)

export const mappingColumns = syntax(`
  m."id" AS "id",
  m."public_id" AS "publicId",
  m."provider" AS "provider",
  m."instance_url" AS "instanceUrl",
  m."external_project_id" AS "externalProjectId",
  m."project_id" AS "projectId",
  m."approved_label_map" AS "approvedLabelMap",
  m."first_sync_approved_at" AS "firstSyncApprovedAt",
  m."created_at" AS "createdAt",
  m."updated_at" AS "updatedAt"
`)

export const referenceColumns = syntax(`
  r."id" AS "id",
  r."public_id" AS "publicId",
  r."provider" AS "provider",
  r."instance_url" AS "instanceUrl",
  r."external_project_id" AS "externalProjectId",
  r."external_issue_id" AS "externalIssueId",
  r."external_issue_number" AS "externalIssueNumber",
  r."external_url" AS "externalUrl",
  r."project_id" AS "projectId",
  r."remote_created_at" AS "remoteCreatedAt",
  r."remote_updated_at" AS "remoteUpdatedAt",
  r."last_synced_at" AS "lastSyncedAt",
  r."created_at" AS "createdAt",
  r."updated_at" AS "updatedAt",
  r."work_item_id" AS "workItemId",
  r."in_scope" AS "inScope"
`)

export const configColumns = syntax(`
  s."id" AS "id",
  s."public_id" AS "publicId",
  s."mapping_id" AS "mappingId",
  s."source_project_path" AS "sourceProjectPath",
  s."assignees" AS "assignees",
  s."token_env_var" AS "tokenEnvVar",
  s."enabled" AS "enabled",
  s."revision" AS "revision",
  s."lease_until" AS "leaseUntil",
  s."lease_token" AS "leaseToken",
  s."created_at" AS "createdAt",
  s."updated_at" AS "updatedAt"
`)

export const runColumns = syntax(`
  r."id" AS "id",
  r."public_id" AS "publicId",
  r."config_id" AS "configId",
  r."status" AS "status",
  r."config_snapshot" AS "configSnapshot",
  r."created_count" AS "createdCount",
  r."updated_count" AS "updatedCount",
  r."skipped_count" AS "skippedCount",
  r."failed_count" AS "failedCount",
  r."results" AS "results",
  r."run_error" AS "runError",
  r."finished_at" AS "finishedAt",
  r."created_at" AS "createdAt",
  r."updated_at" AS "updatedAt"
`)
