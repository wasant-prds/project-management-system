# สร้างและอัปเดต GitHub Issues จาก Markdown

ใช้ Python 3.10 ขึ้นไป ไม่ต้องติดตั้ง package เพิ่ม สคริปต์อ่าน `design/projects/project-management-system/work_items/00_checklist.md` และเปิดเฉพาะไฟล์ที่เลือกจาก checklist

โฟลเดอร์ `design/` ไม่ถูก commit. สคริปต์อ่านไฟล์ใน working tree ของเครื่องนี้

## เลือกและ preview ก่อนสร้าง

รันจาก root ของ repository:

```powershell
# ดูเลขวางแผนที่เลือกได้ (ไม่มีการติดต่อ GitHub)
python scripts/github-create-tasks.py --list

# เลือกหนึ่งใบ
python scripts/github-create-tasks.py --issues 40

# เลือกช่วง รวมเลขแรกและเลขสุดท้าย
python scripts/github-create-tasks.py --issues 31-33

# เลือกหลายใบ/หลายช่วง
python scripts/github-create-tasks.py --issues "31-33,40"

# ใช้ # ได้ แต่ต้องใส่เครื่องหมายคำพูดใน PowerShell
python scripts/github-create-tasks.py --issues "#31-#33"

# บันทึก preview แบบเต็มเป็น JSON
python scripts/github-create-tasks.py --issues 40 --output .runtime/issue-preview.json
```

`--output` จะสร้างโฟลเดอร์ปลายทางให้อัตโนมัติ และไม่อนุญาตให้เขียนทับ checklist หรือไฟล์ต้นทางที่เลือก

ค่าเริ่มต้นเป็น **offline preview** แม้มี token อยู่แล้วก็ไม่มี HTTP request ไม่มีตัวเลือกสร้างทั้งหมดโดยอัตโนมัติ และถ้าไม่ระบุ `--issues` จะหยุดทันที ชุดปัจจุบันคือ #11–#40 หากเพิ่ม `--upsert` จะเปลี่ยนเป็น preview ที่อ่านข้อมูลจริงจาก GitHub ตามรายละเอียดด้านล่าง

ใบที่ checklist เป็น `[x]` จะสร้างได้เมื่อเพิ่ม `--include-closed` เท่านั้น. ตอนนี้มีเฉพาะ #40 ที่ยังเป็น `[ ]`. ช่วงที่ปนใบ `[x]` โดยไม่มี flag นี้จะหยุดก่อนส่ง request ดู [ย้ายงานที่ปิดแล้ว](#ย้ายงานที่ปิดแล้ว-include-closed)

## สร้างจริงเมื่อเลือกใบงานเรียบร้อย

สคริปต์อ่านไฟล์ `scripts/github/.env` โดยอ้างอิงตำแหน่ง repository ไม่ขึ้นกับ working directory ไม่อ่าน root `.env` ค่าใน environment ของ PowerShell มีลำดับความสำคัญสูงกว่าไฟล์ และ `--url`/`--repo` มีลำดับความสำคัญสูงสุด Preview แบบออฟไลน์ก็อ่านไฟล์นี้เพื่อแสดง assignee ตาม Role ให้ตรงกับตอนสร้างจริง แต่ไม่ใช้และไม่พิมพ์ token และไม่ส่ง request

เตรียมไฟล์จากตัวอย่างครั้งแรก (หากมี `.env` แล้ว ให้แก้ไฟล์เดิม ไม่คัดลอกทับ):

```powershell
Copy-Item scripts/github/.env.example scripts/github/.env
```

แก้ `scripts/github/.env` เป็น:

```dotenv
GITHUB_URL=https://github.com
GITHUB_REPO=wasant-prds/project-management-system
GITHUB_TOKEN=วาง_token_จริงที่สร้างจาก_GitHub
```

