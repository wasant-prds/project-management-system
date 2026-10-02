# Board workflow — Issue #22

## Overview

หน้า `/board` เป็นมุมมอง Kanban ของ WorkItem ชุดเดียวกับหน้า Work Items. ระบบจัดการ์ดตาม `WorkItem.status`; Board ไม่มี record, status, API route หรือ database table ของตัวเอง.

ผู้ใช้เลือก status จากเมนูบนการ์ดเพื่อบันทึกลง WorkItem เดิม. คลิกชื่อการ์ดเพื่อเปิด dialog รายละเอียดแบบอ่านอย่างเดียวของ WorkItem ID เดิม. Board ไม่มี drag-and-drop, การสร้าง/แก้/ลบการ์ด หรือการแก้ไข columns.

## สิทธิ์ที่มองเห็น

การอ่านรายการ, filter options และการเปลี่ยนสถานะต้องผ่าน owner access gate และ `getOwner()` ของ API ที่เกี่ยวข้อง. API จำกัด WorkItems ด้วย owner ที่ resolve ฝั่ง server; client ไม่ส่ง owner ID เพื่อกำหนดสิทธิ์. `Developer`, `infra` และ `SA` เป็น functional role ของ WorkItem ไม่ใช่ permission. อ่านเพิ่มเติมที่ [Owner access](../operations/owner-access.md).

## แหล่งข้อมูลและ API ที่ใช้

| การใช้งานใน Board | Method / endpoint | สิ่งที่ Board ใช้ |
| --- | --- | --- |
| Company filter options | `GET /api/company?limit=200[&cursor=...]` | `companies[].id`, `name`, `displayName`; เดินหน้าตาม `page.nextCursor` |
| Project filter options | `GET /api/projects?limit=200[&cursor=...]` | `projects[].id`, `name`, `companyId`; เดินหน้าตาม `page.nextCursor` |
| โหลด cards | `GET /api/work-items?year=all&month=all&limit=200[&companyId=...][&projectId=...][&role=...][&cursor=...]` | `workItems[]`, `page.nextCursor`; summary ใน response ไม่ได้นำมาแสดงบน Board |
| เปลี่ยน status | `PATCH /api/work-items/{id}` | ส่ง `{ "status": "blocked" }`; ตรวจ `workItem.id` และ `workItem.status` จาก response |

Query parameters ในวงเล็บเหลี่ยมเป็น optional. ค่า `companyId` และ `projectId` จะไม่ส่งเมื่อเลือกทั้งหมด; `role=none` เลือก WorkItem ที่ไม่ได้กำหนด role. เมื่อเปลี่ยน Company, Project filter กลับเป็นทั้งหมด.

Board ขอทุกปี/เดือนด้วย `year=all&month=all`; จึงไม่ตัดงานตามปีปัจจุบัน. Collection API เรียงตาม `createdAt` และ `id` แล้วใช้ opaque cursor กับ filter ชุดเดิม. Client ขอทีละ 200 รายการ, ตาม cursor จน `nextCursor` เป็น `null`, และแสดง error เมื่อ response ผิดรูปแบบหรือ cursor วนซ้ำ.

คำอธิบาย query, response fields, validation และ error contract ฉบับเต็มอยู่ใน [Company collection API](../api/company/collection.md), [Project collection API](../api/projects/collection.md), [WorkItem collection API](../api/work-items/collection.md) และ [WorkItem detail API](../api/work-items/detail.md). Board ใช้ endpoints เหล่านี้ตาม implementation ปัจจุบัน; ไม่ได้เพิ่ม API operation ใหม่.

### Fields ที่ใช้แสดงผล

