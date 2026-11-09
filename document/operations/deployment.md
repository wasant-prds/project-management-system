# Deployment

ใช้ root .env จาก .env.example เพียงไฟล์เดียว และเลือก APP_ENV เป็น local/dev/uat/prod. กำหนด APP_ORIGIN ให้ตรง scheme/host/port จริง. ห้ามใส่ secrets ใน build args หรือ NEXT_PUBLIC_*

```sh
docker compose up -d --build
docker compose -f docker-compose.uat.yml up -d --build
docker compose -f docker-compose.prod.yml up -d --build
```

Compose รวม postgres → database-init → app. Initializer รอ PostgreSQL healthy และ app รอ initializer exit 0. Target database-tools อ่าน schema.sql และสร้างเฉพาะฐานว่างที่ DB_SCHEMA_SYNC_APPROVED=true. ฐานที่ checksum/schema ไม่ตรงจะหยุดโดยไม่ลบข้อมูล. RUN_SEED ค่าเริ่มต้น false; fresh approved seeds ใช้ SEED_PATH=database/seeds/sql-master เท่านั้น

postgres_data ใช้ POSTGRES_DATA_DIR บน host. อย่าใช้ docker compose down -v หรือลบ directory เพื่อทดสอบ. ใช้ isolated tests ตาม [Database workflow](../../database/README.md)

Application และ PostgreSQL bind host loopback ตาม compose. NEXT_PUBLIC_ENV ถูก bake ตอน build. App ใช้ pg pool สูงสุด 5 connections. วันที่ใช้ Asia/Bangkok ทั้ง application/session/database

Production HTTPS ใช้ nginx profile https; certificate setup/renewal อยู่ใน infra/certbot. ดู [Docker commands](../development/docker.md) และ [HTTPS](./https.md)

หลัง deployment ตรวจ app/PostgreSQL running, database-init exited:0, /api/health เป็น 200 และทดสอบ public UUID/owner ของ Work Items กับ Daily Work. การ deploy หรือย้ายฐานใช้งานจริงต้องมี approval และ fresh verified baseline แยกจากการ build/test code