- `GITHUB_URL`: หน้าเว็บ GitHub เอาเฉพาะ `https://github.com` ไม่ใส่ชื่อ repository หรือ `api.github.com` สำหรับ GitHub Enterprise ให้ใส่ host ขององค์กร เช่น `https://github.example.com` สคริปต์จะเรียก `/api/v3` เอง
- `GITHUB_REPO`: `owner/name` จาก URL `https://github.com/wasant-prds/project-management-system` ไม่เติม `.git`
- `GITHUB_TOKEN`: Personal access token ของบัญชีที่เขียน Issues ใน repository นี้ได้ classic token ใช้ scope `repo` fine-grained token เลือก repository นี้และให้ Issues เป็น Read and write

ขั้นตอนสร้าง token: GitHub → **Settings** → **Developer settings** → **Personal access tokens** → สร้าง fine-grained หรือ classic token ตามสิทธิ์ด้านบน → คัดลอกทันทีเพราะ GitHub แสดงให้เห็นครั้งเดียว ดู [Managing your personal access tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)

เมื่อกรอกครบ รันได้ทันที:

```powershell
python scripts/github-create-tasks.py --issues 40 --create
```

Label กำหนดจาก Role ในใบงาน ไม่ต้องตั้งใน `.env` ไฟล์ `.env` ถูก ignore โดย Git อยู่แล้ว ห้าม commit token หรือส่งมาในแชต

### Assignee ตาม Role

ค่าเริ่มต้นของทุก Role คือ `wasant-prds` ซึ่งเป็นผู้ใช้เดียวที่ assign ได้ใน repository นี้ ถ้าต้องการแยกคนตาม Role ให้ใส่ GitHub login ใน `scripts/github/.env`:

```dotenv
GITHUB_ASSIGNEE=wasant-prds
GITHUB_ASSIGNEE_SA=
GITHUB_ASSIGNEE_INFRA=
GITHUB_ASSIGNEE_DEVELOPER=
GITHUB_ASSIGNEE_DEVELOPER_INFRA=
GITHUB_ASSIGNEE_DEVELOPER_DATA_MIGRATION=
```

| Role ในไฟล์ | Key |
|---|---|
| `SA` | `GITHUB_ASSIGNEE_SA` |
| `Infra` | `GITHUB_ASSIGNEE_INFRA` |
| `Developer` | `GITHUB_ASSIGNEE_DEVELOPER` |
| `Developer / Infra` | `GITHUB_ASSIGNEE_DEVELOPER_INFRA` |
| `Developer / Data Migration` | `GITHUB_ASSIGNEE_DEVELOPER_DATA_MIGRATION` |

ลำดับที่ใช้: `--assignee` (ทุก Role) → key ของ Role → `GITHUB_ASSIGNEE` → `wasant-prds` ค่าว่างหมายถึงใช้ลำดับถัดไป ค่าใน shell ที่ไม่ว่างชนะค่าในไฟล์ ใส่ `@` นำหน้าได้ login ที่ผิดรูปแบบจะหยุดก่อนติดต่อ GitHub และก่อน write แรกจะตรวจว่า login ทุกคนในชุดเป็นผู้ใช้ที่ assign ได้ใน repository

รองรับเฉพาะ keys ใน `.env.example` รูปแบบ `KEY=value` จะครอบค่าด้วย single/double quotes ก็ได้ รองรับ comment และ UTF-8 BOM ไม่มีการ expand `$VARIABLE` หรือรันคำสั่งจากค่า สามารถเลือกไฟล์อื่นด้วย `--env-file path/to/.env` ได้ หากไม่พบไฟล์จะใช้ environment; ถ้าค่าที่จำเป็นยังไม่ครบจะแจ้งชื่อ key ที่ขาดก่อนแสดงชุดงานหรือส่ง request โดยไม่พิมพ์ token

ยังเลือกใช้ environment แทนไฟล์ได้ ตัวอย่างรับ token แบบไม่แสดงบนหน้าจอใน PowerShell:

```powershell
$issueToken = Read-Host "GitHub access token" -AsSecureString
$env:GITHUB_TOKEN = [System.Net.NetworkCredential]::new('', $issueToken).Password
$env:GITHUB_URL = 'https://github.com'
$env:GITHUB_REPO = 'wasant-prds/project-management-system'

# คำสั่งนี้สร้างจริงเฉพาะ #40 — เปลี่ยน --issues หลังตรวจ preview แล้ว
python scripts/github-create-tasks.py --issues 40 --create

# ลบ token จาก environment เมื่อเสร็จ
Remove-Item Env:GITHUB_TOKEN
```

หรือระบุ `--url https://github.com --repo wasant-prds/project-management-system` ตอนรัน URL ต้องเป็น HTTPS สคริปต์ไม่ปิดการตรวจ TLS และไม่ตาม HTTP redirect เพื่อไม่ให้ token ออกไป host อื่น

`--create` ถือเป็นการยืนยันส่งการเปลี่ยนแปลงของชุดที่ระบุ ไม่ถามยืนยันซ้ำ และทำงานตามเลขวางแผนจากน้อยไปมาก เมื่อใช้เดี่ยว ๆ จะสร้างเฉพาะงานที่ยังไม่มีและข้ามงานเดิม; เมื่อใช้กับ `--upsert` จะสร้างงานใหม่และอัปเดตงานเดิมตาม diff

## Upsert งานที่มีข้อมูล Markdown เปลี่ยนแล้ว

ไม่ต้องเปลี่ยน `.env` ใช้ตัวเลือก `--upsert` เพิ่มเติม:

```powershell
# อ่าน GitHub และแสดง CREATE / UPDATE / UNCHANGED พร้อม diff (ยังไม่ส่งการเปลี่ยนแปลง)
python scripts/github-create-tasks.py --issues 40 --upsert

# เลือกช่วงที่ต้องการตรวจ พร้อมบันทึกแผนและ before/after เป็น JSON
python scripts/github-create-tasks.py --issues 31-33 --upsert --output .runtime/issue-upsert-plan.json

# ส่งการเปลี่ยนแปลงจริงเฉพาะชุดที่เลือก
python scripts/github-create-tasks.py --issues 31-33 --upsert --create
```

- **CREATE**: ยังไม่มี issue ที่ตรงกัน จะสร้างใหม่ด้วย assignee ตาม Role และ labels จากหัวข้อ `**Labels**` ในไฟล์ใบงาน
- **UPDATE**: พบ issue เดิมและมี diff จะใช้ `PATCH` กับเลข GitHub จริง ส่งเฉพาะ fields ที่เปลี่ยน
- **UNCHANGED**: ข้อมูลตรงกันอยู่แล้ว ไม่ส่ง POST/PATCH

`--upsert` อย่างเดียวเป็น read-only preview ต้องมี token เพราะอ่านข้อมูลจริงจาก GitHub; `--upsert --create` จึงส่ง POST/PATCH สคริปต์สร้างแผนของทั้งชุดก่อน write แรก หากหา identity ไม่แน่ชัดในใบใดจะหยุดทั้งชุด หากระบุ `--output` จะบันทึกแผนก่อน write แรก ไฟล์นี้เป็นแผน ไม่ใช่หลักฐานว่าทุกใบถูกส่งสำเร็จ

ข้อมูลที่ใช้เทียบ:

