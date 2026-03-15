-- LineUnifiedInbox - Full schema (สร้างใหม่ทั้งหมดหลัง drop)
-- รันหลัง 20260322000000_drop_all_tables.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ========== TABLES ==========

-- Channels (Line OA accounts)
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  access_token TEXT NOT NULL DEFAULT '',
  secret TEXT NOT NULL DEFAULT '',
  bot_user_id TEXT UNIQUE NOT NULL,
  line_channel_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_channels_line_channel_id ON channels(line_channel_id) WHERE line_channel_id IS NOT NULL;

-- User roles (RBAC)
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);

-- Line users per channel
CREATE TABLE line_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  line_user_id TEXT NOT NULL,
  profile_name TEXT,
  avatar TEXT,
  last_active TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  assigned_admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tags TEXT[] DEFAULT '{}',
  queue_status TEXT DEFAULT 'unassigned' CHECK (queue_status IN ('unassigned', 'assigned', 'resolved')),
  vip_level INTEGER DEFAULT 0,
  assigned_at TIMESTAMPTZ,
  viewed_by_admin_at TIMESTAMPTZ,
  last_message_content TEXT,
  last_message_timestamp TIMESTAMPTZ,
  last_message_sender_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(channel_id, line_user_id)
);

CREATE INDEX idx_line_users_channel_id ON line_users(channel_id);
CREATE INDEX idx_line_users_last_active ON line_users(last_active DESC);
CREATE INDEX idx_line_users_queue_status ON line_users(queue_status);
CREATE INDEX idx_line_users_assigned_admin ON line_users(assigned_admin_id);
CREATE INDEX idx_line_users_vip_level ON line_users(vip_level DESC);
CREATE INDEX idx_line_users_assigned_at ON line_users(assigned_at);

-- Messages
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  channel_id UUID NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  line_user_id TEXT NOT NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'admin')),
  content TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message_id TEXT,
  image_original_url TEXT,
  image_preview_url TEXT,
  mime_type TEXT,
  escalated_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_channel_id ON messages(channel_id);
CREATE INDEX idx_messages_line_user_id ON messages(line_user_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);

-- Admin status (availability)
CREATE TABLE admin_status (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('available', 'busy', 'offline')),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_assign_time TIMESTAMPTZ
);

CREATE INDEX idx_admin_status_status ON admin_status(status);

-- Admin skills (skill-based routing)
CREATE TABLE admin_skills (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  skill TEXT NOT NULL,
  UNIQUE(user_id, skill)
);

CREATE INDEX idx_admin_skills_user_id ON admin_skills(user_id);
CREATE INDEX idx_admin_skills_skill ON admin_skills(skill);

-- Quick replies
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

-- Chat distribution config (singleton)
CREATE TABLE chat_distribution_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  auto_assign BOOLEAN NOT NULL DEFAULT true,
  use_skill_match BOOLEAN NOT NULL DEFAULT true,
  strategy TEXT NOT NULL DEFAULT 'round_robin' CHECK (strategy IN ('round_robin', 'manual_only')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO chat_distribution_config (id, auto_assign, use_skill_match, strategy)
VALUES ('default', true, true, 'round_robin')
ON CONFLICT (id) DO NOTHING;

-- Admin profiles (display name)
CREATE TABLE admin_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ========== FUNCTIONS ==========

-- get_my_role: SECURITY DEFINER เพื่อหลีกเลี่ยง RLS recursion
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM user_roles WHERE user_id = auth.uid() LIMIT 1;
$$;

-- updated_at triggers
CREATE OR REPLACE FUNCTION update_channels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_line_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER channels_updated_at
  BEFORE UPDATE ON channels
  FOR EACH ROW
  EXECUTE FUNCTION update_channels_updated_at();

CREATE TRIGGER line_users_updated_at
  BEFORE UPDATE ON line_users
  FOR EACH ROW
  EXECUTE FUNCTION update_line_users_updated_at();

-- Last message denormalize trigger
CREATE OR REPLACE FUNCTION update_line_users_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE line_users
  SET last_message_content = NEW.content,
      last_message_timestamp = NEW.timestamp,
      last_message_sender_type = NEW.sender_type
  WHERE channel_id = NEW.channel_id AND line_user_id = NEW.line_user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_messages_update_line_users_last
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_line_users_last_message();

-- assigned_at when assigned_admin_id changes
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

CREATE TRIGGER trg_line_users_assigned_at
  BEFORE UPDATE ON line_users
  FOR EACH ROW
  EXECUTE FUNCTION set_line_users_assigned_at();

-- ========== RLS ==========

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE line_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_distribution_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_profiles ENABLE ROW LEVEL SECURITY;

-- channels
CREATE POLICY "super_admin can manage channels"
  ON channels FOR ALL TO authenticated
  USING (public.get_my_role() = 'super_admin')
  WITH CHECK (public.get_my_role() = 'super_admin');

CREATE POLICY "admin and viewer can read channels"
  ON channels FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('super_admin', 'admin', 'viewer'));

