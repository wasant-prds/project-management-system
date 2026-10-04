# Database rollout, backup และ recovery — #16 (Infra)

สถานะ: เครื่องมือและ isolated PostgreSQL 16 rehearsal implement แล้ว. เจ้าของกำหนด defaults เป็น `BACKUP_DIR=./database/backups/postgres_data` และ `BACKUP_KEEP_DAYS=30` แล้ว. Issue #16 ครอบคลุมการเตรียมเครื่องมือ/runbook และ isolated verification; ไม่ใช่การยืนยันว่า rollout schema หรือสำรองฐานข้อมูล Dev/UAT/Production จริงแล้ว. ก่อน schema changes ทุกครั้งยังต้องสร้าง verified backup ของ environment เป้าหมายตาม runbook.

สำหรับ #18 ให้ใช้ [Company → Project decision](./COMPANY_PROJECT_DECISION.md) และ [implementation/runbook](./COMPANY_PROJECT_IMPLEMENTATION.md) ซึ่งแทน Customer contract เดิม. ใช้ [Runtime Security](./RUNTIME_SECURITY.md) สำหรับ runtime secrets. #20 เพิ่ม GitLab schema source; ก่อนใช้ใน environment ให้ผ่าน verified backup, isolated restore และ rollout approval ตามขั้นตอนของเอกสารนี้.

Issue #31 เพิ่ม SQL target และ `scripts/sql-migrate.mjs` สำหรับฐานข้อมูลทดลองที่ระบุชัดเจนเท่านั้น. คำสั่งนั้นยังไม่ใช่ขั้นตอน rollout ของเอกสารนี้ และห้ามชี้ไปที่ฐานข้อมูลของ `APP_ENV`. Active migration ยังเป็น guarded `prisma db push` จนถึง Issue #33.

## Configuration และขอบเขตความปลอดภัย

รันที่ repository root ด้วย Node ของ local toolchain และ Docker CLI. Root `.env` เลือก `APP_ENV=local|dev|uat|prod`; container เป้าหมายคือ `pms-postgres-${APP_ENV}`. Dev/local ใช้ `docker-compose.yml`, UAT ใช้ `docker-compose.uat.yml`, Production ใช้ `docker-compose.prod.yml`; environment และ data/backup directories ต้องแยกจริงบน host.

- `BACKUP_DIR` default เป็น `./database/backups/postgres_data` จาก repository root ทั้งเมื่อไม่ตั้งค่าหรือเว้นว่าง; override ได้สำหรับ installation ที่รันพร้อมกันเพื่อแยกปลายทางจริง. Path นี้แยกจาก PostgreSQL data volume. `BACKUP_KEEP_DAYS` default เป็น 30 วันทั้งเมื่อไม่ตั้งค่าหรือเว้นว่าง; override ต้องเป็นจำนวนเต็ม 1–3650. `.env.example`, CLI, scheduled service และ Compose ใช้ defaults ที่เจ้าของกำหนดตรงกัน.
- จำกัดสิทธิ์ backup directory และ root `.env` ให้ owner/service เท่านั้น (POSIX mode 0700/0600; Windows ต้องตั้ง ACL บน directory ด้วย เพราะ mode ไม่ได้บังคับ Windows ACL). Archive มีข้อมูลธุรกิจและ password hashes; ห้าม commit หรือส่งให้ผู้ไม่มีสิทธิ์.
- ปลายทาง off-host/encrypted storage และ retention ของสำเนานอกเครื่องยังต้องตัดสินใจจริง. Host backup ไม่ครอบคลุมการสูญหายของ host/disk; ห้ามอ้างว่ามี off-site backup จนตรวจสำเนาจริง.
- Credentials อ่านจาก runtime environment ของ PostgreSQL container; ไม่ใส่ password, URL หรือ GitLab token ใน arguments/log. Docker/SQL/restore errors ไม่แสดง raw diagnostics; ใช้ isolated tests เพื่อสอบสวน. ห้ามใช้ `set -x`, `docker inspect` แบบเต็ม หรือ `docker compose config` แบบพิมพ์ environment ลง log.
- System/application/database session เป็น `Asia/Bangkok`; timestamp ใช้ Bangkok local wall-clock, calendar date ใช้ Bangkok date. ขั้นตอนนี้ไม่แปลงเวลาหรือเขียนข้อมูลเก่าเป็น UTC. Legacy timezone/date semantics ต้องตรวจและอนุมัติแผนแยกก่อนเปลี่ยน.

