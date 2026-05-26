# PostgreSQL 迁移计划

> 目标：将数据存储从 Firebase/Firestore 迁移到本地 PostgreSQL
> 状态：新系统（无历史数据需迁移）
> 预计工作量：1-2 天

---

## 一、总体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                           前端 (React + Vite)                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  Authing    │  │  API Client │  │  Local Storage (Cache)  │ │
│  │  登录/注册   │  │  fetch/axios│  │  临时状态 / 草稿保存     │ │
│  └─────────────┘  └──────┬──────┘  └─────────────────────────┘ │
└──────────────────────────┼──────────────────────────────────────┘
                           │ HTTP/JSON
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      后端 (Express.js)                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │ Authing     │  │  Business   │  │  PostgreSQL Client      │ │
│  │ Token 验证  │  │  Logic      │  │  (pg / node-postgres)   │ │
│  └─────────────┘  └──────┬──────┘  └─────────────────────────┘ │
│                          │                                       │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  中间件链：CORS → JSON解析 → Auth验证 → 限流 → 路由 → 错误处理  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                    数据层 (PostgreSQL 16)                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐ │
│  │  users      │  │ conversations│  │  messages              │ │
│  │  user_profiles│ │ knowledge_base│ │  usage_stats          │ │
│  │  feedback   │  │             │  │                         │ │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘ │
│                                                                  │
│  扩展：pgcrypto (UUID) + pgvector (向量检索) + RLS (行级安全)      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 二、迁移范围

### 2.1 前端变更

| 原实现 | 新实现 | 文件 |
|--------|--------|------|
| Firestore `getDoc(doc(db, 'users', uid))` | `fetch('/api/auth/verify')` | `App.tsx` |
| Firestore `setDoc(doc(db, 'users', uid), data)` | `fetch('/api/user/profile', {method: 'PUT'})` | `App.tsx` |
| Firestore `collection(db, 'knowledgeBase')` + `onSnapshot` | `fetch('/api/knowledge-base')` + 轮询/WebSocket | `App.tsx` |
| Firestore `updateDoc(doc(db, 'users', uid), {usageDuration: ...})` | `fetch('/api/usage', {method: 'POST'})` | `App.tsx` |
| Firestore `addDoc(collection(db, 'feedback'), data)` | `fetch('/api/feedback', {method: 'POST'})` | `App.tsx` |

### 2.2 后端新增

| 模块 | 说明 | 文件 |
|------|------|------|
| 数据库连接 | PostgreSQL 连接池配置 | `server/db.js` |
| 认证中间件 | Authing Token 验证 + 会话变量设置 | `server/middleware/auth.js` |
| 用户路由 | `/api/auth/verify` | `server/routes/auth.js` |
| 对话路由 | `/api/conversations/*` | `server/routes/conversations.js` |
| 消息路由 | `/api/conversations/:id/messages` | `server/routes/messages.js` |
| 用户画像路由 | `/api/user/profile` | `server/routes/profiles.js` |
| 知识库路由 | `/api/knowledge-base/*` | `server/routes/knowledgeBase.js` |
| 统计路由 | `/api/usage` | `server/routes/usage.js` |
| 反馈路由 | `/api/feedback` | `server/routes/feedback.js` |

### 2.3 不变的部分

| 模块 | 说明 |
|------|------|
| Authing 登录 | 前端 `@authing/web` 和 `authing-js-sdk` 不变 |
| Gemini AI 调用 | 前端直接调用 Gemini API（或改为后端代理） |
| UI/UX | 3100 行 elitefounder-ai UI 代码不变 |
| 业务逻辑 | 4 步流程（Interview → Information → Positioning → Copywriting）不变 |

---

## 三、实施步骤

### Phase 1：基础设施（0.5 天）

```
□ 1.1 安装 PostgreSQL 16（Docker 或本地安装）
      docker run -d --name ai-chat-db \
        -e POSTGRES_USER=aiuser \
        -e POSTGRES_PASSWORD=<强密码> \
        -e POSTGRES_DB=aichat \
        -v ./data/postgres:/var/lib/postgresql/data \
        -p 5432:5432 \
        postgres:16-alpine

□ 1.2 安装 pgvector 扩展
      docker exec -it ai-chat-db psql -U aiuser -d aichat -c "CREATE EXTENSION vector;"

□ 1.3 执行 schema.sql 创建所有表、索引、RLS、触发器
      psql -U aiuser -d aichat -f docs/schema.sql

□ 1.4 后端安装依赖
      cd server && npm install pg dotenv
```

### Phase 2：后端核心（0.5 天）

```
□ 2.1 创建 server/db.js — PostgreSQL 连接池
□ 2.2 创建 server/middleware/auth.js — Authing Token 验证
□ 2.3 创建 server/middleware/rateLimit.js — 限流中间件
□ 2.4 创建 server/routes/auth.js — Token 验证 + 用户同步
□ 2.5 创建 server/routes/conversations.js — 对话 CRUD
□ 2.6 创建 server/routes/messages.js — 消息发送（含 SSE 流式）
□ 2.7 创建 server/routes/profiles.js — 用户画像
□ 2.8 更新 server/index.js — 注册所有路由
```

### Phase 3：前端适配（0.5 天）

