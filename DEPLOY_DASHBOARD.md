# Deploy ผ่าน Cloudflare Dashboard (ไม่ใช้ Wrangler)

คู่มือนี้สำหรับ deploy ทั้ง **Worker** และ **Pages** ผ่าน Cloudflare Dashboard โดยไม่ต้องใช้ wrangler CLI

---

## ⚠️ สิ่งสำคัญ: Variables และ Secrets

**การ push โค้ดหรือ auto-deploy จะไม่ทับ Variables และ Secrets ที่ตั้งใน Dashboard**

- **Worker**: Secrets เก็บแยกใน Cloudflare — การ deploy โค้ดใหม่จะไม่เปลี่ยนค่า
- **Pages**: Environment variables ใน Dashboard จะไม่ถูก overwrite โดยการ deploy

ค่าที่ตั้งใน Dashboard จะคงอยู่จนกว่าคุณจะแก้ไขเอง

---

## สิ่งที่ต้องเตรียมก่อน

1. สร้างโปรเจกต์ Supabase และรัน migrations
2. สร้าง user ใน Supabase Auth และตั้ง role เป็น `super_admin` ใน `user_roles`
3. เพิ่ม channel ผ่าน Settings หลัง login

---

## ส่วนที่ 1: Deploy Worker

### ขั้นตอนที่ 1: Build Worker

```powershell
cd c:\Users\ADMIN_JUN88\Desktop\line-oa
npm install
npm run build:worker
```

จะได้ไฟล์ `dist/worker.js`

### ขั้นตอนที่ 2: สร้าง Worker ใน Cloudflare Dashboard

1. ไปที่ https://dash.cloudflare.com
2. **Workers & Pages** → **Create** → **Create Worker**
3. ตั้งชื่อ: `line-unified-inbox-worker` (หรือชื่อที่ต้องการ)
4. คลิก **Deploy** (สร้าง Worker ว่างก่อน)

### ขั้นตอนที่ 3: แก้ไขโค้ด

1. คลิก **Edit code** (หรือ **Quick Edit**)
2. ลบโค้ดทั้งหมดในไฟล์ `index.js` (หรือ `worker.js`)
3. เปิดไฟล์ `dist/worker.js` ที่ build ได้
4. คัดลอกเนื้อหาทั้งหมดไปวางใน editor
5. คลิก **Save and Deploy**

### ขั้นตอนที่ 4: ตั้งค่า Variables (Secrets)

1. ไปที่ Worker → **Settings** → **Variables and Secrets**
2. คลิก **Add variable** → **Secret**
3. เพิ่ม:

| Name | Value |
|------|-------|
| `SUPABASE_URL` | URL โปรเจกต์ Supabase (เช่น https://xxx.supabase.co) |
| `SUPABASE_ANON_KEY` | Anon key จาก Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key จาก Supabase |

**หมายเหตุ:** Credentials ของ Line OA เก็บใน DB (channels table) ไม่ต้องใส่ใน Worker

### ขั้นตอนที่ 5: ตั้งค่า Compatibility

1. ไปที่ **Settings** → **Compatibility**
2. **Compatibility date**: `2026-03-01` (หรือใหม่กว่า)
3. **Compatibility flags**: เพิ่ม `nodejs_compat` (ถ้ามี)

### ขั้นตอนที่ 6: จำ Worker URL

หลัง deploy จะได้ URL เช่น `https://line-unified-inbox-worker.xxxx.workers.dev`

**ใช้ URL นี้:** ตั้งเป็น Webhook ใน Line Developers Console → `https://YOUR-WORKER-URL/webhook`

---

## ส่วนที่ 2: Deploy Pages (Frontend)

### ขั้นตอนที่ 1: Build Frontend

```powershell
cd c:\Users\ADMIN_JUN88\Desktop\line-oa
npm run build
```

จะได้โฟลเดอร์ `out/`

### ขั้นตอนที่ 2: สร้าง Pages Project ผ่าน Dashboard

1. ไปที่ https://dash.cloudflare.com
2. **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
3. เลือก **GitHub** → อนุญาต → เลือก repo **line-oa**
4. คลิก **Begin setup**

### ขั้นตอนที่ 3: ตั้งค่า Build

| ช่อง | ค่า |
|------|-----|
| **Project name** | `line-unified-inbox` |
| **Production branch** | `main` |
| **Framework preset** | `None` |
| **Build command** | `npm run build` |
| **Build output directory** | `out` |

### ขั้นตอนที่ 4: Environment Variables

ไปที่ **Settings** → **Environment variables** → **Add variable**

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL โปรเจกต์ Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key |
| `NEXT_PUBLIC_WORKER_URL` | URL ของ Worker (เช่น `https://line-unified-inbox-worker.xxxx.workers.dev`) |

### ขั้นตอนที่ 5: Save และ Deploy

คลิก **Save and Deploy** — Cloudflare จะ build และ deploy อัตโนมัติ

---

## อัปเดต Worker เมื่อมีการแก้ไข

เมื่อแก้ไขโค้ด Worker:

```powershell
npm run build:worker
```

จากนั้นไปที่ **Cloudflare Dashboard** → Worker → **Edit code** → วางโค้ดจาก `dist/worker.js` ใหม่ → **Save and Deploy**

---

## สรุป URL ที่ได้

- **Frontend**: `https://line-unified-inbox.pages.dev` (หรือ custom domain)
- **Worker**: `https://line-unified-inbox-worker.xxxx.workers.dev`
- **Webhook**: `https://line-unified-inbox-worker.xxxx.workers.dev/webhook`

---

## Auto Deploy จาก GitHub

เมื่อเชื่อมต่อกับ GitHub แล้ว ทุกครั้งที่ **push** ขึ้น `main`:

- **Pages**: Cloudflare จะ build และ deploy อัตโนมัติ (ถ้าเชื่อม Git ไว้ใน Dashboard)
- **Worker**: จะ deploy อัตโนมัติ (ถ้าเชื่อม Git ไว้ใน Dashboard)

**Variables และ Secrets ที่ตั้งใน Dashboard จะไม่ถูกทับ** — ค่าเดิมยังใช้ได้หลัง deploy ใหม่
