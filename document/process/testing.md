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

Add reusable Node test files under `tests/` with the `.test.mjs` suffix. `pnpm test` runs the full suite; `pnpm test:contracts` uses the same root runner with the `contracts` suite filter; `pnpm test:migration-contracts` runs the focused migration contract file through the root runner without spawning a child process.

The API contract checks describe documentation and current route inventory; they do not claim that target endpoints without Route Handlers have been implemented. `pnpm test:api-contracts` (or `node tests/run.mjs api-contracts`) runs only `tests/contracts/menu-api-validation.test.mjs` through the shared root runner.
