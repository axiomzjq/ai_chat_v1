# 🚀 新环境部署指南（给 Kimi 助手的提示词）

> 本文档用于帮助新的 Kimi 实例快速了解项目结构，协助用户在全新环境（本地或服务器）完成部署。
> 如果 Kimi 正在阅读此文档，请按以下结构逐步引导用户操作。

---

## 一、项目基本信息

| 项目 | 说明 |
|------|------|
| **项目名称** | my-ai-chat（AI 创始人 IP 深度定制系统） |
| **前端** | React 19 + TypeScript + Vite 6.2.0 + Tailwind CSS 4.1.14 |
| **后端** | Express 4.x + Node.js 18+ + PostgreSQL 16+ |
| **认证** | Authing 手机号验证码（`@authing/web` + `@authing/guard-react`） |
| **AI 引擎** | DeepSeek API（`deepseek-v4-flash`，通过后端代理） |
| **前端端口** | 5173（开发） |
| **后端端口** | 3001 |
| **GitHub** | `git@github.com:axiomzjq/ai_chat_v1.git` |

---

## 二、目录结构（关键文件）

```
my-ai-chat/
├── src/                          # 前端源码
│   ├── App.tsx                  # 主应用（四步工作流：访谈/信息/定位/文案）
│   ├── lib/
│   │   ├── api.ts               # 后端 API 客户端（所有后端调用走这里）
│   │   ├── authing.ts           # Authing 配置（从 import.meta.env 读取）
│   │   ├── deepseek.ts          # DeepSeek 客户端（调用后端代理，不直接调 DeepSeek API）
│   │   ├── debug.ts             # DEBUG_MODE 开关（生产环境必须设为 false）
│   │   ├── logger.ts            # 调试日志拦截器（DEBUG_MODE=true 时启用）
│   │   └── firebase.ts          # Firebase + Authing SDK 集成
│   └── vite-env.d.ts            # Vite 环境变量类型声明
├── server/                       # 后端源码
│   ├── index.js                 # Express 入口
│   ├── db.js                    # PostgreSQL Pool 连接
│   ├── middleware/
│   │   ├── auth.js              # JWT 验签（jose + Authing JWKS）
│   │   ├── errorHandler.js      # 全局错误处理
│   │   └── rateLimit.js         # 内存级限流
│   ├── routes/
│   │   ├── ai.js                # DeepSeek 代理路由（/chat + /chat-stream）
│   │   ├── auth.js              # 认证相关
│   │   ├── conversations.js     # 对话会话
│   │   ├── messages.js          # 消息
│   │   ├── profiles.js          # 用户画像
│   │   ├── knowledgeBase.js     # 知识库
│   │   ├── usage.js             # 额度统计
│   │   ├── feedback.js          # 反馈
│   │   └── admin.js             # 管理员后台
│   └── schema.sql               # 数据库建表脚本
├── docs/
│   ├── SECURITY_TODO.md         # 安全修复任务清单
│   └── security-refactoring.md  # 安全重构方案（新旧方案对比）
├── .env.local                   # 前端环境变量（❌ 不在 git 中）
├── server/.env                  # 后端环境变量（❌ 不在 git 中）
├── firebase-applet-config.json  # Firebase 配置（✅ 在 git 中）
├── vite.config.ts               # Vite 配置
└── package.json                 # 前端依赖
```

---

## 三、部署步骤（Kimi 请按此顺序引导用户）

### Step 0：系统环境检查

确保以下环境已就绪：

```bash
# Node.js ≥ 18
node --version

# Git
git --version

# PostgreSQL 16+
psql --version
```

### Step 1：克隆代码并切换 release 分支

```bash
git clone git@github.com:axiomzjq/ai_chat_v1.git
cd ai_chat_v1

# 切换到 release 分支（稳定版本）
git checkout release
```

> 生产部署请使用 `release` 分支，开发使用 `main` 分支。

### Step 2：安装 Node.js 依赖

```bash
# 前端依赖
npm install

# 后端依赖
cd server && npm install
```

> **注意**：后端使用了原生 `fetch`（Node.js 18+ 支持），请确保 Node.js 版本 ≥ 18。

