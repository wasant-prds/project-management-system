# BUSINESS REQUIREMENT

| รายการ | ค่า |
| --- | --- |
| ระบบ | Project Management System |
| เอกสาร | ข้อกำหนดทางธุรกิจฉบับรวมทุกเมนู |
| ภาษา | ภาษาไทยเป็นหลัก; system terms ใช้ภาษาอังกฤษเมื่อเป็นคำที่ใช้ทั่วไป |
| สถานะ | ข้อกำหนดเป้าหมายเพื่อพัฒนาและทบทวน |
| เอกสารเชื่อมโยง | [Shared Data Model](./SHARED_DATA_MODEL.md) · [ENGINEERING_SPEC.md](./ENGINEERING_SPEC.md) · [SCOPE.md](./SCOPE.md) · [DATABASE_MAPPING.md](./DATABASE_MAPPING.md) · [API.md](./API.md) |

เอกสารนี้รวมและยกระดับ Business Requirement รายเมนูที่อยู่ใน `document/feature/` ให้ทุกหน้าใช้ข้อมูลหลักที่สอดคล้องกัน ตัวเลขในหน้าไม่ควรถือเป็นจริงหากไม่ได้คำนวณจาก `WorkItem` และ `TimeEntry` ในฐานข้อมูล

## 1. ปัญหาและเป้าหมายทางธุรกิจ

ปัจจุบันผู้ใช้เปิด Work Items และ Daily Work เพื่อทำงานจริงได้ แต่ Dashboard, Board และ Analysis แสดงข้อมูลตัวอย่างที่ไม่สอดคล้องกับข้อมูลปฏิบัติงาน ข้อมูล Project ยังไม่มี Customer เชื่อมโยง และ Company/Settings ยังมี action ที่ไม่บันทึกข้อมูล

เป้าหมาย:

1. สร้างข้อมูลจริงชุดเดียวสำหรับงานและเวลาที่ใช้ โดย `WorkItem` เป็นรายการงานหลัก และ `TimeEntry` เป็นรายการ Daily Work ที่ผูกกับ Work Item
2. ให้ Dashboard, Projects, Board, Analysis และ Company แสดงข้อมูลที่ตรวจสอบย้อนกลับได้จากฐานข้อมูล
3. เชื่อม Project กับ Customer เพื่อกรองและติดตามงานตามลูกค้า
4. ให้ผู้ใช้เห็นสถานะการบันทึก ข้อผิดพลาด และแหล่งที่มาของตัวเลขได้ชัดเจน
5. ให้เมนูที่ยังไม่พร้อมมีขอบเขตและพฤติกรรมที่กำหนดไว้ก่อนเริ่มพัฒนา

## 2. ผู้ใช้และสิทธิ์ที่ต้องรองรับ

มีผู้ใช้งานระบบเพียงคนเดียว คือ **เจ้าของโปรเจ็ค** เจ้าของเป็นผู้จัดการ Customer, Project, Work Items และ Daily Work ทั้งหมดในระบบ จึงไม่ต้องออกแบบหลาย account, team permission หรือ role matrix สำหรับคนหลายกลุ่มในขอบเขตปัจจุบัน

เจ้าของอาจทำงานในหลาย functional roles ได้แก่ **Developer / Infra / SA** โดยเลือก role ให้แต่ละ Work Item ตามลักษณะงาน ค่าเหล่านี้คือ `WorkItem.role` ไม่ใช่บัญชีผู้ใช้, `User.role` หรือสิทธิ์เข้าใช้งานระบบ ผู้บันทึก Daily Work และ assignee ของ Work Item เป็นเจ้าของระบบคนเดิม

| Identity / role | ความหมายในระบบ |
| --- | --- |
| เจ้าของโปรเจ็ค | ผู้ใช้จริงเพียงคนเดียว; จัดการข้อมูลทั้งหมดและเป็นผู้สร้าง Work Items / Daily Work |
| Developer | functional role ที่ระบุบน Work Item เมื่องานนั้นทำในบทบาท Developer |
| Infra | functional role ที่ระบุบน Work Item เมื่องานนั้นทำในบทบาท Infrastructure |
| SA | functional role ที่ระบุบน Work Item เมื่องานนั้นทำในบทบาท System Analyst |

