-- Chat queue and assignment workflow
-- Run after 20260314000001

-- 1. admin_status: availability for round-robin assignment
CREATE TABLE admin_status (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('available', 'busy', 'offline')),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_assign_time TIMESTAMPTZ
);

CREATE INDEX idx_admin_status_status ON admin_status(status);

-- 2. admin_skills: skills for skill-based routing
CREATE TABLE admin_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill TEXT NOT NULL,
  UNIQUE(user_id, skill)
);

CREATE INDEX idx_admin_skills_user_id ON admin_skills(user_id);
CREATE INDEX idx_admin_skills_skill ON admin_skills(skill);

-- 3. Add queue columns to line_users
ALTER TABLE line_users ADD COLUMN IF NOT EXISTS assigned_admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE line_users ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE line_users ADD COLUMN IF NOT EXISTS queue_status TEXT DEFAULT 'unassigned' CHECK (queue_status IN ('unassigned', 'assigned', 'resolved'));

CREATE INDEX IF NOT EXISTS idx_line_users_queue_status ON line_users(queue_status);
CREATE INDEX IF NOT EXISTS idx_line_users_assigned_admin ON line_users(assigned_admin_id);

-- 4. RLS for admin_status
ALTER TABLE admin_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read admin_status"
  ON admin_status FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('super_admin', 'admin', 'viewer'));

CREATE POLICY "Admins can update own status"
  ON admin_status FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admins can insert own status"
  ON admin_status FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "super_admin manage admin_status"
  ON admin_status FOR ALL TO authenticated
  USING (public.get_my_role() = 'super_admin')
  WITH CHECK (public.get_my_role() = 'super_admin');

CREATE POLICY "Service role full access admin_status"
  ON admin_status FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5. RLS for admin_skills
ALTER TABLE admin_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read admin_skills"
  ON admin_skills FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('super_admin', 'admin', 'viewer'));

CREATE POLICY "super_admin manage admin_skills"
  ON admin_skills FOR ALL TO authenticated
  USING (public.get_my_role() = 'super_admin')
  WITH CHECK (public.get_my_role() = 'super_admin');

CREATE POLICY "Service role full access admin_skills"
  ON admin_skills FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6. Update line_users RLS for assigned_admin_id, tags, queue_status
-- Existing policies allow admin update - ensure assigned_admin can update their assigned chats
DROP POLICY IF EXISTS "admin update line_users" ON line_users;
CREATE POLICY "admin update line_users"
  ON line_users FOR UPDATE TO authenticated
  USING (public.get_my_role() IN ('super_admin', 'admin'))
  WITH CHECK (public.get_my_role() IN ('super_admin', 'admin'));

