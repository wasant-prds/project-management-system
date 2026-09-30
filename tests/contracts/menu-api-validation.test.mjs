import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFile(join(root, path), "utf8");
const api = await read("document/API.md");

test("API handbook separates the actual Route Handler inventory from target proposals", async () => {
  const handlers = [
    ["app/api/health/route.ts", ["GET"]],
    ["app/api/users/route.ts", ["GET"]],
    ["app/api/company/route.ts", ["GET", "POST"]],
    ["app/api/company/[id]/route.ts", ["PATCH", "DELETE"]],
    ["app/api/projects/route.ts", ["GET", "POST"]],
    ["app/api/projects/[id]/route.ts", ["GET", "PATCH", "DELETE"]],
    ["app/api/work-items/route.ts", ["GET", "POST"]],
    ["app/api/work-items/[id]/route.ts", ["GET", "PATCH", "DELETE"]],
    ["app/api/work-items/import/route.ts", ["POST"]],
    ["app/api/work-logs/route.ts", ["GET", "POST"]],
    ["app/api/work-logs/[id]/route.ts", ["GET", "PATCH", "DELETE"]],
  ];

  for (const [path, methods] of handlers) {
    const source = await read(path);
    for (const method of methods) {
      assert.match(source, new RegExp(`export async function ${method}\\(`), `${path} is missing ${method}`);
    }
    const apiPath = path
      .replace(/^app\/api\//, "/api/")
      .replace(/\/route\.ts$/, "")
      .replace(/\[([^\]]+)\]/g, "{$1}");
    assert.ok(api.includes(`\`${apiPath}\``), `As-Is API inventory is missing ${apiPath}`);
    const inventoryRow = api.split("\n").find((line) => line.includes(`\`${apiPath}\``));
    for (const method of methods) {
      assert.ok(inventoryRow?.includes(`\`${method}\``), `As-Is API inventory is missing ${method} ${apiPath}`);
    }
  }

  assert.match(api, /Endpoint ที่มีอยู่ใน repository \(As-Is\)/i);
  assert.match(api, /Target proposal/);
  for (const proposedPath of [
    "/api/dashboard/summary",
    "/api/analysis",
    "/api/settings/me",
  ]) {
    assert.ok(api.includes(proposedPath), `Missing target endpoint ${proposedPath}`);
  }
  assert.doesNotMatch(api, /`\/api\/customers/);
  assert.match(api, /there is no Customer API or `customerId` contract/i);
});

test("all eight menus declare a consumer, canonical read source, and write behavior", () => {
  const matrix = api.split("## 3. Consumer, read/write")[1]?.split("## 4.")[0];
  assert.ok(matrix, "Missing the target menu contract matrix");
  for (const menu of ["Dashboard", "Projects", "Work Items", "Board", "Analysis", "Daily Work", "Company", "Settings"]) {
    const row = matrix.split("\n").find((line) => line.startsWith(`| ${menu} `));
    assert.ok(row, `Missing target contract for ${menu}`);
    const columns = row.split("|").map((column) => column.trim());
    assert.equal(columns.length, 5, `${menu} row must have four populated columns`);
    assert.ok(columns[2], `${menu} must define reads and data source`);
    assert.ok(columns[3], `${menu} must define writes or explicitly state no mutation`);
  }
});

test("shared HTTP errors, authentication, pagination, and response statuses are explicit", () => {
  for (const [status, code] of [
    ["400", "VALIDATION_ERROR"],
    ["400", "RELATION_MISMATCH"],
    ["401", "OWNER_UNAUTHENTICATED"],
    ["403", "ACCESS_DENIED"],
    ["404", "NOT_FOUND"],
    ["409", "CONFLICT"],
    ["500", "INTERNAL_ERROR"],
    ["503", "DEPENDENCY_UNAVAILABLE"],
  ]) {
    assert.match(api, new RegExp(`\\| \`${status}\` \\| \`${code}\``), `Missing ${status} ${code}`);
  }
  assert.ok(api.includes('ทุก error รวมถึง health `503` ใช้ `{ "error": { "code", "message", "field?" } }`'));
  assert.match(api, /`POST` ที่สร้าง resource คืน `201`/);
  assert.match(api, /`limit`.*default `50`.*maximum `200`/);
  assert.match(api, /opaque `cursor`/);
  assert.match(api, /owner identity ฝั่ง server/);
  assert.match(api, /ห้ามคืน raw database error หรือ stack trace/);
});

test("target contracts preserve shared enums, relations, status writes, and metrics", () => {
  for (const status of ["backlog", "todo", "in-progress", "blocked", "sa-testing", "pm-testing", "completed", "cancelled"]) {
    assert.ok(api.includes(`\`${status}\``), `Missing public WorkItem status ${status}`);
  }
  assert.match(api, /Board เปลี่ยน `WorkItem\.status` ผ่าน WorkItem service\/validation ชุดเดียว/);
  assert.match(api, /PATCH \/api\/work-items\/\{id\}.*ส่ง `status`/);
  assert.match(api, /ทุกครั้งที่ create\/update ต้องอ้าง WorkItem/);
  assert.match(api, /Project ต้องตรงกับ Project ของ WorkItem/);
  assert.match(api, /Asia\/Bangkok/);
  assert.match(api, /completed \/ \(total - cancelled\) \* 100/);
  assert.match(api, /ตัวหารศูนย์คืน `0`/);
  assert.match(api, /Decimal `TimeEntry\.hours` โดยไม่ปัดก่อนรวม/);
  assert.match(api, /`period`, `timezone`, `filters` และ `metricVersion`/);
});

