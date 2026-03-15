# รื้อใหม่ให้ใช้งานตอบแชทได้ (แบบ Salesmartly)

ทำตามลำดับนี้ใน **โปรเจกต์ Supabase เดียวกัน** และ **Worker ชุดเดียว** เพื่อให้โหลด channels → เห็นรายการแชท → เปิดแชท → ตอบกลับได้

---

## ขั้นที่ 1: Supabase – ฐานข้อมูลพร้อมใช้

### 1.1 เปิดโปรเจกต์ที่ใช้จริง

เปิด **Supabase Dashboard** ของโปรเจกต์ที่แอปใช้ (URL ที่อยู่ใน `wrangler.toml` หรือที่ตั้งใน Pages/Worker).

### 1.2 รัน Migration (สร้าง/ล้าง schema ใหม่)

ใน **SQL Editor** รันตามลำดับ:

1. **ลบของเก่า (ถ้าต้องการเริ่มศูนย์):**  
   เปิด `supabase/migrations/20260322000000_drop_all_tables.sql` → Copy ทั้งไฟล์ → วางใน SQL Editor → Run

2. **สร้าง schema ใหม่ทั้งหมด:**  
   เปิด `supabase/migrations/20260322000001_full_schema.sql` → Copy ทั้งไฟล์ → วางใน SQL Editor → Run

(ถ้าเคยรัน full_schema แล้วและแค่โหลด channels ไม่ได้ ให้ข้ามไปขั้น 1.3)

### 1.3 ตรวจว่า `get_my_role()` มีอยู่ (แก้ Error 1042)

ใน SQL Editor รัน:

```sql
SELECT routine_name FROM information_schema.routines
WHERE routine_name = 'get_my_role' AND routine_schema = 'public';
```

- **ไม่มีแถว** → Error 1042 มักมาจากจุดนี้ ให้เปิด `supabase/fix_channels_1042.sql` แล้วรัน **บล็อกข้อ 6 (ตั้งแต่ "รันบล็อกนี้เมื่อไม่มี get_my_role" ถึง "จบบล็อก")** ใน SQL Editor หรือรัน **full_schema ทั้งไฟล์** อีกครั้ง  
- **มีแถว** → ไปขั้นที่ 2

### 1.4 สร้าง User แรก + Role

1. **Authentication** → **Users** → **Add user** → สร้าง user (email + password)
2. Copy **UUID** ของ user
3. ใน **SQL Editor** รัน (แทนที่ `YOUR_USER_UUID` ด้วย UUID จริง):

```sql
INSERT INTO user_roles (user_id, role)
VALUES ('YOUR_USER_UUID'::uuid, 'super_admin')
ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin';
```

ถ้ามี user อยู่แล้ว แค่ให้มีแถวใน `user_roles` (ใช้คำสั่งด้านบนกับ UUID ของ user นั้น)

---

## ขั้นที่ 2: Cloudflare Worker – ตัวแปรต้องชี้โปรเจกต์นี้

1. เปิด **Cloudflare Dashboard** → **Workers & Pages** → เลือก Worker ของแอป
2. ไป **Settings** → **Variables and Secrets**
3. ตรวจให้ครบและถูกโปรเจกต์:
   - **SUPABASE_URL** = URL โปรเจกต์ Supabase (เช่น `https://xxxx.supabase.co`) — ต้องเป็นโปรเจกต์เดียวกับขั้นที่ 1
   - **SUPABASE_ANON_KEY** = Anon key จาก Supabase → **Settings** → **API**
   - **SUPABASE_SERVICE_ROLE_KEY** = Service role key จากหน้าเดียวกัน
4. ถ้าแก้ไข ให้กด **Save and Deploy**

(ถ้าใช้ `wrangler.toml` ใส่ SUPABASE_URL แล้ว ต้องเป็น URL ของโปรเจกต์เดียวกัน)

---

## ขั้นที่ 3: Frontend (Pages) – URL กับ Key ต้องตรง

1. **Workers & Pages** → เลือก **Pages** โปรเจกต์ของแอป
2. **Settings** → **Environment variables**
3. ตรวจว่า:
   - **NEXT_PUBLIC_SUPABASE_URL** = URL โปรเจกต์เดียวกับขั้นที่ 1
   - **NEXT_PUBLIC_SUPABASE_ANON_KEY** = Anon key ของโปรเจกต์นี้
   - **NEXT_PUBLIC_WORKER_URL** = URL ของ Worker (เช่น `https://xxx.workers.dev`)

ถ้าแก้แล้ว Save แล้ว trigger deploy ใหม่ถ้าจำเป็น

---

## ขั้นที่ 4: เพิ่ม Line OA (Channel) อย่างน้อย 1 ช่อง

1. ล็อกอินที่แอปด้วยบัญชี **super_admin**
2. ไป **Settings**
3. กด **Add Channel** แล้วใส่:
   - **Channel name** (ชื่อในระบบ)
   - **Channel ID** (จาก LINE Developers Console → Basic settings)
   - **Channel Access Token** และ **Channel Secret** (จาก Messaging API)
4. บันทึก
5. ใน LINE Developers Console → **Messaging API** → Webhook URL ใส่:  
   `https://YOUR-WORKER-URL/webhook`  
   (ใช้ Worker URL จากขั้นที่ 2)

ถ้ายังไม่เพิ่ม channel Dashboard จะโหลด channels ได้แต่รายการแชทจะว่างจนกว่าจะมีคนทักเข้ามา

---

## ขั้นที่ 5: ทดสอบการตอบแชท

1. เปิด **Dashboard** → กด **โหลดใหม่ (ล้าง cache)** ถ้ามีปุ่มนี้
2. ต้องโหลด channels ได้ (ไม่ขึ้น Error 1042) และเลือก channel ได้
3. เลือกแชทจากรายการซ้าย (หรือรอมีลูกค้าทัก Line เข้ามาก่อน)
4. พิมพ์ข้อความในช่องตอบแล้วส่ง

ถ้าทุกขั้นตรงกับโปรเจกต์เดียวกัน (Supabase เดียว, Worker ชุดเดียว, Frontend ชี้ Worker ถูก) ระบบจะใช้งานตอบแชทได้เหมือน Salesmartly: เห็นรายการแชท → เปิดแชท → ส่งข้อความกลับได้

---

## สรุปสาเหตุ Error 1042 ที่พบบ่อย

| สาเหตุ | วิธีแก้ |
|--------|--------|
| ไม่มีฟังก์ชัน `get_my_role()` ใน DB | รัน full_schema หรือบล็อกสร้าง get_my_role ใน `fix_channels_1042.sql` |
| Worker ใช้ SUPABASE_URL/ANON_KEY คนละโปรเจกต์ | ตั้ง Variables ใน Worker ให้เป็นโปรเจกต์เดียวกับที่รัน migration และที่ล็อกอิน |
| User ยังไม่มีแถวใน `user_roles` | INSERT ลง `user_roles` ตามขั้น 1.4 |

หลังแก้แล้วกด **โหลดใหม่ (ล้าง cache)** ใน Dashboard เสมอ
