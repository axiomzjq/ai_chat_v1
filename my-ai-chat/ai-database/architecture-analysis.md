# elitefounder-ai 架构深度分析

## 项目概况
- **名称**: ToB创始人IP深度定制系统
- **类型**: 单页应用 (SPA)，AI 辅助的多步骤工作流系统
- **代码规模**: App.tsx 单文件 3100 行（巨型组件模式）
- **部署目标**: Google AI Studio / Vercel

## 整体架构模式

### 1. 视图路由 (View-Level Routing)
应用通过 `state.view` 实现三种顶层视图的切换：
- `login` — 登录/注册页面
- `app` — 主应用工作流
- `admin` — 管理员后台

```typescript
type View = 'login' | 'app' | 'admin';
```

### 2. 步骤工作流 (Step Workflow)
主应用内部通过 `currentStep` 实现五个阶段的线性工作流：
```typescript
type Step = 'interview' | 'information' | 'positioning' | 'copywriting' | 'history';
```

**阶段解锁逻辑**（前后依赖）：
- interview → information: 需 `interviewReport` 存在
- information → positioning: 需 `infoReport` 存在
- positioning → copywriting: 需 `positioningReport` 存在
- history: 始终可访问

### 3. 状态管理
采用 **React useState 集中式状态**，所有状态存放在顶层 App 组件中，通过 props 向下传递。

```typescript
interface AppState {
  interviewPhase: 'basic' | 'deep';
  interviewReport: string;
  infoReport: string;
  positioningOptions: string[];
  selectedPositioningIndex: number | null;
  positioningReport: string;
  copywritingOutput: { titles: string[]; selectedTitleIndex: number | null; content: string };
  copywritingMessages: Message[];
  isCopywritingChatMode: boolean;
  history: HistoryItem[];
  user: UserProfile | null;
  view: View;
  isAdminLogin: boolean;
  knowledgeBase: any[];
  uploadedMaterials: UploadedMaterial[];
}
```

**持久化策略**：
- `history` → localStorage（客户端缓存）
- 用户进度 → Firestore `userProgress/{uid}`（5秒防抖写入）
- 会话状态 → Firestore `history` 集合（云端存档）

### 4. 多智能体协作 (Multi-Agent)
四个 AI Agent，每个有独立的 System Prompt：

| Agent | 职责 | 模型 | Prompt 特点 |
|-------|------|------|-------------|
| 访谈顾问 | 深度挖掘创始人故事 | gemini-3-flash-preview | 分两阶段（basic/deep），一次只问一个问题 |
| 信息顾问 | 企业与行业分析 | gemini-3-flash-preview | 输出结构化 Markdown 报告 |
| 定位顾问 | IP 定位规划 | gemini-3.1-pro-preview | 输出3版方案，每阶段≥20个选题 |
| 文案顾问 | 短视频口播文案 | gemini-3-flash-preview | JSON 输出，口语化，禁用黑话 |

### 5. 知识库 RAG 机制
- 管理员通过 Admin Panel 上传语料（txt/md/docx/xlsx）
- AI 自动整理语料（organizeContentWithAI）
- 前端按 `type` 字段过滤（interview/ip/copywriting）注入对应 Agent 的 prompt
- **注意**: 非向量检索，而是全文拼接注入（简单 RAG）

### 6. 文件解析系统
```typescript
// 支持的格式
.txt, .md    → FileReader.readAsText()
.xlsx, .xls  → XLSX.read() → sheet_to_txt()
.docx        → mammoth.extractRawText()
```

## 组件结构

所有组件以内联方式定义在 App.tsx 中：

```
App.tsx
├── StepIndicator        # 顶部步骤指示器（圆形图标 + 连线）
├── CollapsibleSection   # 可折叠面板（motion 动画）
├── CollapsibleMarkdown  # Markdown 折叠渲染（按 H2 分块）
├── ErrorBoundary        # 错误边界（Class 组件）
├── Login                # 登录/注册视图
├── AdminPanel           # 管理员后台（三标签页）
└── App (default export) # 主逻辑 + 各步骤渲染
```

## 关键技术决策

1. **单文件架构**: 所有逻辑集中在 App.tsx，便于 AI 生成和维护，但不利于团队协作
2. **无状态管理库**: 纯 React useState，简单但导致大量 props drilling
3. **Firebase 全家桶**: Auth + Firestore，实现认证、数据持久化、实时订阅
4. **Google GenAI 原生 SDK**: 直接使用 @google/genai，非 OpenAI 兼容格式
5. **Tailwind 原子类**: 大量内联样式类，无自定义 CSS 组件库
