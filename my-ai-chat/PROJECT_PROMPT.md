# my-ai-chat 项目架构总览

> 最后更新：2026-05-27
> 仓库：https://github.com/axiomzjq/ai_chat_v1

---

## 项目定位

**ToB 创始人 IP 深度定制系统**，基于 `elitefounder-ai` 完整移植 UI，底层替换为：
- **认证**：Authing（手机号验证码 / Google OAuth）
- **数据库**：本地 PostgreSQL（替代 Firestore）
- **后端**：Node.js + Express REST API（替代 Firebase 后端）
- **AI**：DeepSeek API（替换 Google Gemini）

---

## 技术栈

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | ^19.0.0 | UI 框架 |
| TypeScript | ~5.8.2 | 类型系统 |
| Vite | ^6.2.0 | 构建工具 |
| Tailwind CSS | ^4.1.14 | 样式（通过 `@tailwindcss/vite` 插件） |
| DeepSeek API | — | AI 接口（兼容 OpenAI 格式） |
| @authing/web | ^5.1.21 | Authing OAuth 登录 |
| authing-js-sdk | ^5.1.21 | 手机号验证码登录/注册 |
| motion | ^12.23.24 | 动画（Framer Motion） |
| lucide-react | ^0.546.0 | 图标 |
| react-markdown | ^10.1.0 | Markdown 渲染 |
| mammoth + xlsx | ^1.12.0 + ^0.18.5 | 文件解析（Word/Excel） |

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| Node.js | v24.15.0 | 运行环境 |
| Express | ^4.x | Web 框架 |
| pg | ^8.x | PostgreSQL 驱动 |
| dotenv | ^16.x | 环境变量 |
| cors | ^2.x | 跨域 |
| multer | ^1.x | 文件上传 |

### 数据库

| 组件 | 版本 | 用途 |
|------|------|------|
| PostgreSQL | 18 | 关系型数据库 |
| 数据库名 | `aichat` | — |
| 用户名 | `aiuser` | — |
| 表数量 | 7 张 | 见 `docs/database-schema.md` |

---

## 目录结构

```
my-ai-chat/
│
├── src/                          # 前端源码
│   ├── App.tsx                   # 主组件（~3100行，含全部业务逻辑）
│   ├── main.tsx                  # 入口文件（初始化 logger、渲染 App）
│   ├── firebase.ts               # Authing 认证适配层（替代 Firebase Auth）
│   ├── index.css                 # Tailwind 入口 + 自定义样式
│   ├── hooks/useAuthing.ts       # Authing Hook（预留）
│   ├── lib/
│   │   ├── api.ts                # 前端 API 客户端（封装所有后端 REST 调用）
│   │   ├── authing.ts            # Authing 常量配置
│   │   ├── debug.ts              # ⭐ 调试模式开关（DEBUG_MODE）
│   │   ├── logger.ts             # 全局日志拦截器（受 debug.ts 控制）
│   │   └── utils.ts              # cn() 工具函数
│   └── assets/                   # 静态资源
│
├── server/                       # 后端服务
│   ├── index.js                  # Express 应用入口
│   ├── db.js                     # PostgreSQL 连接池
│   ├── .env                      # 后端环境变量（不提交 git）
│   ├── .env.example              # 环境变量模板
│   ├── schema.sql                # 数据库 Schema（7 张表 + 索引 + RLS）
│   ├── fix-kb.sql                # 知识库表修复脚本
│   ├── config/rag.js             # RAG 配置（预留）
│   ├── middleware/
│   │   ├── auth.js               # JWT 认证中间件（解析 Authing ID Token）
│   │   ├── errorHandler.js       # 全局错误处理
│   │   └── rateLimit.js          # 限流中间件（预留）
│   └── routes/
│       ├── auth.js               # /api/auth/*（verify, me）
│       ├── conversations.js      # /api/conversations/*（对话 CRUD）
│       ├── messages.js           # /api/conversations/:id/messages/*
│       ├── profiles.js           # /api/user/profile/*（用户画像）
│       ├── knowledgeBase.js      # /api/kb/*（知识库）
│       ├── usage.js              # /api/usage/*（使用统计）
│       └── feedback.js           # /api/feedback/*（反馈）
│
├── docs/                         # 知识库文档
│   ├── api-specification.md      # REST API 规范
│   ├── database-schema.md        # 数据库 Schema 文档
│   ├── postgresql-migration-plan.md  # Firestore → PostgreSQL 迁移计划
│   ├── postgresql-setup.md       # PostgreSQL 安装配置指南
│   ├── authing-phone-login.md    # Authing 手机号登录集成文档
│   ├── debug-mode.md             # 调试模式使用文档
│   └── rag/
│       └── ARCHITECTURE.md       # RAG 系统架构（预留）
│
├── knowledge-base/               # 知识库文件存储（预留）
│   ├── raw/                      # 原始文档
│   ├── processed/                # 清洗后文本（gitignored）
│   └── embeddings/               # 向量索引（gitignored）
│
├── ai-database/                  # 从 elitefounder-ai 提取的知识库
│   ├── architecture-analysis.md
│   ├── style-guide.md
│   ├── component-patterns.md
│   ├── tech-stack.md
│   └── prompts-collection.md
│
├── firebase-applet-config.json   # Firebase 配置（前端保留，用于降级兼容）
├── package.json                  # 前端依赖
├── vite.config.ts                # Vite 配置
├── tsconfig.json                 # TypeScript 配置
├── index.html                    # 页面骨架
├── .env.local                    # 前端环境变量（GEMINI_API_KEY）
├── .gitignore
├── README.md
├── AGENTS.md                     # AI Agent 工作规则
└── PROJECT_PROMPT.md             # 本文件（项目架构总览）
```

