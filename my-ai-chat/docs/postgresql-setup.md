# PostgreSQL 部署与配置指南

> 目标：在本地或服务器上部署 PostgreSQL，配置扩展，初始化数据库

---

## 一、Docker 部署（推荐）

### 1.1 启动 PostgreSQL 容器

```bash
# 创建数据目录
mkdir -p ./data/postgres

# 启动容器
docker run -d \
  --name ai-chat-db \
  -e POSTGRES_USER=aiuser \
  -e POSTGRES_PASSWORD=your_strong_password \
  -e POSTGRES_DB=aichat \
  -v $(pwd)/data/postgres:/var/lib/postgresql/data \
  -p 5432:5432 \
  postgres:16-alpine

# 查看日志
docker logs -f ai-chat-db
```

### 1.2 安装 pgvector 扩展

pgvector 需要额外安装（Alpine 基础镜像不包含）。

```bash
# 进入容器
docker exec -it ai-chat-db sh

# 安装编译工具（Alpine）
apk add --no-cache git build-base postgresql16-dev

# 下载并安装 pgvector
cd /tmp
git clone --branch v0.7.0 https://github.com/pgvector/pgvector.git
cd pgvector
make
make install

# 退出容器
exit

# 重启容器
docker restart ai-chat-db
```

### 1.3 验证安装

```bash
docker exec -it ai-chat-db psql -U aiuser -d aichat -c "CREATE EXTENSION IF NOT EXISTS vector;"
docker exec -it ai-chat-db psql -U aiuser -d aichat -c "SELECT * FROM pg_extension WHERE extname = 'vector';"
```

---

## 二、Windows 本地安装

### 2.1 下载安装包

1. 访问 https://www.postgresql.org/download/windows/
2. 下载 PostgreSQL 16.x 安装程序
3. 运行安装向导，记住设置的超级用户密码

### 2.2 安装 pgvector（Windows）

Windows 安装 pgvector 较复杂，建议使用 Docker 方案。如果必须使用 Windows 本地：

```bash
# 使用 Stack Builder 安装额外工具
# 或手动编译（需要 Visual Studio + PostgreSQL 开发头文件）
# 推荐：直接使用 Docker 版本的 PostgreSQL
```

### 2.3 创建数据库和用户

```sql
-- 使用 psql 或 pgAdmin 连接默认数据库
CREATE DATABASE aichat;
CREATE USER aiuser WITH PASSWORD 'your_strong_password';
GRANT ALL PRIVILEGES ON DATABASE aichat TO aiuser;

-- 切换到 aichat 数据库，创建扩展
\c aichat
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;
```

---

## 三、初始化 Schema

### 3.1 生成 schema.sql

从 `database-schema.md` 中提取 SQL，保存为 `server/schema.sql`：

```bash
# 手动创建 server/schema.sql，或从 database-schema.md 复制
# 然后执行：
psql -U aiuser -d aichat -f server/schema.sql
```

### 3.2 验证表结构

```bash
docker exec -it ai-chat-db psql -U aiuser -d aichat -c "\dt"
```

预期输出：
```
         List of relations
 Schema |     Name      | Type  | Owner
--------+---------------+-------+--------
 public | conversations | table | aiuser
 public | feedback      | table | aiuser
 public | knowledge_base| table | aiuser
 public | messages      | table | aiuser
 public | usage_stats   | table | aiuser
 public | user_profiles | table | aiuser
 public | users         | table | aiuser
```

---

## 四、后端环境配置

### 4.1 server/.env

```bash
# 服务端口号
PORT=3001

# PostgreSQL 连接（开发环境）
DATABASE_URL=postgresql://aiuser:your_strong_password@localhost:5432/aichat

# 生产环境使用连接池（推荐）
# DATABASE_URL=postgresql://aiuser:password@localhost:5432/aichat?pool_max_conns=20

# Authing 配置
AUTHING_APP_ID=6a13a72bc34d1d925e777d82
AUTHING_APP_HOST=https://fnbd4tjpcxb5-demo.authing.cn

# AI 服务
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-pro

# Embedding 服务
EMBEDDING_API_KEY=your_embedding_key
EMBEDDING_MODEL=text-embedding-004
EMBEDDING_DIMENSION=1536

# 文件上传
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800

# 环境
NODE_ENV=development
```

### 4.2 后端数据库连接代码（server/db.js）

```javascript
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// 连接测试
pool.on('connect', () => {
  console.log('PostgreSQL connected');
});

pool.on('error', (err) => {
  console.error('PostgreSQL error:', err);
});

export const db = {
  query: (text, params) => pool.query(text, params),
  getClient: () => pool.connect(),
};
```

---

## 五、备份与恢复

### 5.1 自动备份脚本

创建 `scripts/backup.sh`：

```bash
#!/bin/bash
BACKUP_DIR="./backups"
DB_NAME="aichat"
DB_USER="aiuser"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# 全量备份
pg_dump -U $DB_USER -d $DB_NAME -F c -f "$BACKUP_DIR/aichat_$DATE.dump"

# 保留最近 7 天
find $BACKUP_DIR -name "aichat_*.dump" -mtime +7 -delete

echo "Backup completed: aichat_$DATE.dump"
```

添加 crontab（Linux/Mac）：
```bash
0 2 * * * /path/to/scripts/backup.sh >> /var/log/aichat_backup.log 2>&1
```

### 5.2 手动备份

```bash
# Docker 环境下
docker exec ai-chat-db pg_dump -U aiuser -d aichat -F c > aichat_backup.dump

# 本地环境下
pg_dump -U aiuser -d aichat -F c -f aichat_backup.dump
```

### 5.3 恢复备份

```bash
# Docker 环境下
docker exec -i ai-chat-db pg_restore -U aiuser -d aichat --clean < aichat_backup.dump

# 本地环境下
pg_restore -U aiuser -d aichat --clean aichat_backup.dump
```

---

## 六、监控与调优

### 6.1 常用查询

```sql
-- 查看表大小
SELECT relname AS table_name, pg_size_pretty(pg_total_relation_size(relid)) AS total_size
FROM pg_catalog.pg_statio_user_tables
ORDER BY pg_total_relation_size(relid) DESC;

-- 查看慢查询（需开启 log_min_duration_statement）
SELECT query, calls, mean_exec_time, total_exec_time
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- 查看连接数
SELECT count(*) FROM pg_stat_activity;

-- 查看索引使用情况
SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read
FROM pg_stat_user_indexes
ORDER BY idx_scan DESC;
```

### 6.2 性能调优参数

编辑 `postgresql.conf`（Docker 中挂载自定义配置）：

```conf
# 连接数
max_connections = 200

# 内存
shared_buffers = 256MB
work_mem = 16MB
maintenance_work_mem = 128MB

# WAL
wal_buffers = 16MB
max_wal_size = 2GB

# 日志
log_min_duration_statement = 500  # 记录超过 500ms 的查询
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
```

---

## 七、故障排查

| 问题 | 原因 | 解决 |
|------|------|------|
| `connection refused` | PostgreSQL 未启动或端口错误 | `docker ps` 检查容器状态 |
| `password authentication failed` | 密码错误或用户不存在 | 检查 `.env` 中的密码 |
| `database "aichat" does not exist` | 数据库未创建 | 执行 `CREATE DATABASE aichat;` |
| `extension "vector" does not exist` | pgvector 未安装 | 按 1.2 步骤安装 |
| `RLS policy violation` | 会话变量未设置 | 检查后端 `SET app.current_user` 是否正确执行 |
| 查询缓慢 | 缺少索引 | 使用 `EXPLAIN ANALYZE` 分析，添加索引 |
