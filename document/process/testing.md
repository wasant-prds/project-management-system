# Testing Commands

Project tests use pnpm and Node's built-in test runner; no additional test dependency is required. The root runner imports all `.test.mjs` files under `tests/` in one process.

```powershell
pnpm test
```

To print the test results as a package → file → test tree, use the reusable Bash wrapper. Pass an existing suite name such as `auth` to run only that suite:

```bash
bash scripts/test-unit.sh
bash scripts/test-unit.sh auth
bash scripts/test-unit.sh work-items
```

The wrapper uses Node's TAP reporter and the existing `tests/run.mjs` suite selection; it does not discover or execute tests independently. Verify the formatter itself with `pnpm test:runner` or `bash scripts/test-unit.sh runner`.

The full suite requires Node.js 22 or newer. When launched from WSL with an older Linux Node, the wrapper uses the installed Windows `node.exe` if it is available; otherwise it stops with a version hint instead of printing a partial report.

Use `bash scripts/test-unit.sh local` to name the complete local unit run explicitly; it is equivalent to running the wrapper without a suite name.

Run all documentation/data contract suites:

```powershell
pnpm test:contracts
```

Run only the Customer/Project migration contract checks:

```powershell
pnpm test:migration-contracts
```

Run only the menu API and validation contract checks:

```powershell
pnpm test:api-contracts
```

Run only the Company and Project management regression tests:

```powershell
pnpm test:company-projects
```

Run Issue #22 Board workflow unit tests:

```powershell
pnpm test:board
node tests/run.mjs board
```

The shared terminal reporter also accepts `bash scripts/test-unit.sh board`.

Run Issue #23 Dashboard aggregate, filter, date, timezone, deep-link, empty/error and owner regressions:

```powershell
pnpm test:dashboard
node tests/run.mjs dashboard
```

The suite uses an in-memory Prisma fake and does not connect to PostgreSQL or external services. Work Item and Daily Work source routes also have deep-link filter regressions; run them with `pnpm test:work-items` and `pnpm test:daily-work`. The shared Bash reporter accepts `bash scripts/test-unit.sh dashboard` when Bash is available.

Run Issue #24 Analysis aggregate, shared Dashboard formula/filter, Bangkok grouping, export, source-link, owner, validation, and error regressions:

```powershell
pnpm test:analysis
node tests/run.mjs analysis
```

The reusable unit reporter also accepts `bash scripts/test-unit.sh analysis`. The suite uses an in-memory Prisma fake and route mocks; it does not connect to PostgreSQL, Redis, Docker, network, or external services. Run `pnpm test:dashboard` as well to verify the shared query behavior remains consistent.

This suite uses in-memory API responses and WorkItem fixtures; it does not connect to PostgreSQL or external services. It checks shared status columns, Company/Project/role filters and pagination, Bangkok date rendering, the existing Work Items PATCH contract, status validation, rejection of stale reads during status writes, and selection state following rollback after a failed save.

Run the Work Item management, validation, import, history-retention, and Bangkok date regressions:

```powershell
pnpm test:work-items
node tests/run.mjs work-items
```

Run the Daily Work/TimeEntry owner, positive Decimal, WorkItem/Project, Bangkok date, exact summary, and live logged-hours regressions:

```powershell
pnpm test:daily-work
node tests/run.mjs daily-work
```

The suite uses mocked Prisma Route Handlers and client wiring; it does not connect to PostgreSQL or create TimeEntries from GitLab. The Bash reporter also accepts `bash scripts/test-unit.sh daily-work`.

Run schema rollout approval checks without connecting to a database:

```powershell
pnpm test:schema-rollout-gate
node tests/run.mjs schema-rollout-gate
```

This focused suite executes the actual TypeScript Route Handler/parser code in an in-memory Prisma fixture. It does not connect to or migrate a database. Schema validation uses `pnpm exec prisma validate`; applying the WorkItem `DATE`/`TIMESTAMP` and relation constraints to an environment still requires that environment's verified backup and rollout checks.

Run the local quality gates used before review:

```powershell
pnpm quality
```

`pnpm quality` runs ESLint, TypeScript type checking, Prisma schema validation, and the full Node test suite. Run `pnpm lint`, `pnpm typecheck`, or the focused `pnpm test:company-projects` separately while iterating.

GitHub Actions runs `pnpm quality` and then the SonarQube quality gate. Configure repository variable `SONAR_HOST_URL` and repository secret `SONAR_TOKEN` before pushing; the scan waits for the server's quality-gate result. Fork pull requests run the local quality job without Sonar credentials.

Run only the one-way GitLab Issue import contract checks:

```powershell
pnpm test:gitlab-contracts
```

Run the GitLab Issue import service and API regression tests with an in-memory Prisma fixture and synthetic GitLab responses:

```powershell
pnpm test:gitlab
node tests/run.mjs gitlab
bash scripts/test-unit.sh gitlab
```

These tests never read real GitLab credentials or call a configured GitLab instance. They cover server-side owner gates, mapping and first-sync approval, exact identity upsert, field ownership, Bangkok dates/timestamps, pagination, rate limiting, partial failure, safe retry and mapping removal retention.

Add reusable Node test files under `tests/` with the `.test.mjs` suffix. `pnpm test` runs the full suite; `pnpm test:contracts` uses the same root runner with the `contracts` suite filter; `pnpm test:migration-contracts` and `pnpm test:gitlab-contracts` run a focused contract file through the root runner without spawning a child process.

