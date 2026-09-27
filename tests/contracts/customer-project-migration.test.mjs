import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFile(join(root, path), "utf8");
const migration = await read("document/CUSTOMER_PROJECT_MIGRATION.md");

test("migration contract separates repository facts from target and live data", async () => {
  const schema = await read("prisma/schema.prisma");
  assert.match(migration, /Role \| SA/);
  assert.match(migration, /not yet applied to any database/);
  assert.match(migration, /ยังไม่มี `Customer`, `Project\.customerId`, `GitLabProjectMapping` หรือ `ExternalWorkItemReference`/);
  assert.match(migration, /ห้ามใช้ seed\/sample data/);
  assert.doesNotMatch(schema, /model Customer\s*\{/);
});

test("Customer minimum fields, status, and used-record deletion rules are explicit", () => {
  assert.match(migration, /`id`[\s\S]*?stable/);
  assert.match(migration, /`name`[\s\S]*?Required/);
  assert.match(migration, /`status`[\s\S]*?`active` หรือ `inactive`/);
  assert.match(migration, /Customer ที่ Project อ้างอยู่ห้าม hard-delete/);
  assert.match(migration, /ห้าม hard-delete Project ที่มี WorkItem, TimeEntry หรือ dependent history/);
  assert.match(migration, /`Project\.customerId` required/);
});

test("every existing Project must be covered by an evidence-backed mapping register", () => {
  for (const column of [
    "environment",
    "snapshot_id",
    "project_id",
    "customer_id",
    "evidence_reference",
    "decision",
    "reviewed_by",
    "reviewed_at",
  ]) {
    assert.ok(migration.includes(`\`${column}\``), `Missing mapping register field: ${column}`);
  }
  assert.match(migration, /exact set equality/);
  assert.match(migration, /Project ทุก ID ปรากฏครั้งเดียว/);
  assert.match(migration, /`unmapped`, `ambiguous`, `rejected`[\s\S]*?blocker/);
  assert.match(migration, /ห้ามใส่ “Unknown”, “Default”, หรือ Customer จาก seed/);
});

test("rollout requires backup and restore rehearsal before nullable backfill and final NOT NULL", () => {
  const stage0 = migration.indexOf("### Stage 0 — inventory, backup, restore rehearsal");
  const stage1 = migration.indexOf("### Stage 1 — additive, nullable schema");
  const stage2 = migration.indexOf("### Stage 2 — Customer registry และ Project backfill");
  const stage3 = migration.indexOf("### Stage 3 — validation gate แล้วค่อย require");
  const stage4 = migration.indexOf("### Stage 4 — post-rollout verification");
  assert.ok(stage0 >= 0 && stage0 < stage1 && stage1 < stage2 && stage2 < stage3 && stage3 < stage4);
  assert.match(migration, /Restore backup ไป isolated database/);
  assert.match(migration, /เพิ่ม Customer และ relations พร้อม `Project\.customerId` nullable/);
  assert.match(migration, /Apply mapping จาก register โดย join ด้วย `Project\.id` และ `Customer\.id` เท่านั้น/);
  assert.match(migration, /ก่อนแก้ schema ให้ `Project\.customerId` required/);
  assert.match(migration, /mismatch\/orphan report \(ต้องเป็นศูนย์สำหรับ migration gate\)/);
});

test("backfill preserves existing work history and defines stop and recovery behavior", () => {
  assert.match(migration, /Project IDs, WorkItem IDs, TimeEntry IDs[\s\S]*?ต้องคงเดิม/);
  assert.match(migration, /Backfill แก้เฉพาะ `Project\.customerId`/);
  assert.match(migration, /unmapped[\s\S]*?คงอยู่/);
  assert.match(migration, /restore backup ใน isolated DB/);
  assert.match(migration, /ห้าม restore ทับข้อมูลใหม่โดยไม่มี reconciliation\/อนุมัติ/);
  assert.match(migration, /ไม่มี automatic schema downgrade หรือรับประกัน zero data loss/);
});

test("GitLab identity is canonical, uniquely constrained, and safe under retries", async () => {
  const database = await read("document/DATABASE.md");
  const mapping = await read("document/DATABASE_MAPPING.md");
  assert.match(migration, /\(provider = "gitlab", canonical instance URL, GitLab Project ID, global Issue ID\)/);
  assert.match(migration, /unique ที่ `\(provider, canonical instance URL, GitLab Project ID, global Issue ID\)`/);
  assert.match(migration, /canonical instance URL[\s\S]*?lowercase/);
  assert.match(migration, /transaction[\s\S]*?unique constraint เป็น final race guard/);
  assert.match(migration, /ให้รายงาน conflict และไม่เขียนทับ/);
  assert.match(database, /unique\(provider, canonicalGitLabInstanceUrl, gitLabProjectId, gitLabGlobalIssueId\)/);
  assert.match(mapping, /provider \+ canonical instance URL \+ GitLab project ID \+ global issue ID/);
});

test("primary EV docs and proposed APIs reference the migration contract", async () => {
  const paths = [
    "document/ENGINEERING_SPEC.md",
    "document/ARCHITECTURE.md",
    "document/BUSINESS_REQUIREMENT.md",
    "document/SCOPE.md",
    "document/DATABASE.md",
    "document/DATABASE_MAPPING.md",
    "document/API.md",
    "document/DEPLOYMENT.md",
  ];
  for (const path of paths) {
    const content = await read(path);
    assert.match(content, /\[Customer\/Project Migration Contract\]\(\.\/CUSTOMER_PROJECT_MIGRATION\.md\)/, `Missing contract reference in ${path}`);
  }
  const api = await read("document/API.md");
  assert.match(api, /`DELETE` hard-delete ได้เมื่อไม่มี Project อ้างถึงเท่านั้น มิฉะนั้น `409 CONFLICT`/);
  assert.match(api, /`DELETE \/api\/projects\/\{id\}`: `409 CONFLICT` หากมี WorkItem, TimeEntry หรือ dependent business history/);
  const checklist = await read("design/projects/project-management-system/work_items/00_checklist.md");
  assert.ok(checklist.includes("- [x] **#12** [Specify Customer and Project Data Migration]"));
});

test("reusable test runner documents all-suite, contract-suite, and focused commands", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  const runner = await read("tests/run.mjs");
  const testing = await read("document/process/testing.md");
  assert.equal(packageJson.scripts.test, "node tests/run.mjs");
  assert.equal(packageJson.scripts["test:contracts"], "node tests/run.mjs contracts");
  assert.equal(packageJson.scripts["test:migration-contracts"], "node tests/run.mjs migration-contracts");
  assert.match(runner, /Object\.hasOwn\(suites, requestedSuite\)/);
  assert.match(runner, /"migration-contracts": \{ files:/);
  assert.match(testing, /pnpm test:migration-contracts/);
});
