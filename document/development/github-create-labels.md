# สร้างและอัปเดต GitHub labels จากรายการงาน

ใช้ Python 3.10 ขึ้นไป ไม่ต้องติดตั้ง package เพิ่ม สคริปต์อ่านหัวข้อ `# labels` ใน `design/work_items.md` แล้วสร้างหรืออัปเดต label ใน repository โฟลเดอร์ `design/` ไม่ถูก commit สคริปต์อ่านไฟล์ใน working tree ของเครื่องนี้

Label ที่ขึ้นต้นด้วย prefix เดียวกันใช้สีเดียวกัน เช่น `priority::high` และ `priority::low` เป็นสีเดียวกัน อีโมจิในไฟล์ต้นทางเป็นหมายเหตุของแต่ละบรรทัด จึงไม่ถูกใช้เป็นสี และไม่ถูกใส่ในชื่อหรือคำอธิบายของ label

| Prefix | สี | ใช้กับ |
|---|---|---|
| `priority` | `#D93F0B` | ความสำคัญทุกค่า |
| `role` | `#5319E7` | Role ทุกค่า |
| `status` | `#0E8A16` | สถานะทุกค่า |
| `type` | `#1D76DB` | ประเภทงานทุกค่า |

Prefix ที่ยังไม่มีสีใน `COLORS` ของ `scripts/github-create-labels.py` จะทำให้สคริปต์หยุด เพิ่มสีของ prefix นั้นก่อน จึงจะอ่านบรรทัดใหม่ได้

## Preview ก่อนส่ง

รันจาก root ของ repository ค่าเริ่มต้นเป็น offline preview ไม่ส่ง request และไม่ใช้ token แม้ไฟล์ `.env` จะมี token อยู่แล้ว:

```powershell
python scripts/github-create-labels.py

# บันทึกชุด label เป็น JSON
python scripts/github-create-labels.py --output .runtime/label-preview.json
```

`--output` สร้างโฟลเดอร์ปลายทางให้ และไม่เขียนทับไฟล์ catalog หรือ `scripts/github/.env`

## สร้างและอัปเดตบน GitHub

ใช้ไฟล์ `scripts/github/.env` เดียวกับสคริปต์ issues วิธีเตรียม token อยู่ใน [คู่มือ issues](./github-create-tasks.md) สคริปต์นี้อ่าน `GITHUB_URL`, `GITHUB_REPO` และ `GITHUB_TOKEN` ค่า assignee ในไฟล์เดียวกันไม่ถูกใช้

```powershell
# อ่าน label ที่มีอยู่แล้ว แล้วแสดงว่าจะสร้าง อัปเดต หรือไม่แตะ
python scripts/github-create-labels.py --upsert

# สร้าง label ที่ยังไม่มี และอัปเดตสีกับคำอธิบายให้ตรง catalog
python scripts/github-create-labels.py --upsert --create
```

`--create` โดยไม่มี `--upsert` ก็ส่งการเปลี่ยนแปลงเหมือนกัน ก่อน write แรกสคริปต์ตรวจว่า repository ไม่ถูก archive และเปิด Issues อยู่

- **CREATE**: ยังไม่มีชื่อนี้ จะ `POST` ชื่อ สี และคำอธิบาย
- **UPDATE**: มีชื่อนี้แล้ว แต่สีหรือคำอธิบายต่างจาก catalog จะ `PATCH` สีและคำอธิบาย ไม่เปลี่ยนชื่อ
- **UNCHANGED**: ตรงกับ catalog แล้ว ไม่ส่ง write

สีเทียบแบบไม่สนตัวพิมพ์เล็ก/ใหญ่ รันซ้ำหลังชุดตรงกันแล้วจะไม่ส่ง write ซ้ำ สคริปต์ไม่ลบ label อื่นใน repository รวม label เริ่มต้นของ GitHub

ถ้า label เปลี่ยนระหว่างที่สร้างแผนกับตอน write สคริปต์จะหยุดใบที่เหลือ ให้รัน `--upsert` ใหม่ ถ้า GitHub ตอบชื่อ สี หรือคำอธิบายไม่ตรงกับที่ส่ง จะหยุดเช่นกัน write ที่ล้มเหลวไม่ถูก retry อัตโนมัติ ให้ตรวจหน้าที่ Labels ของ repository ก่อนรันใหม่

คำอธิบายต้องไม่เกิน 100 ตัวอักษร และชื่อต้องไม่เกิน 50 ตัวอักษร ตามขีดจำกัดของ GitHub ถ้าบรรทัดใน catalog เกิน สคริปต์จะหยุดก่อนติดต่อ GitHub

ชื่อ label ที่สคริปต์ issues ส่งไปคือรายการในหัวข้อ `**Labels**` ของแต่ละใบงาน ใบ `Developer / Data Migration` ใช้ `role::Developer` กับ `type::data` ซึ่งมีใน catalog นี้แล้ว

## รูปแบบใน catalog

ใต้หัวข้อ `# labels` หนึ่งหัวข้อ แต่ละบรรทัดเป็น:

```text
prefix::name → คำอธิบาย
prefix::name - คำอธิบาย
prefix::name 🟠 → คำอธิบาย
```

อีโมจิถ้ามี ต้องเป็น token เดียวก่อน `→` หรือ `-` บรรทัดว่างถูกข้าม หัวข้อ `#` ถัดไปจบส่วนนี้ ชื่อซ้ำ บรรทัดที่ไม่มีตัวคั่น หรือ prefix ที่ไม่มีสี จะหยุดทั้งชุด

## ทดสอบโดยไม่สร้าง label จริง

```powershell
python -B -m unittest discover -s scripts/tests -p "test_github_create_labels.py" -v
```

Tests ใช้ GitHub จำลองในหน่วยความจำ `-B` ไม่สร้าง `__pycache__`
