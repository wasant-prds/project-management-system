# Production HTTPS certificate

Issue #38 เพิ่ม nginx สำหรับ production เท่านั้น. Development และ UAT ยังเข้าผ่าน loopback. App กับ PostgreSQL ไม่ถูกเปิดออกอินเทอร์เน็ต.

เส้นทางคือ Browser → Cloudflare → nginx พอร์ต 443 → owner gate → Next.js. nginx รับเฉพาะการเชื่อมต่อจาก IP ของ Cloudflare แล้วส่ง `Host`, `Origin`, `Authorization` และ WebSocket ต่อ. จำกัดอัตราคำขอที่ 10 ครั้งต่อวินาที และไม่เขียน `Authorization` ลง access log. เวลาใน log ของสคริปต์ใช้ `Asia/Bangkok`.

## ค่าที่ต้องมีใน root `.env`

สคริปต์อ่านเฉพาะ allowlist และไม่แก้ไฟล์นี้:

- `APP_ENV=prod`
- `APP_ORIGIN=https://<DOMAIN>` ตรงตัว ไม่ใส่พอร์ต
- `DOMAIN` ชื่อโดเมนตัวพิมพ์เล็กหนึ่งชื่อ
- `EMAIL` สำหรับ Let's Encrypt
- `CF_ZONE_ID` และ `CF_API_TOKEN`

Token ของ Cloudflare จำกัดที่ zone นี้ และใช้สิทธิ์ Zone DNS Read, Zone Settings Edit และ Config Rules Edit. อย่าใส่ token จริงใน git หรือ `.env.example`.

ก่อนรันสคริปต์ ให้ตั้ง `APP_ORIGIN` แล้ว recreate app container เช่น `bash scripts/docker-prod.sh restart` เพื่อให้ owner gate เห็น origin ใหม่.

## คำสั่งเดียวบน server

รันด้วย root เพราะ certbot เขียนไฟล์ใน container เป็น root. Production stack ต้องตอบ health ที่ loopback ก่อน และ timezone ของเครื่องต้องเป็น `Asia/Bangkok` ถ้าต้องการให้ติดตั้ง cron:

```bash
bash scripts/docker-prod.sh health
sudo CERTBOT_STAGING=1 bash infra/certbot/setup-https.sh --yes
sudo bash infra/certbot/setup-https.sh
```

ครั้งแรกควรรันด้วย `CERTBOT_STAGING=1` เพื่อซ้อมกับ staging CA. ใบนี้ไม่ถูกตั้งเป็น SSL strict ของ hostname และไม่ติดตั้ง cron. สคริปต์คืน zone SSL mode กลับเป็นค่าเดิม. ถ้ามี certificate จริงของโดเมนนี้อยู่แล้ว สคริปต์จะไม่ยอมออกใบ staging ทับ. เมื่อพร้อมให้ออกใบจริง ให้รันอีกครั้งโดยไม่ตั้ง `CERTBOT_STAGING`.

สคริปต์ถามยืนยันก่อน start หรือ reload nginx. `--yes` ใช้เมื่อไม่มี TTY. `renew` เป็นโหมดที่ cron เรียก, ต่ออายุเฉพาะใบของโดเมนนี้ และ reload nginx เฉพาะเมื่อไฟล์ certificate เปลี่ยน.

ถ้าขึ้นว่าอ่าน DNS จาก Cloudflare ไม่สำเร็จ ให้ดูบรรทัดรหัสถัดไป. `9109` คือ Zone ID ไม่ตรงหรือ token ไม่มี Zone DNS Read. `9106` คือ Cloudflare ไม่ได้รับหัว Authorization. `CF_ZONE_ID` ต้องเป็น Zone ID ในแถบขวาของหน้า Overview ของโดเมนนั้น ไม่ใช่ Account ID. `CF_API_TOKEN` ต้องเป็น API Token ไม่ใช่ Global API Key (`cfk_` หรือค่าที่เป็นเลขฐานสิบหกยาว). Token ต้องมีสิทธิ์ Zone DNS Read, Zone Settings Edit และ Config Rules Edit เฉพาะ zone นี้.

สิ่งที่สคริปต์ทำ: ตรวจ `APP_ORIGIN`, DNS แบบเมฆสีส้ม, พอร์ต 80/443, health บน loopback, สร้าง self-signed ชั่วคราวถ้ายังไม่มีใบ, start nginx, อ่าน zone SSL mode แล้วสลับเป็น `full` ชั่วคราวเฉพาะเมื่อค่าเดิมเป็น `strict`, ขอใบด้วย HTTP-01, deploy, reload, คืน zone SSL mode เดิม, ตั้ง configuration rule ให้ hostname นี้เป็น `strict` โดยไม่เปลี่ยนโหมดของ hostname อื่น, ติดตั้ง cron เวลา 03:15 และ 15:15, แล้วตรวจ `https://<DOMAIN>/api/health`. ถ้า health ไม่ผ่าน สคริปต์เอา rule ของ hostname นี้ออก และไม่เปลี่ยน zone SSL mode ทั้งโซน.

รันซ้ำได้. `--keep-until-expiring` ป้องกันการออกใบซ้ำเมื่อใบเดิมยังไม่ใกล้หมดอายุ. หลังออกใบจริงแล้ว สคริปต์ลบ lineage ของ staging เพื่อไม่ให้การต่ออายุใบอื่นทำให้ใบจริงไม่ถูก deploy.

## หลังติดตั้ง

- `docker-prod.sh start` และ `start-backup` เปิด profile `https` เมื่อ `infra/nginx/certs/fullchain.pem` และ `privkey.pem` มีข้อมูลแล้ว. คำสั่งนี้ไม่ขอใบใหม่และไม่เรียก Cloudflare
- `docker-prod.sh stop` รวม profile `https` จึงลบ nginx ด้วย. ไฟล์ใบอยู่บน disk. `start` ครั้งถัดไปนำ nginx กลับมาเมื่อไฟล์ใบยังอยู่
- cron อยู่ที่ `/etc/cron.d/pms-https` และรันในนาม root เมื่อ timezone ของเครื่องเป็น `Asia/Bangkok`. รายละเอียดการต่ออายุอยู่ใน [HTTPS renew](../jobs/operations/https-renew.md)
- log การต่ออายุอยู่ที่ `infra/certbot/logs/renew.log`
- ควรจำกัด firewall ของเครื่องให้รับพอร์ต 80 และ 443 จากช่วง IP ของ Cloudflare ด้วย nginx เป็นด่านในแอป

## สิ่งที่สคริปต์ไม่ทำ

ไม่แก้ `.env`, ไม่ migrate, ไม่ seed และไม่ restart PostgreSQL. ถ้า `APP_ORIGIN` ไม่ตรง สคริปต์จะหยุดและบอกค่าที่ต้องตั้ง.
