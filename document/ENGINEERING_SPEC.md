# ENGINEERING SPEC (EV)

> **Owner decision 2026-09-29:** Company หลายรายแทน Customer registry; Projects เดิมทุกตัวผูก `companyId` กับ Dhas และ Projects ใหม่เลือก Company. ข้อกำหนด Customer เดิมในเอกสารนี้ถูกแทนที่โดย [Company → Project decision](./COMPANY_PROJECT_DECISION.md).

| รายการ | ค่า |
| --- | --- |
| ระบบ | Project Management System |
| ฉบับ | EV — Enhanced Version |
| สถานะ | ข้อกำหนดเป้าหมายสำหรับใช้วางแผนการพัฒนา |
| ภาษาหลัก | ไทย โดยคง system terms ภาษาอังกฤษที่ใช้ทั่วไป |
| เอกสารประกอบ | [Shared Data Model](./SHARED_DATA_MODEL.md), [Customer/Project Migration Contract](./CUSTOMER_PROJECT_MIGRATION.md), [GitLab Issue Import Contract](./GITLAB_ISSUE_IMPORT.md), [Architecture](./ARCHITECTURE.md), [Business Requirement](./BUSINESS_REQUIREMENT.md), [Scope](./SCOPE.md), [Database](./DATABASE.md), [Database Mapping](./DATABASE_MAPPING.md), [API](./API.md), [Deployment](./DEPLOYMENT.md) |

> เอกสารนี้เป็นข้อกำหนดเชิงวิศวกรรมฉบับยกระดับ ไม่ได้ยืนยันว่าความสามารถเป้าหมายมีอยู่ในระบบปัจจุบัน รายละเอียดปัจจุบันและส่วนที่ต้องพัฒนาดูหัวข้อ Baseline และ Gap ในเอกสารที่เกี่ยวข้อง

## 1. เป้าหมาย

ข้อกำหนด entity, relation, owner, functional role และ metric ที่เป็นมาตรฐานกลางอยู่ใน [Shared Data Model](./SHARED_DATA_MODEL.md); เอกสารนี้ระบุข้อกำหนดเชิงวิศวกรรมและ As-Is/Target เพิ่มเติม

ทำให้ทุกเมนูใช้ข้อมูลธุรกิจชุดเดียวกัน โดยยึด `WorkItem` เป็นรายการงานหลัก และ `TimeEntry` เป็นบันทึก Daily Work ที่ผูกกับรายการงานนั้น หน้า Dashboard, Projects, Board และ Analysis ต้องคำนวณจากข้อมูลเดียวกัน ไม่สร้างชุดข้อมูลตัวอย่างหรือสถานะซ้ำของตัวเอง

เส้นทางข้อมูลเป้าหมาย:

```text
Company → Project → Work Item → Daily Work (Time Entry)
                         ↑                ↓
                    User/Assignee     ชั่วโมง/วันที่/ผู้บันทึก
```

เมนู Company และ Settings ดูแล master data และการตั้งค่าที่รองรับ workflow นี้ ส่วน Dashboard, Board และ Analysis เป็นมุมมองที่อ่านและสรุปข้อมูลจากแหล่งเดียวกัน

## 2. Baseline ที่ตรวจพบใน repository

- ระบบเป็น Next.js App Router + React + TypeScript, Prisma และ PostgreSQL โดยทำงานเป็น application เดียว
- Work Items อ่าน/เขียน `WorkItem` ผ่าน `/api/work-items`; มีการกรองชนิด สถานะ ความสำคัญ โครงการ ผู้รับผิดชอบ ช่วงปี/เดือน และคำค้น รวมถึง import
- Issue #19 (2026-09-30) เติม shared validation สำหรับ create/update/import, filters ตาม Company/status/priority/functional role และข้อมูล Company/Daily Work ใน Work Item detail; import แยกผลแต่ละแถว
- Daily Work ใช้ `/api/work-logs` ซึ่งอ่าน/เขียนโมเดล `TimeEntry`; ฟอร์มเลือก Project และ Work Item และ API ตรวจว่า Work Item อยู่ใน Project ที่เลือก
- Baseline 2026-09-27: Projects อ่าน `Project` และนับ/สรุป Work Items ได้; #18 เพิ่ม Company relation และ summary จาก WorkItem/TimeEntry ใน source แล้ว โดย rollout/backfill จริงยังต้องผ่าน gate
- Dashboard, Board และ Analysis มีข้อมูลตัวอย่างฝังในหน้า; จึงไม่ใช่รายงานที่เชื่อถือได้จากฐานข้อมูล
- Baseline 2026-09-27: Company อ่าน `Company`, `User`, `Project` และ `WorkItem` บางส่วนโดยไม่มี mutation; #18 เพิ่ม Company profile API และ UI ใน source แล้ว
- Settings มีฟอร์มตัวอย่าง แต่ยังไม่พบ persistence/API สำหรับค่าที่แสดง
- Prisma schema ปัจจุบันไม่มี authentication/session model หรือ Customer model; API ปัจจุบันไม่มีการบังคับตัวตนผู้เรียก
- Schema ปัจจุบันมี `TimeEntry.projectId` และ `TimeEntry.workItemId` แยกกัน; application ตรวจความสอดคล้องของคู่ Project/Work Item ขณะบันทึก แต่ schema ไม่ได้บังคับความสัมพันธ์คู่นี้เอง

