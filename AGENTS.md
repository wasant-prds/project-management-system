# Project-wide identifier standard

Follow [.cursor/rules/05-record-identifiers.mdc](.cursor/rules/05-record-identifiers.mdc) for all work in this repository.

- Every application-owned table has internal `id` (BIGINT identity PK) and immutable random UUIDv4 `public_id` (NOT NULL, UNIQUE, database-generated).
- PK/FK relations and SQL joins use numeric IDs. Public API/UI/URL/export references use UUIDs only; never expose numeric internal keys or accept them as public lookup fallbacks.
- Resolve public UUIDs to authorized rows on the server before writing numeric FKs. Use explicit DTOs for top-level and nested records; do not spread ORM rows into client responses.
- UUIDs make identifiers harder to guess; owner authentication and object-level authorization remain mandatory.
- Ordinary creates do not accept client-chosen IDs. Imports preserve reviewed public UUIDs and durable source-scoped mappings; retries never regenerate public identities.
- Keep provider IDs and historical references separate from local IDs. Preserve source history under the reviewed migration policy.
- SQL tables use plural snake_case; columns use snake_case and every table/column has a PostgreSQL comment.
- Active Prisma/runtime currently uses legacy CUIDs. SQL foundation is a separate target; implement its public UUID boundary and runtime adoption together in #33, with reviewed existing-data migration. Do not silently mix contracts or apply the target to an existing database.
- Keep current user changes. Use isolated test databases for SQL validation; do not reset, seed, migrate or deploy a live environment merely to satisfy a test.