แม้มีผู้ใช้เดียว ระบบยังต้องปกป้องการเข้าถึงของเจ้าของด้วย authentication หรือ access control ที่เหมาะกับ deployment ปัจจุบัน API ยังไม่พบการยืนยันตัวตน; การเพิ่ม role-based authorization สำหรับผู้ใช้หลายคนอยู่นอก scope จนกว่าจะมีความต้องการใหม่

## 3. หลักข้อมูลร่วมทุกเมนู

ความหมาย entity/relation, owner, functional role และ metric แบบบรรทัดฐานอยู่ใน [Shared Data Model](./SHARED_DATA_MODEL.md)

- รายการงานหนึ่งรายการมี Work Item ID เดียว ไม่ว่าจะเปิดจาก Work Items, Board, Project หรือ Dashboard
- Daily Work แต่ละรายการต้องอ้าง Work Item และบันทึกในนามเจ้าของระบบ; Project context ต้องมาจาก Project ของ Work Item นั้น
- สถานะใน Board และ Work Items ต้องตรงกันทันทีหลังบันทึก
- Project progress, task counts และชั่วโมงต้องคำนวณจาก Work Items/Time Entries ตามสูตรที่ระบุ ไม่กรอกซ้ำเป็น snapshot ที่แก้คนละที่
- ทุก Project ต้องผูกกับ Customer หลักหนึ่งราย; Customer หนึ่งรายมีหลาย Projects ได้ และ Project หนึ่งรายการไม่ผูกหลาย Customer ใน scope นี้
- เวลารายงานทั้งหมดใช้ Asia/Bangkok เป็น business timezone; UI ต้องแสดงช่วงวันที่ที่เลือก
- `cancelled` แยกจาก `completed`; ไม่นับเป็นงานเสร็จเมื่อคำนวณ completion rate
- รายการไม่มีข้อมูลต้องแสดง empty state; API error ต้องไม่ถูกแทนด้วยเลขศูนย์หรือ mock values ที่ดูเหมือนข้อมูลจริง
- UI ทั้ง 8 เมนูต้องใช้ visual hierarchy และองค์ประกอบที่สม่ำเสมอ; responsive บนโทรศัพท์ แท็บเล็ต และโน้ตบุ๊ก โดยไม่ตัดข้อมูลหรือซ่อน action สำคัญ

## 4. Business Requirement แยกตาม Menu

### 4.1 Overview — Dashboard (`/`)

**วัตถุประสงค์:** ให้เห็นสถานะปฏิบัติงานจากข้อมูลจริง และเข้าถึงรายการที่ต้องติดตามได้

**ต้องทำได้**

- แสดงจำนวน Work Items ทั้งหมด, งานเปิด, งานเสร็จ, งานเกินกำหนด และชั่วโมงที่บันทึกในช่วงเวลาที่เลือก
- แสดงงานที่เพิ่งสร้าง/ปรับปรุง และรายการเร่งด่วน/เกินกำหนดพร้อม Project, Customer, functional role, status และ due date; ผู้รับผิดชอบคือเจ้าของระบบ
- แสดง Project ล่าสุดพร้อม Customer และ progress ที่คำนวณจาก Work Items
- การ์ด/กราฟที่กดได้พาไปหน้ารายการพร้อม filter ที่สอดคล้องกับตัวเลข
- กราฟและองค์ประกอบภายใน (แกน, legend, tooltip และ label) ต้องอยู่ในกรอบ chart component และไม่ทำให้หน้าเลื่อนแนวนอน
- ระบุช่วงวันที่และนิยามยอดบนหน้า; เมื่อยังไม่มีข้อมูลให้แสดงข้อความว่างที่ถูกต้อง

**เกณฑ์ยอมรับ:** สร้างหรือเปลี่ยนสถานะ Work Item แล้ว KPI และรายการ Dashboard เปลี่ยนตามข้อมูลฐานข้อมูล; ไม่มีชื่อผู้ใช้/โครงการ/ตัวเลข sample; ทุกยอดเปิดดูรายการต้นทางได้

