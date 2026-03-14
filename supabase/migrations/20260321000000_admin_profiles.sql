-- admin_profiles: ชื่อที่แสดงให้พนักงานรู้ว่าใครรับงานอยู่
CREATE TABLE IF NOT EXISTS admin_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;

-- Authenticated can read (เพื่อดูชื่อเพื่อน)
CREATE POLICY "Authenticated can read admin_profiles"
  ON admin_profiles FOR SELECT TO authenticated
  USING (true);

-- User can insert/update own display_name
CREATE POLICY "User can insert own admin_profile"
  ON admin_profiles FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "User can update own admin_profile"
  ON admin_profiles FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Super admin can manage admin_profiles"
  ON admin_profiles FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  )
  WITH CHECK (true);

CREATE POLICY "Service role full access admin_profiles"
  ON admin_profiles FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
