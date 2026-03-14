-- LineUnifiedInbox - Add image support for user-sent images
-- Run after 20260313000001_add_channels.sql

ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_original_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_preview_url TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS mime_type TEXT;
