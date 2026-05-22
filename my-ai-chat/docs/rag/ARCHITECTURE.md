# RAG 系统架构

## 目录结构规范

```
my-ai-chat/
├── src/rag/                  # 前端 RAG 模块
│   ├── components/           # UI 组件（文件上传、知识库管理、引用气泡）
│   ├── hooks/                # React Hooks（useRAG、useKnowledgeBase）
│   ├── services/             # API 调用层
│   ├── utils/                # 前端工具（文本高亮、分块预览）
│   ├── constants/            # 常量配置（API 端点、分块大小）
│   └── types/                # 类型定义（JSDoc / .d.ts）
│
├── server/                   # 后端服务（Node.js + Express）
│   ├── routes/               # REST API 路由
│   ├── services/             # 业务逻辑（文档解析、向量化、检索）
│   ├── models/               # 数据模型（文档、Chunk、会话）
│   ├── utils/                # 后端工具（文本分块、向量计算）
│   ├── middleware/           # 中间件（错误处理、文件上传）
│   └── config/               # 环境配置
│
├── knowledge-base/           # 知识库文件存储
│   ├── raw/                  # 原始文档（PDF、MD、TXT）
│   ├── processed/            # 清洗后的文本
│   └── embeddings/           # 向量索引（JSON / 数据库导出）
│
├── scripts/                  # 运维脚本
│   └── build-index.js        # 批量构建向量索引
│
└── docs/rag/                 # 设计文档
    └── ARCHITECTURE.md
```

## 分层职责

| 层级 | 职责 | 禁止做的事 |
|------|------|-----------|
| **components** | 纯 UI 渲染、用户交互 | 直接调用 fetch / 处理业务逻辑 |
| **hooks** | 封装状态与副作用 | 直接操作 DOM、处理 HTTP 细节 |
| **services** | HTTP 请求、数据序列化 | 包含 UI 状态或业务规则判断 |
| **server/services** | 核心业务（分块、向量化、检索） | 直接操作 HTTP response |
| **server/models** | 数据结构与持久化定义 | 包含业务逻辑 |
| **server/routes** | 接收请求、调用 service、返回响应 | 包含业务逻辑或数据处理 |

## 数据流

```
用户上传文档 → server/routes/upload.js
                   ↓
           server/services/parser.js  (解析 PDF/MD/TXT)
                   ↓
           server/services/chunker.js (文本分块)
                   ↓
           server/services/embedder.js (向量化)
                   ↓
           knowledge-base/embeddings/ (持久化)

用户提问 → src/services/ragApi.js → server/routes/chat.js
                                         ↓
                              server/services/retriever.js (相似度检索)
                                         ↓
                              server/services/llm.js (带上下文生成)
                                         ↓
                              返回引用来源 + 回答
```

## 环境变量（server/.env）

```
PORT=3001
OPENAI_API_KEY=your_key
EMBEDDING_MODEL=text-embedding-3-small
CHUNK_SIZE=500
CHUNK_OVERLAP=50
TOP_K=5
```
