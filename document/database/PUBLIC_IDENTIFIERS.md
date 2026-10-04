# Internal keys and public identifiers

User decision, 2026-10-04: every application-owned table, including technical tables, has internal `id` and public `public_id`. This policy applies across database, ORM, API, frontend, integrations, imports/exports and migration tooling. The SQL target implements storage constraints now; active Prisma/API uses legacy CUIDs until the coordinated #33 adoption.

- `id`: positive BIGINT identity primary key, with independent sequences. All relational foreign keys and joins use these internal keys.
- `public_id`: UUID, NOT NULL, UNIQUE, default `pg_catalog.gen_random_uuid()`. PostgreSQL 16 generates random UUIDv4 with this function ([PostgreSQL documentation](https://www.postgresql.org/docs/16/functions-uuid.html)). Public identifiers never change after creation, including timestamp-preserving imports.
- API route/query/body references, DTO `id` and related `*Id`, browser links, client state and frontend exports use canonical lowercase UUIDv4 strings. Numeric keys are never public lookup fallbacks. Provider IDs remain separate external values.

At #33, validate UUID syntax with the shared public-ID contract, resolve the authorized record server-side, then use its internal key for queries, relations and transactions. Explicit DTOs map `id` to the row's public UUID and each related `*Id` to that related row's public UUID. Cover nested records, filters, reports, Settings, owner lookup, integration mappings, exports and errors; spreading ORM rows can expose internal keys. Pagination tokens must remain opaque and must not contain plainly decodable numeric IDs.

Random IDs reduce guessing but do not authorize access. Authentication and object-level permission checks remain required on every read and mutation ([OWASP IDOR guidance](https://cheatsheetseries.owasp.org/cheatsheets/Insecure_Direct_Object_Reference_Prevention_Cheat_Sheet.html)). UUIDs are identifiers, not credentials; sharing an export or URL does not grant permission.

Ordinary creates rely on database-generated identifiers and do not accept client-chosen `id` or `public_id`. Controlled imports may preserve reviewed UUIDv4 values. Persist the restricted provenance mapping `(entityName, sourceScope, sourceChecksum, targetRevision, oldId) → (newId, newPublicId)` before publishing seed artifacts. Generate random UUIDs once and reuse this mapping on retries/reconversion; preserve a source's existing valid public UUIDs. A source/policy alone cannot reproduce freshly randomized UUIDs: deterministic output requires the same persisted mapping. Do not derive UUIDs from row order, numeric keys, timestamps or a public source hash. Seed and live mappings are separate namespaces.

`scripts/sql-id.mjs` provides public UUID validation/serialization and separate decimal helpers for restricted internal tooling. `scripts/sql-legacy-id.mjs` validates both mapping outputs; it does not yet persist mappings. #32 supplies that persistence when conversion exists. #33 supplies the compatible ORM/API/UI cutover, authorization/DTO leakage tests, and explicit legacy URL/export compatibility. Historical polymorphic values remain archived evidence and require reviewed resolution/serialization before client exposure.

The current edited baseline is for a new empty target; changing its checksum does not upgrade a previously applied target. No application deployment or existing database migration is implied by this policy.

Project instructions: [AGENTS.md](../../AGENTS.md), [always-on identifier rule](../../.cursor/rules/05-record-identifiers.mdc).