| Response field | การใช้งาน |
| --- | --- |
| `workItems[].id` | identity ของ card, ป้องกันการนับซ้ำ และเลือก record สำหรับ dialog |
| `workItems[].title` | ชื่อการ์ดและชื่อ dialog |
| `workItems[].description` | ข้อความย่อบนการ์ดและรายละเอียดใน dialog |
| `workItems[].kind`, `priority`, `role`, `status` | badges; status กำหนด column และตัวเลือกในเมนู |
| `workItems[].workDate`, `dueDate` | วันใน dialog และ due date บนการ์ด |
| `workItems[].project` | ชื่อ Project และ Company ที่สัมพันธ์กับ WorkItem |
| `workItems[].assignee` | ชื่อ owner ใน dialog |
| `companies[].id`, `name`, `displayName` | รายการตัวเลือก Company |
| `projects[].id`, `name`, `companyId` | รายการตัวเลือก Project และกรอง Project ตาม Company |
| `page.nextCursor` | ขอหน้าถัดไป; `null` หมายถึงหน้าสุดท้าย |
| PATCH `workItem.id`, `workItem.status` | ยืนยันว่า server บันทึก status ให้ WorkItem ที่เลือก |

Response object อื่นของ APIs เหล่านี้อธิบายในเอกสาร API ที่ลิงก์ด้านบน.

## Status workflow

คอลัมน์และเมนูเปลี่ยน status มาจาก enum กลาง `WORK_ITEM_STATUSES`:

`backlog` · `todo` · `in-progress` · `blocked` · `sa-testing` · `pm-testing` · `completed` · `cancelled`

แต่ละ WorkItem ปรากฏใน column ตาม status ปัจจุบันและถูกนับเพียงครั้งเดียว. `cancelled` แยกจาก `completed`. เมื่อเปลี่ยนสถานะ client แสดงค่าใหม่ทันที แล้วเรียก `PATCH /api/work-items/{id}`; server ใช้ `parseWorkItemPatch`, owner check, transaction และ serializer ชุดเดียวกับ Work Items. Transaction ใช้ Serializable isolation และ lock WorkItem ก่อน update. หาก status ใหม่คือ `sa-testing` หรือ `completed` และ `submittedAt` ยังว่าง API จะ stamp field นี้ตามกฎ shared ของ Work Items.

ระหว่างการเขียนรายการเดียวกัน เมนู status ของ card นั้นถูกปิด. Board ปิด filter และ reload ขณะที่มี status write เพื่อไม่ให้ query เก่าทับข้อมูล optimistic; request ที่ abort หรือจบระหว่าง write จะถูกละเว้น. เมื่อ write สุดท้ายจบ Board โหลดข้อมูลจาก server อีกครั้ง. ถ้า PATCH ล้มเหลว helper คืน status เดิมและ UI แสดง error.

## Database impact

ไม่มี schema change, migration หรือ Board-specific table ใน Issue #22.

| Table/model | การใช้งานจาก APIs ที่ Board เรียก |
| --- | --- |
| `User` | `getOwner()` resolve owner สำหรับ requests |
| `work_items` / `WorkItem` | อ่าน cards และ summary counts; PATCH อัปเดต status ของ record เดิม |
| `Project` | filter/list options และ relation ของ WorkItem |
| `Company` | อ่าน filter options/relations; `GET /api/company` อาจสร้าง Dhas row หรือเติม `code` ให้ row เดิม |
| `TimeEntry` | `GET /api/company` และ `GET /api/projects` อ่านชั่วโมงเพื่อสร้าง summaries ใน response; Board ไม่แสดง summary เหล่านั้น และ status PATCH ไม่แก้ TimeEntry |

ข้อควรทราบ: `GET /api/company` เรียก `getOrCreateDhasCompany()`. หากไม่มี Dhas Company route นี้อาจสร้าง row; หากพบ row ที่ชื่อ Dhas แต่ยังไม่มี code อาจเติม `code`. นี่เป็น behavior ของ Company API เดิมซึ่ง Board เรียกตอนโหลด filter options.

รายละเอียด relation และข้อจำกัดของ schema อยู่ใน [Database data model](../database/data-model.md).

## วันที่

