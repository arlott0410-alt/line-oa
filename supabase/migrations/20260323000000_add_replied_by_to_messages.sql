-- Add replied_by to messages so we can show which admin sent each reply
ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS replied_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_messages_replied_by ON messages(replied_by);