## คำสั่งที่ทำซ้ำได้

```bash
# หลัง owner อนุมัติ environment และหยุด writes; ไม่ต้องใส่ secrets ใน command
node scripts/db-rollout.mjs backup
# Output ชี้ไป archive ใหม่; เรียก BACKUP_FILE ด้านล่างเป็น path ของไฟล์นั้น
node scripts/db-rollout.mjs rehearse "$BACKUP_FILE"
node scripts/db-rollout.mjs verify "$BACKUP_FILE" baseline
node scripts/db-rollout.mjs verify "$BACKUP_FILE" additive
node scripts/db-rollout.mjs verify "$BACKUP_FILE" backfilled
node scripts/db-rollout.mjs verify "$BACKUP_FILE" required
node scripts/db-rollout.mjs health
node scripts/db-rollout.mjs prune
```

บน PowerShell ใช้ `$backupFile` เป็น path แทน `$BACKUP_FILE`. Bash/PowerShell helper เดิมใช้ได้: `bash scripts/db-manage.sh backup`, `restore <archive>`, `verify-rollout <archive> <stage>`, `health`, `prune-backups`. **restore helper เปลี่ยนเป็น isolated rehearsal เท่านั้น**; ไม่ restore ทับ live database และไม่รับ legacy SQL/gzip/zip โดยอัตโนมัติ. Legacy archives ต้องทดสอบใน isolated environment และทบทวนวิธี restore ตามชนิดไฟล์ก่อน recovery จริง.

Manual backup ใช้ PostgreSQL custom archive (`.dump`, pg_dump --no-owner --no-privileges), SHA-256 checksum, bytes, Bangkok timestamp, environment และ inventory manifest (`.dump.json`). ตรวจ inventory ก่อน/หลัง dump และ restore ไป ephemeral PostgreSQL 16 container `--network none` โดยไม่มี ports/host volumes. ใช้ pg_restore --exit-on-error --single-transaction; compare ตารางทุก public table, column types, counts และ exact row hashes. Hash รวม IDs, nulls, decimals, date/time precision; manifest ไม่เก็บ business rows หรือ credentials. เมื่อผ่านจึงเขียน `.dump.verified.json`. การคืน ownership/grants ของ custom DB roles ต้อง provision และตรวจแยกก่อน cutover จริง.

ต้อง quiesce writes ก่อน snapshot; ถ้าข้อมูลเปลี่ยนระหว่าง dump จะไม่ certify. เครื่องมือ buffer archive สูงสุด 256 MiB และ timeout command 120s; ทดสอบกับขนาดจริงก่อนใช้ ถ้าเกินให้ review streaming/timeout plan ห้ามถือว่า backup สำเร็จ. Archive ที่ verify ล้มเหลวเก็บไว้เพื่อ review และไม่สร้าง success receipt.

## Staged rollout และ gates

1. **Stage 0:** อนุมัติ environment, path, retention, revision และ downtime/RPO. Export exact Company/Project inventory ด้วย access ที่จำกัด; ตรวจว่ามี Company เดิมเกินหนึ่งรายการหรือเป็นบริษัทอื่นหรือไม่. หยุด app/writes ที่เกี่ยวข้อง แล้ว backup + rehearsal + `verify baseline`. ต้องแก้ legacy orphans/mismatch/invalid hours ด้วยแผนอนุมัติ ไม่ใช้ reset/force-seed.
2. **Stage 1 additive:** Reviewer ตรวจ schema diff ของ #18: Company profile fields และ `Project.companyId` nullable พร้อม FK `ON DELETE RESTRICT` และ unique index ของ Dhas code. Apply เฉพาะ diff ที่ปลอดภัยใน environment ที่อนุมัติ; ห้าม apply การแปลง Project date/timestamp เดิมก่อนตรวจความหมายข้อมูล. ใช้ `verify additive` ตรวจ FK, orphan และ history.
3. **Stage 2 backfill:** ใช้ Dhas ตามการตัดสินใจของ owner. รัน `node scripts/company-project-backfill-docker.mjs --check <environment> <verified-archive>` แล้ว `--apply` ด้วย arguments เดียวกันใน reviewed environment. Script เก็บ Company เดิม, เปลี่ยนเฉพาะ `Project.companyId` ของ Projects เดิม และหยุดเมื่อพบ Dhas หรือ Project link ขัดแย้ง. รัน `verify backfilled`: ทุก Project เดิมต้อง map Dhas ครบและ `companyId` ยัง nullable.
4. **Stage 3 application:** Deploy compatible app ที่อนุมัติและตรวจ health/authenticated Company/Project reads. Quiesce Project writes ระหว่าง deploy กับ NOT NULL promotion; app รุ่นเก่าอาจยังเขียน `companyId` เป็น null.
5. **Stage 4 required:** หลัง app ใหม่ทำงานและ backfilled gate ผ่าน ให้รัน `node scripts/company-project-required.mjs --apply <environment> <verified-archive>`. รัน `verify required`; ต้องมี NOT NULL, FK/Company code unique index, ไม่มี legacy relation defects และ Project/WorkItem/TimeEntry count/hash/column types คงเดิม (ยกเว้น `Project.companyId`). ทุก verify ทำ restore rehearsal ใหม่.
6. **Stage 5 Project DATE:** ตรวจว่าทุก Project date มีเวลาเที่ยงคืน, สร้าง verified backup ใหม่, หยุด app writes, แล้วรัน `node scripts/project-date-promotion.mjs --apply <environment> <new-verified-archive>`. Script ตรวจ calendar values และ fields อื่นทุกแถวก่อน commit. Deploy image ที่ใช้ Prisma `@db.Date`, ตรวจ authenticated Company/Project reads และ `api/health` ก่อนเปิด writes. Migration service อาจไม่มี container ค้างหลัง deploy; ตรวจ schema gates ที่ apply จริงแทนการนับแค่ service exit.

