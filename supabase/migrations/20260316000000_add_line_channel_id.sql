-- เพิ่ม line_channel_id สำหรับ lookup fallback (LINE อาจส่ง destination เป็น Channel ID หรือ Bot User ID)
ALTER TABLE channels ADD COLUMN IF NOT EXISTS line_channel_id TEXT;

-- คัดลอกค่าจาก bot_user_id สำหรับ channel ที่มีอยู่แล้ว (กรณีเป็นตัวเลข Channel ID)
UPDATE channels SET line_channel_id = bot_user_id WHERE line_channel_id IS NULL AND bot_user_id ~ '^[0-9]+$';

CREATE INDEX IF NOT EXISTS idx_channels_line_channel_id ON channels(line_channel_id) WHERE line_channel_id IS NOT NULL;
