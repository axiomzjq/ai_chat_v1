# my-ai-chat 项目提示词

## 项目大纲

### 目标
构建一个基于网页的通用 AI 对话系统，采用 React + Vite + Tailwind CSS 技术栈，使用 Node.js/npm 开发。系统设计借鉴 elitefounder-ai 的极简黑白美学、大圆角设计语言、精致的排版层次，但实现为一个通用的多会话 AI 聊天应用。

### 核心功能
1. **多会话管理** — 左侧边栏显示历史会话列表，支持新建、重命名、删除会话
2. **AI 对话** — 支持文本输入、Enter 发送、Markdown 渲染、代码块高亮
3. **文件上传** — 支持上传文本文件（.txt/.md）作为上下文注入对话
4. **响应式布局** — 桌面端双栏（侧边栏+聊天区），移动端单栏
5. **本地持久化** — 使用 localStorage 保存会话历史和消息
6. **后端 API 预留** — 服务层封装 AI 调用，便于切换不同模型提供商

### 技术栈
- React 19 + Vite 8
- Tailwind CSS 4（原子化样式，极简黑白灰主题）
- lucide-react（图标）
- react-markdown（Markdown 渲染）
- clsx + tailwind-merge（类名管理）
- Node.js + npm（开发/构建环境）

### 目录结构
```
my-ai-chat/
├── ai-database/              # AI 知识库（存储从 elitefounder-ai 学到的架构/样式/模式）
├── server/                   # Node.js 后端服务（预留，当前阶段未实现）
├── src/
│   ├── components/           # React 组件
│   │   ├── Sidebar.jsx       # 会话侧边栏
│   │   ├── ChatHeader.jsx    # 聊天区域头部
│   │   ├── MessageList.jsx   # 消息列表
│   │   ├── MessageBubble.jsx # 单条消息气泡
│   │   ├── ChatInput.jsx     # 底部输入框
│   │   └── WelcomeScreen.jsx # 空会话欢迎页
│   ├── hooks/
│   │   └── useChat.js        # 聊天状态管理 Hook
│   ├── services/
│   │   └── aiService.js      # AI API 调用封装
│   ├── lib/
│   │   └── utils.js          # cn() 等工具函数
│   ├── styles/
│   │   └── index.css         # Tailwind 入口 + 自定义样式
│   ├── App.jsx               # 主应用组件
│   └── main.jsx              # 入口文件
├── index.html
├── package.json
└── PROJECT_PROMPT.md         # 本文件
```

## 当前进度

### ✅ 已完成
- [x] 阅读并深度分析 elitefounder-ai 全部源码（3100行 App.tsx + 配置文件）
- [x] 提取架构分析、样式规范、组件模式、技术栈、提示词等知识
- [x] 创建 ai-database/ 知识库，存入5份核心文档
- [x] 设计 my-ai-chat 项目大纲与技术方案
- [x] 创建本 PROJECT_PROMPT.md

### ✅ 已完成
- [x] 配置 Tailwind CSS 和安装项目依赖
- [x] 实现核心工具函数（cn()、generateId()、formatTime()）
- [x] 实现全局样式（index.css，含 Markdown 渲染样式）
- [x] 实现 useChat Hook（会话管理、消息发送、本地持久化）
- [x] 实现 AI 服务层封装（Mock Mode + Google GenAI / OpenAI 预留接口）
- [x] 构建 Sidebar 组件（会话列表、新建、重命名、删除）
- [x] 构建 ChatHeader 组件
- [x] 构建 MessageList + MessageBubble 组件（Markdown、代码块、复制、朗读）
- [x] 构建 ChatInput 组件（文本输入、文件上传、语音输入、自适应高度）
- [x] 构建 WelcomeScreen 组件（快捷提问入口）
- [x] 组装 App.jsx 主布局（双栏响应式）
- [x] 运行验证（npm run dev）— 成功启动于 localhost:5174

### ⏳ 待完成
- [ ] 接入真实 AI API（当前为 Mock 模式，需配置 VITE_GEMINI_API_KEY 或 VITE_OPENAI_API_KEY）
- [ ] 流式输出（streamMessageToAI 已实现但尚未接入 UI）
- [ ] 后端 server/ 服务开发（RAG 向量检索、文档解析）
- [ ] 部署上线（Vercel）

## 样式参考基准
直接继承 elitefounder-ai 的设计语言：
- 背景: `#F8F9FA` / `bg-gray-50`
- 卡片: `bg-white rounded-3xl border border-gray-100 shadow-sm`
- 按钮: `bg-black text-white rounded-2xl hover:bg-gray-800`
- 标签: `text-[10px] font-bold uppercase tracking-widest text-gray-400`
- 用户气泡: `bg-black text-white rounded-tr-none shadow-lg`
- AI 气泡: `bg-white border border-gray-100 rounded-tl-none shadow-sm`
- 输入框: `bg-white border border-gray-200 rounded-2xl focus:ring-2 focus:ring-black/5`
- 头像: `w-10 h-10 rounded-full border border-gray-200`
- 动画: Framer Motion（入场 fade+y，列表 AnimatePresence）

## 下一步行动
当前应进入 "配置 Tailwind CSS 和安装项目依赖" 阶段，执行 npm install 并写入配置文件。