### Issue #19/#21 WorkItem and TimeEntry schema gate

Compose migrations และ `scripts/db-push-safe.sh` จะไม่เรียก `prisma db push` จนกว่า environment จะผ่าน manual gate. ฐานข้อมูลที่มีข้อมูลต้องมี backup ใหม่และ isolated restore rehearsal ด้วย revision/schema ที่จะ deploy; ตรวจ WorkItem/TimeEntry date values ที่จะถูก cast เป็น PostgreSQL `DATE`, TimeEntry timestamps ที่จะเป็น `TIMESTAMP WITHOUT TIME ZONE`, `TimeEntry.workItem` FK/`ON DELETE RESTRICT`, orphan references และความสอดคล้อง `TimeEntry.projectId = WorkItem.projectId`. ก่อนลด `TimeEntry.date` เป็น calendar date ต้องตรวจว่าค่าเดิมสื่อ Bangkok date ใดและมี time-of-day ที่มีความหมายหรือไม่; ห้ามตัดส่วนเวลาโดยไม่ทำ baseline comparison และยืนยันแผนกับเจ้าของข้อมูล. Timestamp ต้องคง Bangkok local wall-clock โดยไม่แปลง UTC. ฐานข้อมูลใหม่ต้องตรวจว่าไม่มี schema/table หรือข้อมูลที่ต้องเก็บ. บันทึก archive/verification receipt หรือผล empty-database check, schema diff, environment, approver และผลตรวจใน rollout record. การ backup อย่างเดียวหรือ daily backup candidate ไม่นับว่า verified.

หลังตรวจครบ ให้ตั้ง root `.env` ของ environment เป้าหมายดังนี้ แล้ว recreate migrations/app ด้วย Compose command ตาม environment:

```dotenv
DB_SCHEMA_BACKUP_RESTORE_VERIFIED=true
DB_SCHEMA_EMPTY_DATABASE_VERIFIED=false
DB_SCHEMA_SYNC_APPROVED=true
DB_SCHEMA_SYNC_APPROVED_ENV=uat
DB_SCHEMA_SYNC_APPROVED_SCHEMA_SHA256=<sha256-of-reviewed-prisma-schema>
```

คำนวณค่า hash จาก revision ที่จะ deploy ด้วย `sha256sum prisma/schema.prisma` หรือ PowerShell `(Get-FileHash prisma/schema.prisma -Algorithm SHA256).Hash.ToLowerInvariant()`. เปิด baseline flag เพียงแบบเดียว: backup+restore สำหรับฐานข้อมูลที่มีข้อมูล หรือ `DB_SCHEMA_EMPTY_DATABASE_VERIFIED=true` หลังตรวจฐานข้อมูลใหม่ว่าง. Gate ตรวจ baseline, explicit approval, `APP_ENV` (`local`, `dev`, `uat`, `prod`), และ hash เทียบกับ schema ใน migration image; mismatch จะหยุดก่อน `prisma generate` และ database sync. Schema change ใหม่หรือ target environment อื่นต้องทำ verification และ approval ใหม่. `DB_MANAGE_MODE=seed` ไม่แก้ schemaและไม่ผ่าน `db push`, จึงไม่ต้องตั้ง gate; `force-seed` ต้องผ่าน gate.

