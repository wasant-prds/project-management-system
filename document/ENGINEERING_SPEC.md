# ENGINEERING SPEC (EV)

| รายการ | ค่า |
| --- | --- |
| ระบบ | Project Management System |
| ฉบับ | EV — Enhanced Version |
| สถานะ | ข้อกำหนดเป้าหมายสำหรับใช้วางแผนการพัฒนา |
| ภาษาหลัก | ไทย โดยคง system terms ภาษาอังกฤษที่ใช้ทั่วไป |
| เอกสารประกอบ | [Shared Data Model](./SHARED_DATA_MODEL.md), [Customer/Project Migration Contract](./CUSTOMER_PROJECT_MIGRATION.md), [Architecture](./ARCHITECTURE.md), [Business Requirement](./BUSINESS_REQUIREMENT.md), [Scope](./SCOPE.md), [Database](./DATABASE.md), [Database Mapping](./DATABASE_MAPPING.md), [API](./API.md), [Deployment](./DEPLOYMENT.md) |

> เอกสารนี้เป็นข้อกำหนดเชิงวิศวกรรมฉบับยกระดับ ไม่ได้ยืนยันว่าความสามารถเป้าหมายมีอยู่ในระบบปัจจุบัน รายละเอียดปัจจุบันและส่วนที่ต้องพัฒนาดูหัวข้อ Baseline และ Gap ในเอกสารที่เกี่ยวข้อง

## 1. เป้าหมาย

ข้อกำหนด entity, relation, owner, functional role และ metric ที่เป็นมาตรฐานกลางอยู่ใน [Shared Data Model](./SHARED_DATA_MODEL.md); เอกสารนี้ระบุข้อกำหนดเชิงวิศวกรรมและ As-Is/Target เพิ่มเติม

ทำให้ทุกเมนูใช้ข้อมูลธุรกิจชุดเดียวกัน โดยยึด `WorkItem` เป็นรายการงานหลัก และ `TimeEntry` เป็นบันทึก Daily Work ที่ผูกกับรายการงานนั้น หน้า Dashboard, Projects, Board และ Analysis ต้องคำนวณจากข้อมูลเดียวกัน ไม่สร้างชุดข้อมูลตัวอย่างหรือสถานะซ้ำของตัวเอง

เส้นทางข้อมูลเป้าหมาย:

```text
Customer → Project → Work Item → Daily Work (Time Entry)
                         ↑                ↓
                    User/Assignee     ชั่วโมง/วันที่/ผู้บันทึก
```

เมนู Company และ Settings ดูแล master data และการตั้งค่าที่รองรับ workflow นี้ ส่วน Dashboard, Board และ Analysis เป็นมุมมองที่อ่านและสรุปข้อมูลจากแหล่งเดียวกัน

## 2. Baseline ที่ตรวจพบใน repository

- ระบบเป็น Next.js App Router + React + TypeScript, Prisma และ PostgreSQL โดยทำงานเป็น application เดียว
- Work Items อ่าน/เขียน `WorkItem` ผ่าน `/api/work-items`; มีการกรองชนิด สถานะ ความสำคัญ โครงการ ผู้รับผิดชอบ ช่วงปี/เดือน และคำค้น รวมถึง import
- Daily Work ใช้ `/api/work-logs` ซึ่งอ่าน/เขียนโมเดล `TimeEntry`; ฟอร์มเลือก Project และ Work Item และ API ตรวจว่า Work Item อยู่ใน Project ที่เลือก
- Projects อ่าน `Project` และนับ/สรุป Work Items ได้แล้ว แต่ยังไม่มี Customer model หรือความสัมพันธ์กับลูกค้า
- Dashboard, Board และ Analysis มีข้อมูลตัวอย่างฝังในหน้า; จึงไม่ใช่รายงานที่เชื่อถือได้จากฐานข้อมูล
- Company อ่าน `Company`, `User`, `Project` และ `WorkItem` จากฐานข้อมูลบางส่วน แต่ action จัดการ Customer และแก้ไขข้อมูลบริษัทยังไม่มี API ที่พบ; ความต้องการเป้าหมายมีเจ้าของระบบคนเดียว
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
7. Project แต่ละรายการผูกกับ Customer หนึ่งราย; Customer หนึ่งรายมีหลาย Projects ได้. Customer ขั้นต่ำมี stable ID, required name และ active/inactive status; customer ที่ถูกใช้งานห้ามลบ. ใช้ approved mapping register ต่อ Project และทำ staged nullable/backfill/validation ก่อนบังคับ `customerId` ตาม [Customer/Project Migration Contract](./CUSTOMER_PROJECT_MIGRATION.md)
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

