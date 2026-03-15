-- แก้ปัญหา "ไม่สามารถโหลด channels ได้" / error code 1042
-- สาเหตุส่วนใหญ่: User ที่ login ยังไม่มี role ในตาราง user_roles จึงถูก RLS บล็อก
--
-- วิธีใช้: เปิด Supabase Dashboard → SQL Editor → วางแล้วรันทีละบล็อก

-- 1) ดู User ทั้งหมดในระบบ (หาค่า user_id ของคุณจาก email)
SELECT id, email, created_at FROM auth.users ORDER BY created_at DESC;

-- 2) ดูว่ามีใครมี role บ้าง
SELECT ur.user_id, ur.role, u.email
FROM user_roles ur
JOIN auth.users u ON u.id = ur.user_id;

-- 3) ใส่ role ให้ User ของคุณ (แทนที่ YOUR_USER_ID_UUID ด้วย id จากข้อ 1)
--    ตัวอย่าง: ถ้า id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
INSERT INTO user_roles (user_id, role)
VALUES ('YOUR_USER_ID_UUID'::uuid, 'super_admin')
ON CONFLICT (user_id) DO UPDATE SET role = 'super_admin';

-- 4) ถ้ายัง error อยู่ ให้ตรวจสอบว่า function get_my_role มีอยู่ (รัน migration 20260314000001_fix_user_roles_rls_recursion.sql ก่อน)
-- SELECT public.get_my_role();
