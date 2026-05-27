-- ============================================================
-- ToB 创始人 IP 深度定制系统 - PostgreSQL Schema
-- 数据库：aichat
-- 扩展：pgcrypto, vector
-- ============================================================

-- 1. 扩展安装
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- CREATE EXTENSION IF NOT EXISTS vector;  -- Windows 需手动安装 pgvector，暂禁用

-- 2. 用户表
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    authing_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(20),
    display_name VARCHAR(255),
    avatar_url TEXT,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_authing_id ON users(authing_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

COMMENT ON TABLE users IS '用户基础信息，与 Authing 身份源关联';
COMMENT ON COLUMN users.authing_id IS 'Authing 用户 ID';
COMMENT ON COLUMN users.role IS 'user=普通用户, admin=管理员';

-- 3. 对话会话表
CREATE TABLE IF NOT EXISTS conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    current_step VARCHAR(50) DEFAULT 'interview' CHECK (current_step IN ('interview', 'information', 'positioning', 'copywriting', 'history')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_updated ON conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);

COMMENT ON TABLE conversations IS '对话会话';

-- 4. 消息表
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    model VARCHAR(100),
    input_tokens INT DEFAULT 0,
    output_tokens INT DEFAULT 0,
    latency_ms INT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_created ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_user_created ON messages(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_role ON messages(role);
CREATE INDEX IF NOT EXISTS idx_messages_model ON messages(model);

COMMENT ON TABLE messages IS '对话消息';

-- 5. 用户画像表
CREATE TABLE IF NOT EXISTS user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    interview_data JSONB DEFAULT '{}',
    information_report JSONB DEFAULT '{}',
    positioning_report JSONB DEFAULT '{}',
    copywriting_data JSONB DEFAULT '{}',
    current_step VARCHAR(50) DEFAULT 'interview' CHECK (current_step IN ('interview', 'information', 'positioning', 'copywriting', 'history')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_profiles_user ON user_profiles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_step ON user_profiles(current_step);

COMMENT ON TABLE user_profiles IS '创始人 IP 定制核心数据';

-- 6. 知识库表
CREATE TABLE IF NOT EXISTS knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,
    category VARCHAR(100),
    source VARCHAR(100),
    file_type VARCHAR(50),
    file_path TEXT,
    file_size INT,
    embedding JSONB,                            -- 未来迁移为 VECTOR(1536)
    metadata JSONB DEFAULT '{}',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kb_category ON knowledge_base(category);
CREATE INDEX IF NOT EXISTS idx_kb_created_by ON knowledge_base(created_by);

COMMENT ON TABLE knowledge_base IS '知识库文档，用于 RAG';
COMMENT ON COLUMN knowledge_base.embedding IS '文本向量嵌入（1536维），需 pgvector';

-- 7. 使用统计表
CREATE TABLE IF NOT EXISTS usage_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    conversation_count INT DEFAULT 0,
    message_count INT DEFAULT 0,
    total_input_tokens INT DEFAULT 0,
    total_output_tokens INT DEFAULT 0,
    duration_seconds INT DEFAULT 0,
    UNIQUE(user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_usage_user_date ON usage_stats(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_usage_date ON usage_stats(date);

COMMENT ON TABLE usage_stats IS '按日聚合使用统计';

-- 8. 反馈表
CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL CHECK (type IN ('bug', 'feature', 'improvement', 'other')),
    title VARCHAR(255),
    content TEXT NOT NULL,
    contact VARCHAR(255),
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    admin_reply TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(type);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created_at DESC);

COMMENT ON TABLE feedback IS '用户反馈与工单';

-- 9. 触发器：自动更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at') THEN
        CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_conversations_updated_at') THEN
        CREATE TRIGGER update_conversations_updated_at BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_user_profiles_updated_at') THEN
        CREATE TRIGGER update_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_knowledge_base_updated_at') THEN
        CREATE TRIGGER update_knowledge_base_updated_at BEFORE UPDATE ON knowledge_base FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_feedback_updated_at') THEN
        CREATE TRIGGER update_feedback_updated_at BEFORE UPDATE ON feedback FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

-- 10. 触发器：消息插入时更新对话 updated_at
CREATE OR REPLACE FUNCTION touch_conversation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations SET updated_at = NOW() WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'message_insert_touch_conversation') THEN
        CREATE TRIGGER message_insert_touch_conversation AFTER INSERT ON messages FOR EACH ROW EXECUTE FUNCTION touch_conversation_updated_at();
    END IF;
END $$;

-- 11. 行级安全策略（RLS）
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- 删除已存在的策略（避免重复创建错误）
DROP POLICY IF EXISTS user_conversations ON conversations;
DROP POLICY IF EXISTS user_messages ON messages;
DROP POLICY IF EXISTS user_profiles_isolation ON user_profiles;
DROP POLICY IF EXISTS user_usage_stats ON usage_stats;
DROP POLICY IF EXISTS kb_read_all ON knowledge_base;
DROP POLICY IF EXISTS kb_write_admin ON knowledge_base;
DROP POLICY IF EXISTS feedback_user ON feedback;

-- 用户数据隔离策略
CREATE POLICY user_conversations ON conversations FOR ALL USING (user_id = current_setting('app.current_user')::UUID);
CREATE POLICY user_messages ON messages FOR ALL USING (user_id = current_setting('app.current_user')::UUID);
CREATE POLICY user_profiles_isolation ON user_profiles FOR ALL USING (user_id = current_setting('app.current_user')::UUID);
CREATE POLICY user_usage_stats ON usage_stats FOR ALL USING (user_id = current_setting('app.current_user')::UUID);

-- 知识库：所有用户可读，仅管理员可写
CREATE POLICY kb_read_all ON knowledge_base FOR SELECT USING (true);
CREATE POLICY kb_write_admin ON knowledge_base FOR ALL USING (current_setting('app.current_user_role')::TEXT = 'admin');

-- 反馈：用户看自己或管理员看所有
CREATE POLICY feedback_user ON feedback FOR ALL USING (
    user_id = current_setting('app.current_user')::UUID
    OR current_setting('app.current_user_role')::TEXT = 'admin'
);