test("target timestamps use the issue's +07:00 API contract and Bangkok persistence policy", async () => {
  const issue = await read("design/projects/project-management-system/work_items/13_sa_menu-api-validation-contracts.md");
  const checklist = await read("design/projects/project-management-system/work_items/00_checklist.md");
  const coreRule = await read(".cursor/rules/00-core-product.mdc");
  const dataRule = await read(".cursor/rules/01-data-invariants.mdc");
  const apiRule = await read(".cursor/rules/api-contracts.mdc");
  const settingsRule = await read(".cursor/rules/menu-settings.mdc");
  const dateTimePolicy = api.split("### 2.4")[1]?.split("## 3.")[0];

  assert.match(issue, /API รับ\/แสดง timestamps ด้วย offset `\+07:00`/);
  assert.match(issue, /ทุก database write ใช้ `Asia\/Bangkok` และห้าม normalize เป็น UTC/);
  assert.match(dateTimePolicy ?? "", /ทุก timestamp field ใน Target request ต้องส่ง ISO 8601 พร้อม offset `\+07:00`/);
  assert.match(dateTimePolicy ?? "", /ทุก timestamp field ใน Target response ต้องแสดง offset `\+07:00`/);
  assert.match(dateTimePolicy ?? "", /timestamp ที่ไม่มี offset นี้หรือใช้ offset อื่นตอบ `400 VALIDATION_ERROR`/);
  assert.match(dateTimePolicy ?? "", /ทุกค่าที่เขียนลงฐานข้อมูล/);
  assert.match(dateTimePolicy ?? "", /ห้าม normalize เป็น UTC/);
  assert.match(dateTimePolicy ?? "", /ห้ามพึ่ง timezone ของ browser\/device/);
  assert.match(apiRule, /Every target API timestamp in a request must use ISO 8601 offset `\+07:00`/);
  assert.match(apiRule, /timestamp fields in responses must also include `\+07:00`/);
  assert.match(apiRule, /Reject missing or different offsets with `400 VALIDATION_ERROR`/);
  assert.match(checklist, /timestamps เป็น Bangkok local wall-clock และห้ามแปลงข้อมูลที่บันทึกเป็น UTC/);
  assert.match(coreRule, /Persist every date and timestamp using Bangkok calendar\/wall-clock semantics; do not convert stored values to UTC/);
  assert.match(dataRule, /Database timestamps represent Bangkok local wall-clock date\/time/);
  assert.match(settingsRule, /Settings must not allow an override/);
  assert.match(api, /timezone=Asia\/Bangkok` จาก system config แบบ read-only/);
});

test("resource contracts cover create/update guards and shared aggregate filters", () => {
  assert.match(api, /`name`, `companyId`, `startDate`, and `dueDate`/);
  assert.match(api, /Company ที่มีอยู่/);
  assert.match(api, /Project\.companyId/);
  assert.match(api, /`title`, `kind`, `projectId`/);
  assert.match(api, /`DELETE \/api\/work-items\/\{id\}` ตอบ `409 HISTORY_CONFLICT` เมื่อมี TimeEntry อ้างอยู่/);
  assert.match(api, /`workItemId`, business `date`, `hours`/);
  assert.match(api, /ตรวจ next-state ของ `workItemId` \+ `projectId` ทุกครั้ง/);
  assert.match(api, /`startDate`, `endDate` \(ทั้งคู่หรือไม่ส่งทั้งคู่/);
  assert.match(api, /เมื่อไม่ส่งใช้เดือนปัจจุบันใน default time zone `Asia\/Bangkok`/);
  assert.match(api, /multiple Companies with Project, WorkItem, and TimeEntry aggregate summaries/);
  assert.match(api, /Company collection\/create\/update\/delete contracts ของ #18/);
  assert.match(api, /Target preferences จำกัดที่ theme/);
  assert.match(api, /`profile` รองรับ `name`, `email`, `phone`, `avatar`/);
  assert.match(api, /GET \/api\/settings\/me.*หากยังไม่มี preferences ให้คืน default/);
  assert.match(api, /คืน default `theme=light`, `locale=th` และเพิ่ม `timezone=Asia\/Bangkok` จาก system config แบบ read-only/);
  assert.match(api, /ห้ามคืน raw database error หรือ stack trace/);
});

test("focused API contract runner is reusable and documented", async () => {
  const packageJson = JSON.parse(await read("package.json"));
  const runner = await read("tests/run.mjs");
  const guide = await read("document/process/testing.md");
  const checklist = await read("design/projects/project-management-system/work_items/00_checklist.md");
  assert.equal(packageJson.scripts["test:api-contracts"], "node tests/run.mjs api-contracts");
  assert.match(runner, /"api-contracts": \{ files:/);
  assert.match(runner, /menu-api-validation\.test\.mjs/);
  assert.match(guide, /pnpm test:api-contracts/);
  assert.match(guide, /node tests\/run\.mjs api-contracts/);
  assert.match(api, /`pnpm test:api-contracts`, `pnpm test:contracts`, `pnpm test`/);
  assert.match(api, /`pnpm test:gitlab-contracts`/);
  assert.ok(checklist.includes("- [x] **#13** [Define Menu API and Validation Contracts]"));
});
