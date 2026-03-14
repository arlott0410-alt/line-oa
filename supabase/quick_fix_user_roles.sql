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

-- RLS
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "super_admin can manage user_roles" ON user_roles;
CREATE POLICY "super_admin can manage user_roles"
  ON user_roles FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'));

DROP POLICY IF EXISTS "Users can read own role" ON user_roles;
CREATE POLICY "Users can read own role"
  ON user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Service role full access user_roles" ON user_roles;
CREATE POLICY "Service role full access user_roles"
  ON user_roles FOR ALL TO service_role
  USING (true) WITH CHECK (true);