## 3. ข้อกำหนดระบบ

### 3.1 Data ownership และ consistency

1. `WorkItem` เป็น source of truth ของ title, kind, priority, functional role, status, project, owner/assignee, work date และ due date
2. `WorkItem.role` ระบุบทบาทที่เจ้าของทำงานในรายการนั้น (`Developer`, `infra`, `SA`); ไม่ใช่ role หรือ permission ของ account
3. `TimeEntry` เป็น source of truth ของเวลาที่ใช้จริง โดยต้องอ้างถึง Work Item เดียวที่มีอยู่; Project ที่แสดงใน Daily Work ต้องเป็น Project ของ Work Item นั้น และผู้บันทึกคือเจ้าของระบบ
4. Work Items, Board, Dashboard, Projects และ Analysis ต้องอ่าน `WorkItem` ชุดเดียวกัน; Daily Work, ชั่วโมงใน Project และรายงานเวลาอ่าน `TimeEntry` ชุดเดียวกัน
5. การแก้สถานะจาก Work Items หรือ Board ต้องเขียนกลับ WorkItem เดียวกันและสะท้อนในทุกหน้าหลัง refresh/query ใหม่
6. ยอดรวมและกราฟต้องได้จาก database query/aggregation หรือข้อมูล API ที่คำนวณจากฐานข้อมูล ห้ามใช้ hard-coded sample values
7. Project แต่ละรายการผูกกับ Company หนึ่งราย และ Company หนึ่งรายมีหลาย Projects ได้. ระบบรองรับ Companies หลายราย; Project ใหม่เลือก Company ที่มีอยู่ และ Projects เดิมผูกกับ Dhas ตามการตัดสินใจของเจ้าของ. Company ที่มี Projects อ้างถึงห้ามลบ.
8. การลบ/เก็บถาวรต้องไม่ทำให้ข้อมูลเวลาหรือประวัติงานหายโดยไม่ตั้งใจ; นโยบาย soft delete/retention ต้องสรุปก่อนพัฒนา destructive operation

### 3.2 Work Item workflow

ค่าปัจจุบันใน Prisma enum ซึ่งต้องคงที่ระหว่าง API และ UI:

| Field | ค่าที่รองรับ |
| --- | --- |
| `kind` | `Incident`, `Issue`, `Task` |
| `priority` | `none`, `low`, `medium`, `high`, `urgent` |
| `role` | functional role ของเจ้าของ: `Developer`, `infra`, `SA` หรือว่าง; ไม่ใช่สิทธิ์ user |
| `status` | `backlog`, `todo`, `in-progress`, `blocked`, `sa-testing`, `pm-testing`, `completed`, `cancelled` |

- Board แสดงคอลัมน์ตาม status ที่ระบบรองรับ; คอลัมน์เป็น workflow configuration ไม่ใช่ข้อมูลแยกใน browser
- การลากการ์ด/แก้สถานะต้อง validate status, บันทึกผ่าน API และแสดง error เมื่อบันทึกไม่สำเร็จ
- สถานะปลายทางและ timestamp สำหรับวัด throughput ต้องมี semantics เดียวกันใน UI, API และรายงาน; ปัจจุบัน `submittedAt` ถูก stamp เมื่อเข้าสู่ `sa-testing` หรือ `completed` จึงห้ามตีความเป็นเวลาปิดงานโดยไม่ระบุให้ชัด
- กลุ่มแสดงผล “Complete” ใน Work Items อาจรวม `cancelled` ตามข้อกำหนด UI เดิม แต่ metric `Completed` ของ Dashboard/Analysis นับเฉพาะ `status = completed`; ต้องคงนิยามนี้ให้ชัดใน label และรายงาน

