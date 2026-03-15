# ขั้นตอนการสร้างยูสใหม่

มี 2 กรณี: **สร้าง user คนแรก (super_admin)** กับ **สร้าง user คนถัดไป**

---

## 1. สร้าง User คนแรก (Super Admin)

ใช้เมื่อยังไม่มีใครมี role `super_admin` ในระบบ (เช่นติดตั้งใหม่)

1. เปิด **Supabase Dashboard** → **Authentication** → **Users**
2. กด **Add user** → **Create new user**
   - ใส่ **Email** และ **Password**
   - (ถ้ามี) เปิด **Auto Confirm User** เพื่อไม่ต้องยืนยันอีเมล
3. หลังสร้างแล้ว ให้ copy **UUID** ของ user (คอลัมน์ UID หรือกดเข้าไปดู)
4. ไปที่ **SQL Editor** → วางแล้วรัน (แทนที่ `YOUR_USER_UUID` ด้วย UUID จริง):

```sql
INSERT INTO user_roles (user_id, role)
VALUES ('YOUR_USER_UUID'::uuid, 'super_admin')
ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin';
```

5. ล็อกอินที่แอป Dashboard ด้วย email/password ที่สร้าง
6. ไป **Settings** เพื่อ Add Channel (ผูก Line OA) ตามต้องการ

---

## 2. สร้าง User คนถัดไป (ผ่านหน้า Users)

เมื่อมี **super_admin** แล้ว ให้ใช้หน้าในแอป:

1. ล็อกอินด้วยบัญชี **super_admin**
2. ไปที่ **Users** ในแถบด้านซ้าย
3. กด **Add user**
4. ใส่:
   - **Email**
   - **Password**
   - **Role**: `super_admin` / `admin` / `viewer`
   - (ถ้าต้องการ) **Display name** สำหรับแสดงในระบบ
5. กดสร้าง → ระบบจะสร้าง user ใน Supabase Auth และใส่ role ใน `user_roles` ให้อัตโนมัติ

จากนั้น user คนใหม่สามารถล็อกอินด้วย email/password ที่ตั้งไว้ได้เลย

---

## สรุป Role

| Role         | สิทธิ์หลัก |
|-------------|------------|
| super_admin | ครบ: จัดการ Users, Settings, แชท, คิว |
| admin       | Dashboard, คิว, แชท, ส่งข้อความ (ไม่เข้า Users/Settings) |
| viewer      | ดู Dashboard และแชทอย่างเดียว (ไม่ส่งข้อความ) |

---

## ถ้าโหลด channels ไม่ได้ (Error 1042)

ถ้า user มีอยู่แล้วแต่ล็อกอินแล้วโหลด channels ไม่ได้ มักเป็นเพราะ **ยังไม่มีแถวใน `user_roles`**  
→ ทำตามขั้นตอนใน `supabase/fix_channels_1042.sql` (ดู user id จาก `auth.users` แล้ว INSERT ลง `user_roles`)