- Title รวม prefix ตาม Role
- Body คือเนื้อหาไฟล์หลังตัดหัวข้อ `**Role:**`, `**Labels**` และ `**Title**` ออก เพราะค่าเหล่านั้นไปอยู่ที่ Title, labels และ prefix ของ issue แล้ว ข้อความอื่นที่อยู่ก่อน Title เช่น `**Issue:**` หรือบันทึก handoff ยังอยู่ใน body แล้วต่อท้าย marker ไม่ถือ CRLF/LF หรือจำนวน newline ท้ายข้อความเป็น diff
- Assignee ต้องตรงกับ login ที่กำหนด
- Labels คือรายการใต้หัวข้อ `**Labels**` ของไฟล์นั้น อย่างน้อยหนึ่งชื่อ และมีได้มากกว่าหนึ่ง ชื่อต้องเป็น `prefix::name` เช่น `type::feature` หรือ `role::SA, role::infra` ในใบเดียวกัน ส่ง `labels` ทั้งชุดเพราะ GitHub แทนที่รายการเดิมทั้งก้อน prefix ที่ปรากฏในไฟล์จะถูกทำให้ตรงกับรายการนั้น เช่น มี `status::completed` ในไฟล์แล้ว `status::todo` บน GitHub จะถูกเอาออก prefix ที่ไฟล์ไม่ได้ระบุและ label ที่ไม่มี `::` จะยังอยู่

**Markdown เป็นข้อมูลหลักสำหรับ Title, Body และ assignee:** หากทีมแก้ body ตรงใน GitHub เนื้อหานั้นจะอยู่ใน diff และถูกแทนที่ด้วยไฟล์เมื่อ apply ให้นำเนื้อหาที่ต้องเก็บกลับมาใส่ Markdown ก่อนรัน การอัปเดตไม่ merge ข้อความที่เพิ่มตรงใน GitHub ให้อัตโนมัติ

การอัปเดตไม่ส่ง `state` จึงไม่ปิดหรือ reopen issue เดิม ไม่แตะ comments, milestone หรือฟิลด์อื่นที่ไม่มีใน payload หาก checklist เป็น `[x]` โหมด upsert ยังอัปเดต issue ที่มีอยู่ได้ ถ้าหาไม่พบจะสร้างใหม่เฉพาะเมื่อมี `--include-closed` สถานะในไฟล์ไม่ใช่คำสั่ง reopen หรือปิด issue ที่มีอยู่แล้ว

### ย้ายงานที่ปิดแล้ว (`--include-closed`)

ใช้เมื่อต้องการสร้าง issue ของใบที่ checklist เป็น `[x]` เช่นย้ายประวัติ #11–#38 มา GitHub:

```powershell
# Preview ออฟไลน์
python scripts/github-create-tasks.py --issues 11-38 --include-closed

# อ่าน GitHub และแสดงแผน
python scripts/github-create-tasks.py --issues 11-38 --upsert --include-closed

# สร้างจริง
python scripts/github-create-tasks.py --issues 11-38 --upsert --include-closed --create
```

ใบ `[x]` ใช้ labels ตามหัวข้อ `**Labels**` ในไฟล์ ชุด #11–#38 ระบุ `status::completed` และ #40 ระบุ `status::todo` หลัง POST ของใบ `[x]` สคริปต์ส่ง `PATCH` `{"state": "closed", "state_reason": "completed"}` แล้วตรวจว่าปิดจริง ถ้าปิดไม่ได้จะหยุดใบที่เหลือและพิมพ์ URL ให้ปิดเอง issue ที่มีอยู่แล้วไม่ถูกเปลี่ยน state รันซ้ำจะได้ UNCHANGED

### เลข `#N` ใน body (`--references`)

GitHub แปลงทุก `#N` ใน issue body เป็นลิงก์ไป issue หรือ PR เลข N **บน GitHub** และเพิ่มรายการ "mentioned" ใน timeline ของปลายทาง การใส่ backslash (`\#N`) ป้องกันไม่ได้ เลขในใบงานเป็นเลขวางแผน จึงอาจชี้ไปผิด issue

ค่าเริ่มต้น `--references plain` แทรก `&#8203;` (zero-width space) ระหว่าง `#` กับตัวเลข หน้า GitHub ยังแสดง `#26` เหมือนเดิมแต่ไม่เป็นลิงก์และไม่สร้าง mention ไม่แตะ inline code, code block, `owner/repo#N`, `&#35;` และคำอย่าง `C#8` ไฟล์ Markdown ต้นทางไม่ถูกแก้ ใช้ `--references keep` เมื่อเลขวางแผนตรงกับเลข GitHub แล้วและต้องการลิงก์จริง การเปลี่ยนโหมดทำให้ body ต่างจากเดิม upsert จะแสดงเป็น UPDATE

