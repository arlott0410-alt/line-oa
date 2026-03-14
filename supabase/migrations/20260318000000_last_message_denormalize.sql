-- Denormalize last message into line_users เพื่อลด N+1 queries (GET /chats, GET /queue)
ALTER TABLE line_users ADD COLUMN IF NOT EXISTS last_message_content TEXT;
ALTER TABLE line_users ADD COLUMN IF NOT EXISTS last_message_timestamp TIMESTAMPTZ;
ALTER TABLE line_users ADD COLUMN IF NOT EXISTS last_message_sender_type TEXT;

-- Trigger: อัปเดต last_message เมื่อมี message ใหม่
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

DROP TRIGGER IF EXISTS trg_messages_update_line_users_last ON messages;
CREATE TRIGGER trg_messages_update_line_users_last
  AFTER INSERT ON messages
  FOR EACH ROW
  EXECUTE FUNCTION update_line_users_last_message();

-- Backfill: อัปเดต last_message จาก messages ที่มีอยู่
UPDATE line_users lu
SET last_message_content = m.content,
    last_message_timestamp = m.timestamp,
    last_message_sender_type = m.sender_type
FROM (
  SELECT DISTINCT ON (channel_id, line_user_id) channel_id, line_user_id, content, timestamp, sender_type
  FROM messages
  ORDER BY channel_id, line_user_id, timestamp DESC
) m
WHERE lu.channel_id = m.channel_id AND lu.line_user_id = m.line_user_id;
