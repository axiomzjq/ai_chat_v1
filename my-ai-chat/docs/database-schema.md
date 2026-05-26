# PostgreSQL 数据库 Schema 设计

> 适用项目：ToB 创始人 IP 深度定制系统（AI 对话系统）
> 数据库：PostgreSQL 16+
> 扩展依赖：pgcrypto（UUID）、pgvector（向量检索）

---

## 一、表结构总览

```
users                          -- 用户基础信息（与 Authing 同步）
├── conversations              -- 对话会话
│   └── messages               -- 对话消息
├── user_profiles              -- 用户画像 / IP 定制数据
├── knowledge_base             -- 知识库文档
├── usage_stats                -- 使用统计（按日聚合）
└── feedback                   -- 用户反馈
```

---

## 二、详细表定义

### 2.1 users — 用户表

与 Authing 用户体系关联，作为系统内所有数据的归属主体。

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    authing_id VARCHAR(255) UNIQUE NOT NULL,  -- Authing 返回的用户唯一标识
    email VARCHAR(255),
    phone VARCHAR(20),
    display_name VARCHAR(255),
    avatar_url TEXT,
    role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE users IS '用户基础信息，与 Authing 身份源关联';
COMMENT ON COLUMN users.authing_id IS 'Authing 用户 ID（sub 或 id）';
COMMENT ON COLUMN users.role IS 'user=普通用户, admin=管理员';
```

**索引**
```sql
CREATE INDEX idx_users_authing_id ON users(authing_id);
CREATE INDEX idx_users_role ON users(role);
```

---

### 2.2 conversations — 对话会话表

管理用户与 AI 的每一次完整对话（一个 Session）。

```sql
CREATE TABLE conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(500),                         -- 对话标题（AI 自动生成）
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'archived', 'deleted')),
    current_step VARCHAR(50) DEFAULT 'interview' CHECK (current_step IN ('interview', 'information', 'positioning', 'copywriting', 'history')),
    metadata JSONB DEFAULT '{}',                -- 扩展信息：关联文件、标签等
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE conversations IS '对话会话，一个 session 对应一次完整的创始人 IP 定制流程';
COMMENT ON COLUMN conversations.current_step IS '当前所处步骤：interview/information/positioning/copywriting/history';
```

**索引**
```sql
-- 用户查询自己的对话列表（按更新时间倒序）
CREATE INDEX idx_conversations_user_updated ON conversations(user_id, updated_at DESC);
-- 按状态筛选
CREATE INDEX idx_conversations_status ON conversations(status);
```

---

### 2.3 messages — 对话消息表

存储对话中的每一条消息。这是写入最频繁的表。

```sql
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    model VARCHAR(100),                         -- 使用的 AI 模型，如 gemini-2.5-pro
    input_tokens INT DEFAULT 0,                 -- 输入 token 数
    output_tokens INT DEFAULT 0,                -- 输出 token 数
    latency_ms INT,                             -- API 响应延迟（毫秒）
    metadata JSONB DEFAULT '{}',                -- 扩展：文件引用、工具调用、错误码等
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE messages IS '对话消息，系统的核心数据表';
COMMENT ON COLUMN messages.metadata IS 'JSON 格式扩展字段，用于存储文件附件、思维链、工具调用结果等';
```

**索引**
```sql
-- 核心索引：按会话查询消息（时间正序，用于展示对话流）
CREATE INDEX idx_messages_conversation_created ON messages(conversation_id, created_at);

-- 核心索引：按用户查询所有消息（时间倒序，用于全局搜索）
CREATE INDEX idx_messages_user_created ON messages(user_id, created_at DESC);

-- 全文搜索索引（中文）
CREATE INDEX idx_messages_content_search ON messages 
    USING gin(to_tsvector('chinese', content));

-- 按角色筛选（用于统计用户/AI 消息比例）
CREATE INDEX idx_messages_role ON messages(role);

-- 模型筛选（用于分析不同模型使用情况）
CREATE INDEX idx_messages_model ON messages(model);
```

---

### 2.4 user_profiles — 用户画像 / IP 定制数据表

存储创始人 IP 定制系统的核心产出数据（访谈、信息报告、定位报告、文案）。

```sql
CREATE TABLE user_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- 访谈阶段原始数据
    interview_data JSONB DEFAULT '{}',
    
    -- 信息报告（AI 生成的结构化报告）
    information_report JSONB DEFAULT '{}',
    
    -- 定位报告
    positioning_report JSONB DEFAULT '{}',
    
    -- 文案数据（多版本文案）
    copywriting_data JSONB DEFAULT '{}',
    
    -- 当前进度
    current_step VARCHAR(50) DEFAULT 'interview' CHECK (current_step IN ('interview', 'information', 'positioning', 'copywriting', 'history')),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE user_profiles IS '创始人 IP 定制系统的核心数据：访谈、报告、文案';