ก่อน PATCH จะอ่าน issue ซ้ำ ถ้า Title, Body, assignee, labels, state หรือ `updated_at` ต่างจากตอนสร้างแผนจะหยุดใบนี้และใบที่เหลือให้ตรวจ preview ใหม่ การอ่านซ้ำลดโอกาสทับการแก้พร้อมกัน แต่ GitHub ยังอาจถูกแก้ระหว่าง GET สุดท้ายกับ PATCH ได้ จึงไม่ควรรันหลาย process หรือแก้เนื้อหาใบเดียวกันระหว่าง apply

### จับคู่เลขวางแผนกับเลข GitHub จริง

`--issues` คือเลขจาก checklist ถ้าเจอ issue เดิม สคริปต์อัปเดตใบนั้น ไม่สร้างใบใหม่ `[DEV]` กับ `[Developer]` เป็น role เดียวกัน เช่นเดียวกับ `[SA]`/`SA` และ `[Infra]`/`Infra`

1. ถ้ามี GitHub issue เลขเดียวกัน ให้อัปเดตใบนั้นก่อน เช่น ไฟล์ #18 ไปที่ GitHub #18 แม้ prefix เป็น `[DEV]` แทน `[Developer]` หรือข้อความ Title ยังไม่ตรงทุกคำ ความต่างนั้นเป็น PATCH ใบที่สร้างทีหลังและมีแค่ marker ไม่แทนที่เลขนี้
2. ถ้าไม่มีเลขนั้น ให้ใช้ marker `<!-- github-issue:18 -->`
3. ถ้าไม่มีทั้งสองอย่าง ให้เทียบ role หลังรวมชื่อย่อกับข้อความ Title ถ้าเจอใบเดียวให้อัปเดต `[DEV]` กับ `[Developer]` เป็น role เดียวกัน
4. ถ้า marker เดียวกันหลายใบ หรือเจองานเดียวกันหลายใบโดยไม่มีเลขที่ตรงกัน จะหยุด ไม่มีการสุ่มเลือก

ใบ `[x]` ที่จับคู่ได้จะถูกอัปเดตโดยไม่ต้องใช้ `--include-closed` flag นั้นใช้เฉพาะตอนสร้างใบที่ยังไม่มีอยู่ การอัปเดตไม่ส่ง `state` จึงไม่ปิดหรือ reopen issue เดิม Title, body, assignee และ labels ที่ต่างจากไฟล์ถูกส่งเป็น PATCH

ใช้ `--number-map` เมื่อเลขบน GitHub ไม่ใช่เลขในไฟล์ ตัวอย่าง **สมมติ** ว่าไฟล์ #40 เคยสร้างเป็น GitHub #120:

```powershell
# Preview ที่เลือกเลขจริงอย่างชัดเจน
python scripts/github-create-tasks.py --issues 40 --upsert --number-map "40=120"

# Apply หลังตรวจ preview
python scripts/github-create-tasks.py --issues 40 --upsert --number-map "40=120" --create
```

รองรับหลายคู่ เช่น `--issues 38-40 --number-map "38=119,40=120"` ต้องใช้กับ `--upsert` เท่านั้น `--iid-map` เป็นชื่อสำรองของตัวเลือกเดียวกัน หากเลขจริงไม่มีอยู่, marker ขัดกัน หรือรายการนั้นเป็น pull request จะหยุดโดยไม่สร้างใหม่แทน กรณีที่ชี้ไป issue เดียวกันสำหรับสองไฟล์จะหยุดเช่นกัน

