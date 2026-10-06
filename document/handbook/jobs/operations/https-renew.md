# HTTPS certificate renew

## Overview

ต่ออายุ Let's Encrypt certificate ของ production hostname เดียว แล้ว copy ไฟล์ใบเข้า nginx เฉพาะเมื่อไฟล์เปลี่ยน. งานนี้เป็น cron บน Linux host ที่เรียก `infra/certbot/setup-https.sh renew`. ไม่มี application queue หรือ worker. ไม่เรียก Cloudflare และไม่แตะฐานข้อมูล.

ขั้นตอนออกใบครั้งแรกอยู่ใน [HTTPS certificate](../../operations/https.md).

## Trigger

สคริปต์ติดตั้ง `/etc/cron.d/pms-https` หลังออกใบจริงและตรวจ `https://<DOMAIN>/api/health` ได้ 200. ติดตั้งเมื่อรันด้วย root และ timezone ของเครื่องเป็น `Asia/Bangkok`. ใบ staging ไม่ติดตั้ง cron.

```cron
15 3,15 * * * root cd <repository> && TZ=Asia/Bangkok bash infra/certbot/setup-https.sh renew >> infra/certbot/logs/renew.log 2>&1
```

เวลานี้เป็นเวลาท้องถิ่นของเครื่อง. ไฟล์ cron ไม่มี `CRON_TZ`. คำสั่งในบรรทัดตั้ง `TZ=Asia/Bangkok` ให้ process ของสคริปต์.

รันเองได้ด้วย:

```bash
sudo bash infra/certbot/setup-https.sh renew
```

`renew` ไม่ถามยืนยันก่อน reload nginx.

## Input

สคริปต์อ่าน allowlist จาก root `.env` และไม่แก้ไฟล์นั้น.

| Name | Required | Description |
| --- | --- | --- |
| `DOMAIN` | Required | ชื่อโดเมนตัวพิมพ์เล็ก. โหมด renew ใช้ชื่อนี้เป็น `--cert-name` เมื่อ `CERTBOT_STAGING` ไม่ใช่ `1` |
| `APP_ENV` | Required | ต้องเป็น `prod` |
| `APP_ORIGIN` | Required | ต้องเป็น `https://<DOMAIN>` ตรงตัว |
| `APP_PORT` | Optional | พอร์ต loopback ของแอป. ค่าเริ่มต้น `3000`. โหมด renew ไม่ได้เรียก health ก่อนต่ออายุ |
| `CERTBOT_STAGING` | Optional | `0` หรือ `1`. ค่าเริ่มต้น `0`. ถ้าเป็น `1` และมีใบจริงอยู่แล้ว สคริปต์หยุดก่อนต่ออายุ |
| `CERTBOT_IMAGE` | Optional | image ของ certbot. ค่าเริ่มต้น `certbot/certbot:v5.8.0` |
| `COMPOSE_FILE` | Optional | ต้องเป็น `docker-compose.prod.yml` เมื่อกำหนดค่า |

`EMAIL`, `CF_API_TOKEN` และ `CF_ZONE_ID` ไม่ถูกใช้ในโหมด renew. ค่าอื่นใน `.env` ไม่ถูก export.

## Processing flow

cron หรือคำสั่ง `renew`
→ ตรวจว่าเป็น root
→ อ่าน allowlist และตรวจ `APP_ORIGIN`
→ ถ้าเป็น staging และมี lineage ของใบจริง หยุด
→ `flock` ที่ `infra/certbot/logs/setup.lock` เมื่อเครื่องมี `flock`
→ `certbot renew --cert-name <CERT_NAME> --quiet --non-interactive`
→ เทียบ mtime ของ `fullchain.pem`
→ ถ้าเปลี่ยน จึง copy ใบเข้า `infra/nginx/certs` แล้ว `nginx -t` และ reload
→ ถ้าไม่เปลี่ยน ไม่ reload

`--cert-name` ทำให้ต่ออายุเฉพาะใบของ hostname นี้. certbot จะขอใบใหม่เมื่อใบใกล้หมดอายุตามกติกาของ Let's Encrypt.

## Database impact

ไม่มีตารางที่ถูกอ่านหรือเขียน. ไฟล์ที่เปลี่ยนได้คือ lineage ใน `infra/certbot/conf`, ใบที่ nginx ใช้ใน `infra/nginx/certs` และบรรทัด mtime ที่ `.deployed-mtime`.

## Retry / Failure handling

ไม่มี retry counter ในสคริปต์. cron รอบถัดไปคือ 03:15 หรือ 15:15 ของวันเดียวกันหรือวันถัดไป. ถ้า `certbot renew` จบไม่สำเร็จ สคริปต์หยุดก่อน copy ใบเดิมทับ. ถ้ามีคำสั่ง HTTPS อื่นถือ lock อยู่ คำสั่งนี้จบด้วยข้อความว่ามีงานอื่นกำลังทำงาน. ถ้าเครื่องไม่มี `flock` สคริปต์ทำงานต่อโดยไม่ล็อก.

ถ้า `CERTBOT_STAGING=1` ค้างใน `.env` หลังมีใบจริง โหมด renew จะหยุดและไม่ deploy ใบ staging ทับใบที่ nginx ใช้อยู่.

## Logging / Monitoring

stdout และ stderr ของ cron ต่อท้าย `infra/certbot/logs/renew.log`. บรรทัด log ของสคริปต์มีเวลา `Asia/Bangkok`. ไม่พิมพ์ `CF_API_TOKEN` หรือ `Authorization`.

ตรวจ container:

```bash
docker ps --filter name=pms-nginx-prod
```

ตรวจจากภายนอกด้วย `GET /api/health` ตาม [Health check](../../api/system/health.md). ผ่าน nginx แล้วต้องได้ HTTP 200.

## Verification

- `pnpm test:https` ตรวจว่า renew ส่ง `--cert-name`, ไม่ออก staging ทับใบจริง, reload เฉพาะเมื่อ mtime เปลี่ยน, และเขียน cron เฉพาะเมื่อ timezone เป็น `Asia/Bangkok`
- `pnpm test:https-docker` ตรวจว่า config ของ nginx ผ่าน `nginx -t`. Suite นี้ไม่รันใน `pnpm test` จนกว่าจะเรียก `pnpm test:https-docker`
- บน server: รัน `sudo bash infra/certbot/setup-https.sh renew` แล้วตรวจ `infra/certbot/logs/renew.log` ว่าไม่มีใบถูก reload เมื่อไฟล์ไม่เปลี่ยน
- ยังไม่ได้รัน cron นี้บน server จริง จึงยังไม่ยืนยันการต่ออายุกับ Let's Encrypt