เก็บ release revision, approved register, backup/receipt/checksum, pre/post validation, approver และ exceptions ใน run record ตาม retention. Pin rollout archive ด้วยไฟล์ชื่อ `<archive>.pin` (เช่น PowerShell `New-Item "$backupFile.pin" -ItemType File`) จนปล่อย retention hold โดยเจ้าของ. `prune` ลบเฉพาะ verified archives หมดอายุของ environment เดียว เก็บ newest verified archive, pinned, corrupt/unverified และไฟล์ environment อื่น. ไม่ prune อัตโนมัติระหว่าง rollout.

## Scheduled backup

Production profile `backup` ใช้ `db-backup-scheduled.sh`; BACKUP_DIR default เป็น `./database/backups/postgres_data` และ mount เป็น `/backups` ใน container. BACKUP_KEEP_DAYS default เป็น 30 วัน; service จะหยุดก่อนเขียนหาก override ไม่ใช่จำนวนเต็ม 1–3650. dump ใช้ไฟล์ partial สิทธิ์จำกัดและ rename เมื่อ pg_dump exit 0 เท่านั้น; dump failure ปิด serviceด้วย error ที่ไม่เผย secret. Retention ลบเฉพาะ `pms_<env>_daily_*.dump` ของ service ไม่แตะ manual/pinned rollout backup. Restart=always จะ retry service; ต้องตรวจ failure status/log ใน operations monitoring.

Daily archive เป็น candidate ยังไม่ verified และไม่มี snapshot manifest; ห้ามใช้เป็น rollout baseline. ก่อน schema change ต้องรัน manual `backup` เพื่อได้ archive+manifest+isolated restore ที่จับคู่กัน. Daily recovery ต้อง restore ใน isolated DB และตรวจข้อมูลกับ run inventory ที่อนุมัติก่อน cutover.

## Recovery ที่รักษาประวัติ

เมื่อ gate ล้มเหลวให้หยุด promotion/writes, เก็บ snapshot สถานะปัจจุบันและ logs ที่ไม่มี secrets. Additive failure ใช้ reviewed forward repair หรือ app revision ที่อ่าน nullable schema ได้; backfill failure rollback transaction และตรวจ Company/Project conflicts. ห้าม reset, force seed หรือ `down -v` เพื่อแก้ migration.

กรณีต้อง database recovery: backup state ปัจจุบันก่อน, restore baseline ไป isolated replacement, compare IDs/counts/decimal hours/null/date/time และ relations, reconcile writes หลัง backup, ให้ owner อนุมัติ downtime และ data-loss/RPO ที่ตรวจแล้ว. Provision credentials/roles/grants, timezone, isolated persistent volume และ reviewed Compose DB target สำหรับ replacement ก่อน cutover. สลับ app ไป replacement หลังอนุมัติและตรวจ health/migrations/data ใหม่; เก็บ original volume และ backups จน owner ปล่อย retention hold. เครื่องมือไม่มี live overwrite/cutover command เพราะข้อมูลจริงและ reconciliation ยังไม่อนุมัติ.

## Verification ของ repository

`pnpm test:database-rollout` ตรวจ validation, failure/cleanup, checksum, history, retention และ health. `pnpm test:database-rollout-docker` ทดสอบ schema ปัจจุบันจาก Prisma และ staged target DDL เฉพาะ fixture ใน PostgreSQL 16 containers แยก; ไม่ใช้ root `.env`, installed seed data หรือ production volumes. รันทดสอบซ้ำได้และลบเฉพาะ fixtures ที่สร้าง. ดู [Testing](./process/testing.md).

ผลตรวจหลังเจ้าของยืนยัน defaults (2026-09-28): `pnpm test:database-rollout` ผ่าน 6 tests; `pnpm test:runtime-docker` ผ่าน 4 tests รวม default/override ของ Compose และ scheduled backup; `pnpm test:database-rollout-docker` ผ่าน end-to-end PostgreSQL/Next health และยืนยัน manifest retention 30 วัน; `pnpm test` ผ่าน 52 และ skip 8 opt-in Docker tests ซึ่ง focused suites ที่เกี่ยวข้องรันแยกแล้ว. Syntax และ `git diff --check` ผ่าน. Checklist #16 ปิดเฉพาะ Infra preparation; การใช้งาน environment จริงยังต้องผ่าน staged gates ตาม runbook.
