# Testing Commands

Project tests use pnpm and Node's built-in test runner; no additional test dependency is required. The root runner imports all `.test.mjs` files under `tests/` in one process.

```powershell
pnpm test
```

Run the shared data model contract suite by itself:

```powershell
pnpm test:contracts
```

Add reusable Node test files under `tests/` with the `.test.mjs` suffix. The root `test` command runs the full suite; `test:contracts` runs the shared model documentation and cross-reference checks directly.