Board แสดง `workDate` และ `dueDate` ซึ่งเป็น date-only values. ใช้ Bangkok date parser/serializer เพื่อแสดง calendar date ใน `Asia/Bangkok` โดยไม่อิง timezone ของอุปกรณ์. Card แสดง due date; dialog แสดง Work date และ Due date. หน้า Board ปัจจุบันไม่ได้แสดง `submittedAt`, `createdAt` หรือ `updatedAt`.

## Loading และ failure behavior

- ขณะโหลด WorkItem collection แสดง loading state; เมื่อสำเร็จแต่ละ column ที่ไม่มีรายการแสดง empty state.
- ถ้าโหลด WorkItems ไม่สำเร็จ Board แสดงข้อความและปุ่มลองใหม่. ถ้าโหลด filter options ไม่สำเร็จจะแสดง error แยกและปุ่ม retry ของ filters.
- API error message ใช้ข้อความจาก `{ error: { message } }` เมื่อมี; response JSON ที่อ่านไม่ได้หรือรูปแบบไม่ถูกต้องใช้ข้อความ fallback.
- การเปลี่ยน status เป็น optimistic. HTTP error, response ที่ ID/status ไม่ตรง หรือ persistence failure จะทำให้ status กลับค่าเดิมและแสดงข้อผิดพลาด. Board ไม่ retry PATCH อัตโนมัติ; หลังจบ write จะอ่านข้อมูลจาก server ใหม่.
- Owner/authentication, validation และ server errors เป็นไปตาม [WorkItem detail API](../api/work-items/detail.md) และ [Owner access](../operations/owner-access.md).

## วิธีตรวจสอบ

ใช้ development/test environment และ WorkItem ที่ไม่กระทบข้อมูลจริง. Browser ต้องผ่าน owner access gate.

อ่าน WorkItems ทั้งปีและตรวจ cursor/filter response:

```bash
curl -u "$OWNER_GATE_USERNAME:$OWNER_GATE_PASSWORD" \
  "$APP_ORIGIN/api/work-items?year=all&month=all&role=infra&limit=200"
```

เปลี่ยน status ของ WorkItem ที่เตรียมไว้ แล้วตรวจ `200`, `workItem.id` เดิม และ `workItem.status` ใหม่:

```bash
curl -u "$OWNER_GATE_USERNAME:$OWNER_GATE_PASSWORD" \
  -X PATCH "$APP_ORIGIN/api/work-items/$WORK_ITEM_ID" \
  -H 'Content-Type: application/json' \
  --data '{"status":"blocked"}'
```

Reload collection โดยใช้ filter ชุดเดียวกันและตรวจว่า WorkItem อยู่ใน status ใหม่. บนหน้า Board ตรวจ Company/Project/role filters, empty columns, dialog ของ card เดิม, การ rollback เมื่อ API ปฏิเสธ status และการแสดงวันที่เดียวกันเมื่อเปลี่ยน timezone ของ browser. อย่าใช้ production record สำหรับ PATCH verification.

Regression suite ไม่ใช้ database หรือ external API:

```powershell
pnpm test:board
pnpm test:work-items
pnpm test:auth
```

## Source references

- [Board page](../../../app/board/page.tsx)
- [Board workflow helpers](../../../components/page/board/board-workflow.ts)
- [Board WorkItem dialog](../../../components/page/board/board-work-item-dialog.tsx)
- [WorkItem collection handler](../../../app/api/work-items/route.ts)
- [WorkItem detail handler](../../../app/api/work-items/[id]/route.ts)
- [Company collection handler](../../../app/api/company/route.ts)
- [Project collection handler](../../../app/api/projects/route.ts)
- [Shared WorkItem parser](../../../lib/work-item-input.ts)
- [Owner resolver](../../../lib/owner.ts)
- [Prisma schema](../../../prisma/schema.prisma)
- [Board unit tests](../../../tests/board/workflow.test.mjs)