HTTP 404 ของเลขที่ map ไว้แปลว่าไม่มี issue นั้น หรือ token อ่าน issues ของ repository ไม่ได้ (GitHub ตอบ 404 กับ private repository ที่ไม่มีสิทธิ์) HTTP 401/403 แสดง error ของ GitHub ตามจริง ไม่รายงานว่าไม่พบ

## ข้อมูลที่ส่งไป GitHub

Assignee ค่าเริ่มต้นของทุก Role คือ `@wasant-prds` กำหนดแยกตาม Role ได้ที่ [Assignee ตาม Role](#assignee-ตาม-role) Developer, Infra และ SA ใน PMS เป็น functional role ไม่ใช่บัญชีผู้ใช้ Role ในไฟล์ใช้ตั้ง prefix ของ Title และ assignee เท่านั้น

| Role ในไฟล์ | Title |
|---|---|
| `SA` | `[SA] {Title}` |
| `Infra` | `[Infra] {Title}` |
| `Developer` | `[Developer] {Title}` |
| `Developer / Infra` | `[Developer / Infra] {Title}` |
| `Developer / Data Migration` | `[Developer / Data Migration] {Title}` |

Labels ของแต่ละใบอยู่ที่หัวข้อ `**Labels**` ในไฟล์งาน ไม่ได้เติมจาก Role อัตโนมัติ หนึ่งใบมีได้อย่างน้อยหนึ่ง label เช่น #31 มีทั้ง `role::Developer` และ `role::infra` #24 มีทั้ง `type::feature` และ `type::data`

สร้างชื่อเหล่านั้นใน repository ก่อนรัน ด้วย [สคริปต์ labels](./github-create-labels.md) สคริปต์ issues ไม่สร้าง label ให้ และหยุดทั้งชุดถ้าชื่อใน `**Labels**` ยังไม่มีบน GitHub ใช้ตัวพิมพ์เล็ก/ใหญ่ตรงกับไฟล์ใบงาน

Body คือเนื้อหาไฟล์หลังตัด `**Role:**`, `**Labels**` และบรรทัด Title ออก แล้วผ่านการกันลิงก์ `#N` ตาม `--references` จากนั้นต่อท้าย HTML comment `<!-- github-issue:40 -->` comment ไม่แสดงในหน้าที่ render แต่ยังอยู่ใน body ที่ API อ่านได้ ถ้าไฟล์ Markdown มี marker ของเลขอื่นหรือ marker กลางบรรทัด สคริปต์จะหยุดเพื่อไม่ให้ body มีสอง identity

ก่อน write แรกจะตรวจว่า repository ไม่ถูก archive, เปิด Issues อยู่, labels ที่ต้องใช้มีอยู่ และ assignee เป็นผู้ใช้ที่มอบหมายงานใน repository ได้ ถ้าไม่ผ่านจะหยุด ไม่สร้าง label หรือ issue โหมด `--create` เดี่ยว ๆ จะข้ามงานที่มี marker เดิมหรือ Title ตรงกันทั้งข้อความ รวม issue ที่ปิดแล้วด้วย; โหมด `--upsert` จะเทียบและอัปเดตงานเดิม ถ้าตรงกับ pull request จะหยุด

เมื่อสร้างหรืออัปเดตแต่ละใบจะพิมพ์เลขวางแผน → เลข GitHub จริงและ URL หากส่งบางใบสำเร็จแล้วเกิด error จะหยุดใบที่เหลือ ไม่ rollback หรือลบ issue หาก POST/PATCH timeout จะไม่ retry อัตโนมัติ ให้ตรวจ GitHub ก่อนรันใหม่ GitHub อาจตัด assignee ทิ้งถ้า token ไม่มีสิทธิ์เขียน assignee สคริปต์จะหยุดเมื่อคำตอบไม่มี assignee หรือ label ที่ขอ โหมด upsert รันซ้ำแล้วไม่ส่ง write สำหรับงานที่ตรงกับไฟล์อยู่แล้ว แต่ไม่ควรรันสอง process พร้อมกัน

GitHub เป็นผู้กำหนดเลขจริง ไม่บังคับให้ตรงเลขวางแผน สคริปต์ไม่แก้ checklist, ชื่อไฟล์ หรือ Dependencies ให้เอง `[x]` หมายถึงปิดงานใน checklist ไม่ใช่คำสั่งปิด issue บน GitHub และไม่ใช่หลักฐานว่าสร้างแล้ว

สคริปต์ใช้ [GitHub Issues API](https://docs.github.com/en/rest/issues/issues) `POST` และ `PATCH /repos/{owner}/{repo}/issues` พร้อมรายการ issues, labels และ assignees แบบแบ่งหน้า ตอนวางแผนอ่านรายการ issues ทั้ง repository ครั้งเดียวต่อรอบ และอ่านใหม่ก่อน POST แต่ละใบเพื่อกันการสร้างซ้ำ

## เพิ่มใบงานใหม่

เพิ่มไฟล์ `.md` และลิงก์ใน checklist ใต้หัวข้อ `##` ที่มีอยู่ ไม่ต้องแก้สคริปต์ถ้า Role อยู่ในตารางด้านบน และชื่อใน `**Labels**` มีอยู่บน GitHub แล้ว:

```markdown
## Developer — Premium date picker (`#40`)

- [ ] **#40** [Replace Native Date Inputs with a Premium Themed Date Picker](./40_dev_premium-themed-date-picker.md)
```

รูปแบบไฟล์:

```markdown
**Issue:** #40

**Role:** Developer

**Labels**

- type::feature
- priority::high
- role::Developer
- status::todo

**Title**

Replace Native Date Inputs with a Premium Themed Date Picker

**Status:** Open

**Scope**

รายละเอียดงาน
```

`**Issue:**` ใส่หรือไม่ใส่ก็ได้ ถ้ามีต้องตรงกับเลขใน checklist และยังถูกใส่ใน body `**Role:**` ต้องมีหนึ่งบรรทัดก่อน Title และเป็นค่าในตาราง `**Labels**` ต้องมีหนึ่งหัวข้อ และมี bullet อย่างน้อยหนึ่งรายการ Title ต้องเป็นหนึ่งบรรทัดแยกจากหัวข้อ รองรับ `**Title**`, `**Title (required)**` หรือ `# Title (required)` Role, Labels และ Title ไม่ถูกส่งใน description ข้อความอื่นก่อน Title ยังอยู่ใน body ใบที่เลือกต้องมีเนื้อหาหลัง Title ใบ `[x]` ต้องมี `--include-closed` เพื่อสร้างใหม่ โหมด upsert อัปเดตใบ `[x]` ที่มี issue อยู่แล้วได้โดยไม่ต้องใช้ flag รายการผิดรูปแบบหรือเลขที่ไม่มีใน checklist จะหยุดก่อนติดต่อ GitHub

ใช้ชุดไฟล์ที่อื่นได้ด้วย `--checklist path/to/00_checklist.md` ลิงก์ work item ต้องอยู่ภายใน directory ของ checklist ไม่รับ URL ภายนอก ข้อความต่อท้ายลิงก์ใน checklist เช่น note หรือลิงก์ prompt ไม่ถูกอ่านเป็นไฟล์งาน

## ทดสอบสคริปต์โดยไม่สร้าง issue จริง

```powershell
python -B -m unittest discover -s scripts/tests -p "test_github_create_tasks.py" -v
```

Tests ใช้ GitHub จำลองในหน่วยความจำ ไม่มีการติดต่อ GitHub จริง `-B` ไม่สร้าง `__pycache__` และ `.gitignore` ignore `__pycache__/` กับ `*.pyc` ไว้แล้ว เทสต์ checklist จริงอ่านทุกใบที่มีอยู่โดยไม่ตรึงช่วงเลข จึงยังผ่านเมื่อเพิ่ม #40 ขึ้นไป
