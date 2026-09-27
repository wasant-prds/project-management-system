import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (path) => readFile(join(root, path), "utf8");
const model = await read("document/SHARED_DATA_MODEL.md");

test("shared model defines the canonical entity cardinalities", () => {
  assert.match(model, /Customer มี Projects ได้ 0\.\.หลายรายการ/);
  assert.match(model, /Project หนึ่งรายการมี Customer หลักหนึ่งรายพอดี/);
  assert.match(model, /Customer\.id, name required/);
  assert.match(model, /target customerId/);
  assert.match(model, /Project \| Project\.id[\s\S]*?WorkItems ได้ 0\.\.หลายรายการ/);
  assert.match(model, /WorkItem \| WorkItem\.id[\s\S]*?มี TimeEntries ได้ 0\.\.หลายรายการ/);
  assert.match(model, /TimeEntry \| TimeEntry\.id[\s\S]*?อ้าง WorkItem เดียว/);
});

test("owner identity and functional roles stay separate", () => {
  assert.match(model, /มีเจ้าของจริงหนึ่งคน/);
  assert.match(model, /server resolve User\.id เดียวกัน/);
  assert.match(model, /Developer, infra และ SA เป็นบทบาทการทำงานบน WorkItem เท่านั้น/);
  assert.match(model, /ไม่สร้าง requirement สำหรับหลาย User/);
  assert.match(model, /เป็นข้อมูลคนละส่วนกับ Customer/);
  assert.match(model, /\| WorkItem\.kind \| Incident, Issue, Task \|/);
  assert.match(model, /\| WorkItem\.priority \| none, low, medium, high, urgent \|/);
  assert.match(model, /\| WorkItem\.role \| Developer, infra, SA หรือ null \|/);
  assert.match(model, /\| WorkItem\.status \| backlog, todo, in-progress, blocked, sa-testing, pm-testing, completed, cancelled \|/);
});

test("shared metrics, decimal hours, and business dates are explicit", () => {
  assert.match(model, /completed ÷ \(total − cancelled\) × 100/);
  assert.match(model, /ตัวหารเป็น 0 ให้คืน 0%/);
  assert.match(model, /dueDate มี business calendar date ก่อนวันนี้ใน Asia\/Bangkok/);
  assert.match(model, /SUM\(TimeEntry\.hours\)/);
  assert.match(model, /ไม่ปัดก่อน summation/);
  assert.match(model, /ห้ามแปลงค่าที่เก็บเป็น UTC/);
  assert.match(model, /ห้ามรายงาน historical throughput จาก current status/);
});

test("work views reuse persisted WorkItem and TimeEntry IDs", () => {
  for (const menu of ["Dashboard", "Projects", "Work Items", "Board", "Analysis", "Daily Work", "Company", "Settings"]) {
    assert.ok(model.includes(`| ${menu} |`), `Missing menu mapping: ${menu}`);
  }
  assert.match(model, /WorkItem\.id หรือ TimeEntry\.id เดิมไว้/);
  assert.match(model, /ไม่ใช่ record สำเนาหรือสถานะที่แก้แยกได้/);
});

test("primary EV documents point to the canonical shared model", async () => {
  const documents = [
    "document/ENGINEERING_SPEC.md",
    "document/ARCHITECTURE.md",
    "document/BUSINESS_REQUIREMENT.md",
    "document/SCOPE.md",
    "document/DATABASE.md",
    "document/DATABASE_MAPPING.md",
    "document/API.md",
    "document/DEPLOYMENT.md",
  ];
  for (const path of documents) {
    const content = await read(path);
    assert.match(content, /\[Shared Data Model\]\(\.\/SHARED_DATA_MODEL\.md\)/, `Missing shared model link in ${path}`);
  }
});

test("menu mapping treats TimeEntry status as legacy, not a second workflow", async () => {
  const mapping = await read("document/DATABASE_MAPPING.md");
  assert.match(mapping, /TimeEntry\.status[\s\S]*?legacy field[\s\S]*?not a WorkItem workflow status/);
  assert.match(mapping, /Project context มาจาก Project ของ WorkItem/);
});
