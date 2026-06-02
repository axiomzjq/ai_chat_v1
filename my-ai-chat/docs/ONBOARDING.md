# 🚀 新环境部署指南（给 Kimi 助手的提示词）

> 本文档用于帮助新的 Kimi 实例快速了解项目结构，协助用户在全新电脑上完成部署。
> 如果 Kimi 正在阅读此文档，请按以下结构逐步引导用户操作。

---

## 一、项目基本信息

| 项目 | 说明 |
|------|------|
| **项目名称** | my-ai-chat（AI 创始人 IP 深度定制系统） |
| **前端** | React 19 + TypeScript + Vite 6.2.0 + Tailwind CSS 4.1.14 |
| **后端** | Express 4.x + Node.js 18+ + PostgreSQL |
| **认证** | Authing 手机号验证码（`@authing/web` + `@authing/guard-react`） |
| **AI 引擎** | DeepSeek API（`deepseek-v4-flash`，通过后端代理） |
| **前端端口** | 5173 |
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

### Step 1：克隆代码

```bash
git clone git@github.com:axiomzjq/ai_chat_v1.git
cd ai_chat_v1
```

### Step 2：安装 Node.js 依赖

```bash
# 前端依赖
npm install

# 后端依赖
cd server && npm install
```

> **注意**：后端使用了原生 `fetch`（Node.js 18+ 支持），请确保 Node.js 版本 ≥ 18。可用 `node --version` 检查。

### Step 3：安装 PostgreSQL 并创建数据库

用户需要在本机安装 PostgreSQL。然后执行：

```bash
# 创建数据库和用户（以 postgres 超级用户执行）
psql -U postgres -c "CREATE DATABASE aichat;"
psql -U postgres -c "CREATE USER aiuser WITH PASSWORD 'aichat_pass_2026';"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE aichat TO aiuser;"

# 执行建表脚本（在 server 目录下）
cd server
psql -U aiuser -d aichat -f schema.sql
```

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

需要两个终端同时运行：

```bash
# 终端 1：前端（项目根目录）
npm run dev

# 终端 2：后端（server 目录）
npm run server
```

---

## 四、需要向用户索取的信息清单

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

## 五、部署后验证清单

启动成功后，Kimi 应引导用户完成以下验证：

- [ ] 浏览器打开 `http://localhost:5173`，页面正常加载
- [ ] 使用手机号验证码登录成功
- [ ] 发起一次 AI 对话，回复正常
- [ ] 浏览器 DevTools → Network 面板，**确认没有请求到 `api.deepseek.com`**（所有 AI 请求应走 `localhost:3001/api/ai`）
- [ ] 后端控制台没有报错

---

## 六、常见问题

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

### Q4：登录成功但 API 返回 401
**解决**：检查 `server/.env` 的 `AUTHING_JWKS_URL` 是否与 Authing 控制台一致。不同版本的 Authing，JWKS 路径可能不同（`/.well-known/jwks.json` vs `/oidc/.well-known/jwks.json`）。

### Q5：数据库连接失败
**解决**：
1. 确认 PostgreSQL 服务已启动
2. 确认数据库 `aichat` 和用户 `aiuser` 已创建
3. 确认 `schema.sql` 已执行
4. 检查 `server/.env` 的 `DATABASE_URL` 是否正确

---

## 七、如果用户要从旧电脑迁移数据

如果用户想保留旧电脑的数据（用户账户、对话记录等），需要：

1. 在旧电脑执行数据库导出：
   ```bash
   pg_dump -U aiuser -d aichat > aichat_backup.sql
   ```
2. 将 `aichat_backup.sql` 复制到新电脑
3. 在新电脑导入：
   ```bash
   psql -U aiuser -d aichat < aichat_backup.sql
   ```

---

*本文档应与代码同步维护。如果项目结构或依赖发生变更，请更新此文档。*