CREATE POLICY "Service role full access channels"
  ON channels FOR ALL TO service_role USING (true) WITH CHECK (true);

-- user_roles
CREATE POLICY "super_admin can manage user_roles"
  ON user_roles FOR ALL TO authenticated
  USING (public.get_my_role() = 'super_admin')
  WITH CHECK (public.get_my_role() = 'super_admin');

CREATE POLICY "Users can read own role"
  ON user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role full access user_roles"
  ON user_roles FOR ALL TO service_role USING (true) WITH CHECK (true);

-- line_users
CREATE POLICY "admin viewer select line_users"
  ON line_users FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('super_admin', 'admin', 'viewer'));

CREATE POLICY "admin insert update line_users"
  ON line_users FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() IN ('super_admin', 'admin'));

CREATE POLICY "admin update line_users"
  ON line_users FOR UPDATE TO authenticated
  USING (public.get_my_role() IN ('super_admin', 'admin'))
  WITH CHECK (public.get_my_role() IN ('super_admin', 'admin'));

CREATE POLICY "Service role full access line_users"
  ON line_users FOR ALL TO service_role USING (true) WITH CHECK (true);

-- messages
CREATE POLICY "admin viewer select messages"
  ON messages FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('super_admin', 'admin', 'viewer'));

CREATE POLICY "admin insert messages"
  ON messages FOR INSERT TO authenticated
  WITH CHECK (public.get_my_role() IN ('super_admin', 'admin'));

CREATE POLICY "admin update messages"
  ON messages FOR UPDATE TO authenticated
  USING (public.get_my_role() IN ('super_admin', 'admin'));

CREATE POLICY "Service role full access messages"
  ON messages FOR ALL TO service_role USING (true) WITH CHECK (true);

-- admin_status
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

-- admin_skills
CREATE POLICY "Admins can read admin_skills"
  ON admin_skills FOR SELECT TO authenticated
  USING (public.get_my_role() IN ('super_admin', 'admin', 'viewer'));

CREATE POLICY "super_admin manage admin_skills"
  ON admin_skills FOR ALL TO authenticated
  USING (public.get_my_role() = 'super_admin')
  WITH CHECK (public.get_my_role() = 'super_admin');

CREATE POLICY "Service role full access admin_skills"
  ON admin_skills FOR ALL TO service_role USING (true) WITH CHECK (true);

-- quick_replies
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

-- chat_distribution_config (ใช้ get_my_role เพื่อไม่ recursion)
CREATE POLICY "Allow read chat_distribution_config"
  ON chat_distribution_config FOR SELECT
  TO authenticated, service_role
  USING (true);

CREATE POLICY "Super admin can update chat_distribution_config"
  ON chat_distribution_config FOR UPDATE
  TO authenticated
  USING (public.get_my_role() = 'super_admin')
  WITH CHECK (true);

CREATE POLICY "Service role full access chat_distribution_config"
  ON chat_distribution_config FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- admin_profiles
CREATE POLICY "Authenticated can read admin_profiles"
  ON admin_profiles FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Super admin can manage admin_profiles"
  ON admin_profiles FOR ALL TO authenticated
  USING (public.get_my_role() = 'super_admin')
  WITH CHECK (true);

CREATE POLICY "Service role full access admin_profiles"
  ON admin_profiles FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ========== REALTIME ==========

ALTER PUBLICATION supabase_realtime ADD TABLE channels;
ALTER PUBLICATION supabase_realtime ADD TABLE line_users;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
