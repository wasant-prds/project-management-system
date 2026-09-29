# Runtime security — Issue #15 (Infra)

สถานะ: implement private owner access gate, server secret injection และ issue #17 ที่เชื่อม gate กับ Next.js middleware/owner User resolver แล้ว. GitLab connector (#20) ยังเป็นงานถัดไป. ไม่มีการ deploy หรือเปลี่ยนข้อมูลจริงจาก issue นี้.

## Access boundary

`Browser → owner gate :3000 → Next.js 127.0.0.1:3001 → Prisma → PostgreSQL` อยู่ใน app container เดียว. Gate ใช้ HTTP Basic สำหรับ credential เจ้าของหนึ่งชุดจาก secret store/environment; ไม่สร้าง password database, session หรือ multi-user RBAC. ตรวจ credential ด้วย fixed-length SHA-256 digest และ timing-safe comparison. SHA-256 ใช้เปรียบเทียบระหว่าง request เท่านั้น ไม่ใช่ password storage format.

Issue #17 เพิ่ม internal proof แบบสุ่มต่อ process: gate ลบ header proof ที่ browser ส่งมาและใส่ค่าใหม่ให้ Next.js middleware ตรวจ. Middleware ส่ง authenticated marker ต่อให้ server-side owner resolver ซึ่งต้องพบ `User` เพียงหนึ่งแถว. Browser จัดการ HTTP Basic credential เป็น access session; ปิด browser session หรือ rotate credential เพื่อออกจากระบบ. Proof ถูก redact จาก child logs และไม่มีค่าใน client bundle หรือ `.env`.

ทุก page, API, static asset และ WebSocket ต้องผ่าน gate; ไม่มี credential/credential ผิด → `401 OWNER_UNAUTHENTICATED`, origin ไม่ตรง → `403 ACCESS_DENIED`, startup config ไม่ครบ → process ไม่เริ่ม. Mutations และ WebSocket ต้องส่ง `Origin` ตรง `APP_ORIGIN`; API client ต้องส่ง header นี้ด้วย. Gate ลบ Authorization และ middleware bypass header ก่อนส่งเข้า Next. Health ยกเว้นเฉพาะ `GET /api/health` ที่ไม่มี query; response มีเพียง generic dependency status และ Bangkok timestamp, failure เป็น 503 ไม่มี raw exception. Health ตรวจ Prisma session timezone เป็น `Asia/Bangkok` ด้วย.

Compose publish app และ PostgreSQL เฉพาะ `127.0.0.1`; ไม่มี switch เปิด host port แบบ public. Next child bind loopback ภายใน container จึงเข้าตรงจาก network เพื่อข้าม gate ไม่ได้. Local CLI (`pnpm dev`, `pnpm start`) ต้องมี credential ด้วย; ให้ใช้ firewall/private host และเข้าจาก loopback. การเข้าจากภายนอกต้องผ่าน HTTPS reverse proxy หรือ SSH tunnel ที่ operator จัดไว้; `APP_ORIGIN` ยอมรับ HTTP เฉพาะ loopback. ห้าม expose Next child port, bypass launcher หรือ forward Basic credentials ผ่าน plaintext public network. Reverse proxy ต้อง preserve Host/Origin, ส่ง Authorization และรองรับ WebSocket; ตั้ง rate limit ที่ proxy เมื่อเปิด remote access. Docker host เป็น trusted boundary และผู้ใช้ Docker socket อ่าน secrets ได้.

## Configuration ใน root .env เท่านั้น

ตามการตัดสินใจล่าสุด ทุกค่า runtime และ credential อยู่ใน `.env` ที่ root ของ installation. ยกเลิก Docker secrets, secret mounts, secret directory และ `_FILE` injection แล้ว. Dev/UAT/Production แต่ละ installation ใช้ root `.env` และ data directory ของตัวเอง; ไม่แชร์ production credential กับ development และไม่สร้าง `.env.uat`/`.env.production` ใน installation เดียว.

