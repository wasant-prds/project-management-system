import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFile(join(root, path), "utf8");
const contract = await read("document/GITLAB_ISSUE_IMPORT.md");

test("GitLab import contract distinguishes implemented repository code from environment rollout", async () => {
  const status = await read("app/api/integrations/gitlab/status/route.ts");
  const mappingRoutes = await read("app/api/integrations/gitlab/projects/route.ts");
  const syncRoute = await read("app/api/integrations/gitlab/sync/route.ts");
  const service = await read("lib/gitlab-issue-import.ts");
  const schema = await read("prisma/schema.prisma");
  const api = await read("document/API.md");
  const inventory = api.split("## 1.")[1]?.split("## 2.")[0];

  assert.match(contract, /Role \| SA/);
  assert.match(contract, /implement ใน repository โดย Issue #20/);
  assert.match(contract, /ยังไม่ได้เชื่อม\/ทดสอบกับ GitLab instance จริง/);
  assert.match(schema, /model WorkItem\s*\{/);
  assert.match(schema, /model GitLabProjectMapping\s*\{/);
  assert.match(schema, /model ExternalWorkItemReference\s*\{/);
  assert.match(schema, /remoteCreatedAt\s+DateTime\s+@map\("remote_created_at"\)\s+@db\.Timestamp\(3\)/);
  assert.match(status, /export async function GET/);
  assert.match(mappingRoutes, /export async function POST/);
  assert.match(syncRoute, /approveFirstSync/);
  assert.match(service, /Serializable/);
  assert.match(inventory ?? "", /\/api\/integrations\/gitlab\/sync/);
  assert.match(api, /Prisma schema changes ของ #20, #21 และ #25 ยังไม่ได้ apply กับ environment/);
});

test("scope, owner access, and first-sync mapping gates are explicit", () => {
  assert.match(contract, /GitLab → PMS เท่านั้น/);
  assert.match(contract, /เจ้าของที่ยืนยันตัวตนแล้วเท่านั้นเป็นผู้เริ่ม sync แบบ manual/);
  assert.match(contract, /Route ทั้งหมดใช้ owner authentication ที่มีอยู่/);
  assert.match(contract, /GitLab Project หนึ่งรายการต่อ Project ใน PMS หนึ่งรายการ/);
  assert.match(contract, /เก็บ `approvedLabelMap` กับ mapping นั้น/);
  assert.match(contract, /ก่อน sync ครั้งแรกของ mapping ต้องยืนยัน/);
  assert.match(contract, /ห้ามจับคู่ด้วย title, IID, URL หรือ label/);
  assert.match(contract, /ต้องทำ exact identity reconciliation ที่ตรวจสอบได้ก่อน sync/);
  for (const excluded of ["Merge Requests", "commits", "CI", "webhook", "scheduled sync", "GitLab time tracking"]) {
    assert.ok(contract.includes(excluded), `Missing out-of-scope item: ${excluded}`);
  }
});

test("identity and Project mapping are unique and conflict-safe", async () => {
  const migration = await read("document/CUSTOMER_PROJECT_MIGRATION.md");
  assert.match(contract, /provider = "gitlab", canonical instance URL, GitLab Project ID, global Issue ID/);
  assert.match(contract, /ใช้ global Issue `id` เป็น identity; `iid` ใช้แสดงผล/);
  assert.match(contract, /GitLabProjectMapping` unique ที่ `\(canonicalGitLabInstanceUrl, gitLabProjectId\)`/);
  assert.match(contract, /ExternalWorkItemReference` unique ที่ `\(provider, canonicalGitLabInstanceUrl, gitLabProjectId, gitLabGlobalIssueId\)`/);
  assert.match(contract, /`approvedLabelMap` เป็น JSONB map/);
  assert.match(contract, /transactional upsert/);
  assert.match(contract, /concurrent insert ชน unique constraint/);
  assert.match(contract, /ถอน Project mapping ลบได้เฉพาะ mapping นั้น/);
  assert.match(contract, /เปลี่ยนปลายทางที่มี references เป็น conflict/);
  assert.match(migration, /unique ที่ `\(provider, canonical instance URL, GitLab Project ID, global Issue ID\)`/);
});

test("field ownership, status, labels, dates, and new-item defaults are defined", () => {
  for (const field of ["WorkItem.title", "WorkItem.description", "WorkItem.status", "WorkItem.types", "WorkItem.dueDate"]) {
    assert.ok(contract.includes(field), `Missing GitLab-owned field mapping: ${field}`);
  }
  for (const field of ["role", "priority", "workDate", "owner/assignee", "TimeEntry"]) {
    assert.ok(contract.includes(field), `Missing PMS-owned field: ${field}`);
  }
  assert.match(contract, /`opened → todo`; `closed → completed`/);
  assert.match(contract, /แทนที่ `WorkItem\.types` ด้วยชุด mapped ล่าสุดทั้งหมด/);
  assert.match(contract, /`priority=none`, `role=null`, `workDate=null`/);
  assert.match(contract, /`submittedAt` .*ไม่ใช่ GitLab `closed_at`/);
  assert.match(contract, /due date ที่มาจาก GitLab/);
  assert.match(contract, /Label ที่ไม่รองรับเป็น warning ต่อ Issue/);
  assert.match(contract, /GitLab assignee[\s\S]*?ไม่สร้าง User/);
});

test("date and timestamp storage uses Bangkok wall-clock semantics", () => {
  assert.match(contract, /`due_date` เป็น calendar date ไม่มีเวลา/);
  assert.match(contract, /`DATE` \/ Prisma `@db\.Date`/);
  assert.match(contract, /timestamp จากต้นทางที่มี offset/);
  assert.match(contract, /`Asia\/Bangkok` ก่อนเก็บ timestamps/);
  assert.match(contract, /`TIMESTAMP WITHOUT TIME ZONE` \/ Prisma `@db\.Timestamp`/);
  assert.match(contract, /ห้าม persist หรือ normalize ค่าเป็น UTC/);
  assert.match(contract, /Target API timestamp ที่ตอบกลับต้องใส่ `\+07:00`/);
  assert.match(contract, /Settings เปลี่ยนค่านี้ไม่ได้/);
});

test("pagination, transaction boundaries, partial failures, rate limits, and safe retry are covered", () => {
  assert.match(contract, /`scope=all`, `state=all`, `per_page=100`/);
  assert.match(contract, /validated `Link rel=next`/);
  assert.match(contract, /ตรวจทุก next-page URL ว่าอยู่บน configured GitLab instance/);
  assert.match(contract, /REST API pagination/);
  assert.match(contract, /deduplicate global Issue identity เพื่อรองรับ page overlap/);
  assert.match(contract, /transaction เดียวที่ครอบ `WorkItem` และ external reference/);
  assert.match(contract, /หนึ่ง Issue ที่ผิดพลาดต้องไม่ rollback Issue อื่นที่ commit ไปแล้ว/);
  assert.match(contract, /เทียบ remote `updated_at` เพื่อป้องกัน snapshot ที่เก่ากว่า/);
  assert.match(contract, /เคารพ `Retry-After`/);
  assert.match(contract, /bounded retry\/backoff/);
  assert.match(contract, /partial result/);
  assert.match(contract, /`created`, `updated`, `skipped`, `failed`/);
  assert.match(contract, /ทุกผลต่อ Issue มี `outcome` และเหตุผลที่อ่านได้/);
  assert.match(contract, /`skipped` ระบุเหตุผล/);
  assert.match(contract, /`failed` ใช้ code\/message ปลอดภัย/);
  assert.match(contract, /pagination ล้มเหลวก่อนเห็น Issue ถัดไป/);
  assert.match(contract, /per-Issue outcomes ให้คืน HTTP `200` พร้อมผล partial/);
});

test("implemented routes, safe response/errors, and secret handling are documented", () => {
  for (const route of [
    "GET /api/integrations/gitlab/status",
    "GET`, `POST /api/integrations/gitlab/projects",
    "PATCH`, `DELETE /api/integrations/gitlab/projects/{mappingId}",
    "POST /api/integrations/gitlab/sync",
  ]) {
    assert.ok(contract.includes(route), `Missing proposed route: ${route}`);
  }
  for (const code of ["VALIDATION_ERROR", "OWNER_UNAUTHENTICATED", "ACCESS_DENIED", "NOT_FOUND", "CONFLICT", "INTERNAL_ERROR", "DEPENDENCY_UNAVAILABLE"]) {
    assert.ok(contract.includes(code), `Missing request-level error code: ${code}`);
  }
  assert.match(contract, /ไม่คืน raw GitLab\/DB response, token, stack trace หรือ request headers/);
  assert.match(contract, /server-side secret\/environment/);
  assert.match(contract, /ไม่อยู่ใน Prisma, browser bundle, `NEXT_PUBLIC_\*`, API response, docs หรือ logs/);
  assert.match(contract, /Token\/base URL มาจาก server configuration เท่านั้น/);
  assert.match(contract, /ตรวจ origin\/path ของทุก pagination link/);
});

test("all primary EV docs point to the canonical contract", async () => {
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
    assert.match(content, /\[GitLab Issue Import Contract\]\(\.\/GITLAB_ISSUE_IMPORT\.md\)/, `Missing contract reference in ${path}`);
  }
});

test("focused GitLab test command uses the shared runner and is documented", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  const runner = await read("tests/run.mjs");
  const guide = await read("document/process/testing.md");

  assert.equal(packageJson.scripts["test:gitlab-contracts"], "node tests/run.mjs gitlab-contracts");
  assert.equal(packageJson.scripts["test:gitlab"], "node tests/run.mjs gitlab");
  assert.match(runner, /"gitlab-contracts": \{ files:/);
  assert.match(runner, /gitlab-issue-import\.test\.mjs/);
  assert.match(guide, /pnpm test:gitlab-contracts/);
  assert.match(guide, /node tests\/run\.mjs gitlab-contracts/);
  assert.match(runner, /gitlab: \{ directory:/);
  assert.match(guide, /pnpm test:gitlab/);
  assert.match(contract, /Tests ใช้ synthetic credentials เท่านั้น/);
});