---

## 核心功能

### 1. 四步深度定制工作流

| 步骤 | Agent | 职责 | 导航 |
|------|-------|------|------|
| **访谈** | 访谈顾问 | 深度挖掘创始人故事 | 始终可用 |
| **信息** | 信息顾问 | 企业与行业分析报告 | 任意跳转 |
| **定位** | 定位顾问 | 输出 3 版 IP 定位方案 | 任意跳转 |
| **文案** | 文案顾问 | 短视频口播文案创作（JSON 输出） | 任意跳转 |
| **历史** | — | 查看云端存档记录 | 始终可用 |

> 阶段导航已放开限制，用户可自由跳转任意阶段。各阶段内部的数据依赖（如定位阶段读取访谈报告）仍保留，缺失时 AI prompt 中会标注"暂无"并基于通用模板生成。

### 2. 认证系统

- **手机号验证码登录/注册**（authing-js-sdk）
- **Google OAuth 登录**（@authing/web）
- **管理员后台**（基于手机号白名单判断 role=admin，管理员：17388978910）
- **Token 机制**：Authing ID Token → localStorage → 后端 JWT 解析

### 3. 数据持久化

PostgreSQL 7 张表：

| 表名 | 用途 |
|------|------|
| `users` | 用户主表（authing_id, email, phone, role） |
| `conversations` | 对话记录 |
| `messages` | 消息记录 |
| `user_profiles` | 用户画像（访谈/信息/定位报告缓存） |
| `knowledge_base` | 知识库文档（embedding 暂用 JSONB） |
| `usage_stats` | 使用统计 |
| `feedback` | 用户反馈 |

### 4. 调试系统

- 全局日志拦截器：`console.log/error/warn` + `fetch` + `XHR` + 未捕获异常
- 一键导出日志（复制到剪贴板）
- 日志弹窗（黑底绿字终端风格）
- **单一开关控制**：`src/lib/debug.ts` 中 `DEBUG_MODE = true/false`

---

## 开发环境

### 启动方式

**前端（终端 1）：**
```bash
cd my-ai-chat
npm install
npm run dev
# http://localhost:5173
```

**后端（终端 2）：**
```bash
cd my-ai-chat/server
npm install
node index.js
# http://localhost:3001
```

### 环境变量

**前端 `.env.local`：**
```env
DEEPSEEK_API_KEY=your_deepseek_api_key
```

**后端 `server/.env`：**
```env
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://aiuser:password@localhost:5432/aichat
AUTHING_APP_ID=your_app_id
AUTHING_APP_HOST=https://your-app.authing.cn
DEEPSEEK_API_KEY=your_deepseek_api_key
```

---

## 关键决策记录

| 时间 | 决策 | 原因 |
|------|------|------|
| 2026-05-22 | 从 Firebase 迁移到 Authing + PostgreSQL | 开发者在中国大陆，Firebase 被墙 |
| 2026-05-22 | 双 SDK 方案（@authing/web + authing-js-sdk） | OAuth 弹窗 + 手机号验证码各需不同 SDK |
| 2026-05-23 | embedding 列从 VECTOR(1536) 降级为 JSONB | 本地 PostgreSQL 未安装 pgvector 扩展 |
| 2026-05-25 | 后端 JWT 改为直接解析 payload | authing-js-sdk 的 `getUserInfoByAccessToken` 在实例无 token 时无法调用 |
| 2026-05-27 | 引入 DEBUG_MODE 配置化 | 调试入口需可一键移除，避免上线后 UI 污染 |
| 2026-05-27 | AI 从 Gemini 迁移到 DeepSeek | Gemini 503 频繁过载，DeepSeek 稳定性更好 |
| 2026-05-27 | 访谈报告改为手动生成 + 20轮解锁 | 原 5/10 轮过早触发，用户故事还没讲完 |

---

## 已知问题

| 问题 | 状态 | 说明 |
|------|------|------|
| pgvector 未安装 | 🔶 待升级 | 知识库语义搜索暂不可用（embedding 为 JSONB） |
| SSE 消息流 | 🔶 预留 | `/api/conversations/:id/messages/stream` 已预留，未实现 |
| 前端轮询知识库 | 🔶 可优化 | 当前每 30 秒轮询，可改为 WebSocket/SSE |
| 后端 RAG 服务 | 🔶 预留 | `server/config/rag.js` 和 `services/` 为骨架 |

---

## 访谈阶段流程（2026-05-27 更新）

```
用户进入 → AI 开场白
    ↓
用户与 AI 自由对话（无自动阶段切换，无强制报告生成）
    ↓
【第 20 轮对话后】
    → 显示提示："已进行 N 轮对话，您可以继续深入交流，或点击生成报告"
    → 「🌟 生成深度报告」按钮解锁
    ↓
用户点击按钮 → 调用 generateDetailedInterviewReport()
    → 分 5 章调用 DeepSeek（每章 5000-8000 字）
    → 约 1-2 分钟生成完毕
    ↓
报告生成后显示在页面下方
    → 可下载 Word / Markdown
    → 可删除报告并重新访谈
```

**关键规则：**
- Phase 切换（basic→deep）代码保留但**不自动触发**，等待产品经理确认触发条件
- 报告生成**纯手动**，取消原有关键词触发和 150 轮自动触发
- 用户可随时点击顶部导航跳转其他阶段