```
□ 3.1 创建 src/lib/api.ts — API 客户端封装
□ 3.2 修改 App.tsx 登录逻辑 — 替换 Firestore 用户查询为 API 调用
□ 3.3 修改 App.tsx 对话逻辑 — 替换 Firestore 对话/消息查询
□ 3.4 修改 App.tsx 知识库逻辑 — 替换 Firestore knowledgeBase
□ 3.5 修改 App.tsx 反馈逻辑 — 替换 Firestore feedback
□ 3.6 删除 firebase.ts 中 Firestore 相关导出（保留 Authing 部分）
```

### Phase 4：测试验证（0.5 天）

```
□ 4.1 手机号验证码登录 → 用户数据写入 PostgreSQL
□ 4.2 创建对话 → 发送消息 → 历史记录正确
□ 4.3 刷新页面 → 数据持久化正确
□ 4.4 多用户隔离测试 → RLS 策略生效
□ 4.5 知识库上传 → 向量检索正确
□ 4.6 管理员权限测试 → 知识库/反馈管理正确
```

---

## 四、关键决策点

### 4.1 Gemini API 调用位置

| 方案 | 优点 | 缺点 | 推荐 |
|------|------|------|------|
| **前端直接调用**（现状） | 简单、低延迟 | API Key 暴露、无法做 RAG 增强 | ❌ 不推荐 |
| **后端代理调用** | Key 安全、可注入 RAG 上下文、可记录 Token 消耗 | 增加服务器负载 | ✅ **推荐** |

**决策**：迁移到后端代理调用。前端发送消息 → 后端拼接 RAG 上下文 → 调用 Gemini → 流式返回。

### 4.2 实时数据同步方式

原 Firestore 的 `onSnapshot` 提供实时订阅，替换方案：

| 方案 | 实现 | 适用场景 |
|------|------|---------|
| **轮询**（Polling） | `setInterval(() => fetch(...), 5000)` | 知识库列表、使用统计 |
| **SSE**（Server-Sent Events） | `EventSource` | 消息流式返回（已采用） |
| **WebSocket** | `socket.io` | 多人在线协作（当前不需要） |

**决策**：消息流用 SSE，其他列表用轮询（足够满足需求，实现简单）。

### 4.3 文件存储位置

| 方案 | 优点 | 缺点 |
|------|------|------|
| 本地文件系统 | 简单、零成本 | 多实例部署时不共享 |
| 对象存储（MinIO） | 兼容 S3、可扩展 | 需额外部署 |

**决策**：Phase 1 使用本地文件系统（`server/uploads/`），数据库存储文件路径。未来需要多实例时迁移到 MinIO。

---

## 五、风险与应对

| 风险 | 影响 | 应对措施 |
|------|------|---------|
| PostgreSQL 性能瓶颈（高并发） | 消息发送延迟 | 连接池 + 索引优化 + 读写分离（未来） |
| 向量检索性能下降（知识库 >10万条） | RAG 响应慢 | IVFFlat/HNSW 索引调优 + 分片 |
| Authing Token 验证延迟 | 每次请求都验证 | 后端 Redis 缓存 Token 验证结果（10分钟） |
| 数据丢失 | 无法恢复 | 每日自动备份 + 保留7天 |
| RLS 配置错误 | 数据越权访问 | 单元测试覆盖所有数据操作 |

---

## 六、文件清单

### 新建文件

```
server/
├── db.js                    # PostgreSQL 连接池
├── middleware/
│   ├── auth.js              # Authing Token 验证 + RLS 会话设置
│   └── rateLimit.js         # 限流中间件
├── routes/
│   ├── auth.js              # POST /api/auth/verify
│   ├── conversations.js     # 对话 CRUD
│   ├── messages.js          # 消息发送（SSE）
│   ├── profiles.js          # 用户画像
│   ├── knowledgeBase.js     # 知识库 + 向量检索
│   ├── usage.js             # 使用统计
│   └── feedback.js          # 反馈
├── services/
│   ├── gemini.js            # Gemini API 代理（含 RAG 上下文拼接）
│   └── embedding.js         # Embedding API 调用
├── utils/
│   └── fileParser.js        # 文件内容提取（txt/md/docx/xlsx/pdf）
└── schema.sql               # 完整数据库 Schema（从 database-schema.md 生成）

docs/
├── database-schema.md       # 已创建 ✅
├── api-specification.md     # 已创建 ✅
├── postgresql-migration-plan.md  # 本文档 ✅
└── postgresql-setup.md      # 部署指南（待创建）

src/
└── lib/
    └── api.ts               # API 客户端封装
```

### 修改文件

```
server/
├── index.js                 # 注册新路由
└── package.json             # 添加 pg, dotenv 依赖

src/
├── firebase.ts              # 删除 Firestore 导出，保留 Authing
├── App.tsx                  # 替换所有 Firestore 调用为 API 调用
└── hooks/
    └── useAuthing.ts        # 可选：简化或移除
```

---

## 七、验收标准

- [ ] 手机号验证码登录成功，用户数据写入 PostgreSQL `users` 表
- [ ] 创建对话、发送消息，数据正确写入 `conversations` + `messages` 表
- [ ] 刷新页面后，历史对话和消息正确加载
- [ ] 用户 A 无法访问用户 B 的对话（RLS 生效）
- [ ] 知识库上传后，语义搜索返回正确结果
- [ ] 管理员可查看所有反馈，普通用户只能看自己的
- [ ] 每日使用统计数据正确聚合
- [ ] 数据库备份文件正常生成