### Step 3：安装 PostgreSQL 16 并初始化数据库

#### 3.1 安装 PostgreSQL（服务器环境）

**CentOS / RHEL / Alibaba Cloud Linux：**

```bash
# 安装 PostgreSQL 16 和 contrib 扩展包（pgcrypto 需要）
sudo yum install -y postgresql16-server postgresql16-contrib

# 初始化数据库集群
sudo /usr/pgsql-16/bin/postgresql-16-setup initdb

# 启动并设置开机自启
sudo systemctl start postgresql-16
sudo systemctl enable postgresql-16
```

**Ubuntu / Debian：**

```bash
sudo apt update
sudo apt install -y postgresql-16 postgresql-contrib-16
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

**macOS（开发环境）：**

```bash
brew install postgresql@16
brew services start postgresql@16
```

#### 3.2 配置数据库认证

> ⚠️ **服务器部署关键步骤**：PostgreSQL 默认使用 `peer`/`ident` 认证，Node.js 的 `pg` 库通过 TCP 连接需要密码认证。

找到 `pg_hba.conf` 并修改：

```bash
# 查找配置文件位置
sudo -u postgres psql -c "SHOW hba_file;"

# 通常为 /var/lib/pgsql/16/data/pg_hba.conf（CentOS）或 /etc/postgresql/16/main/pg_hba.conf（Ubuntu）
```

修改为以下内容（**替换整文件对应行**）：

```conf
# 本地连接使用 md5 密码认证
local   all             all                                     md5

# IPv4 本地连接使用 md5 密码认证
host    all             all             127.0.0.1/32            md5

# IPv6 本地连接使用 md5 密码认证
host    all             all             ::1/128                 md5
```

重启 PostgreSQL 生效：

```bash
# CentOS / RHEL
sudo systemctl restart postgresql-16

# Ubuntu
sudo systemctl restart postgresql
```

#### 3.3 创建数据库和用户

```bash
# 创建数据库
sudo -u postgres psql -c "CREATE DATABASE aichat;"

# 创建用户（密码可自定义，需同步修改 server/.env 的 DATABASE_URL）
sudo -u postgres psql -c "CREATE USER aiuser WITH PASSWORD 'aichat_pass_2026';"

# 授权
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE aichat TO aiuser;"
```

#### 3.4 执行建表脚本

> ⚠️ **重要**：`schema.sql` 包含 `CREATE EXTENSION pgcrypto`，**必须用 postgres 超级用户执行**，普通用户无权限创建扩展。

```bash
cd server

# 用 postgres 超级用户执行（正确做法）
sudo -u postgres psql -d aichat -f schema.sql

# 给 aiuser 授予表权限（因为表 owner 是 postgres）
sudo -u postgres psql -d aichat -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO aiuser;"
sudo -u postgres psql -d aichat -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO aiuser;"
sudo -u postgres psql -d aichat -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO aiuser;"
sudo -u postgres psql -d aichat -c "ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO aiuser;"
```

> ❌ **以下命令会失败**（因为 aiuser 无法创建扩展）：
> ```bash
> psql -U aiuser -d aichat -f schema.sql        # 错误！权限不足
> cd server && npm run db:init                   # 同上，内部也是 aiuser
> ```

#### 3.5 验证表结构

```bash
PGPASSWORD=aichat_pass_2026 psql -U aiuser -d aichat -h localhost -c "\dt"
PGPASSWORD=aichat_pass_2026 psql -U aiuser -d aichat -h localhost -c "\d users"
```

确认 `users` 表包含以下字段：
- `subscription_start_at`
- `subscription_days`
- `token_quota`
- `token_used`

> ⚠️ **注意**：本项目不使用迁移脚本。`schema.sql` 是唯一的初始化脚本，可直接重复执行（使用 `IF NOT EXISTS` 和 `DROP POLICY IF EXISTS` 保证幂等性）。如果表结构需要变更，直接修改 `schema.sql` 后重新执行即可（开发环境可删库重建）。

> 如果用户想换数据库用户名/密码，需要同步修改 `server/.env` 中的 `DATABASE_URL`。

### Step 4：创建环境变量文件

这是最关键的一步。**以下两个文件不在 git 中，必须手动创建。**

#### 文件 A：`.env.local`（项目根目录）

```bash
# Authing (GenAuth) 配置
# 请向用户索取以下三项，填入真实值
VITE_AUTHING_APP_ID=
VITE_AUTHING_DOMAIN=
VITE_AUTHING_USER_POOL_ID=