### 4.2 Overview — Projects (`/projects`)

**วัตถุประสงค์:** ดูแลโครงการและผูกโครงการกับลูกค้าเพื่อจัดกลุ่ม Work Items และ Daily Work

**ต้องทำได้**

- สร้าง ดู แก้ไข และลบ/เก็บถาวร Project โดยเจ้าของ พร้อมชื่อ รายละเอียด สถานะ priority วันเริ่ม/กำหนดเสร็จ และ Customer
- ค้นหา/กรอง Project ตาม Customer, status และข้อความ; เปิดรายละเอียด Project แล้วเห็น Work Items, functional roles และชั่วโมงรวม
- แสดง total, open, completed Work Items จาก `WorkItem`; แสดง actual hours จาก `TimeEntry`
- Progress ที่แสดงต้องมีสูตรเดียวทั้งระบบ: completed / (total - cancelled); เมื่อ denominator เป็นศูนย์ให้ 0%
- การลบ Project ต้องแจ้งผลต่อ Work Items/Time Entries และป้องกันการลบข้อมูลประวัติโดยไม่ตั้งใจ

**เกณฑ์ยอมรับ:** Customer ที่เลือกติดกับ Project ที่บันทึกจริง; ทุก Work Item/Daily Work ใน Project detail มี foreign relation ที่ตรวจสอบได้; summary เท่ากับจำนวนรายการจริง

### 4.3 Overview — Work Items (`/work-items`)

**วัตถุประสงค์:** เป็นจุดหลักสำหรับสร้าง ติดตาม และแก้ไขงาน

**ต้องทำได้**

- สร้าง/ดู/แก้ไข/ลบ Work Item; กำหนด title, description, kind, types, priority, functional role, status, Project, work date และ due date; assignee เป็นเจ้าของระบบคนเดียว
- ค้นหาและกรองตามปี/เดือน, Project, kind และค่าที่ backend รองรับ; รองรับ import/export ตาม validation และผลลัพธ์รายแถว
- เชื่อม GitLab Project กับ Project ในระบบ แล้วสั่งดึง GitLab Issues เข้ามาเป็น Work Items ได้ทางเดียว; แสดงผล sync และลิงก์กลับไปยัง Issue ต้นทาง
- Sync ซ้ำแล้วไม่สร้างรายการซ้ำ; ปรับข้อมูลที่กำหนดให้มาจาก GitLab โดยคงข้อมูลเฉพาะในระบบ เช่น functional role, priority, work date และ Daily Work
- แสดง labels/status/priority ตาม enum กลาง; ไม่แปลงเป็นตัวเลือกเฉพาะหน้า
- เปิดรายละเอียดแล้วดูข้อมูล Project/Customer, owner และ Daily Work ที่ผูกอยู่
- แก้ไขข้อมูล/สถานะแล้ว refresh ค่าที่ใช้งานร่วมกันบน Board, Project, Dashboard และ Analysis

**เกณฑ์ยอมรับ:** รายการจาก API ตรงกับ DB; invalid enum/foreign key ถูกปฏิเสธ; Work Item เดียวกันมี ID เดียวในทุกทางเข้า; import ที่ผิดแสดงสาเหตุโดยไม่ทำให้ข้อมูลเดิมเสียหาย; GitLab Issue ที่ sync ซ้ำอ้างถึง WorkItem เดิม มีลิงก์กลับต้นทาง ไม่มีการเขียนข้อมูลกลับ GitLab และการยกเลิก Project mapping ไม่ลบประวัติงานหรือเวลา

**ขอบเขต GitLab ระยะแรก:** นำเข้า Issues จาก GitLab ทางเดียวแบบ manual เท่านั้น; mapping สถานะที่เสนอคือ `opened → todo` และ `closed → completed`. ต้อง map GitLab Project กับ Project ในระบบก่อน sync. ยังไม่รวม Merge Requests, commits, CI, scheduled/webhook sync และการนำเข้า time tracking.

### 4.4 Management — Board (`/board`)

**วัตถุประสงค์:** ดู workflow ของ Work Items ในรูปแบบ Kanban เพื่ออัปเดตงานได้รวดเร็ว

