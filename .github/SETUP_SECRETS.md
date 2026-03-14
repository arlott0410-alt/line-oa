# ตั้งค่า GitHub Secrets สำหรับ Auto Deploy

ไปที่ **GitHub repo** → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

เพิ่ม Secrets เหล่านี้:

## บังคับ (สำหรับ Deploy)

| Secret Name | ค่าที่ใส่ | วิธีหา |
|-------------|----------|--------|
| `CLOUDFLARE_ACCOUNT_ID` | Account ID | Cloudflare Dashboard → ด้านขวา Overview |
| `CLOUDFLARE_API_TOKEN` | API Token | Cloudflare Dashboard → My Profile → API Tokens → Create Token (เลือก template "Edit Cloudflare Workers" + "Edit Cloudflare Pages") |

## สำหรับ Build Frontend (Pages)

| Secret Name | ค่าที่ใส่ |
|-------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | URL โปรเจกต์ Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key จาก Supabase |
| `NEXT_PUBLIC_WORKER_URL` | URL ของ Worker (เช่น `https://line-unified-inbox-worker.xxxx.workers.dev`) — ใส่หลัง deploy Worker ครั้งแรก |

## Worker Secrets (ตั้งใน Cloudflare)

Credentials เก็บใน DB (channels table) — Worker ใช้แค่ Supabase:

```powershell
npx wrangler login
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_ANON_KEY
npx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

## สร้าง Pages Project ครั้งแรก

ถ้ายังไม่มี project **line-unified-inbox** ใน Cloudflare:

1. ไปที่ https://dash.cloudflare.com
2. Workers & Pages → Create → Pages → Direct Upload
3. Project name: `line-unified-inbox`
4. สร้าง project แล้ว workflow จะ deploy ได้
