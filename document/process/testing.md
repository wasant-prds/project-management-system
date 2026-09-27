# Testing Commands

Project tests use pnpm and Node's built-in test runner; no additional test dependency is required. The root runner imports all `.test.mjs` files under `tests/` in one process.

```powershell
pnpm test
```

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

Run only the one-way GitLab Issue import contract checks:

```powershell
pnpm test:gitlab-contracts
```

Add reusable Node test files under `tests/` with the `.test.mjs` suffix. `pnpm test` runs the full suite; `pnpm test:contracts` uses the same root runner with the `contracts` suite filter; `pnpm test:migration-contracts` and `pnpm test:gitlab-contracts` run a focused contract file through the root runner without spawning a child process.

The API and GitLab contract checks describe documentation and current route inventory; they do not claim that target endpoints without Route Handlers have been implemented. `pnpm test:api-contracts` (or `node tests/run.mjs api-contracts`) runs only `tests/contracts/menu-api-validation.test.mjs`; `pnpm test:gitlab-contracts` (or `node tests/run.mjs gitlab-contracts`) runs only `tests/contracts/gitlab-issue-import.test.mjs` through the shared root runner.

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

`pnpm test:runtime-docker` also runs the migrations entrypoint with fixture commands: missing/default `RUN_SEED` skips seeding; explicit `RUN_SEED=true` fails on missing config with an actionable message and without printing captured credentials. The test never modifies the installation database.

### Per-table seed regression

- `pnpm test:seed`: empty/populated/mixed tables, repeat runs, missing/malformed files, directory JSON, invalid config and rollback fixtures.
- `docker build --target migrate -t pms-seed-validation .` then `pnpm test:seed-docker`: PostgreSQL/Prisma mixed tables, existing parent references, idempotency and transaction rollback. Uses disposable containers without installation volumes.

When `database/seeds/master/config.json` is available, `pnpm test:seed-docker` additionally runs the real migrations entrypoint with `RUN_SEED=true` against a fresh disposable database using the installation dataset. It then reruns seeding and verifies every existing record is unchanged. Row contents and raw errors are withheld; the test never uses installation volumes.
