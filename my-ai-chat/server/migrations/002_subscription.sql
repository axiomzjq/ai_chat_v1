-- ============================================================
-- 迁移 002: 用户额度从分钟制改为订阅制 + Token 额度
-- ============================================================

-- 1. 添加订阅制字段
ALTER TABLE users
ADD COLUMN IF NOT EXISTS subscription_start_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_days INT DEFAULT 7,
ADD COLUMN IF NOT EXISTS token_quota BIGINT DEFAULT 100000,
ADD COLUMN IF NOT EXISTS token_used BIGINT DEFAULT 0;

-- 2. 为已有用户设置默认值（已使用的用户保留，未使用的给 7 天试用期）
UPDATE users
SET subscription_days = 7,
    token_quota = 100000,
    token_used = 0
WHERE token_quota IS NULL;

-- 3. 注释
COMMENT ON COLUMN users.subscription_start_at IS '订阅开始时间（首次登录时自动设置），NULL 表示未开始';
COMMENT ON COLUMN users.subscription_days IS '订阅时长（天），管理员可预设';
COMMENT ON COLUMN users.token_quota IS 'Token 使用额度上限（默认 100000）';
COMMENT ON COLUMN users.token_used IS '已消耗的 Token 数量';

-- 4. 保留旧字段 quota_minutes/used_minutes 不做删除（向后兼容）
--    前端不再读取，后续可清理