The API and GitLab contract checks cover documentation and current route inventory. `pnpm test:api-contracts` (or `node tests/run.mjs api-contracts`) runs only `tests/contracts/menu-api-validation.test.mjs`; `pnpm test:gitlab-contracts` (or `node tests/run.mjs gitlab-contracts`) runs only `tests/contracts/gitlab-issue-import.test.mjs` through the shared root runner. `pnpm test:gitlab` covers the implemented #20 routes and service with synthetic mocks.

## Date and timezone checks

Date/filter/report contract tests must use `Asia/Bangkok` as the system, application, and database-session default in every environment, regardless of the test runner's or browser's local timezone. Cover date-only inputs, current year/month defaults, inclusive day boundaries around midnight in Bangkok, database-generated `now()` defaults, and verify persisted timestamps retain Bangkok local wall-clock values without UTC normalization. Verify Settings cannot override the fixed system timezone.

## Issue #15 — runtime security

```powershell
pnpm test:runtime-security
node tests/run.mjs runtime-security
pnpm test:runtime-docker
node tests/run.mjs runtime-docker
pnpm runtime:check
```

Focused security suite ใช้ synthetic credentials, HTTP server และ Node subprocess; ไม่เรียก GitLab จริง. Docker suite เป็น opt-in; `pnpm test` skip Docker integration tests. Docker tests ต้องมี Docker daemon และ `postgres:16-alpine` กับ local migrations image ที่มี Prisma client (`PMS_PRISMA_TEST_IMAGE` override ได้). ใช้ disposable PostgreSQL ไม่มี published port, volume ของระบบจริงหรือ schema migration และ cleanup container หลังจบ. Runtime .env configuration/rotate/revoke และ read-only deployment verification อยู่ใน [Runtime Security](../RUNTIME_SECURITY.md).

Production container smoke (ไม่ deploy):

```powershell
docker build --target production -t pms-issue15-validation .
pnpm test:runtime-container
node tests/run.mjs runtime-container
```

`PMS_RUNTIME_TEST_IMAGE` override validation image ได้. Container smoke ใช้ network none หรือ network namespace ของ PostgreSQL ชั่วคราว, synthetic `.env` ชั่วคราว และไม่มี host ports; ตรวจ non-root image, owner gate หน้า Next standalone, health 200 กับ PostgreSQL ชั่วคราว และ health 503 แบบไม่เผย raw error, Bangkok timestamp, client JS และ application logs ที่ไม่มี token. Full `pnpm test` skip container smoke จนเรียก focused command. Windows local `pnpm build` อาจติด EACCES ของ optional sharp package; production Docker build ใช้ Linux toolchain จาก lockfile โดยไม่เปลี่ยน local dependencies.

`pnpm test:runtime-docker` also runs the migrations entrypoint with fixture commands: schema sync is blocked before Prisma/database commands without approval; approved fixtures then verify absent/default `RUN_SEED` skips seeding and explicit `RUN_SEED=true` fails on missing config with an actionable message and without printing captured credentials. The test never modifies the installation database.

### Per-table seed regression

- `pnpm test:seed`: empty/populated/mixed tables, repeat runs, missing/malformed files, directory JSON, invalid config and rollback fixtures.
- `docker build --target migrate -t pms-seed-validation .` then `pnpm test:seed-docker`: PostgreSQL/Prisma mixed tables, existing parent references, idempotency and transaction rollback. Uses disposable containers without installation volumes.
- `pnpm test:work-item-schema-docker`: gated `prisma db push` on disposable PostgreSQL 16 and verifies WorkItem `DATE` columns, stored calendar days, and the `TimeEntry.workItem` `RESTRICT` foreign key.

When `database/seeds/master/config.json` is available, `pnpm test:seed-docker` additionally runs the real migrations entrypoint with `RUN_SEED=true` against a fresh disposable database using the installation dataset. It then reruns seeding and verifies every existing record is unchanged. Row contents and raw errors are withheld; the test never uses installation volumes.

## Issue #16 — database rollout และ recovery

```powershell
pnpm test:database-rollout
node tests/run.mjs database-rollout
pnpm test:database-rollout-docker
node tests/run.mjs database-rollout-docker
```

Unit suite ใช้ temporary artifacts/mocked operations; Docker suite เป็น opt-in ที่ focused command เปิดให้อัตโนมัติ (`pnpm test` skip). ต้องมี Docker daemon, `postgres:16-alpine` และ production app image ที่มี runtime launcher/health route (`PMS_ROLLOUT_TEST_IMAGE` override ได้; default `project-management-system-production-app:latest`). ใช้ Node/Prisma CLI จาก lockfile เพื่อสร้าง As-Is schema เฉพาะ fixture แล้วทดลอง nullable/backfilled/required target DDL. ตรวจ backup/checksum/full restore/schema/exact hashes, same-count history changes, unmapped Customer, relation mismatch, database-generated Bangkok wall-clock default และ real Next.js `/api/health` กับ migration-container exit. Fixture ใช้ network none/shared isolated namespace ไม่มี ports หรือ installation volumes/root `.env`; cleanup container/temporary files หลังจบ.

Runbook และข้อจำกัด environment จริงอยู่ใน [Database Rollout](../DATABASE_ROLLOUT.md). Compose/scheduled backup regression ใช้ `pnpm test:runtime-docker`.

หากไม่มี production app image สำหรับ health smoke ให้ build validation image (ไม่ deploy) และเลือกผ่าน runtime environment:

```powershell
docker build --target production -t pms-issue16-app-validation .
$env:PMS_ROLLOUT_TEST_IMAGE = 'pms-issue16-app-validation'
pnpm test:database-rollout-docker
```
