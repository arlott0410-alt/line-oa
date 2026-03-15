-- Add last_message_replied_by so we can filter "แชทล่าสุดของเรา" (chats where I sent the last message)
ALTER TABLE line_users
  ADD COLUMN IF NOT EXISTS last_message_replied_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_line_users_last_message_replied_by ON line_users(last_message_replied_by);

-- Update trigger to set last_message_replied_by when an admin message is inserted
CREATE OR REPLACE FUNCTION update_line_users_last_message()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE line_users
  SET last_message_content = NEW.content,
      last_message_timestamp = NEW.timestamp,
      last_message_sender_type = NEW.sender_type,
      last_message_replied_by = CASE WHEN NEW.sender_type = 'admin' THEN NEW.replied_by ELSE NULL END
  WHERE channel_id = NEW.channel_id AND line_user_id = NEW.line_user_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