**ต้องทำได้**

- แสดง Work Items จริงแยกตาม status ที่กำหนดใน schema; แสดงจำนวนต่อคอลัมน์
- กรองตาม Customer/Project, functional role (Developer/Infra/SA), kind, priority และช่วงวันที่ตามความเหมาะสม; ไม่ต้องมี assignee filter เมื่อมีเจ้าของคนเดียว
- การเปิดการ์ดไปยัง Work Item เดิม; การเปลี่ยนคอลัมน์บันทึก status ของ Work Item ผ่าน API
- แสดง loading/empty/error; ถ้าบันทึก status ไม่สำเร็จให้คงค่าเดิมหรือ rollback UI
- เพิ่ม/ลบคอลัมน์ได้เฉพาะเมื่อมี workflow configuration ที่ persist และ enum/API รองรับ; ห้ามจำลองคอลัมน์ที่ไม่ตรงกับสถานะงาน

**เกณฑ์ยอมรับ:** การย้ายการ์ดไป `in-progress` เห็นสถานะเดียวกันใน Work Items หลัง reload; ไม่มี task cards ตัวอย่าง; นับรวมทุกการ์ดที่ตรง filter โดยไม่ double count

### 4.5 Management — Analysis (`/analysis`)

**วัตถุประสงค์:** วิเคราะห์ throughput, workload และชั่วโมงจากรายการจริง

**ต้องทำได้**

- เลือกช่วงวันและ filter Customer/Project, functional role, kind; แสดง filter ที่กำลังใช้อยู่
- แสดง Work Items ตาม status/kind/priority, จำนวนที่เสร็จ, งานค้าง/เกินกำหนด และชั่วโมงจาก TimeEntry
- กราฟแนวโน้มใช้วัน/สัปดาห์/เดือนตามช่วงที่เลือก; ตาราง/จุดข้อมูลพาไปยังรายการต้นทางได้
- กราฟและองค์ประกอบภายใน (แกน, legend, tooltip และ label) ต้องอยู่ในกรอบ chart component บนทุกขนาดหน้าจอ โดยไม่ทำให้ทั้งหน้าเลื่อนแนวนอน
- Export ต้องส่งออกข้อมูลที่ตรงกับ filter และแสดงสถานะสำเร็จ/ล้มเหลว
- นิยาม metric ต้องแสดงชัด เช่น completion rate = completed / (total - cancelled); ชั่วโมง = ผลรวม TimeEntry.hours ในช่วงวันที่
- การวิเคราะห์ตามช่วงเวลาใช้วันที่ event ที่มีความหมาย; ปัจจุบันไม่มี status history และ `submittedAt` ใช้ทั้งสถานะ `sa-testing` และ `completed` จึงต้องตัดสินใจเพิ่ม `completedAt`/status history ก่อนรายงาน completion trend

**เกณฑ์ยอมรับ:** ตัวเลขคำนวณย้อนกลับได้จาก Work Items/Time Entries ที่แสดง; เปลี่ยนช่วงวันที่แล้วทั้ง KPI และกราฟเปลี่ยน; ไม่มี hard-coded dataset

### 4.6 Management — Daily Work (`/daily-work`)

**วัตถุประสงค์:** บันทึกและทบทวนเวลาที่ใช้กับ Work Item ในแต่ละวัน

**ต้องทำได้**

- เลือกวัน/สัปดาห์/เดือน/ปี และดูรายการที่ตรงช่วง; ค้นหาได้ในรายการที่โหลด
- สร้าง ดู แก้ไข และลบ Time Entry; เลือก Project ก่อน แล้วเลือก Work Item จาก Project นั้น
- บันทึกผู้ทำงานเป็นเจ้าของระบบจาก authenticated identity; วันที่ ชั่วโมง คำอธิบาย/remarks และ status ตามข้อกำหนดปัจจุบัน
- แสดงชั่วโมงรวมในช่วง/การ์ดสถิติจาก Time Entries ชุดเดียวกับฐานข้อมูล
- เปลี่ยน Project แล้ว reset Work Item selection; backend ปฏิเสธ ID mismatch
- ตรวจชั่วโมงบวกและเพดานต่อวันที่ตกลงกัน; ป้องกันการ submit ซ้ำระหว่างรอผล

