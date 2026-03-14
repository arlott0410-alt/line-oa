-- High-volume chat workflow: quick_replies, escalation, vip_level, viewed_at
-- Run after 20260318000000

-- 1. quick_replies table
CREATE TABLE quick_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quick_replies_tags ON quick_replies USING GIN(tags);
CREATE INDEX idx_quick_replies_created_by ON quick_replies(created_by);

ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read quick_replies"
  ON quick_replies FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('super_admin', 'admin', 'viewer'));

CREATE POLICY "Admins write quick_replies"
  ON quick_replies FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() IN ('super_admin', 'admin'));

CREATE POLICY "Admins update quick_replies"
  ON quick_replies FOR UPDATE TO authenticated
  USING (public.get_my_role() IN ('super_admin', 'admin'));

CREATE POLICY "Admins delete quick_replies"
  ON quick_replies FOR DELETE TO authenticated
  USING (public.get_my_role() IN ('super_admin', 'admin'));

CREATE POLICY "Service role full access quick_replies"
  ON quick_replies FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 2. messages.escalated_to
ALTER TABLE messages ADD COLUMN IF NOT EXISTS escalated_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- 3. line_users: vip_level, assigned_at, viewed_by_admin_at
ALTER TABLE line_users ADD COLUMN IF NOT EXISTS vip_level INTEGER DEFAULT 0;
ALTER TABLE line_users ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE line_users ADD COLUMN IF NOT EXISTS viewed_by_admin_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_line_users_vip_level ON line_users(vip_level DESC);
CREATE INDEX IF NOT EXISTS idx_line_users_assigned_at ON line_users(assigned_at);

-- Trigger: set assigned_at when assigned_admin_id changes
CREATE OR REPLACE FUNCTION set_line_users_assigned_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assigned_admin_id IS DISTINCT FROM OLD.assigned_admin_id AND NEW.assigned_admin_id IS NOT NULL THEN
    NEW.assigned_at = NOW();
    NEW.viewed_by_admin_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_line_users_assigned_at ON line_users;
CREATE TRIGGER trg_line_users_assigned_at
  BEFORE UPDATE ON line_users
  FOR EACH ROW
  EXECUTE FUNCTION set_line_users_assigned_at();