### 3.3 Daily Work / Time Entry

- รายการบันทึกขั้นต่ำ: Work Item, owner, date, hours; description/remarks/status ตามแบบฟอร์มปัจจุบัน
- Project เป็น context ที่ได้จาก Work Item หรือส่งซ้ำได้เฉพาะเมื่อ backend ตรวจว่า projectId ตรงกับ project ของ workItemId
- ตรวจรูปแบบวันที่, จำนวนชั่วโมงเป็นค่าบวก, ขีดจำกัดชั่วโมงต่อวัน และความสัมพันธ์ระหว่าง user, Project และ Work Item ฝั่ง server ไม่พึ่ง validation ฝั่ง browser เพียงอย่างเดียว
- การแก้ไข/ลบต้อง refresh ผลรวมชั่วโมงและทุกมุมมองที่คำนวณจาก TimeEntry
- รายงานชั่วโมงรวมต้องระบุ timezone และช่วงวันที่ที่ใช้ให้ตรงกัน โดยใช้ Asia/Bangkok เป็น business timezone
- Default time zone ของระบบทุก environment คือ `Asia/Bangkok`; date-only input, ปฏิทิน, date range, year/month filter และ grouping ต้องคำนวณด้วย timezone นี้อย่างชัดเจน ไม่ใช้ local timezone ของ browser/process
- ตั้ง timezone ของ application และ PostgreSQL session เป็น `Asia/Bangkok`; ทุก date/time ที่บันทึกลง DB ใช้ Bangkok calendar/wall-clock semantics และไม่แปลงเป็น UTC. Parse/format ที่ API/UI ด้วย `Asia/Bangkok` โดยชัดเจน; Settings แสดง timezone ระบบนี้และไม่เปลี่ยน timezone ของข้อมูล

### 3.4 Menu contracts

รายละเอียด business acceptance แยกตามเมนูอยู่ใน [BUSINESS_REQUIREMENT.md](./BUSINESS_REQUIREMENT.md); technical scope และลำดับงานอยู่ใน [SCOPE.md](./SCOPE.md)

| Menu | Contract เชิงเทคนิค |
| --- | --- |
| Dashboard `/` | อ่าน aggregates จาก WorkItem, TimeEntry, Project และ Company context; มี global filter และลิงก์ไปยังรายการต้นทาง |
| Projects `/projects` | Project CRUD; ผูก Company; progress/counts คำนวณจาก WorkItem; hours คำนวณจาก TimeEntry |
| Work Items `/work-items` | หน้าหลักสำหรับ query/filter/create/update/delete/import WorkItem; ดึง GitLab Issues เข้าระบบทางเดียวแบบ idempotent; คง enum และ validation กลาง |
| Board `/board` | Query WorkItem ด้วย filter แล้ว group ตาม status; status mutation เรียก WorkItem API |
| Analysis `/analysis` | อ่าน aggregation จาก WorkItem และ TimeEntry พร้อมช่วงเวลาและ filter ที่ระบุได้ |
| Daily Work `/daily-work` | CRUD TimeEntry ที่อ้าง WorkItem; ช่วงวัน/สัปดาห์/เดือน/ปีใช้ timezone เดียวกัน |
| Company `/company` | จัดการ Company หลายราย; สรุป Projects/Work Items/ชั่วโมงจาก DB; ไม่มี user/team administration หรือ Customer registry |
| Settings `/settings` | แยก profile, preferences และ security; persist ตามเจ้าของ setting; ห้ามแสดงปุ่มบันทึกที่ไม่เกิดผล |

### 3.4.1 GitLab Issue import

Issue #20 implements owner-triggered GitLab → PMS only, explicit GitLab Project → PMS Project mapping, identity-based upsert, per-Issue transaction, approved label mapping and first-sync owner approval. PMS-owned fields/TimeEntries stay unchanged. Exact API, field, pagination, retry and timezone contract อยู่ใน [GitLab Issue Import Contract](./GITLAB_ISSUE_IMPORT.md); Prisma source is implemented but no environment schema rollout หรือ GitLab real connection ถูกทดสอบ.

