-- LineUnifiedInbox - Drop all app tables and related objects
-- รันไฟล์นี้เมื่อต้องการลบ schema เดิมแล้วจะสร้างใหม่จาก migration ถัดไป
-- หมายเหตุ: เมื่อ DROP TABLE แล้ว Postgres จะเอาตารางออกจาก publication อัตโนมัติ

-- 1. ลบ triggers (ถ้ามี) ก่อน drop ตาราง
DROP TRIGGER IF EXISTS trg_messages_update_line_users_last ON messages;
DROP TRIGGER IF EXISTS trg_line_users_assigned_at ON line_users;
DROP TRIGGER IF EXISTS line_users_updated_at ON line_users;
DROP TRIGGER IF EXISTS channels_updated_at ON channels;

-- 2. ลบตารางตามลำดับ (ตารางที่ถูกอ้างอิงก่อน)
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS line_users CASCADE;
DROP TABLE IF EXISTS admin_status CASCADE;
DROP TABLE IF EXISTS admin_skills CASCADE;
DROP TABLE IF EXISTS quick_replies CASCADE;
DROP TABLE IF EXISTS chat_distribution_config CASCADE;
DROP TABLE IF EXISTS admin_profiles CASCADE;
DROP TABLE IF EXISTS user_roles CASCADE;
DROP TABLE IF EXISTS channels CASCADE;

-- 3. ลบ functions
DROP FUNCTION IF EXISTS update_line_users_last_message() CASCADE;
DROP FUNCTION IF EXISTS set_line_users_assigned_at() CASCADE;
DROP FUNCTION IF EXISTS update_line_users_updated_at() CASCADE;
DROP FUNCTION IF EXISTS update_channels_updated_at() CASCADE;
DROP FUNCTION IF EXISTS public.get_my_role() CASCADE;