**เกณฑ์ยอมรับ:** หลังบันทึก รายการและยอดชั่วโมงอัปเดต; Project/Work Item/ผู้บันทึกตรงกัน; เปิด Work Item เดิมแล้วเห็นเวลาที่บันทึกได้; กรองวันไม่เลื่อนข้ามวันเพราะ timezone

### 4.7 Management — Company (`/company`)

**วัตถุประสงค์:** ดูแลข้อมูลบริษัทของเจ้าของ และทะเบียน Customer ที่ใช้ผูกกับ Projects

**ต้องทำได้**

- อ่าน/แก้ไข company profile ของเจ้าของจาก `Company`; ถือเป็นข้อมูลบริษัทเดียวของ installation นี้
- เพิ่ม ดู แก้ไข และปิดใช้งาน Customer ในทะเบียนกลาง เพื่อให้ Project เลือก Customer ได้
- แสดง Projects ภายใต้ Customer และจำนวน Work Items/ชั่วโมงจากข้อมูลจริง
- ไม่ต้องมีหน้าจัดการสมาชิก, เชิญผู้ใช้, Project membership หรือ team permissions ในขอบเขตปัจจุบัน
- ข้อมูลเจ้าของที่เก็บใน `User` ใช้เป็น identity/ผู้รับผิดชอบเพียงคนเดียว ไม่แสดงเป็นทีมหลายสมาชิก

**เกณฑ์ยอมรับ:** company profile และ Customer ที่แก้แล้วคงอยู่หลัง reload; Project ผูก Customer ที่ถูกต้อง; ปุ่มทุกปุ่มมีผลจริงหรือถูกซ่อนไว้; ไม่มีข้อมูลสมาชิก/สิทธิ์หลายคนที่ทำให้เข้าใจว่ารองรับหลาย account

### 4.8 Settings (`/settings`)

**วัตถุประสงค์:** ให้เจ้าของระบบจัดการ profile และ preferences ของ account เดียวอย่างเชื่อถือได้

**ต้องทำได้**

- Profile: อ่าน/แก้ไขข้อมูลของเจ้าของที่ login อยู่ ไม่ใช้ profile ตัวอย่างหรือ selector เปลี่ยนผู้ใช้
- Preferences: persist theme, locale/timezone และการตั้งค่าการแจ้งเตือนที่ product รองรับ
- Security: แสดงเฉพาะความสามารถที่เชื่อม authentication provider ได้จริง; password/2FA controls ต้องไม่รับข้อมูลแล้วทิ้ง
- แจ้งสถานะบันทึกและ validation; Cancel คืนค่าที่บันทึกไว้ล่าสุด
- ใช้ settings ชุดเดียวของเจ้าของ; ไม่ต้องมีการตั้งค่าแยกตาม role หรือผู้ใช้หลายคน

**เกณฑ์ยอมรับ:** ทุก control ที่แสดงบันทึก/อ่านค่าได้จริง; settings ผูกกับ account ของเจ้าของ; security actions ใช้ endpoint/provider ที่ปลอดภัย

## 5. กฎธุรกิจร่วมและ metric definitions

| Metric | นิยามเริ่มต้นที่เสนอ |
| --- | --- |
| Total Work Items | จำนวน Work Items ที่ตรง filters; รวมทุก status |
| Open Work Items | ไม่นับ `completed` และ `cancelled` |
| Completed | status เท่ากับ `completed`; ไม่รวม `cancelled` |
| Completion rate | completed ÷ (total − cancelled) × 100; ถ้าตัวหารเป็นศูนย์ให้ 0% |
| Overdue | `dueDate` ก่อนวันปัจจุบันใน Asia/Bangkok และ status ไม่ใช่ `completed`/`cancelled` |
| Project progress | completed ÷ (total − cancelled) × 100; ต้องใช้สูตรเดียวใน Project และ Dashboard |
| Logged hours | ผลรวม `TimeEntry.hours` ตาม date range และ filters; ใช้ decimal ไม่ปัดก่อนรวม |
| Active Project | ค่า Project status ที่องค์กรกำหนด (baseline ใช้ `In Progress`, `Review` ใน Company summary) |

