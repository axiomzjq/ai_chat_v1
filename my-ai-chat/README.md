# 🤖 AI 创始人 IP 深度定制系统

基于 React + Express + PostgreSQL + DeepSeek 的创始人 IP 智能定制平台，支持四步工作流（访谈 → 信息 → 定位 → 文案）。

---

## 🚀 快速开始

### 1. 克隆项目

```bash
git clone git@github.com:axiomzjq/ai_chat_v1.git
cd ai_chat_v1
```

### 2. 安装依赖

```bash
# 前端
npm install

# 后端
cd server && npm install
```

### 3. 配置环境变量

**前端**：项目根目录创建 `.env.local`

```bash
VITE_AUTHING_APP_ID=你的 Authing App ID
VITE_AUTHING_DOMAIN=你的 Authing Domain
VITE_AUTHING_USER_POOL_ID=你的 Authing User Pool ID
```

**后端**：`server/.env`

```bash
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://aiuser:aichat_pass_2026@localhost:5432/aichat
AUTHING_APP_ID=你的 Authing App ID
AUTHING_APP_HOST=https://你的域名.authing.cn
AUTHING_JWKS_URL=https://你的域名.authing.cn/oidc/.well-known/jwks.json
ADMIN_PHONE=管理员手机号
DEEPSEEK_API_KEY=你的 DeepSeek API Key
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800
```

> `.env` 和 `.env.local` 已在 `.gitignore` 中，不会进入 git。

### 4. 初始化数据库

**首次部署（新环境）**：

```bash
# 创建数据库和用户
psql -U postgres -c "CREATE DATABASE aichat;"
psql -U postgres -c "CREATE USER aiuser WITH PASSWORD 'aichat_pass_2026';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE aichat TO aiuser;"

# 执行建表脚本
cd server
psql -U aiuser -d aichat -f schema.sql
# 或: npm run db:init
```

### 5. 启动服务

需要两个终端同时运行：

```bash
# 终端 1：前端（项目根目录）
npm run dev

# 终端 2：后端（server 目录）
npm run server
```

浏览器打开 `http://localhost:5173`

---

## 🗑️ 数据库清理与重建

### 场景 1：表结构变更后重建（开发环境）

如果你修改了 `schema.sql` 或发现表结构不对，可以一键重建：

```bash
# 1. 删库重建（数据全清，仅开发环境使用）
psql -U postgres -c "DROP DATABASE IF EXISTS aichat; CREATE DATABASE aichat;"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE aichat TO aiuser;"

# 2. 重新执行 schema.sql
cd server
psql -U aiuser -d aichat -f schema.sql

# 3. 重启后端服务
```

### 场景 2：保留数据，仅修复表结构

如果不想清数据，可以手动 ALTER TABLE：

```bash
# 以 aiuser 身份连接数据库
psql -U aiuser -d aichat

# 检查 users 表字段
\d users

# 如果缺少 subscription 相关字段，手动添加：
ALTER TABLE users
ADD COLUMN IF NOT EXISTS subscription_start_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_days INT DEFAULT 7,
ADD COLUMN IF NOT EXISTS token_quota BIGINT DEFAULT 100000,
ADD COLUMN IF NOT EXISTS token_used BIGINT DEFAULT 0;
```

### 场景 3：数据迁移到新电脑

```bash
# 旧电脑导出
pg_dump -U aiuser -d aichat > aichat_backup.sql

# 复制到新电脑后导入
psql -U postgres -c "CREATE DATABASE aichat;"
psql -U aiuser -d aichat < aichat_backup.sql
```

---

## 🏗️ 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19 + TypeScript + Vite 6.2 + Tailwind CSS 4.1 |
| 后端 | Express 4.x + Node.js 18+ |
| 数据库 | PostgreSQL 14+ |
| 认证 | Authing（手机号验证码） |
| AI | DeepSeek API（后端代理，前端不持有 Key） |

---

## 📁 目录结构

```
my-ai-chat/
├── src/                    # 前端源码
│   ├── App.tsx            # 主应用（四步工作流）
│   ├── lib/
│   │   ├── api.ts         # 后端 API 客户端
│   │   ├── authing.ts     # Authing 配置
│   │   ├── deepseek.ts    # DeepSeek 客户端（调用后端代理）
│   │   └── ...
│   └── vite-env.d.ts      # 环境变量类型声明
├── server/                 # 后端源码
│   ├── index.js           # Express 入口
│   ├── schema.sql         # 数据库建表脚本（唯一初始化脚本）
│   ├── middleware/
│   │   └── auth.js        # JWT 验签（jose + Authing JWKS）
│   └── routes/
│       ├── ai.js          # DeepSeek 代理路由
│       ├── auth.js        # 认证
│       ├── profiles.js    # 用户画像
│       ├── admin.js       # 管理员后台
│       └── ...
├── docs/
│   ├── ONBOARDING.md      # 新环境部署指南
│   ├── security-refactoring.md  # 安全重构方案
│   └── production-deployment.md # 生产部署指南
├── .env.local             # 前端环境变量（.gitignore）
├── server/.env            # 后端环境变量（.gitignore）
└── README.md              # 本文件
```

---

## 📚 相关文档

- [新环境部署指南](docs/ONBOARDING.md) — 给 Kimi 助手的完整部署提示词
- [安全重构方案](docs/security-refactoring.md) — 旧方案 vs 新方案对比
- [生产部署指南](docs/production-deployment.md) — 生产环境部署参考
- [安全修复清单](SECURITY_TODO.md) — 安全任务跟踪

---

## ⚠️ 注意事项

1. **API Key 安全**：DeepSeek API Key 仅存在于 `server/.env`，前端通过后端代理调用，bundle 中不会出现 Key。
2. **不使用迁移脚本**：本项目使用单一 `schema.sql` 初始化，开发环境可直接删库重建。
3. **DEBUG_MODE**：生产环境务必将 `src/lib/debug.ts` 中的 `DEBUG_MODE` 设为 `false`。
4. **Node.js 版本**：≥ 18（后端使用原生 `fetch`）。

---

## 🔧 常见问题

**Q: 后端报错 `column "subscription_days" does not exist`**
A: 执行数据库重建命令（见上文"场景 1"），或手动 ALTER TABLE 添加缺失字段。

**Q: 登录成功但 API 返回 401**
A: 检查 `server/.env` 的 `AUTHING_JWKS_URL` 是否正确。不同 Authing 版本路径可能不同。

**Q: 前端报 `import.meta.env` 类型错误**
A: 确保 `src/vite-env.d.ts` 存在且内容正确。
