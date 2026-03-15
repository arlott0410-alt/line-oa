-- แก้ปัญหา "ไม่สามารถโหลด channels ได้" / error code 1042
-- วิธีใช้: เปิด Supabase Dashboard → SQL Editor → วางแล้วรันทีละบล็อก

-- ========== กรณีที่ 1: ตรวจว่าใครมี role บ้าง ==========
-- 1) ดู User ทั้งหมดในระบบ
SELECT id, email, created_at FROM auth.users ORDER BY created_at DESC;

-- 2) ดูว่ามีใครมี role บ้าง
SELECT ur.user_id, ur.role, u.email
FROM user_roles ur
JOIN auth.users u ON u.id = ur.user_id;

-- 3) ถ้ามีคนที่ยังไม่มี role ให้ใส่ (แทนที่ YOUR_USER_ID_UUID ด้วย id จากข้อ 1)
INSERT INTO user_roles (user_id, role)
VALUES ('YOUR_USER_ID_UUID'::uuid, 'super_admin')
ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin';


-- ========== กรณีที่ 2: ทุกคนมี role แล้วแต่ยัง error 1042 ==========
-- สาเหตุที่เป็นไปได้: (ก) ยังไม่มี function get_my_role หรือ policy ใช้แบบเก่า (ข) Worker ใช้ URL/Key คนละโปรเจกต์

-- 4) ตรวจว่า function get_my_role มีอยู่หรือไม่ (ต้องมี)
SELECT routine_name, routine_schema
FROM information_schema.routines
WHERE routine_name = 'get_my_role' AND routine_schema = 'public';
-- ถ้าไม่มีแถว = ต้องรัน migration: supabase/migrations/20260322000001_full_schema.sql

-- 5) ตรวจว่า policy บน channels ใช้ get_my_role หรือไม่
SELECT policyname, cmd, qual
FROM pg_policies
WHERE tablename = 'channels';
-- ควรเห็น policy "admin and viewer can read channels" และ qual มี get_my_role()

-- 6) ถ้า get_my_role ไม่มี → รัน migration 20260322000001_full_schema.sql (หรือรัน full_schema ทั้งไฟล์)
-- CREATE OR REPLACE FUNCTION public.get_my_role()
-- RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
-- AS $$ SELECT role FROM user_roles WHERE user_id = auth.uid() LIMIT 1; $$;
--
-- DROP POLICY IF EXISTS "admin and viewer can read channels" ON channels;
-- CREATE POLICY "admin and viewer can read channels"
--   ON channels FOR SELECT TO authenticated
--   USING (public.get_my_role() IN ('super_admin', 'admin', 'viewer'));

-- 7) ตรวจนอก Supabase: ใน Cloudflare Worker → Settings → Variables
--    SUPABASE_URL ต้องเป็น URL ของโปรเจกต์นี้ (เช่น https://xxxx.supabase.co)
--    SUPABASE_ANON_KEY ต้องเป็น anon key ของโปรเจกต์นี้ (Supabase → Settings → API)
--    ถ้าใช้คนละโปรเจกต์ JWT ที่ส่งมาจาก Frontend จะไม่ตรงกับ REST API → error ได้

-- ========== กรณีที่ 3: พึ่งผูก KV แล้วโหลด channels ไม่ได้ ==========
-- เวลาผูก KV หรือกด Save and Deploy ใหม่ Cloudflare อาจ deploy Worker ใหม่และตัวแปรอาจหาย
-- ทำตามนี้:
-- 1) เปิด Cloudflare Dashboard → Worker ของคุณ → Settings → Variables and Secrets
-- 2) ตรวจว่ามี SUPABASE_URL และ SUPABASE_ANON_KEY (ค่าต้องเป็นของโปรเจกต์ Supabase นี้)
-- 3) ถ้าไม่มีหรือผิด ให้ Add/Edit ให้ถูก แล้วกด Save and Deploy
-- 4) ในแอป Dashboard กด "โหลดใหม่ (ล้าง cache)"