1. ใช้ `.env.example` เป็น template; ตั้ง `APP_ENV`, `APP_PORT`, `APP_ORIGIN`, `POSTGRES_DATA_DIR`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `OWNER_GATE_USERNAME`, `OWNER_GATE_PASSWORD`, `GITLAB_BASE_URL`, `GITLAB_TOKEN`. ปรับ origin ให้ตรง URL ของ browser; localhost กับ 127.0.0.1 เป็นคนละ origin.
2. Owner password ต้องสุ่มอย่างน้อย 32 characters. แก้ `.env` ใน editor ที่ไม่เปิดเผยค่าใน logs/chat/history และจำกัด filesystem ACL ให้ operator ที่จำเป็น. `.env` ไม่เข้า git หรือ Docker image/build context.
3. Docker Compose อ่าน root `.env` และ inject เฉพาะค่า environment ที่แต่ละ service ต้องใช้; credentials ไม่ผ่าน build args และไม่ใช้ `env_file` เพื่อส่งทุกค่าโดยไม่จำเป็น. PostgreSQL/app/migrations/backup ใช้ `POSTGRES_*` จากไฟล์เดียวกัน. Container entrypoint สร้าง encoded DATABASE_URL จาก POSTGRES_* โดยใช้ internal postgres:5432; host POSTGRES_PORT ใช้ publish loopback เท่านั้น.
4. Local `pnpm dev/start/runtime:check` อ่าน root `.env`. ใช้ DATABASE_URL ที่ตั้งไว้ได้ หรือ derive จาก POSTGRES_* กับ host port เมื่อไม่ได้ตั้ง URL. `*_FILE` ของ credential ถูกปฏิเสธเพื่อไม่ให้แอบอ่าน secret file เก่า.
5. GitLab URL/token ต้องตั้งคู่กัน; ถ้ายังไม่เปิด integration ให้ทั้งสองค่าว่าง. URL ต้องเป็น server-only HTTPS canonical instance รวม base path และไม่มี embedded credential/query/fragment. ยังไม่มี outbound GitLab call ใน #15.
6. เลือก `read_api` และจำกัด Project/role ให้เห็นเฉพาะ Issues ที่อนุมัติ. ตรวจ confidential Issue visibility และ expiry ก่อน connector #20. ดู [GitLab token scopes](https://docs.gitlab.com/security/tokens/access_token_scopes/) และ [Issues API](https://docs.gitlab.com/api/issues/).

Git ignore ครอบคลุม `.env`/`.env.*`; Docker context exclude `.env*`, legacy secrets directory, backup และ persisted DB data. ห้าม credential ใน NEXT_PUBLIC_*. Runtime preflight ปฏิเสธ public credential variables. Launcher redact configured tokens/password/connection strings จาก stdout/stderr โดยสะสมจนจบแต่ละบรรทัด; oversized lines ถูกทิ้ง. Route/Prisma logs ไม่พิมพ์ raw DB exception/query values. ห้าม dump environment, raw Docker Compose config หรือ Docker inspect ใน shared logs เพราะ environment injection มี credentials. Legacy credential files ของผู้ใช้ไม่ได้ถูกลบอัตโนมัติ แต่ runtime/DB helpers ไม่อ่านอีก.

## Timezone และการตรวจโดยไม่พิมพ์ secrets

App, migrations, PostgreSQL และ backup ใช้ `TZ=Asia/Bangkok`; PostgreSQL server เริ่มด้วย `-c timezone=Asia/Bangkok`. Prisma URL ตั้ง `options=--timezone=Asia/Bangkok` (percent encoded) และ libpq operations ใช้ `PGTZ`/`PGOPTIONS`. Config นี้ใช้ได้กับ existing volume โดยไม่แก้ records/schema และไม่ต้อง init database ใหม่. PostgreSQL credentials ใน URL ถูก percent encode โดยไม่ตัด space/quote/special characters. การ parse/persist Bangkok calendar/wall-clock และ explicit Prisma native types ยังคงตาม contracts ของ issues ถัดไป; ห้าม normalize stored timestamps เป็น UTC.

คำสั่ง preflight สำหรับ local CLI:

```powershell
pnpm runtime:check
```

คืนเฉพาะ environment, timezone, gate enabled และ GitLab configured/disabled; ไม่คืน URL, token, token fragment หรือ secret path. ตรวจ effective Compose และ running app/PostgreSQL แบบ read-only:

```powershell
node scripts/runtime-verify.mjs docker-compose.yml
node scripts/runtime-verify.mjs docker-compose.uat.yml
node scripts/runtime-verify.mjs docker-compose.prod.yml
```

เลือกเฉพาะ environment ที่กำลังตรวจ. คำสั่งจับ raw Docker output ไว้ภายในและแสดง safe result/error; ไม่ start/deploy/migrate. ตรวจ host binding, mounted secret injection, app preflight และ `SHOW timezone` ของ PostgreSQL session. Health ยังตรวจ session ของ Prisma application จริงแยกอีกชั้น. Failure ต้องแก้ก่อนเปิด instance.

## Rotate/revoke และ rollback

1. สร้าง GitLab token ใหม่สำหรับ instance/Projects เดิม ด้วยสิทธิ์อ่านเดิมและ expiry ที่เหมาะสม; แก้ GITLAB_TOKEN ใน root `.env` ของ installation เดียว. ห้ามเปลี่ยน canonical URL เพื่อ rotate token.
2. บันทึก root `.env` และ recreate **app only** เพื่อให้ Compose inject ค่าใหม่ (`docker compose -f <compose-file> up -d --no-deps --force-recreate app`); production ต้องผ่าน operator confirmation ตาม process. Restart เพียงอย่างเดียวไม่เปลี่ยน environment ของ container ที่สร้างไว้แล้ว. ไม่ recreate migrations/DB และไม่ใช้ reset/seed.
3. รัน safe runtime verification; เมื่อ connector #20 พร้อมจึงตรวจ owner-triggered read/sync ที่อนุมัติ. จากนั้น revoke token เก่าใน GitLab. เหตุรั่วให้ revoke ทันที, disable integration (GITLAB_BASE_URL/GITLAB_TOKEN ว่างทั้งคู่), recreate app และตรวจระบบก่อนเปิดอีกครั้ง.
4. Owner gate rotation ใช้ credential ใหม่ใน root `.env` และ recreate app เช่นเดียวกัน; credential เก่าจะใช้ไม่ได้หลัง process เปลี่ยน. Browser อาจ cache Basic credential ให้ปิด session/browser แล้วกรอกค่าใหม่. Issue #17 ใช้ browser-managed Basic session; ไม่มี in-app logout.
5. Imported WorkItems, external references, Project mappings และ TimeEntries ไม่ถูกแก้/ลบจาก rotation/revocation. Rollback ใช้ image/config เดิมที่ยังมี gate; ห้าม rollback ไป image ที่ bypass gate. ไม่ downgrade schema หรือคืน credential ที่ revoke แล้ว.

## Verification evidence และ limitations

`pnpm test:runtime-security` ทดสอบ validation, root .env loading, fail-closed, HTTP owner gate/CSRF/WebSocket denial, safe responses/logs, child binding และ credential removal. `pnpm test:runtime-docker` ตรวจ effective Compose ทุก environment และ PostgreSQL/Prisma จริงใน disposable container ไม่มี host ports, production volumes หรือ migration. ใช้ image PostgreSQL 16 และ local migrations image ที่มี Prisma client; override ด้วย `PMS_PRISMA_TEST_IMAGE` ได้. `pnpm test` รวม tests ปกติและ skip Docker integration จนเรียก focused command.

การผ่าน synthetic tests ไม่ยืนยัน provisioning, ACL ของ `.env`, TLS/proxy หรือ token permissions ของ installation จริง. Operator ต้อง provision ค่าจริงและรัน safe verification ก่อน deploy. Owner User identity/session และ import connector ยังต้องทำใน #17/#20.

Production image smoke ใช้ `docker build --target production -t pms-issue15-validation .` แล้ว `pnpm test:runtime-container`; container ไม่มี host port, ใช้ network none หรือ network namespace ของ PostgreSQL ชั่วคราว และ ใช้ synthetic `.env` ผ่าน Docker --env-file เท่านั้น. ตรวจ gate หน้า Next standalone, health success/failure กับ PostgreSQL ชั่วคราว, client bundle/logs และ non-root image. ไม่ deploy หรือเชื่อมข้อมูลจริง.