### 3.4 Menu contracts

รายละเอียด business acceptance แยกตามเมนูอยู่ใน [BUSINESS_REQUIREMENT.md](./BUSINESS_REQUIREMENT.md); technical scope และลำดับงานอยู่ใน [SCOPE.md](./SCOPE.md)

| Menu | Contract เชิงเทคนิค |
| --- | --- |
| Dashboard `/` | อ่าน aggregates จาก WorkItem, TimeEntry, Project และ Customer; มี global filter และลิงก์ไปยังรายการต้นทาง |
| Projects `/projects` | Project CRUD; ผูก Customer; progress/counts คำนวณจาก WorkItem; hours คำนวณจาก TimeEntry |
| Work Items `/work-items` | หน้าหลักสำหรับ query/filter/create/update/delete/import WorkItem; ดึง GitLab Issues เข้าระบบทางเดียวแบบ idempotent; คง enum และ validation กลาง |
| Board `/board` | Query WorkItem ด้วย filter แล้ว group ตาม status; status mutation เรียก WorkItem API |
| Analysis `/analysis` | อ่าน aggregation จาก WorkItem และ TimeEntry พร้อมช่วงเวลาและ filter ที่ระบุได้ |
| Daily Work `/daily-work` | CRUD TimeEntry ที่อ้าง WorkItem; ช่วงวัน/สัปดาห์/เดือน/ปีใช้ timezone เดียวกัน |
| Company `/company` | อ่าน/แก้ company profile ของเจ้าของและจัดการ Customer registry; สรุป Projects/Work Items/ชั่วโมงจาก DB; ไม่มี user/team administration |
| Settings `/settings` | แยก profile, preferences และ security; persist ตามเจ้าของ setting; ห้ามแสดงปุ่มบันทึกที่ไม่เกิดผล |

### 3.4.1 GitLab Issue import

1. Work Items รองรับการดึง GitLab Issues เข้ามาเป็น `WorkItem` แบบทางเดียว (GitLab → PMS); การแก้ใน PMS ไม่ส่งกลับไป GitLab
2. เจ้าของเป็นผู้เริ่ม sync แบบ manual ในระยะแรก และต้อง map GitLab Project แต่ละรายการกับ Project ใน PMS ก่อนนำเข้า; Customer ของงานจึงได้จาก Project ใน PMS; Work Item แสดงลิงก์กลับไป GitLab Issue
3. ใช้ `(provider, canonical GitLab instance URL, GitLab Project ID, global Issue ID)` เป็น external identity พร้อม database uniqueness และ transactional upsert เพื่อป้องกันการสร้าง WorkItem ซ้ำ; รายละเอียดอยู่ใน [Customer/Project Migration Contract](./CUSTOMER_PROJECT_MIGRATION.md)
4. GitLab Issue สร้าง `WorkItem.kind = Issue`, ใช้ owner คนเดียวเป็น assignee, `priority = none`, `role`/`workDate` ว่าง และ sync title, description, state, supported labels, due date และ remote updated time; GitLab URL/IDs เก็บเป็น external reference
5. เสนอ mapping สถานะ `opened → todo`, `closed → completed`; sync ซ้ำเขียนทับเฉพาะฟิลด์ที่เป็นของ GitLab (title, description, status, mapped types, due date) และคง `role`, `priority`, `workDate`, owner กับ `TimeEntry` ที่เป็นข้อมูลเฉพาะ PMS
6. แสดงผลจำนวนสร้างใหม่/อัปเดต/ข้าม/ผิดพลาด และสาเหตุของรายการที่ sync ไม่สำเร็จ; รองรับ pagination, rate limit และ retry โดยไม่ทำให้ข้อมูลซ้ำ; การยกเลิก Project mapping ไม่ลบ WorkItem/TimeEntry ที่นำเข้าแล้ว
7. เก็บ GitLab token ฝั่ง server ใน secret store/environment; ไม่ส่ง token ให้ browser และไม่บันทึก token ใน logs
8. Webhook, scheduled sync, Merge Requests, commits, CI data, write-back และ GitLab time logs ยังไม่อยู่ในระยะแรก

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
| Usability | ภาษาไทยเป็นหลัก; visual hierarchy สม่ำเสมอ; responsive บนโทรศัพท์/แท็บเล็ต/โน้ตบุ๊ก; มี loading/empty/error state และแสดงวันที่ตาม Asia/Bangkok |
| Frontend behavior | ใช้ CSS/utilities ที่มีอยู่; hover/focus ราว 120–180 ms, dialog/dropdown 160–220 ms; keyboard focus ใช้งานได้และเคารพ `prefers-reduced-motion`; Dashboard/Analysis charts และองค์ประกอบภายในต้องพอดีกับ chart component โดยไม่ทำให้หน้า overflow แนวนอน |
| Observability | health endpoint ตรวจ DB; error log มี request context โดยไม่มีข้อมูลลับ; บันทึกเหตุการณ์สำคัญที่จำเป็นต่อ audit |
| Maintainability | API/service และ business rules กลาง; หลีกเลี่ยง query/enum mapping คนละชุดระหว่างเมนู |

