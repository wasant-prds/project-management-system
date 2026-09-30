# Issue #18 — Company and Project Management

**Role:** Developer  
**Status:** Implemented and deployed to production on 2026-09-29.

## Implemented

- Removed the Customer model/API/UI introduced during the earlier #18 draft. `Project.companyId` now links directly to one of multiple Companies.
- Dhas — D.H.A. Siamwalla Ltd. is the Company for all existing Projects. The owner-provided name, location, address, phone, and description live in `lib/dhas-company.json`. Existing other Companies remain available.
- Company and Project APIs use the owner gate. New Projects select an existing Company, validated server-side, and receive the owner ID server-side. Project list/detail and Company portfolio summarize real WorkItems and TimeEntries. Delete guards preserve history.
- `scripts/company-project-schema.mjs` applies only additive Company/Project columns after baseline backup verification. `scripts/company-project-backfill-docker.mjs` runs the reviewed Dhas backfill through the environment's PostgreSQL container and changes only `Project.companyId` on existing Projects in a serializable transaction. `scripts/company-project-backfill.mjs` provides the equivalent Prisma transaction for directly reachable databases.
- Focused tests use the existing `pnpm test:company-projects` runner.

## Rollout gate

Production preflight on 2026-09-29 found 25 Projects and one populated Company profile named `ProjectHub Inc.`. Verified production backups passed isolated restore and are pinned for this rollout. The additive schema and backfilled gates passed. Dhas was added as a second Company; all 25 existing Projects link to Dhas, none remain unlinked, and `ProjectHub Inc.` remains intact. Project/WorkItem/TimeEntry history hashes matched the verified baseline after excluding only the new `Project.companyId` column. The compatible app was deployed, then `Project.companyId` was promoted to `NOT NULL` and the required gate passed.

All 25 existing Project date values had midnight time components. With app writes stopped, the `DATE` promotion compared calendar values and all other Project fields before and after conversion. `Project.startDate` and `dueDate` are PostgreSQL `DATE`, and the DATE-compatible production image passed health and authenticated Company/Project API smoke checks. API input/output uses Bangkok calendar dates.

Production verification: 2 Companies, 25 Projects linked to Dhas, 0 unlinked Projects, `Project.companyId` non-nullable, both Project date columns of type `date`, and the previous Company preserved. `/api/health`, `/api/company`, `/api/projects`, and a Project detail returned HTTP 200. The app and PostgreSQL containers were healthy. The generic `db-rollout.mjs health` gate still assumes a `pms-migrations-prod` container that this manual staged rollout does not create; direct endpoint and database checks were used.

Reusable commands (PowerShell, with approved `DATABASE_URL` supplied securely):

```text
$env:APP_ENV = '<environment>'
node scripts/db-rollout.mjs backup
node scripts/db-rollout.mjs verify <verified-archive> baseline
node scripts/company-project-schema.mjs --apply <environment> <verified-archive>
node scripts/db-rollout.mjs verify <verified-archive> additive
node scripts/company-project-backfill-docker.mjs --check <environment> <verified-archive>
node scripts/company-project-backfill-docker.mjs --apply <environment> <verified-archive>
node scripts/db-rollout.mjs verify <verified-archive> backfilled
node scripts/company-project-required.mjs --apply <environment> <verified-archive>
node scripts/db-rollout.mjs verify <verified-archive> required
node scripts/db-rollout.mjs backup
# Stop app writes; use the new verified archive from the preceding backup.
node scripts/project-date-promotion.mjs --apply <environment> <new-verified-archive>
pnpm test:company-projects
pnpm test:database-rollout
pnpm test:database-rollout-docker
pnpm test
pnpm exec prisma validate
pnpm exec tsc --noEmit
```

`--apply` mutates the database and belongs only in the reviewed rollout runbook.
