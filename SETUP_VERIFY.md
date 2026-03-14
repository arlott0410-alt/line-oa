# ตรวจสอบ Setup เมื่อฟีเจอร์ใช้งานไม่ได้

ถ้า Dashboard แสดง error หรือกดอะไรไม่ได้ ให้ตรวจสอบตามลำดับ:

---

## 1. รัน Migrations ใน Supabase

ตาราง `user_roles` และ `channels` ต้องมีก่อน ถึงจะใช้งานได้

1. ไปที่ **Supabase Dashboard** → **SQL Editor**
2. รัน migrations ตามลำดับ (copy จากไฟล์):

```
supabase/migrations/20260313000000_initial_schema.sql
supabase/migrations/20260313000001_add_channels.sql
supabase/migrations/20260314000000_add_image_support.sql
```

**ถ้า Error 500 บน user_roles:** รัน `supabase/quick_fix_user_roles.sql` ใน SQL Editor ก่อน

หรือใช้คำสั่ง:
```bash
supabase db push
```

---

## 2. สร้าง User แรกและตั้ง Role

1. Supabase → **Authentication** → **Users** → **Add user**
2. สร้าง user (email + password)
3. Copy **UUID** ของ user
4. SQL Editor รัน:
```sql
INSERT INTO user_roles (user_id, role) VALUES ('ใส่-UUID-ที่นี่', 'super_admin');
```

---

## 3. ตั้งค่า Worker (Cloudflare)

Worker ต้องมี **3 ค่า** ครบ:

| Name | วิธีตั้ง |
|------|----------|
| `SUPABASE_URL` | อยู่ใน `wrangler.toml` แล้ว — deploy ไปอัตโนมัติ |
| `SUPABASE_ANON_KEY` | `npm run setup:secrets` หรือ Dashboard → Variables → Secret |
| `SUPABASE_SERVICE_ROLE_KEY` | `npm run setup:secrets` หรือ Dashboard → Variables → Secret |

**วิธีที่ไม่อ่านผิด (แนะนำ):**
1. Regenerate keys ใน Supabase (Settings → API → Reset keys) — เพราะ keys เดิมถูกแชร์แล้ว
2. รัน `npm run setup:secrets` แล้วใส่ ANON_KEY และ SERVICE_ROLE_KEY
3. รัน `npm run deploy:workers` — จะ deploy พร้อม vars จาก wrangler.toml และ secrets ที่ตั้งไว้

---

## 4. ตั้งค่า Frontend (Pages)

ใน Cloudflare Pages → **Settings** → **Environment variables**:

| Name | Value |
|------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | ต้องตรงกับ Worker (Project URL เดียวกัน) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key |
| `NEXT_PUBLIC_WORKER_URL` | URL ของ Worker เช่น `https://line-oa-worker.xxxx.workers.dev` |

---

## 5. ตรวจสอบ Error ใน Browser

เปิด DevTools → **Network** → คลิก request ที่สีแดง (failed) → ดู **Response** tab

- `relation "user_roles" does not exist` → รัน migration
- `Server config error` → Worker ไม่มี SUPABASE_URL
- `Failed to fetch channels` + detail → ดูข้อความใน detail
