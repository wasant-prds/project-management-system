# คำสั่งสำหรับจัดการฐานข้อมูล

เรียกใช้คำสั่งเหล่านี้จาก root ของ repository โดยใช้แทน scripts เดิม (`db:*`) ใน `package.json`

ใช้ `bash` เรียกไฟล์ `.sh` (บน Windows ให้ใช้ Git Bash) เนื่องจาก PowerShell ไม่มีคำสั่ง `sh`

`postinstall` ยังคงรัน `prisma generate` ส่วน Prisma seed ยังคงตั้งค่าเป็น `tsx prisma/seed.ts` ใน `package.json`

ตั้ง `APP_ENV` ใน `.env` ที่ root ของ repository เพื่อเลือก site เป้าหมาย โดยใช้ `.env` เพียงไฟล์เดียว: `local` หรือ `dev` สำหรับ development, `uat` สำหรับ UAT และ `prod` สำหรับ production สคริปต์จัดการฐานข้อมูลจะเลือก Compose file, container และ volume ตามค่านี้ หากกำหนด `SEED_PATH` ใน `.env` ให้ใช้ `database/seeds/master` ซึ่งเป็น path ที่อ้างอิงจาก root ของ `/app` ใน container

ตัวอย่างเมื่อจะจัดการ UAT ให้ตั้ง `APP_ENV=uat` ใน `.env` ก่อนรันสคริปต์ เมื่อทำงานกับ production ให้เปลี่ยนเป็น `APP_ENV=prod`

## งานที่ทำบ่อย: export และ backup seeds

รันคำสั่งนี้เพื่อ export ข้อมูลจากฐานข้อมูลของ site ที่เลือกใน `APP_ENV` เป็นไฟล์ JSON ใน `database/seeds/master` แล้วสร้าง ZIP backup ของ seeds ชุดใหม่ไว้ใน `./backups`:

```bash
bash scripts/dump-master-seeds.sh
```

ชื่อไฟล์ backup จะมี site และ timestamp ตาม `Asia/Bangkok` เช่น `master-seeds_uat_20260926_120000.zip` ต้องเปิด PostgreSQL container ของ site นั้นอยู่ก่อนรัน หาก host ไม่มี Node.js ให้เปิด app container ของ site นั้นด้วย

## Prisma

| คำสั่ง | คำอธิบาย |
| --- | --- |
| `pnpm prisma generate` | สร้าง Prisma Client |
| `pnpm prisma migrate dev` | สร้างและ apply migration |
| `pnpm prisma db seed` | seed ข้อมูลลงฐานข้อมูล (ข้ามหากมีข้อมูลอยู่แล้ว และไม่ลบข้อมูลเดิม) |
| `pnpm prisma studio` | เปิด Prisma Studio |
| `bash scripts/db-push-safe.sh` | push schema แบบไม่ทำลายข้อมูล (ปฏิเสธ flags ที่อาจทำให้ข้อมูลสูญหาย) |
| `bash scripts/dump-master-seeds.sh` | export ข้อมูลจาก PostgreSQL ของ site ที่เลือกเป็น JSON ใน `database/seeds/master` (แยก `WorkItem/` ตามปีและลบ JSON ที่ไม่อยู่ใน config) แล้ว zip seeds ชุดใหม่ไว้ใน `./backups` |

## สคริปต์ช่วยจัดการ

สคริปต์: `scripts/db-manage.sh` (PowerShell: `scripts/db-manage.ps1`)

```bash
bash scripts/db-manage.sh <command>
```

| คำสั่ง | คำอธิบาย |
| --- | --- |
| `bash scripts/db-manage.sh status` | แสดงสถานะฐานข้อมูล |
| `bash scripts/db-manage.sh reset` | reset ฐานข้อมูล (ลบข้อมูลทั้งหมด) |
| `bash scripts/db-manage.sh backup` | สร้าง backup ของฐานข้อมูลตาม `APP_ENV`; ถ้า PostgreSQL หยุดอยู่แต่พบไฟล์ฐานข้อมูล จะเปิดเฉพาะ PostgreSQL ชั่วคราวแล้วหยุดหลัง backup |
| `bash scripts/db-manage.sh restore <file>` | กู้คืนฐานข้อมูลจาก backup |
| `bash scripts/db-manage.sh connect` | เชื่อมต่อฐานข้อมูลด้วย `psql` |
| `bash scripts/db-manage.sh logs` | แสดง logs ของ PostgreSQL |
| `bash scripts/db-manage.sh seed` | รัน seed ใน Linux migrations container ของ site ที่เลือก (ข้ามหากตารางใน seed config มีข้อมูลอยู่แล้ว; ถ้า container หยุดแต่พบไฟล์ฐานข้อมูล จะข้ามอย่างปลอดภัย) |
| `bash scripts/db-manage.sh force-seed` | บังคับ seed ใหม่ (ลบข้อมูลเดิม) |

คำสั่ง `status`, `backup`, `restore`, `connect`, `logs`, `reset` และ `force-seed` จะทำงานกับ site ที่ระบุใน `.env` เท่านั้น ตัวอย่าง:

```bash
# ตั้ง APP_ENV=prod ใน .env ก่อน
bash scripts/db-manage.sh status
bash scripts/db-manage.sh backup
```

`backup` จะบันทึก SQL backup ไว้ใน `database/backups` โดยใส่ชื่อ site ในชื่อไฟล์