COMMENT ON COLUMN user_profiles.interview_data IS '访谈阶段的问答原始数据';
COMMENT ON COLUMN user_profiles.information_report IS 'AI 生成的信息整理报告（JSON 结构）';
COMMENT ON COLUMN user_profiles.positioning_report IS 'AI 生成的定位分析报告（JSON 结构）';
COMMENT ON COLUMN user_profiles.copywriting_data IS 'AI 生成的多版本文案（JSON 数组）';
```

**索引**
```sql
CREATE INDEX idx_user_profiles_user ON user_profiles(user_id);
CREATE INDEX idx_user_profiles_step ON user_profiles(current_step);
```

---

### 2.5 knowledge_base — 知识库表

存储上传的文档、参考资料，支持向量检索（RAG）。

```sql
CREATE TABLE knowledge_base (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(500) NOT NULL,
    content TEXT NOT NULL,                      -- 文本内容（原始或提取后的纯文本）
    category VARCHAR(100),                      -- 分类：行业报告/案例/方法论等
    source VARCHAR(100),                        -- 来源：upload（用户上传）/ manual（手动录入）
    file_type VARCHAR(50),                      -- 原始文件类型：txt/md/docx/xlsx/pdf
    file_path TEXT,                             -- 文件存储路径（如使用本地存储）
    file_size INT,                              -- 文件大小（字节）
    
    -- 向量嵌入（需安装 pgvector 扩展）
    embedding VECTOR(1536),                     -- OpenAI/Gemini 文本嵌入向量
    
    metadata JSONB DEFAULT '{}',                -- 扩展：文档摘要、关键词、chunk 信息等
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE knowledge_base IS '知识库文档，用于 RAG 检索和上下文增强';
COMMENT ON COLUMN knowledge_base.embedding IS '文本向量嵌入（维度 1536），需 pgvector 扩展';
COMMENT ON COLUMN knowledge_base.content IS '提取后的纯文本内容，用于展示和检索';
```

**索引**
```sql
-- 向量相似度搜索索引（IVFFlat，适合 10万+ 数据量）
CREATE INDEX idx_kb_embedding ON knowledge_base 
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 全文搜索
CREATE INDEX idx_kb_content_search ON knowledge_base 
    USING gin(to_tsvector('chinese', content));

-- 分类筛选
CREATE INDEX idx_kb_category ON knowledge_base(category);

-- 创建者筛选（管理员查看）
CREATE INDEX idx_kb_created_by ON knowledge_base(created_by);
```

---

### 2.6 usage_stats — 使用统计表

按日聚合用户的使用数据，用于计费、限额、分析。

```sql
CREATE TABLE usage_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    
    conversation_count INT DEFAULT 0,           -- 当日新建对话数
    message_count INT DEFAULT 0,                -- 当日总消息数
    total_input_tokens INT DEFAULT 0,           -- 当日输入 token 总数
    total_output_tokens INT DEFAULT 0,          -- 当日输出 token 总数
    duration_seconds INT DEFAULT 0,             -- 当日使用时长（秒）
    
    UNIQUE(user_id, date)
);

COMMENT ON TABLE usage_stats IS '按日聚合的用户使用统计数据';
```

**索引**
```sql
-- 按用户 + 日期查询（核心索引）
CREATE INDEX idx_usage_user_date ON usage_stats(user_id, date DESC);

-- 按日期范围聚合（管理员查看全局统计）
CREATE INDEX idx_usage_date ON usage_stats(date);
```

---

### 2.7 feedback — 反馈表

用户提交的 Bug、功能建议、改进意见。

```sql
CREATE TABLE feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,  -- 允许匿名反馈
    type VARCHAR(50) NOT NULL CHECK (type IN ('bug', 'feature', 'improvement', 'other')),
    title VARCHAR(255),
    content TEXT NOT NULL,
    contact VARCHAR(255),                       -- 联系方式（可选）
    status VARCHAR(20) DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    admin_reply TEXT,                           -- 管理员回复
    metadata JSONB DEFAULT '{}',                -- 截图链接、环境信息等
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE feedback IS '用户反馈与工单系统';
```

**索引**
```sql
CREATE INDEX idx_feedback_user ON feedback(user_id);
CREATE INDEX idx_feedback_status ON feedback(status);
CREATE INDEX idx_feedback_type ON feedback(type);
CREATE INDEX idx_feedback_created ON feedback(created_at DESC);
```

---

## 三、行级安全策略（RLS）

核心安全机制：数据库层面强制数据隔离，即使后端代码存在漏洞，也无法越权访问其他用户数据。

```sql
-- 启用 RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_stats ENABLE ROW LEVEL SECURITY;

-- 用户只能访问自己的数据
CREATE POLICY user_conversations ON conversations
    FOR ALL USING (user_id = current_setting('app.current_user')::UUID);

CREATE POLICY user_messages ON messages
    FOR ALL USING (user_id = current_setting('app.current_user')::UUID);

CREATE POLICY user_profiles_isolation ON user_profiles
    FOR ALL USING (user_id = current_setting('app.current_user')::UUID);

