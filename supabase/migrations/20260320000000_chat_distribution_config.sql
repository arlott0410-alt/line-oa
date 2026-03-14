-- Chat distribution config - super_admin ตั้งค่าการกระจายแชทเมื่อลูกค้าทักมา
CREATE TABLE IF NOT EXISTS chat_distribution_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  -- เปิด/ปิดการกระจายอัตโนมัติ เมื่อลูกค้าทักมา
  auto_assign BOOLEAN NOT NULL DEFAULT true,
  -- ใช้ skill match (ฝาก, ถอน, general) หรือไม่
  use_skill_match BOOLEAN NOT NULL DEFAULT true,
  -- วิธีกระจาย: round_robin = กระจายอัตโนมัติ | manual_only = ไม่กระจาย (ต้องไปรับที่ Queue)
  strategy TEXT NOT NULL DEFAULT 'round_robin' CHECK (strategy IN ('round_robin', 'manual_only')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert default row (singleton)
INSERT INTO chat_distribution_config (id, auto_assign, use_skill_match, strategy)
VALUES ('default', true, true, 'round_robin')
ON CONFLICT (id) DO NOTHING;

-- RLS
ALTER TABLE chat_distribution_config ENABLE ROW LEVEL SECURITY;

-- Authenticated + service_role can read
CREATE POLICY "Allow read chat_distribution_config"
  ON chat_distribution_config FOR SELECT
  TO authenticated, service_role
  USING (true);

-- Only super_admin can update
CREATE POLICY "Super admin can update chat_distribution_config"
  ON chat_distribution_config FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
  )
  WITH CHECK (true);

-- Service role full access (Worker needs to read)
CREATE POLICY "Service role full access chat_distribution_config"
  ON chat_distribution_config FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
