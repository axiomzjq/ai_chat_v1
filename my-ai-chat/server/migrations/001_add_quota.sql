-- Migration: 为用户表增加额度控制字段
-- 执行方式：连接到 aichat 数据库后运行此文件

-- 增加总配额（分钟）
ALTER TABLE users
ADD COLUMN IF NOT EXISTS quota_minutes INT DEFAULT 60;

-- 增加已用配额（分钟）
ALTER TABLE users
ADD COLUMN IF NOT EXISTS used_minutes INT DEFAULT 0;

-- 为现有用户设置默认配额
UPDATE users SET quota_minutes = 60 WHERE quota_minutes IS NULL;
UPDATE users SET used_minutes = 0 WHERE used_minutes IS NULL;

-- 添加注释
COMMENT ON COLUMN users.quota_minutes IS '用户总使用配额（分钟），管理员可调';
COMMENT ON COLUMN users.used_minutes IS '用户已使用时长（分钟），每分钟扣减';