ก่อน sync จริงต้องยืนยัน instance, Project/label mapping, first-sync policy และ owner access. ระยะแรกไม่รวม write-back, webhooks, scheduled sync, Merge Requests, commits, CI หรือ GitLab time tracking.

### 3.5 Validation, errors, and security

- ทุก mutation ตรวจ input ที่ server ด้วย schema validation; ตอบ 400 สำหรับข้อมูลไม่ผ่าน, 404 สำหรับ entity ไม่พบ, 409 สำหรับ conflict และ 500 สำหรับความผิดพลาดภายใน โดยไม่เปิดเผย stack trace
- ระบบมี account เจ้าของเพียงบัญชีเดียว; เส้นทางเป้าหมายต้องยืนยันตัวเจ้าของก่อนเปิดข้อมูล/การแก้ไข แต่ไม่ต้องมี role-based permission matrix ระหว่างผู้ใช้หลายคน
- ห้ามเชื่อ `userId` หรือ `assigneeId` จาก browser เพื่อเปลี่ยนผู้ใช้; ให้ resolve เป็น owner identity ฝั่ง server (ยกเว้น compatibility/import ที่ต้อง review)
- credentials ใช้ secret/environment ที่เหมาะกับ deployment; ห้ามบันทึก password, connection string หรือ secret ใน log/เอกสาร
- ลบ Project ที่มี WorkItem/TimeEntry ต้องมีนโยบายป้องกันการสูญเสียข้อมูลและ confirmation ตาม BR

## 4. Quality attributes

| ด้าน | ข้อกำหนดเป้าหมาย |
| --- | --- |
| ความถูกต้อง | ตัวเลขทุกหน้าตรวจย้อนกลับไป WorkItem/TimeEntry ได้; ระบุสูตรและ filter ที่ใช้ |
| ความสอดคล้อง | การเปลี่ยนแปลงเดียวปรากฏเหมือนกันในทุก menu หลัง response สำเร็จและ refresh |
| ความปลอดภัย | Owner authentication/access control, server validation และ secret isolation ก่อนเปิด instance สู่เครือข่าย |
| Performance | ใช้ aggregate query, index ที่ตรง filter, จำกัดผลลัพธ์และ pagination เมื่อชุดข้อมูลโต; วัดจากข้อมูลจริงก่อนตั้ง SLA |
| Usability | ภาษาไทยเป็นหลัก; visual hierarchy สม่ำเสมอด้วย Neumorphism ผ่าน shared theme-aware tokens/components ทั้ง 8 เมนูและทุก theme ปัจจุบัน; responsive บนโทรศัพท์/แท็บเล็ต/โน้ตบุ๊ก; มี loading/empty/error state และใช้ default time zone `Asia/Bangkok` ในทุกเมนู |
| Frontend behavior | Neumorphism ใช้ raised/inset surfaces และ soft shadows อย่างพอดี; ไม่ใส่เงาซ้ำทุก element และเงา/สีพื้นห้ามแทน typography, semantic states, contrast หรือ visible keyboard focus; คง light/dark/special-dark เดิมและไม่เพิ่ม style toggle แยก ใช้ CSS/utilities ที่มีอยู่; hover/focus ราว 120–180 ms, dialog/dropdown 160–220 ms; keyboard focus ใช้งานได้และเคารพ `prefers-reduced-motion`; Dashboard/Analysis charts และองค์ประกอบภายในต้องพอดีกับ chart component โดยไม่ทำให้หน้า overflow แนวนอน |
| Observability | health endpoint ตรวจ DB; error log มี request context โดยไม่มีข้อมูลลับ; บันทึกเหตุการณ์สำคัญที่จำเป็นต่อ audit |
| Maintainability | API/service และ business rules กลาง; หลีกเลี่ยง query/enum mapping คนละชุดระหว่างเมนู |

## 5. Definition of Done สำหรับการพัฒนาในอนาคต