# 后端 API 地址
# 本地开发：http://localhost:3001/api
# 生产环境（有域名）：https://yourdomain.com/api
VITE_API_BASE_URL=http://localhost:3001/api
```

#### 文件 B：`server/.env`（server 目录下）

```bash
# Server
PORT=3001
NODE_ENV=development

# PostgreSQL
DATABASE_URL=postgresql://aiuser:aichat_pass_2026@localhost:5432/aichat

# Authing
AUTHING_APP_ID=
AUTHING_APP_HOST=
AUTHING_JWKS_URL=

# Admin（管理员手机号，用于自动分配 admin 角色）
ADMIN_PHONE=17388978910

# DeepSeek（后端代理持有，前端不可见）
DEEPSEEK_API_KEY=

# File Upload
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800
```

### Step 5：启动服务

#### 5.1 本地开发模式

需要两个终端同时运行：

```bash
# 终端 1：前端（项目根目录）
npm run dev

# 终端 2：后端（server 目录）
npm run server
```

#### 5.2 生产部署模式

**构建前端：**

```bash
cd my-ai-chat
npm run build

# 生成的 dist/ 目录即为生产环境静态文件
```

**启动后端（生产环境）：**

```bash
cd server
NODE_ENV=production node index.js
```

**推荐：使用 PM2 进程守护（生产环境必备）**

```bash
# 安装 PM2
sudo npm install -g pm2

# 启动后端
cd server
pm2 start index.js --name "ai-chat-backend"

# 保存配置并设置开机自启
pm2 save
pm2 startup
```

> PM2 优势：进程崩溃自动重启、日志管理、负载监控、开机自启。

---

## 四、生产环境部署（Nginx + HTTPS）

如果用户有域名，需要配置 Nginx 反向代理 + SSL 证书。

### 4.1 安装 Nginx

```bash
# CentOS / RHEL
sudo yum install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx

# Ubuntu
sudo apt install -y nginx
sudo systemctl start nginx
sudo systemctl enable nginx
```

### 4.2 配置 Nginx

创建配置文件 `/etc/nginx/conf.d/yourdomain.conf`：

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # 前端静态文件
    location / {
        root /var/www/yourdomain;
        index index.html;
        try_files $uri $uri/ /index.html;
    }

    # 后端 API 代理
    location /api/ {
        proxy_pass http://localhost:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

复制前端构建产物：

```bash
sudo mkdir -p /var/www/yourdomain
sudo cp -r my-ai-chat/dist/* /var/www/yourdomain/
sudo chown -R nginx:nginx /var/www/yourdomain
sudo chmod -R 755 /var/www/yourdomain
```

### 4.3 配置 HTTPS（Let's Encrypt）

```bash
# 安装 certbot
sudo yum install -y certbot python3-certbot-nginx

# 自动申请证书并配置 Nginx
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# 测试自动续期
sudo certbot renew --dry-run
```

Certbot 会自动：
- 申请 SSL 证书
- 修改 Nginx 配置添加 443 端口
- 配置 HTTP → HTTPS 自动跳转
- 设置证书自动续期

### 4.4 修改前端 API 地址

部署到生产环境后，`.env.local` 需要改为域名：

```bash
VITE_API_BASE_URL=https://yourdomain.com/api
```

然后重新构建前端：

```bash
cd my-ai-chat
npm run build
sudo cp -r dist/* /var/www/yourdomain/
```

---

## 五、需要向用户索取的信息清单

Kimi 在部署前，必须向用户确认以下配置。这些信息**不会**随着 `git clone` 自动带到新电脑。

### 🔴 必须提供（没有就无法运行）

| 信息项 | 用途 | 填在哪里 |
|--------|------|----------|
| **DeepSeek API Key** | AI 对话、报告生成 | `server/.env` 的 `DEEPSEEK_API_KEY` |
| **Authing App ID** | 前端 Authing SDK 初始化 + 后端 JWT 验签 | `.env.local` 的 `VITE_AUTHING_APP_ID` + `server/.env` 的 `AUTHING_APP_ID` |
| **Authing Domain** | 前端 Authing SDK 初始化 + 后端 JWT 验签 | `.env.local` 的 `VITE_AUTHING_DOMAIN` + `server/.env` 的 `AUTHING_APP_HOST` |
| **Authing User Pool ID** | 前端 Authing SDK 初始化 | `.env.local` 的 `VITE_AUTHING_USER_POOL_ID` |
| **Authing JWKS URL** | 后端 JWT 签名验证 | `server/.env` 的 `AUTHING_JWKS_URL`（通常是 `https://<domain>/oidc/.well-known/jwks.json`） |
| **数据库连接信息** | 后端连接 PostgreSQL | `server/.env` 的 `DATABASE_URL`（如果用户名/密码/数据库名和默认值不同） |

### 🟡 可选提供（有默认值）

| 信息项 | 默认值 | 填在哪里 |
|--------|--------|----------|
| 管理员手机号 | `17388978910` | `server/.env` 的 `ADMIN_PHONE` |
| 后端端口 | `3001` | `server/.env` 的 `PORT` |

### 🔒 安全提醒（Kimi 必须告诉用户）

- **App Secret** 不要告诉任何人，包括 Kimi。当前代码没有使用 App Secret，不需要配置。
- **DeepSeek API Key** 绝不可写入任何 `.ts/.js` 源码文件，只能放在 `server/.env` 中。
- **`.env` 和 `.env.local` 已在 `.gitignore` 中**，不会进入 git，这是安全的。

---

## 六、部署后验证清单

### 本地开发验证

- [ ] 浏览器打开 `http://localhost:5173`，页面正常加载
- [ ] 使用手机号验证码登录成功
- [ ] 发起一次 AI 对话，回复正常
- [ ] 浏览器 DevTools → Network 面板，**确认没有请求到 `api.deepseek.com`**（所有 AI 请求应走 `localhost:3001/api/ai`）
- [ ] 后端控制台没有报错

### 生产环境验证

- [ ] 浏览器打开 `https://yourdomain.com`，页面正常加载
- [ ] 登录成功
- [ ] 发起 AI 对话正常
- [ ] Network 面板确认 API 请求走域名，不是 localhost
- [ ] 后端 PM2 状态正常：`pm2 status`
- [ ] SSL 证书有效：浏览器地址栏显示 🔒

---

## 七、数据库清理与重建（Kimi 必须掌握）

### 场景 A：全新环境首次初始化

引导用户执行 Step 3 即可，见上文。

### 场景 B：表结构变更后重建（开发环境最常用）

如果用户反馈"数据库报错 column does not exist"或"表结构不对"，使用以下一键重建命令：

```bash
# 1. 删除并重建数据库（数据全清，仅开发环境使用！）
sudo -u postgres psql -c "DROP DATABASE IF EXISTS aichat; CREATE DATABASE aichat;"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE aichat TO aiuser;"

# 2. 重新执行 schema.sql（用 postgres 超级用户）
cd server
sudo -u postgres psql -d aichat -f schema.sql

# 3. 重新授权
sudo -u postgres psql -d aichat -c "GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO aiuser;"
sudo -u postgres psql -d aichat -c "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO aiuser;"

# 4. 重启后端服务（必须重启，因为连接池缓存了旧结构）
```

> ⚠️ **警告**：此操作会删除所有数据！如果用户需要保留数据，见场景 C。

### 场景 C：保留数据，仅修复表结构

如果不想清数据，引导用户手动 ALTER TABLE：

```bash
# 以 aiuser 连接数据库
PGPASSWORD=aichat_pass_2026 psql -U aiuser -d aichat -h localhost

# 检查 users 表字段
\d users

# 如果缺少 subscription 相关字段，手动添加：
ALTER TABLE users
ADD COLUMN IF NOT EXISTS subscription_start_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_days INT DEFAULT 7,
ADD COLUMN IF NOT EXISTS token_quota BIGINT DEFAULT 100000,
ADD COLUMN IF NOT EXISTS token_used BIGINT DEFAULT 0;
```

### 场景 D：数据迁移到新电脑

```bash
# 旧电脑导出
pg_dump -U aiuser -d aichat > aichat_backup.sql

# 复制到新电脑后导入
sudo -u postgres psql -c "CREATE DATABASE aichat;"
PGPASSWORD=aichat_pass_2026 psql -U aiuser -d aichat -h localhost < aichat_backup.sql
```

### 场景 E：验证表结构是否正确

```bash
PGPASSWORD=aichat_pass_2026 psql -U aiuser -d aichat -h localhost -c "\d users"
```

正确输出应包含以下字段：
- `subscription_start_at`
- `subscription_days`
- `token_quota`
- `token_used`

如果没有这些字段，说明初始化脚本没有正确执行，按场景 B 重建。

---

## 八、常见问题

### Q1：前端报 `import.meta.env` 类型错误
**解决**：确保项目根目录存在 `src/vite-env.d.ts`，内容如下：
```typescript
/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_AUTHING_APP_ID: string;
  readonly VITE_AUTHING_DOMAIN: string;
  readonly VITE_AUTHING_USER_POOL_ID: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

### Q2：后端报 `DEEPSEEK_API_KEY 未配置`
**解决**：检查 `server/.env` 中是否填写了 `DEEPSEEK_API_KEY`。

### Q3：后端报 `JWKS 未初始化`
**解决**：检查 `server/.env` 中 `AUTHING_APP_HOST` 或 `AUTHING_JWKS_URL` 是否填写正确。

### Q4：登录成功但 API 返回 401 / Token 验证失败
**解决**：
1. 检查 `server/.env` 的 `AUTHING_JWKS_URL` 是否与 Authing 控制台一致。不同版本的 Authing，JWKS 路径可能不同（`/.well-known/jwks.json` vs `/oidc/.well-known/jwks.json`）。
2. **如果已经换过域名**：退出登录，重新用手机号验证码登录获取新 Token。
3. 检查后端日志是否有数据库连接错误（见 Q6）。

### Q5：数据库连接失败 / password authentication failed
**解决**：
1. 确认 PostgreSQL 服务已启动：`sudo systemctl status postgresql-16`
2. 确认 `pg_hba.conf` 已配置为 `md5` 认证（见 Step 3.2）
3. 确认数据库 `aichat` 和用户 `aiuser` 已创建
4. 确认 `schema.sql` 已执行
5. 检查 `server/.env` 的 `DATABASE_URL` 是否正确
6. **如果修改过 pg_hba.conf**：重启 PostgreSQL 后，重新设置 aiuser 密码：
   ```bash
   sudo -u postgres psql -c "ALTER USER aiuser WITH PASSWORD 'aichat_pass_2026';"
   ```

### Q6：网页报 502 Bad Gateway
**解决**：
1. 确认后端服务在运行：`curl http://localhost:3001/api/usage/me`
2. 确认 Nginx 配置正确，`/api/` 代理到 `localhost:3001`
3. 检查 Nginx 错误日志：`sudo tail -20 /var/log/nginx/error.log`
4. 如果后端已启动还是 502，检查 SELinux 或防火墙是否阻止了 Nginx 连接后端

### Q7：前端页面加载但 API 请求报 CORS 错误
**解决**：
1. 检查 `server/.env` 的 `NODE_ENV` 是否为 `production`
2. 检查后端 CORS 配置是否包含当前域名
3. 确认 `VITE_API_BASE_URL` 配置的是域名，不是 `localhost`

---

## 九、如果用户要从旧电脑迁移数据

如果用户想保留旧电脑的数据（用户账户、对话记录等），需要：

1. 在旧电脑执行数据库导出：
   ```bash
   pg_dump -U aiuser -d aichat > aichat_backup.sql
   ```
2. 将 `aichat_backup.sql` 复制到新电脑
3. 在新电脑导入：
   ```bash
   sudo -u postgres psql -c "CREATE DATABASE aichat;"
   PGPASSWORD=aichat_pass_2026 psql -U aiuser -d aichat -h localhost < aichat_backup.sql
   ```

---

*本文档应与代码同步维护。如果项目结构或依赖发生变更，请更新此文档。*
