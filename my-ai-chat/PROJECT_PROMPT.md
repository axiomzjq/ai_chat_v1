# my-ai-chat 项目提示词

## 项目概述

**my-ai-chat** 是基于 `elitefounder-ai` 完整移植的 **ToB 创始人 IP 深度定制系统**。以参考项目的所有页面和样式为最高优先级，完整保留了其 3100 行单文件组件架构、四步工作流、多 Agent 协作、Firebase 认证与数据持久化、知识库 RAG 等全部功能。

在此基础上，项目扩展了独立的 **RAG 后端服务骨架** 和 **AI 知识库（ai-database）**，用于持续迭代和演进。

---

## 核心功能

### 1. 四步深度定制工作流（来自 elitefounder-ai）
| 步骤 | Agent | 职责 | 解锁条件 |
|------|-------|------|---------|
| **访谈** | 访谈顾问 | 深度挖掘创始人故事（basic → deep 两阶段） | 始终可用 |
| **信息** | 信息顾问 | 企业与行业分析报告 | 完成访谈报告 |
| **定位** | 定位顾问 | 输出 3 版 IP 定位方案 | 完成信息报告 |
| **文案** | 文案顾问 | 短视频口播文案创作（JSON 输出） | 完成定位报告 |
| **历史** | — | 查看云端存档记录 | 始终可用 |

### 2. 认证与权限
- 邮箱/密码注册登录
- Google 账号登录
- 管理员后台（用户管理、反馈查看、知识库训练）
- 使用时长限制机制

### 3. 知识库 RAG
- 管理员上传语料（txt/md/docx/xlsx）
- AI 自动整理语料
- 按 Agent 类型过滤注入（interview/ip/copywriting）
- 前端全量拼接注入（简单 RAG）

### 4. 交互增强
- Markdown 渲染 + 折叠分节
- 语音输入（Web Speech API）
- TTS 朗读（Gemini 音频生成）
- 文件解析（Excel/Word/Text）
- 报告下载（Markdown/Word）
- 剪贴板复制

### 5. 扩展骨架（RAG 后端）
- `server/` — Node.js + Express 后端服务（预留）
- `knowledge-base/` — 原始文档存储
- `docs/rag/` — RAG 架构文档
- `ai-database/` — 从 elitefounder-ai 提取的知识库

---

## 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | React + TypeScript | ^19.0.0 / ~5.8.2 |
| 构建 | Vite | ^6.2.0 |
| 样式 | Tailwind CSS v4 | ^4.1.14 |
| AI SDK | @google/genai | ^1.29.0 |
| 后端 | Firebase (Auth + Firestore) | ^12.11.0 |
| 动画 | motion (Framer Motion) | ^12.23.24 |
| 图标 | lucide-react | ^0.546.0 |
| Markdown | react-markdown | ^10.1.0 |
| 文件解析 | mammoth + xlsx | ^1.12.0 + ^0.18.5 |
| 导出 | html2canvas + jspdf | ^1.4.1 + ^4.2.1 |

---

## 目录结构

```
my-ai-chat/
├── ai-database/              # AI 知识库（从 elitefounder-ai 提取的架构/样式/模式/提示词）
│   ├── architecture-analysis.md
│   ├── style-guide.md
│   ├── component-patterns.md
│   ├── tech-stack.md
│   └── prompts-collection.md
│
├── docs/rag/
│   └── ARCHITECTURE.md       # RAG 系统架构文档
│
├── knowledge-base/           # 知识库文件存储
│   ├── raw/                  # 原始文档
│   ├── processed/            # 清洗后文本（gitignored）
│   └── embeddings/           # 向量索引（gitignored）
│
├── server/                   # Node.js 后端服务骨架
│   ├── index.js
│   ├── package.json
│   ├── config/rag.js
│   ├── middleware/errorHandler.js
│   └── routes/services/models/utils/（.gitkeep）
│
├── scripts/
│   └── build-index.js        # 批量构建索引脚本
│
├── src/                      # 前端源码（完整移植自 elitefounder-ai）
│   ├── App.tsx               # 主组件（3100行，含全部业务逻辑）
│   ├── firebase.ts           # Firebase 初始化与封装
│   ├── main.tsx              # 入口文件
│   ├── index.css             # Tailwind 入口 + 自定义样式
│   ├── lib/
│   │   └── utils.ts          # cn() 工具函数
│   └── assets/               # 静态资源
│
├── firebase-applet-config.json   # Firebase 配置
├── tsconfig.json
├── vite.config.ts
├── index.html
├── package.json
└── PROJECT_PROMPT.md         # 本文件
```

---

## 当前进度

### ✅ 已完成
- [x] 深度阅读 elitefounder-ai 全部源码（3100 行 App.tsx + 配置文件）
- [x] 提取并建立 ai-database 知识库（5 份核心文档）
- [x] 完整移植 elitefounder-ai 前端代码到 my-ai-chat/src/（TypeScript 源码直接复制）
- [x] 移植配置文件（vite.config.ts, tsconfig.json, firebase-applet-config.json, index.html）
- [x] 更新 package.json 包含全部依赖并安装
- [x] 清理旧的通用 AI Chat 组件代码
- [x] 保留 RAG 后端骨架（server/、docs/、knowledge-base/、scripts/）
- [x] 运行验证成功（npm run dev → localhost:5179，登录页正常显示）
- [x] 推送至 GitHub（axiomzjq/ai_chat_v1）
- [x] 修复 Vite 与 Tailwind CSS 版本兼容性（锁定 vite@6.2.0 + tailwindcss@4.1.14）
- [x] 添加 Firebase 初始化保护（try-catch + mock 降级）
- [x] 添加 RootErrorBoundary 根级错误边界
- [x] 提供 GEMINI_API_KEY 占位符（使 UI 在无真实 key 时仍可挂载）

### ⏳ 待完成
- [ ] 替换为真实 Gemini API Key（当前为占位符，AI 功能返回 401）
- [ ] 后端 RAG 服务开发（server/ 当前为骨架，需实现文档解析、分块、向量化、检索）
- [ ] 部署上线（Vercel / Firebase Hosting）

---

## 启动方式

```bash
cd my-ai-chat
npm install
npm run dev
# 浏览器打开 http://localhost:5173
```

## 环境变量

项目根目录创建 `.env.local`：
```env
GEMINI_API_KEY=your_gemini_api_key
```

---

> **设计基准**：所有页面样式严格遵循 elitefounder-ai 的极简黑白灰设计语言——大圆角（rounded-2xl/3xl）、细边框（border-gray-100）、轻阴影（shadow-xl）、精致标签文字（text-[10px] uppercase tracking-widest）。
