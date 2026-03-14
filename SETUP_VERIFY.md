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
| `SUPABASE_URL` | แก้ใน `wrangler.toml` แล้ว run `npx wrangler deploy` หรือใส่ใน Dashboard |
| `SUPABASE_ANON_KEY` | Dashboard → Variables → Secret |
| `SUPABASE_SERVICE_ROLE_KEY` | Dashboard → Variables → Secret |

**Deploy Worker:** ถ้าแก้ wrangler.toml แล้ว ต้อง run `npx wrangler deploy` เพื่อให้ SUPABASE_URL ถูก deploy ไป (ไม่ใช้แค่ copy-paste โค้ด)

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
