-- รันไฟล์นี้ใน Supabase SQL Editor ถ้า user_roles ยังไม่มี
-- (ใช้เมื่อ migration 20260313000001 ยังไม่ได้รัน หรือรันไม่ครบ)

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- สร้าง user_roles ถ้ายังไม่มี
CREATE TABLE IF NOT EXISTS user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);

-- RLS (ใช้ get_my_role() เพื่อหลีกเลี่ยง infinite recursion)
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT role FROM user_roles WHERE user_id = auth.uid() LIMIT 1; $$;

DROP POLICY IF EXISTS "super_admin can manage user_roles" ON user_roles;
CREATE POLICY "super_admin can manage user_roles"
  ON user_roles FOR ALL TO authenticated
  USING (public.get_my_role() = 'super_admin')
  WITH CHECK (public.get_my_role() = 'super_admin');

DROP POLICY IF EXISTS "Users can read own role" ON user_roles;
CREATE POLICY "Users can read own role"
  ON user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access user_roles" ON user_roles;
CREATE POLICY "Service role full access user_roles"
  ON user_roles FOR ALL TO service_role
  USING (true) WITH CHECK (true);
