CREATE TABLE IF NOT EXISTS knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(100),
    source VARCHAR(100),
    file_type VARCHAR(50),
    file_path TEXT,
    file_size INT,
    embedding JSONB,
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kb_category ON knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_kb_created_by ON knowledge_base(created_by);
COMMENT ON TABLE knowledge_base IS 'Knowledge base for RAG';
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS kb_read_all ON knowledge_base;
DROP POLICY IF EXISTS kb_write_admin ON knowledge_base;
CREATE POLICY kb_read_all ON knowledge_base FOR SELECT USING (true);
CREATE POLICY kb_write_admin ON knowledge_base FOR ALL USING (current_setting('app.current_user_role')::TEXT = 'admin');

-- 迁移：users 表 role 字段增加 superadmin（2026-07-18）
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin', 'superadmin'));
COMMENT ON COLUMN users.role IS '用户角色：user=普通用户, admin=普通管理员, superadmin=超级管理员(ADMIN_PHONE)';
