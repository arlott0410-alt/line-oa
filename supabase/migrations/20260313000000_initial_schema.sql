-- LineUnifiedInbox - Initial Schema
-- Run this in Supabase SQL Editor or via supabase db push

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Line users who have messaged the OA
CREATE TABLE line_users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  line_user_id TEXT NOT NULL UNIQUE,
  profile_name TEXT,
  avatar TEXT,
  last_active TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Messages (incoming from Line users, outgoing from admin)
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  line_user_id TEXT NOT NULL,
  sender_type TEXT NOT NULL CHECK (sender_type IN ('user', 'admin')),
  content TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_messages_line_user_id ON messages(line_user_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_line_users_last_active ON line_users(last_active DESC);

-- Enable Realtime on messages table
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- Row Level Security (RLS)
ALTER TABLE line_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users (admins) can read/write line_users
CREATE POLICY "Authenticated users can manage line_users"
  ON line_users FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy: Authenticated users (admins) can read/write messages
CREATE POLICY "Authenticated users can manage messages"
  ON messages FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy: Service role can do everything (for Worker webhook)
CREATE POLICY "Service role full access line_users"
  ON line_users FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access messages"
  ON messages FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Function to update updated_at on line_users
CREATE OR REPLACE FUNCTION update_line_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER line_users_updated_at
  BEFORE UPDATE ON line_users
  FOR EACH ROW
  EXECUTE FUNCTION update_line_users_updated_at();