CREATE POLICY user_usage_stats ON usage_stats
    FOR ALL USING (user_id = current_setting('app.current_user')::UUID);

-- 知识库：所有登录用户可读，仅管理员可写
ALTER TABLE knowledge_base ENABLE ROW LEVEL SECURITY;

CREATE POLICY kb_read_all ON knowledge_base
    FOR SELECT USING (true);  -- 所有用户可读

CREATE POLICY kb_write_admin ON knowledge_base
    FOR ALL USING (
        current_setting('app.current_user_role')::TEXT = 'admin'
    );

-- 反馈：用户看自己提交的，管理员看所有
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY feedback_user ON feedback
    FOR ALL USING (
        user_id = current_setting('app.current_user')::UUID
        OR current_setting('app.current_user_role')::TEXT = 'admin'
    );
```

**后端设置会话变量的方式**
```javascript
// 在每个请求开始时，根据 Authing JWT 解析出的用户 ID 设置
await db.query("SET app.current_user = $1", [userId]);
await db.query("SET app.current_user_role = $2", [userRole]);
```

---

## 四、触发器（自动维护）

### 4.1 自动更新 updated_at

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_profiles_updated_at
    BEFORE UPDATE ON user_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_knowledge_base_updated_at
    BEFORE UPDATE ON knowledge_base
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_feedback_updated_at
    BEFORE UPDATE ON feedback
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
```

### 4.2 对话更新时自动刷新 conversations.updated_at

当 messages 表插入新消息时，自动更新对应 conversation 的 updated_at。

```sql
CREATE OR REPLACE FUNCTION touch_conversation_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE conversations 
    SET updated_at = NOW() 
    WHERE id = NEW.conversation_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER message_insert_touch_conversation
    AFTER INSERT ON messages
    FOR EACH ROW EXECUTE FUNCTION touch_conversation_updated_at();
```

---

## 五、视图（方便查询）

### 5.1 对话列表视图（含最新消息预览）

```sql
CREATE VIEW conversation_list AS
SELECT 
    c.id,
    c.user_id,
    c.title,
    c.status,
    c.current_step,
    c.created_at,
    c.updated_at,
    COUNT(m.id) AS message_count,
    (SELECT content FROM messages 
     WHERE conversation_id = c.id 
     ORDER BY created_at DESC LIMIT 1) AS last_message_preview
FROM conversations c
LEFT JOIN messages m ON c.id = m.conversation_id
WHERE c.status != 'deleted'
GROUP BY c.id;
```

### 5.2 用户使用统计视图

```sql
CREATE VIEW user_usage_summary AS
SELECT 
    u.id AS user_id,
    u.display_name,
    u.email,
    u.role,
    COUNT(DISTINCT c.id) AS total_conversations,
    COUNT(DISTINCT m.id) AS total_messages,
    COALESCE(SUM(us.total_input_tokens), 0) AS total_input_tokens,
    COALESCE(SUM(us.total_output_tokens), 0) AS total_output_tokens,
    COALESCE(SUM(us.duration_seconds), 0) AS total_duration_seconds,
    MAX(c.updated_at) AS last_active_at
FROM users u
LEFT JOIN conversations c ON u.id = c.user_id AND c.status = 'active'
LEFT JOIN messages m ON c.id = m.conversation_id
LEFT JOIN usage_stats us ON u.id = us.user_id
GROUP BY u.id;
```

---

## 六、数据类型对照（原 Firestore → PostgreSQL）

| Firestore 类型 | PostgreSQL 类型 | 说明 |
|--------------|----------------|------|
| `string` | `VARCHAR(n)` / `TEXT` | 短文本用 VARCHAR，长文本用 TEXT |
| `number` | `INT` / `BIGINT` / `NUMERIC` | 计数用 INT，金额用 NUMERIC |
| `boolean` | `BOOLEAN` | |
| `timestamp` | `TIMESTAMPTZ` | 带时区时间戳 |
| `map` (Object) | `JSONB` | JSONB 支持索引和查询 |
| `array` | `JSONB` / `ARRAY` | 灵活结构用 JSONB，固定类型用 ARRAY |
| `reference` | `UUID` + `FOREIGN KEY` | 外键约束 |
| `geopoint` | `POINT` / `GEOGRAPHY` | PostGIS 扩展 |

---

## 七、扩展安装清单

```sql
-- 1. pgcrypto：UUID 生成
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. pgvector：向量检索（RAG）
CREATE EXTENSION IF NOT EXISTS vector;

-- 3. 中文全文搜索（可选，需额外字典）
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
```

---

## 八、备份策略

```bash
# 每日全量备份（crontab）
0 2 * * * pg_dump -U aiuser -d aichat -F c -f /backup/aichat_$(date +\%Y\%m\%d).dump

# 保留最近 7 天备份
0 3 * * * find /backup -name "aichat_*.dump" -mtime +7 -delete
```

恢复命令：
```bash
pg_restore -U aiuser -d aichat -c /backup/aichat_20260115.dump
```
