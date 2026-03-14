# คู่มือ Deploy บน Cloudflare และเชื่อมต่อ GitHub

## วิธีที่ 1: Auto Deploy ผ่าน GitHub Actions (แนะนำ)

เมื่อ push ขึ้น `main` จะ deploy อัตโนมัติ

### ตั้งค่า GitHub Secrets ก่อน

ไปที่ **Settings** → **Secrets and variables** → **Actions** → เพิ่ม:

- `CLOUDFLARE_ACCOUNT_ID` — จาก Cloudflare Dashboard
- `CLOUDFLARE_API_TOKEN` — สร้างที่ My Profile → API Tokens (สิทธิ์ Workers + Pages)
- `NEXT_PUBLIC_SUPABASE_URL` — URL โปรเจกต์ Supabase
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Anon key
- `NEXT_PUBLIC_WORKER_URL` — URL Worker (เช่น `https://line-unified-inbox-worker.xxx.workers.dev`) — ใส่หลัง deploy Worker ครั้งแรก

### ตั้งค่า Worker Secrets (ครั้งเดียว)

Credentials เก็บใน DB — Worker ใช้แค่ Supabase:

```powershell
npx wrangler login
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

### สร้าง Pages Project ครั้งแรก

ไปที่ Cloudflare Dashboard → Workers & Pages → Create → Pages → Direct Upload → ชื่อ `line-unified-inbox`

---

## วิธีที่ 2: Deploy ด้วยมือ

## ขั้นตอนที่ 1: Login เข้า Cloudflare

เปิด Terminal/PowerShell แล้วรัน:

```powershell
cd c:\Users\ADMIN_JUN88\Desktop\line-oa
npx wrangler login
```

จะเปิดเบราว์เซอร์ให้ล็อกอิน Cloudflare (หรือใส่ API Token)

---

## ขั้นตอนที่ 2: Deploy Worker (Webhook + API)

### 2.1 ตั้งค่า Secrets (ต้องมีก่อน deploy)

```powershell
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

### 2.2 Deploy Worker

```powershell
npm run deploy:workers
```

เมื่อเสร็จจะได้ URL เช่น `https://line-unified-inbox-worker.xxxx.workers.dev`

**จำ URL นี้ไว้** — ใช้ตั้ง Webhook ใน Line Developers Console

---

## ขั้นตอนที่ 3: เชื่อมต่อ GitHub กับ Cloudflare Pages

### 3.1 เข้า Cloudflare Dashboard

1. ไปที่ https://dash.cloudflare.com
2. คลิก **Workers & Pages** ในเมนูด้านซ้าย
3. คลิก **Create application** → **Pages** → **Connect to Git**

### 3.2 เชื่อมต่อ GitHub

1. เลือก **GitHub** เป็น provider
2. ถ้ายังไม่เชื่อมต่อ — คลิก **Connect GitHub** แล้วอนุญาต Cloudflare
3. เลือก account: **arlott0410-alt**
4. เลือก repo: **line-oa**
5. คลิก **Begin setup**

### 3.3 ตั้งค่า Build

| ช่อง | ค่า |
|------|-----|
| **Project name** | `line-unified-inbox` (หรือชื่อที่ต้องการ) |
| **Production branch** | `main` |
| **Framework preset** | `None` (หรือ Next.js (Static HTML)) |
| **Build command** | `npm run build` |
| **Build output directory** | `out` |

### 3.4 ตั้งค่า Environment Variables

ไปที่ **Settings** → **Environment variables** → **Add variable**

เพิ่มตัวแปรเหล่านี้ (ทั้ง Production และ Preview):

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL โปรเจกต์ Supabase ของคุณ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key จาก Supabase |
| `NEXT_PUBLIC_WORKER_URL` | URL ของ Worker ที่ deploy แล้ว (เช่น `https://line-unified-inbox-worker.xxxx.workers.dev`) |

### 3.5 Save และ Deploy

คลิก **Save and Deploy** — Cloudflare จะ build และ deploy อัตโนมัติ

---

## ขั้นตอนที่ 4: ตั้งค่า Line Webhook

1. ไปที่ [Line Developers Console](https://developers.line.biz/console/)
2. เลือก Channel ของคุณ → แท็บ **Messaging API**
3. ใน **Webhook URL** ใส่: `https://line-unified-inbox-worker.xxxx.workers.dev/webhook`
4. เปิด **Use webhook** เป็น Enabled

---

## สรุป URL ที่ได้

- **Frontend (Pages)**: `https://line-unified-inbox.pages.dev` (หรือ custom domain)
- **Worker (API)**: `https://line-unified-inbox-worker.xxxx.workers.dev`
- **Webhook**: `https://line-unified-inbox-worker.xxxx.workers.dev/webhook`

---

## Auto Deploy จาก GitHub

เมื่อเชื่อมต่อ GitHub แล้ว ทุกครั้งที่คุณ **push** ขึ้น `main` Cloudflare จะ build และ deploy ใหม่อัตโนมัติ ไม่ต้องทำอะไรเพิ่ม