## 5. Definition of Done สำหรับการพัฒนาในอนาคต

- ทุกหน้าแสดงข้อมูลจาก API/Prisma ที่อ่าน persistent records; ไม่มี mock data ใน production UI
- สร้างหรือแก้ WorkItem หนึ่งรายการแล้ว Work Items, Board, Dashboard, Projects และ Analysis แสดงค่าที่ตรงกัน
- บันทึก Daily Work แล้ว Work Item/Project/User ที่เกี่ยวข้องและชั่วโมงสะสมตรงกัน; ป้องกัน project/work-item mismatch
- Filter วันที่ให้ผลลัพธ์ตรงกันเมื่อใช้ timezone และช่วงวันที่เดียวกัน
- UI ทั้ง 8 เมนูใช้งานได้บนโทรศัพท์ แท็บเล็ต และโน้ตบุ๊กโดยไม่ตัดข้อมูลหรือ action สำคัญ; horizontal scrolling จำกัดอยู่ภายใน component ที่ออกแบบไว้
- Chart, axis, legend, tooltip และ label ใน Dashboard/Analysis อยู่ภายใน chart component; ไม่เกิด page-level horizontal overflow
- Motion สื่อ feedback โดยไม่ทำให้ layout shift หรือชะลอการบันทึก; keyboard focus และ `prefers-reduced-motion` ทำงานถูกต้อง
- ทุก loading, empty, validation, not-found และ server-error state มีการตอบสนองที่ผู้ใช้เข้าใจ
- Customer association สำหรับ Project และ migration/backfill ผ่านการ review ก่อนบังคับใช้
- Owner authentication และ validation ฝั่ง server ครอบคลุมทุก mutation ก่อนเปิด production
- Acceptance criteria ตาม [BUSINESS_REQUIREMENT.md](./BUSINESS_REQUIREMENT.md) ผ่านการทวนกับผู้ใช้ธุรกิจ

## 6. คำถามที่ต้องยืนยันก่อน migration/implementation

1. ก่อน rollout จริง ให้สร้างและอนุมัติ environment-specific mapping register สำหรับทุก Project ตาม [Customer/Project Migration Contract](./CUSTOMER_PROJECT_MIGRATION.md); แถวที่ unmapped/ambiguous ต้อง block rollout และห้ามเดาค่าแทน
2. ยืนยันหลักฐานและ Customer ID ของแต่ละ Project จากเจ้าของข้อมูลใน environment ที่กำลังย้าย; repository ไม่มีข้อมูลจริงให้กำหนด mapping ล่วงหน้า
3. `submittedAt` หมายถึงส่งเข้า SA Testing หรือส่งงานเสร็จ; ควรเพิ่ม `completedAt`/status history เพื่อวัด throughput หรือไม่
4. Daily Work อนุญาตหลายบันทึกต่อ Work Item ต่อวันหรือไม่ และจำกัดยอดรวมไม่เกิน 24 ชั่วโมงต่อเจ้าของต่อวันหรือไม่
5. ยืนยันว่า Company profile มีหนึ่ง record ต่อ installation (ข้อกำหนดปัจจุบัน: ใช้หนึ่งบริษัท/เจ้าของต่อ installation)
6. เลือก `User` record ที่เป็นเจ้าของหลัก และกำหนดวิธี map WorkItem/TimeEntry เดิมที่อ้าง User หลายรายการโดยไม่ทำประวัติสูญหาย
7. ยืนยัน GitLab instance (gitlab.com หรือ self-managed), รายการ Project ที่เชื่อม, label mapping และว่าจะอนุญาตให้ผูก Issue เข้ากับ WorkItem เดิมหรือให้สร้าง WorkItem ใหม่เมื่อ sync ครั้งแรก (ข้อเสนอปัจจุบัน: สร้างใหม่)
8. ยืนยันว่าจะนำเข้า GitLab time tracking เป็น Daily Work หรือไม่; ระยะแรก `TimeEntry` ที่เจ้าของบันทึกใน PMS ยังคงเป็นแหล่งจริง