- ทุกหน้าแสดงข้อมูลจาก API/Prisma ที่อ่าน persistent records; ไม่มี mock data ใน production UI
- สร้างหรือแก้ WorkItem หนึ่งรายการแล้ว Work Items, Board, Dashboard, Projects และ Analysis แสดงค่าที่ตรงกัน
- บันทึก Daily Work แล้ว Work Item/Project/User ที่เกี่ยวข้องและชั่วโมงสะสมตรงกัน; ป้องกัน project/work-item mismatch
- ทุกเมนูและทุก database write ใช้ default time zone `Asia/Bangkok`; date-only values เป็นวันปฏิทิน Bangkok และ timestamps เป็น Bangkok local wall-clock
- Filter วันที่ให้ผลลัพธ์ตรงกันเมื่อใช้ timezone และช่วงวันที่เดียวกัน
- UI ทั้ง 8 เมนูใช้งานได้บนโทรศัพท์ แท็บเล็ต และโน้ตบุ๊กโดยไม่ตัดข้อมูลหรือ action สำคัญ; horizontal scrolling จำกัดอยู่ภายใน component ที่ออกแบบไว้
- Chart, axis, legend, tooltip และ label ใน Dashboard/Analysis อยู่ภายใน chart component; ไม่เกิด page-level horizontal overflow
- Motion สื่อ feedback โดยไม่ทำให้ layout shift หรือชะลอการบันทึก; keyboard focus และ `prefers-reduced-motion` ทำงานถูกต้อง
- UI ทั้ง 8 เมนูใช้ Neumorphism อย่างสม่ำเสมอผ่าน shared theme-aware tokens/components โดยไม่ทำให้ contrast, อ่านง่าย, semantic states หรือ visible focus แย่ลง; light/dark/special-dark แสดงพื้นผิวและเงาเหมาะกับแต่ละ theme
- ทุก loading, empty, validation, not-found และ server-error state มีการตอบสนองที่ผู้ใช้เข้าใจ
- Company association สำหรับ Project ผ่าน verified backup, staged Dhas backfill และ NOT NULL rollout แล้วใน Production; รายละเอียดอยู่ใน [Company/Project implementation](./COMPANY_PROJECT_IMPLEMENTATION.md)
- Owner authentication และ validation ฝั่ง server ครอบคลุมทุก mutation ก่อนเปิด production
- Acceptance criteria ตาม [BUSINESS_REQUIREMENT.md](./BUSINESS_REQUIREMENT.md) ผ่านการทวนกับผู้ใช้ธุรกิจ

## 6. คำถามที่ต้องยืนยันก่อน migration/implementation

1. Company/Project rollout สำหรับ Production เสร็จตาม backup และ verification gates ที่บันทึกใน [Company/Project implementation](./COMPANY_PROJECT_IMPLEMENTATION.md); environment อื่นต้องทำ verified backup และ rollout gates ของตนก่อน schema change
2. การเลือก Company ใหม่เป็นการตัดสินใจของเจ้าของตอนสร้าง Project; Company ID ต้องมาจาก Company ที่มีอยู่และ API ตรวจสอบฝั่ง server
3. `submittedAt` หมายถึงส่งเข้า SA Testing หรือส่งงานเสร็จ; ควรเพิ่ม `completedAt`/status history เพื่อวัด throughput หรือไม่
4. Daily Work อนุญาตหลายบันทึกต่อ Work Item ต่อวันหรือไม่ และจำกัดยอดรวมไม่เกิน 24 ชั่วโมงต่อเจ้าของต่อวันหรือไม่
5. ยืนยันว่า Company profile มีหนึ่ง record ต่อ installation (ข้อกำหนดปัจจุบัน: ใช้หนึ่งบริษัท/เจ้าของต่อ installation)
6. เลือก `User` record ที่เป็นเจ้าของหลัก และกำหนดวิธี map WorkItem/TimeEntry เดิมที่อ้าง User หลายรายการโดยไม่ทำประวัติสูญหาย
7. ก่อนเปิดใช้ GitLab จริง ให้ owner อนุมัติ instance, Project/label mappings และ first-sync policy ตาม [GitLab Issue Import Contract](./GITLAB_ISSUE_IMPORT.md); ห้าม fuzzy-match WorkItem เดิม
8. ยืนยันว่าจะนำเข้า GitLab time tracking เป็น Daily Work หรือไม่; ระยะแรก `TimeEntry` ที่เจ้าของบันทึกใน PMS ยังคงเป็นแหล่งจริง


## Runtime security ที่ implement ใน #15