Metric ที่เป็นแนวโน้มตามเวลาไม่ควรใช้ current status ย้อนหลัง; ต้องใช้ status event history หรือ timestamp เฉพาะ เช่น `completedAt` ก่อนอ้างตัวเลข historical throughput

หมายเหตุ: กลุ่มแสดงผล “Complete” ในหน้า Work Items อาจรวม `cancelled` เพื่อจัดกลุ่มรายการที่ปิดแล้ว แต่ metric `Completed` และอัตราความสำเร็จนับเฉพาะ `completed`; รายการ `cancelled` ไม่นับเป็นงานสำเร็จ

## 6. Non-functional requirements

- ภาษา UI หลักเป็นไทย โดยแสดง enum/common system terms ภาษาอังกฤษได้
- รองรับโทรศัพท์ (<640px), แท็บเล็ต (640–1023px) และโน้ตบุ๊ก (≥1024px); ไม่มี page-level horizontal overflow หรือการตัดข้อมูล/action สำคัญ โดยอนุญาต local scrolling เฉพาะ component ที่ออกแบบไว้ เช่น Board และ tabs
- ใช้ visual hierarchy, design tokens และ shared UI components ให้สม่ำเสมอทั้ง 8 เมนู
- ใช้ motion สั้นเพื่อสื่อ feedback เช่น hover/focus, dialog/dropdown, loading และ Board drag; hover/focus ประมาณ 120–180 ms, dialog/dropdown 160–220 ms ใช้ CSS/utilities ที่มีอยู่ก่อนเพิ่ม dependency, ไม่ทำให้ layout กระโดดหรือชะลอการบันทึก และเคารพ keyboard focus กับ `prefers-reduced-motion`
- กราฟ Dashboard/Analysis และแกน, legend, tooltip, label ต้องปรับตาม parent container และอยู่ภายในกรอบ chart component
- แสดง loading, empty, validation, permission denied, not found และ server failure อย่างชัดเจน
- ข้อมูลเวลาและ identity ต้องได้รับการป้องกันด้วย owner authentication หรือ private access control ก่อน production; ไม่ต้องมี permission matrix หลาย role
- Export และ import ต้องเคารพ filter และ validation เดียวกับหน้า/API
- ทุกยอดรวมต้องอธิบาย source, period และ formula; ห้ามแสดงค่าคาดเดาเป็นค่าจริง

## 7. ลำดับการส่งมอบที่แนะนำ

1. **Foundation:** ยืนยันกฎ Customer, timezone, auth/role, metric และ data retention; เพิ่ม API validation และ consistency rules
2. **Core consistency:** ทำ Projects ↔ Customer; ทำ Board ให้ใช้ WorkItem จริง; เติมความสมบูรณ์ของ Work Items ↔ Daily Work
3. **Operational overview:** เชื่อม Dashboard กับ source records และ deep links
4. **Analysis:** สร้าง shared aggregate/query definitions และเพิ่ม status history/completedAt หากต้องการแนวโน้มย้อนหลัง
5. **Administration:** Company CRUD และ Settings persistence/auth integration

ลำดับนี้เป็น recommendation เพื่อทำให้ข้อมูลหลักเชื่อถือได้ก่อนทำรายงานและหน้า administration; การเริ่ม implementation เป็นงานขั้นถัดไปจากการทบทวนเอกสารชุดนี้

## 8. เอกสารรายเมนูเดิม

รายละเอียด UI/responsive ที่มีอยู่ใน `document/feature/<menu>/business-requirement.th.md` และ `scope.th.md` ยังคงใช้เป็น reference เฉพาะเมื่อตรงกับข้อกำหนดฉบับรวมนี้ เอกสารฉบับเดิมบางส่วนระบุ status ว่าเสร็จจากงาน UI และไม่ครอบคลุมการเชื่อมข้อมูล/API ตามเป้าหมาย EV; ให้ใช้เอกสารฉบับนี้เป็น business source of truth ระหว่างวางแผน

