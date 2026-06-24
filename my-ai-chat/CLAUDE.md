# AI Chat 项目知识库

> 本文档是 Claude Code 了解项目的基础知识，包含技术栈、架构、运行规则和开发规范。
> 最后更新：2026-06-25

---

## 📋 目录

1. [项目基本信息](#1-项目基本信息)
2. [技术栈](#2-技术栈)
3. [目录结构](#3-目录结构)
4. [服务运行规则](#4-服务运行规则)
5. [核心功能](#5-核心功能)
6. [数据库架构](#6-数据库架构)
7. [API 架构](#7-api-架构)
8. [开发规范](#8-开发规范)
9. [运维脚本](#9-运维脚本)
10. [常见问题](#10-常见问题)

---

## 1. 项目基本信息

### 项目定位
**ToB 创始人 IP 深度定制系统** - 基于 React + Express + PostgreSQL + 智谱 AI 的四步工作流平台

| 项目 | 说明 |
|------|------|
| **项目名称** | my-ai-chat |
| **前端端口** | 5173（开发） |
| **后端端口** | 3001 |
| **GitHub** | `git@github.com:axiomzjq/ai_chat_v1.git` |
| **代码仓库** | `/home/admin/work/ai_chat_v1/my-ai-chat` |

### 分支策略
- **main** - 开发主分支（最新功能）
- **release** - 稳定版本分支（生产部署）
- 定期从 main 合并到 release

### 关键决策记录
| 时间 | 决策 | 原因 |
|------|------|------|
| 2026-05-22 | 从 Firebase 迁移到 Authing + PostgreSQL | Firebase 在中国大陆被墙 |
| 2026-05-22 | 双 SDK 方案（@authing/web + authing-js-sdk） | OAuth 弹窗 + 手机号验证码各需不同 SDK |
| 2026-05-23 | embedding 降级为 JSONB | 本地未安装 pgvector 扩展 |
| 2026-05-27 | 引入 DEBUG_MODE | 调试入口可一键移除 |
| 2026-05-27 | AI 从 Gemini 迁移到 DeepSeek | Gemini 503 过载，DeepSeek 更稳定 |
| 2026-06-25 | 删除顶部导航按钮 | 简化 UI，避免重复导航 |

---

## 2. 技术栈

### 前端
| 技术 | 版本 | 用途 |
|------|------|------|
| React | ^19.0.0 | UI 框架 |
| TypeScript | ~5.8.2 | 类型系统 |
| Vite | ^6.2.0 | 构建工具 |
| Tailwind CSS | ^4.1.14 | 样式框架 |
| Authing SDK | ^5.1.21 | 认证系统 |
| motion | ^12.23.24 | 动画库 |
| lucide-react | ^0.546.0 | 图标库 |
| react-markdown | ^10.1.0 | Markdown 渲染 |

### 后端
| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | v24.15.0 | 运行环境（≥18） |
| Express | ^4.x | Web 框架 |
| PostgreSQL | 18 | 关系型数据库 |
| pg | ^8.x | PostgreSQL 驱动 |
| jose | ^6.2.3 | JWT 验证 |

### AI 服务
| 技术 | 用途 |
|------|------|
| **智谱 AI (ZhipuAI)** | 对话和 RAG（当前使用） |
| **DeepSeek** | 备用（已废弃，代码中仍有残留） |

### 数据库
| 组件 | 版本 | 用途 |
|------|------|------|
| PostgreSQL | 18 | 主数据库 |
| pgcrypto | - | UUID 生成 |
| pgvector | - | 向量检索（预留，未安装） |

---

## 3. 目录结构

```
my-ai-chat/
├── src/                          # 前端源码
│   ├── App.tsx                   # 主组件（~3100行，核心业务逻辑）
│   ├── main.tsx                  # 入口文件
│   ├── firebase.ts               # Authing 认证适配层
│   ├── index.css                 # Tailwind 入口
│   ├── hooks/useAuthing.ts       # Authing Hook（预留）
│   └── lib/
│       ├── api.ts                # 前端 API 客户端
│       ├── authing.ts            # Authing 配置
│       ├── deepseek.ts           # DeepSeek 客户端（已废弃）
│       ├── debug.ts              # ⭐ 调试模式开关
│       ├── logger.ts             # 日志拦截器
│       └── utils.ts              # 工具函数
│
├── server/                       # 后端服务
│   ├── index.js                  # Express 入口
│   ├── db.js                     # PostgreSQL 连接池
│   ├── schema.sql                # 数据库建表脚本
│   ├── .env                      # 后端环境变量（不在 git 中）
│   ├── .env.example              # 环境变量模板
│   ├── middleware/
│   │   ├── auth.js               # JWT 认证中间件
│   │   ├── errorHandler.js       # 全局错误处理
│   │   └── rateLimit.js          # 限流中间件
│   └── routes/
│       ├── auth.js               # /api/auth/*
│       ├── conversations.js      # /api/conversations/*
│       ├── messages.js           # /api/conversations/:id/messages/*
│       ├── profiles.js           # /api/user/profile/*
│       ├── knowledgeBase.js      # /api/kb/*
│       ├── usage.js              # /api/usage/*
│       ├── feedback.js           # /api/feedback/*
│       ├── admin.js              # /api/admin/*
│       └── ai.js                 # /api/ai/* (智谱 AI 代理)
│
├── scripts/                      # 运维脚本
│   ├── check-services.sh         # 服务健康检查脚本
│   ├── restart-all.sh            # ⭐ 一键重启所有服务
│   └── build-index.js            # 知识库索引构建（预留）
│
├── docs/                         # 项目文档
│   ├── ONBOARDING.md             # 新环境部署指南
│   ├── api-specification.md      # REST API 规范
│   ├── database-schema.md        # 数据库 Schema 文档
│   ├── debug-mode.md             # 调试模式文档
│   └── rag/ARCHITECTURE.md       # RAG 系统架构（预留）
│
├── knowledge-base/               # 知识库文件存储
│   ├── raw/                      # 原始文档
│   ├── processed/                # 清洗后文本（gitignored）
│   └── embeddings/               # 向量索引（gitignored）
│
├── ai-database/                  # 知识库文档（从 elitefounder-ai 提取）
├── package.json                  # 前端依赖
├── server/package.json           # 后端依赖
├── vite.config.ts                # Vite 配置
├── .env.example                  # 前端环境变量模板
├── server/.env.example           # 后端环境变量模板
└── README.md                     # 项目说明
```

---

## 4. 服务运行规则

### PM2 进程管理

| 服务名 | 端口 | 启动命令 | 说明 |
|--------|------|---------|------|
| **ai-chat-backend** | 3001 | `cd server && npm run dev` | 后端 API |
| **ai-chat-frontend** | 5173 | `npm run dev` | 前端 Vite |

**当前状态：** 使用 `vite preview` 模式（生产环境）或 `vite dev`（开发环境）

### PM2 常用命令

```bash
# 查看状态
pm2 status

# 重启所有服务
pm2 restart ai-chat-backend ai-chat-frontend

# 重启指定服务
pm2 restart ai-chat-backend

# 查看日志
pm2 logs ai-chat-backend
pm2 logs ai-chat-frontend

# 停止服务
pm2 stop ai-chat-backend ai-chat-frontend

# 保存配置
pm2 save

# 开机自启
pm2 startup
```

### 一键重启脚本

```bash
cd /home/admin/work/ai_chat_v1/my-ai-chat
./scripts/restart-all.sh
```

**功能：**
- ✅ 检查 PM2 进程是否存在
- ✅ 重启或启动后端
- ✅ 重启或启动前端
- ✅ 检查端口监听
- ✅ 检查 HTTP 健康状态
- ✅ 输出访问地址

### 服务健康检查

```bash
cd /home/admin/work/ai_chat_v1/my-ai-chat
./scripts/check-services.sh
```

**检查项（5项）：**
1. PostgreSQL 16 服务
2. PM2 后端进程
3. PM2 前端进程
4. 端口监听（3001/5173）
5. HTTP 健康检查

### 中间件链（后端）

```
请求 → CORS → JSON解析 → 认证中间件 → 限流中间件 → 路由处理 → 错误处理
```

### 限流规则

| 路由类型 | 限制 | 说明 |
|---------|------|------|
| `message` | 20 次/分钟 | AI 对话消息 |
| `upload` | 5 次/分钟 | 文件上传 |
| `search` | 20 次/分钟 | 知识库搜索 |
| `default` | 60 次/分钟 | 其他接口 |

**实现：** 内存级 `Map<userId, timestamps>`（生产环境建议 Redis）

---

## 5. 核心功能

### 四步工作流

| 步骤 | Agent | 解锁条件 | 导航 |
|------|-------|---------|------|
| **访谈** | 访谈顾问 | 始终可进 | 始终可用 |
| **定位** | 定位顾问 | 完成访谈并生成报告 | 访谈完成后解锁 |
| **文案** | 文案顾问 | 访谈完成后可跳过定位 | 访谈完成后解锁 |
| **历史** | — | 始终可进 | 始终可用 |

**关键规则：**
- 访谈第 20 轮后解锁"生成深度报告"按钮
- 报告生成手动触发（非自动）
- 步骤导航已简化（删除了顶部圆形按钮）

### 认证系统

| 方式 | SDK | 说明 |
|------|-----|------|
| **手机号验证码** | `authing-js-sdk` | 登录/注册 |
| **Google OAuth** | `@authing/web` | OAuth 弹窗 |

**管理员识别：**
- 基于 `ADMIN_PHONE` 环境变量
- 默认管理员手机号：`17388978910`

**JWT 验证策略：**
```
Token → 优先 JWKS 验签（RS256）
      → 失败则降级到 Authing GraphQL API
```
- Authing access token 通常是 **HS256**（对称加密）
- JWKS 只包含 **RS256** 公钥
- **所以 HS256 token 直接跳过 JWKS，走 GraphQL 降级**

### 消息自动滚动

```typescript
const chatEndRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  if (isStarted) {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }
}, [messages, isStarted]);

// 在消息列表底部放置锚点
<div ref={chatEndRef} />
```

**触发条件：**
- `messages` 数组变化（新消息到达）
- `isStarted` 变为 `true`（首次进入对话）

**效果：** 平滑滚动 (`smooth`) 到消息列表底部

### 调试系统

**开关：** `src/lib/debug.ts` 中的 `DEBUG_MODE`

| 值 | 说明 |
|----|------|
| `'off'` | 关闭（生产环境） |
| `'internal'` | 内部测试模式（当前） |

**开启时显示：**
- 登录页"导出调试日志"按钮
- Header Bug 图标按钮
- 一键还原按钮（清空所有数据）

---

## 6. 数据库架构

### 7 张核心表

| 表名 | 用途 | 关键字段 |
|------|------|---------|
| **users** | 用户主表 | authing_id, phone, role, subscription_* |
| **conversations** | 对话会话 | user_id, title, status, current_step |
| **messages** | 对话消息 | conversation_id, role, content, tokens |
| **user_profiles** | 用户画像 | user_id, interview_data, reports |
| **knowledge_base** | 知识库 | title, content, category, embedding |
| **usage_stats** | 使用统计 | user_id, date, counts |
| **feedback** | 用户反馈 | user_id, type, content, status |

### 行级安全策略（RLS）

```sql
-- 用户只能访问自己的数据
CREATE POLICY user_conversations ON conversations
  FOR ALL USING (user_id = current_setting('app.current_user')::UUID);

-- 知识库：所有用户可读，仅管理员可写
CREATE POLICY kb_write_admin ON knowledge_base
  FOR ALL USING (current_setting('app.current_user_role')::TEXT = 'admin');
```

**后端设置会话变量：**
```javascript
await db.query(`SELECT set_config('app.current_user', $1, false)`, [user.id]);
await db.query(`SELECT set_config('app.current_user_role', $1, false)`, [user.role]);
```

### 数据初始化

```bash
# 建表脚本（唯一初始化脚本）
cd server && sudo -u postgres psql -d aichat -f schema.sql
```

**注意：** 不使用迁移脚本，直接修改 `schema.sql` 后重新执行即可。

---

## 7. API 架构

### 路由结构

```
/api
├── /auth/*              → 认证（POST /verify）
├── /conversations/*     → 对话 CRUD
├── /conversations/:id/messages/*  → 消息管理
├── /user/profile/*      → 用户画像
├── /knowledge-base/*    → 知识库（管理员写，所有人读）
├── /usage/*            → 使用统计
├── /feedback/*         → 反馈
├── /admin/*            → 管理员后台
└── /ai/*               → AI 代理（智谱 AI）
```

### AI 代理配置（当前）

| 配置项 | 值 |
|--------|-----|
| **服务商** | 智谱 AI (ZhipuAI) |
| **API 地址** | `https://open.bigmodel.cn/api/paas/v4` |
| **默认模型** | `glm-5.1` |
| **RAG** | 智谱知识库 ID（`ZHIPU_KNOWLEDGE_ID`） |

**RAG 实现：**
- 使用智谱 AI 原生 RAG 能力（`type: 'retrieval'`）
- 无需本地 embedding 和向量检索
- 知识库 ID 优先从请求体读取，fallback 到环境变量

### 环境变量

#### 前端（`.env.local`）

```env
VITE_API_BASE_URL=http://localhost:3001
VITE_AUTHING_APP_ID=your_app_id
VITE_AUTHING_DOMAIN=your-domain.authing.cn
VITE_AUTHING_APP_SECRET=your_app_secret
VITE_AUTHING_USER_POOL_ID=your_pool_id
VITE_ZHIPU_KNOWLEDGE_ID=your_knowledge_id
```

#### 后端（`server/.env`）

```env
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://aiuser:password@localhost:5432/aichat

# Authing
AUTHING_APP_ID=your_app_id
AUTHING_APP_SECRET=your_app_secret
AUTHING_APP_HOST=https://your-domain.authing.cn
AUTHING_JWKS_URL=https://your-domain.authing.cn/oidc/.well-known/jwks.json

# 智谱 AI
ZHIPU_API_KEY=your_zhipu_api_key
ZHIPU_KNOWLEDGE_ID=your_knowledge_id

# 管理员
ADMIN_PHONE=17388978910
```

---

## 8. 开发规范

### Git 提交规范

采用 **Conventional Commits**：

| 类型 | 说明 | 示例 |
|------|------|------|
| `feat:` | 新功能 | `feat: 添加语音识别功能` |
| `fix:` | Bug 修复 | `fix: 修复导航按钮重复显示` |
| `chore:` | 配置/工具 | `chore: 更新 Authing 配置` |
| `perf:` | 性能优化 | `perf: 降低 max_tokens` |
| `docs:` | 文档 | `docs: 更新 README` |

### 代码修改流程

```bash
# 1. 修改代码
vim src/App.tsx

# 2. 本地测试
npm run dev

# 3. 提交
git add .
git commit -m "feat: 添加新功能"
git push

# 4. 重启服务
pm2 restart ai-chat-backend ai-chat-frontend

# 5. 验证
./scripts/check-services.sh
```

### ⚠️ 重要规则

**代码修改后必须：**
1. ✅ 更新相关文档（README、docs/ 目录）
2. ✅ 更新 CLAUDE.md（如果是重要功能）
3. ✅ 更新知识库（新增特性或变更）
4. ✅ 提交 Git（`git commit`）
5. ✅ 重启服务（`pm2 restart`）
6. ✅ 验证服务（`./scripts/check-services.sh`）

### 安全规范

- ❌ 禁止将 API Key 提交到 git
- ❌ 禁止在 `.ts/.js` 源码中硬编码密钥
- ✅ 所有密钥必须放在 `.env` 文件中
- ✅ `.env` 和 `.env.local` 已在 `.gitignore` 中
- ⚠️ 生产环境必须设置 `DEBUG_MODE = 'off'`

---

## 9. 运维脚本

### scripts/check-services.sh

**功能：** 检查 5 项核心服务状态

```bash
cd /home/admin/work/ai_chat_v1/my-ai-chat
./scripts/check-services.sh
```

**检查项：**
1. PostgreSQL 16
2. PM2 后端服务
3. PM2 前端服务
4. 端口监听（3001/5173）
5. HTTP 健康检查

### scripts/restart-all.sh ⭐

**功能：** 一键重启所有服务

```bash
cd /home/admin/work/ai_chat_v1/my-ai-chat
./scripts/restart-all.sh
```

**功能特性：**
- ✅ 检查 PM2 是否安装
- ✅ 检查 PM2 进程是否存在
- ✅ 自动重启或启动后端
- ✅ 自动重启或启动前端
- ✅ 检查端口监听
- ✅ 检查 HTTP 健康状态
- ✅ 输出访问地址和错误提示

**跳过检查：**
```bash
./scripts/restart-all.sh --skip-check
```

### scripts/build-index.js

**功能：** 知识库向量索引构建（预留）

```bash
cd /home/admin/work/ai_chat_v1/my-ai-chat
node scripts/build-index.js
```

**当前状态：** ⚠️ **骨架代码，未实现具体逻辑**

---

## 10. 常见问题

### Q1: 前端修改不生效？

**原因：** PM2 使用 `vite preview` 模式，不会自动重新编译

**解决：**
```bash
# 重启前端服务
pm2 restart ai-chat-frontend

# 或重启所有
./scripts/restart-all.sh
```

### Q2: 后端报错 "ZHIPU_API_KEY 未配置"

**解决：** 检查 `server/.env` 中是否填写了 `ZHIPU_API_KEY`

### Q3: 登录成功但 API 返回 401

**解决：**
1. 检查 `server/.env` 的 `AUTHING_JWKS_URL` 是否正确
2. 退出登录，重新用手机号验证码登录获取新 Token
3. 检查后端日志是否有数据库连接错误

### Q4: 数据库连接失败

**解决：**
1. 确认 PostgreSQL 服务已启动：`sudo systemctl status postgresql-16`
2. 确认 `DATABASE_URL` 配置正确
3. 确认数据库 `aichat` 和用户 `aiuser` 已创建

### Q5: PM2 进程崩溃

**解决：**
```bash
# 查看日志
pm2 logs ai-chat-backend

# 重启服务
pm2 restart ai-chat-backend

# 查看状态
pm2 status
```

---

## 📌 快速参考

### 启动服务（开发环境）

```bash
# 方法1: PM2（推荐）
cd /home/admin/work/ai_chat_v1/my-ai-chat
pm2 start npm --name "ai-chat-frontend" -- start
pm2 start npm --name "ai-chat-backend" -- start
cd server && npm run dev

# 方法2: 手动启动（两个终端）
# 终端1: npm run dev
# 终端2: cd server && npm run dev
```

### 停止服务

```bash
pm2 stop ai-chat-backend ai-chat-frontend
```

### 查看日志

```bash
pm2 logs                    # 所有日志
pm2 logs ai-chat-backend    # 后端日志
pm2 logs ai-chat-frontend   # 前端日志
```

### 访问地址

- **前端：** http://localhost:5173
- **后端：** http://localhost:3001
- **健康检查：** http://localhost:3001/health

---

*最后更新：2026-06-25*
