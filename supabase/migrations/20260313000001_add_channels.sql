-- LineUnifiedInbox - Add multi-channel support and role-based access
-- Run after 20260313000000_initial_schema.sql

-- 1. Create channels table (Line OA accounts)
CREATE TABLE channels (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  access_token TEXT NOT NULL DEFAULT '',
  secret TEXT NOT NULL DEFAULT '',
  bot_user_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create user_roles table (RBAC)
CREATE TABLE user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id)
);

CREATE INDEX idx_user_roles_user_id ON user_roles(user_id);

-- 3. Add channel_id to line_users
ALTER TABLE line_users ADD COLUMN channel_id UUID REFERENCES channels(id) ON DELETE CASCADE;

-- 4. Add channel_id to messages
ALTER TABLE messages ADD COLUMN channel_id UUID REFERENCES channels(id) ON DELETE CASCADE;

-- 5. Create default channel for existing data (user must update credentials in settings)
INSERT INTO channels (id, name, access_token, secret, bot_user_id)
VALUES (
  uuid_generate_v4(),
  'Default Channel',
  '',
  '',
  'default_' || uuid_generate_v4()::text
);

-- 6. Update existing rows to use default channel
UPDATE line_users SET channel_id = (SELECT id FROM channels WHERE bot_user_id LIKE 'default_%' LIMIT 1) WHERE channel_id IS NULL;
UPDATE messages SET channel_id = (SELECT id FROM channels WHERE bot_user_id LIKE 'default_%' LIMIT 1) WHERE channel_id IS NULL;

-- 7. Make channel_id NOT NULL
ALTER TABLE line_users ALTER COLUMN channel_id SET NOT NULL;
ALTER TABLE messages ALTER COLUMN channel_id SET NOT NULL;

-- 8. Drop old unique constraint on line_users, add composite unique
ALTER TABLE line_users DROP CONSTRAINT IF EXISTS line_users_line_user_id_key;
ALTER TABLE line_users ADD CONSTRAINT line_users_channel_line_user_key UNIQUE (channel_id, line_user_id);

-- 9. Indexes for channel filtering
CREATE INDEX idx_line_users_channel_id ON line_users(channel_id);
CREATE INDEX idx_messages_channel_id ON messages(channel_id);

-- 10. Enable Realtime on new tables
ALTER PUBLICATION supabase_realtime ADD TABLE channels;

-- 11. RLS for channels (super_admin only for write)
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin can manage channels"
  ON channels FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  );

CREATE POLICY "admin and viewer can read channels"
  ON channels FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin', 'viewer'))
  );

CREATE POLICY "Service role full access channels"
  ON channels FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 12. RLS for user_roles (super_admin can manage)
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "super_admin can manage user_roles"
  ON user_roles FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin')
  );

CREATE POLICY "Users can read own role"
  ON user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role full access user_roles"
  ON user_roles FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 13. Drop old RLS policies on line_users and messages, add new role-based
DROP POLICY IF EXISTS "Authenticated users can manage line_users" ON line_users;
DROP POLICY IF EXISTS "Authenticated users can manage messages" ON messages;

CREATE POLICY "admin viewer select line_users"
  ON line_users FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin', 'viewer'))
  );

CREATE POLICY "admin insert update line_users"
  ON line_users FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin'))
  );

CREATE POLICY "admin update line_users"
  ON line_users FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin'))
  );

CREATE POLICY "admin viewer select messages"
  ON messages FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin', 'viewer'))
  );

CREATE POLICY "admin insert messages"
  ON messages FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin'))
  );

CREATE POLICY "admin update messages"
  ON messages FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role IN ('super_admin', 'admin'))
  );

-- 14. Trigger for channels updated_at
CREATE OR REPLACE FUNCTION update_channels_updated_at()
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