สถานะเพิ่มเติม ณ 2026-09-28: มี private owner access gate หน้า Next.js, server-only environment injection จาก root `.env` ของ Dev/UAT/Production, loopback host ports และ `Asia/Bangkok` สำหรับ app/PostgreSQL session แล้ว. Issue #17 ผูก gate กับ Next.js middleware ด้วย proof แบบสุ่มต่อ process และ resolve owner ฝั่ง server; หากมี legacy User rows หลายแถวให้ `OWNER_USER_ID` ชี้ owner ที่ผ่าน audit มิฉะนั้นต้องมี User หนึ่งแถว. WorkItem/TimeEntry writes ไม่เชื่อ owner ID จาก browser. Gate บันทึก structured access outcome, method และ Bangkok timestamp โดยไม่บันทึก credential หรือ URL. HTTP Basic ของ gate เป็น browser-managed access session; ไม่มี session table หรือ password ใน DB. รายละเอียด runtime อยู่ใน [Runtime Security](./RUNTIME_SECURITY.md). ยังไม่ยืนยันว่า installation จริง deploy แล้ว.

## Database operations ที่ implement ใน #16

เครื่องมือ backup/isolated restore/staged validation/health และ retention อยู่ใน [Database Rollout](./DATABASE_ROLLOUT.md). #16 เตรียมเครื่องมือ; #18 rollout Company/Project ใน Production แล้ว. #20 เพิ่ม GitLab schema source/API ใน repository; ยังไม่ apply schema กับ environment ใดและต้องผ่าน runbook ของ environment เป้าหมายก่อน sync จริง.

## Work Item management ที่ implement ใน #19

`POST/PATCH /api/work-items` และ import ใช้ shared validation ของ enum, required fields, Bangkok calendar dates, Project reference และ owner. List/detail อ่านและเขียน canonical `WorkItem`; Company แสดงผ่าน Project relation และ Daily Work detail แสดงเฉพาะ TimeEntry ของ owner. Import ส่งผลลัพธ์ต่อแถว (`created`/`skipped`/`failed`) เพื่อให้ข้อมูลแถวที่ถูกต้องดำเนินต่อได้. `cancelled` ยังคงไม่ใช่ `completed`. `DELETE` ตอบ `409 HISTORY_CONFLICT` เมื่อมี Daily Work และ relation ใช้ `Restrict`.

## Daily Work consistency ที่ implement ใน #21

`POST/PATCH/DELETE /api/work-logs` ใช้ owner จาก server และ transaction ที่ serialize การเขียนต่อ Work Item; ทุก mutation ตรวจ Work Item ownership และ Project consistency แล้ว derive `projectId` จาก Work Item. `hours` รับเป็น positive Decimal string ภายใน `DECIMAL(65,30)` และทุก summary รวมด้วย exact decimal arithmetic. `date` serialize เป็น `YYYY-MM-DD`; input แบบ Bangkok `+07:00` จะ normalize เป็น Bangkok calendar date. ตัวกรอง day/week/month/year ใช้ Bangkok calendar boundaries; Work Item options โหลดครบทุก cursor page และไม่จำกัดปี. `GET /api/work-logs/summary` คืนยอด exact decimal สำหรับทั้งหมดหรือ inclusive Bangkok date range. หน้า Work Item, Project, Dashboard และ Analysis อ่านยอดล่าสุด; Dashboard/Analysis เพิ่มเฉพาะ logged-hours summary ตาม scope #21. GitLab importer ไม่เขียน TimeEntry. Schema source กำหนด TimeEntry hours เป็น `DECIMAL(65,30)`, calendar date เป็น PostgreSQL `DATE` และ timestamps เป็น `TIMESTAMP(3) WITHOUT TIME ZONE`; ยังไม่ apply กับ database ใด.

## Board workflow ที่ implement ใน #22

`/board` อ่าน canonical WorkItems จาก `GET /api/work-items` แบบครบทุกหน้า โดยส่ง filter Company, Project และ functional role; คอลัมน์ใช้ status enum กลางทั้ง 8 ค่า. เปิดการ์ดเพื่อดู WorkItem เดิม; ย้ายสถานะผ่าน `PATCH /api/work-items/{id}` ที่ใช้ validation และ transaction ของ Work Items. UI แสดง loading/empty/error, อัปเดตแบบ optimistic และ rollback เป็นค่าเดิมเมื่อบันทึกล้มเหลว. Board ไม่มี status หรือ API record แยก. วัน Work/Due แสดงจาก Bangkok date ที่ serialize เป็น `YYYY-MM-DD`; ไม่มี schema หรือ deployment change ใน #22.
