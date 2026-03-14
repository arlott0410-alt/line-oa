-- Fix: infinite recursion in RLS policies on user_roles
-- สาเหตุ: policy "super_admin can manage user_roles" ใช้ EXISTS (SELECT FROM user_roles)
-- ทำให้ตอนตรวจสอบสิทธิ์ต้อง query user_roles อีกครั้ง → recursion
-- วิธีแก้: ใช้ SECURITY DEFINER function ที่ bypass RLS

-- 1. สร้าง function ที่อ่าน role ได้โดยไม่ trigger RLS
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM user_roles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- 2. แก้ policy บน user_roles ให้ใช้ function แทน
DROP POLICY IF EXISTS "super_admin can manage user_roles" ON user_roles;
CREATE POLICY "super_admin can manage user_roles"
  ON user_roles FOR ALL TO authenticated
  USING (public.get_my_role() = 'super_admin')
  WITH CHECK (public.get_my_role() = 'super_admin');

-- 3. แก้ policy บน channels ที่อ้างอิง user_roles
DROP POLICY IF EXISTS "super_admin can manage channels" ON channels;
CREATE POLICY "super_admin can manage channels"
  ON channels FOR ALL TO authenticated
  USING (public.get_my_role() = 'super_admin')
  WITH CHECK (public.get_my_role() = 'super_admin');

DROP POLICY IF EXISTS "admin and viewer can read channels" ON channels;
CREATE POLICY "admin and viewer can read channels"
  ON channels FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('super_admin', 'admin', 'viewer'));

-- 4. แก้ policy บน line_users
DROP POLICY IF EXISTS "admin viewer select line_users" ON line_users;
CREATE POLICY "admin viewer select line_users"
  ON line_users FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('super_admin', 'admin', 'viewer'));

DROP POLICY IF EXISTS "admin insert update line_users" ON line_users;
CREATE POLICY "admin insert update line_users"
  ON line_users FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() IN ('super_admin', 'admin'));

DROP POLICY IF EXISTS "admin update line_users" ON line_users;
CREATE POLICY "admin update line_users"
  ON line_users FOR UPDATE TO authenticated
  USING (public.get_my_role() IN ('super_admin', 'admin'));

-- 5. แก้ policy บน messages
DROP POLICY IF EXISTS "admin viewer select messages" ON messages;
CREATE POLICY "admin viewer select messages"
  ON messages FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('super_admin', 'admin', 'viewer'));

DROP POLICY IF EXISTS "admin insert messages" ON messages;
CREATE POLICY "admin insert messages"
  ON messages FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() IN ('super_admin', 'admin'));

DROP POLICY IF EXISTS "admin update messages" ON messages;
CREATE POLICY "admin update messages"
  ON messages FOR UPDATE TO authenticated
  USING (public.get_my_role() IN ('super_admin', 'admin'));
