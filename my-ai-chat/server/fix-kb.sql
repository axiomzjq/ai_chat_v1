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
