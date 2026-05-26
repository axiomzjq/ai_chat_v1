# API 规范文档

> 适用项目：ToB 创始人 IP 深度定制系统
> 后端框架：Express.js (ES Module)
> 数据库：PostgreSQL
> 身份认证：Authing JWT

---

## 一、通用规范

### 1.1 基础信息

| 项目 | 值 |
|------|-----|
| 基础 URL | `http://localhost:3001/api` |
| 协议 | HTTP/1.1（本地开发）/ HTTPS（生产） |
| 编码 | UTF-8 |
| 请求格式 | `Content-Type: application/json` |
| 响应格式 | JSON |

### 1.2 认证方式

所有 API（除登录相关）需在请求头携带 Authing Access Token：

```http
Authorization: Bearer <authing_access_token>
```

后端中间件验证 Token 后，解析出 `user_id` 和 `role`，并设置 PostgreSQL 会话变量：

```javascript
await db.query("SET app.current_user = $1", [userId]);
await db.query("SET app.current_user_role = $2", [userRole]);
```

### 1.3 通用响应格式

```typescript
interface ApiResponse<T> {
  code: number;        // 业务状态码：0=成功，非0=失败
  message: string;     // 提示信息
  data: T | null;      // 响应数据
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}
```

**成功示例**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "创始人 IP 访谈 - 第一轮",
    "current_step": "interview",
    "created_at": "2026-05-26T10:30:00+08:00"
  }
}
```

**失败示例**
```json
{
  "code": 403,
  "message": "无权限访问此资源",
  "data": null
}
```

### 1.4 分页规范

列表接口统一支持分页参数：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | int | 1 | 页码，从 1 开始 |
| `pageSize` | int | 20 | 每页数量，最大 100 |

### 1.5 HTTP 状态码

| 状态码 | 含义 | 场景 |
|--------|------|------|
| 200 | OK | 请求成功 |
| 201 | Created | 资源创建成功 |
| 400 | Bad Request | 参数校验失败 |
| 401 | Unauthorized | Token 缺失或无效 |
| 403 | Forbidden | 无权限访问（RLS 拦截） |
| 404 | Not Found | 资源不存在 |
| 409 | Conflict | 资源冲突（如重复创建） |
| 429 | Too Many Requests | 限流触发 |
| 500 | Internal Server Error | 服务器内部错误 |

---

## 二、API 列表

### 2.1 认证相关

> 注：认证由 Authing 前端 SDK 处理，后端只需验证 Token。此处列出后端需要的验证接口。

#### POST `/auth/verify`
验证 Authing Token，返回用户信息和本地 user_id。

**请求**
```json
{
  "accessToken": "eyJhbGciOiJSUzI1NiIs..."
}
```

**响应**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "user": {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "authing_id": "6a14fd4ecc839d0d1ef259c7",
      "email": null,
      "phone": "17388978910",
      "display_name": null,
      "role": "user",
      "created_at": "2026-05-26T01:54:22+08:00"
    },
    "isNewUser": false
  }
}
```

**逻辑说明**
1. 调用 Authing API 验证 accessToken 有效性
2. 查询本地 `users` 表，查找 `authing_id` 对应的记录
3. 如果不存在，自动创建新用户（写入 `users` 表）
4. 返回本地 user_id 和角色

---

### 2.2 对话管理

#### GET `/conversations`
获取当前用户的对话列表。

**查询参数**
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | int | 1 | 页码 |
| `pageSize` | int | 20 | 每页数量 |
| `status` | string | active | 筛选状态：active/archived |

**响应**
```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "title": "创始人 IP 访谈 - 第一轮",
      "current_step": "interview",
      "message_count": 24,
      "last_message_preview": "请介绍一下您的创业经历...",
      "created_at": "2026-05-26T10:30:00+08:00",
      "updated_at": "2026-05-26T11:15:00+08:00"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 5,
    "totalPages": 1
  }
}
```

#### POST `/conversations`
创建新对话。

**请求**
```json
{
  "title": "创始人 IP 访谈 - 第二轮",
  "current_step": "interview"
}
```

**响应**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "660e8400-e29b-41d4-a716-446655440001",
    "title": "创始人 IP 访谈 - 第二轮",
    "current_step": "interview",
    "status": "active",
    "created_at": "2026-05-26T12:00:00+08:00"
  }
}
```

#### GET `/conversations/:id`
获取单个对话详情。

**响应**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "title": "创始人 IP 访谈 - 第一轮",
    "current_step": "interview",
    "status": "active",
    "metadata": {},
    "created_at": "2026-05-26T10:30:00+08:00",
    "updated_at": "2026-05-26T11:15:00+08:00"
  }
}
```

#### PUT `/conversations/:id`
更新对话信息（标题、步骤）。

**请求**
```json
{
  "title": "修改后的标题",
  "current_step": "information"
}
```

#### DELETE `/conversations/:id`
软删除对话（status 改为 deleted）。

**响应**
```json
{
  "code": 0,
  "message": "对话已删除",
  "data": null
}
```

---

### 2.3 消息管理

#### GET `/conversations/:id/messages`
获取对话的消息列表。

**查询参数**
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `beforeId` | UUID | null | 消息 ID，获取此 ID 之前的消息（向上翻页） |
| `limit` | int | 20 | 返回消息数量 |

**响应**
```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "id": "770e8400-e29b-41d4-a716-446655440002",
      "role": "user",
      "content": "请帮我分析我的个人定位",
      "model": null,
      "input_tokens": 12,
      "output_tokens": 0,
      "latency_ms": null,
      "metadata": {},
      "created_at": "2026-05-26T10:30:05+08:00"
    },
    {
      "id": "880e8400-e29b-41d4-a716-446655440003",
      "role": "assistant",
      "content": "基于您的背景，我建议从以下三个维度进行定位...",
      "model": "gemini-2.5-pro",
      "input_tokens": 12,
      "output_tokens": 256,
      "latency_ms": 3200,
      "metadata": {
        "thinking": "用户希望分析个人定位...",
        "references": []
      },
      "created_at": "2026-05-26T10:30:08+08:00"
    }
  ]
}
```

#### POST `/conversations/:id/messages`
发送消息（用户消息 + AI 回复）。

> 此接口为**流式响应**（SSE），支持打字机效果。

**请求**
```json
{
  "content": "请帮我分析我的个人定位",
  "model": "gemini-2.5-pro"
}
```

**响应（SSE 流）**
```
event: message_start
data: {"message_id": "880e8400-e29b-41d4-a716-446655440003"}

event: content_delta
data: {"delta": "基于"}

event: content_delta
data: {"delta": "您的"}

event: content_delta
data: {"delta": "背景"}

event: message_end
data: {"message_id": "880e8400-e29b-41d4-a716-446655440003", "input_tokens": 12, "output_tokens": 256, "latency_ms": 3200}
```

**后端逻辑**
1. 验证用户对 conversation_id 的访问权限
2. 将用户消息写入 `messages` 表
3. 调用 Gemini API 获取 AI 回复（流式）
4. 将 AI 回复逐段推送给前端
5. AI 回复完成后，将完整消息写入 `messages` 表
6. 更新 `conversations.updated_at`

---

### 2.4 用户画像（IP 定制数据）

#### GET `/user/profile`
获取当前用户的 IP 定制数据。

**响应**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "990e8400-e29b-41d4-a716-446655440004",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "current_step": "positioning",
    "interview_data": {
      "q1": { "question": "您的创业领域是什么？", "answer": "SaaS 企业服务" },
      "q2": { "question": "您的核心优势是什么？", "answer": "10年行业经验" }
    },
    "information_report": {
      "industry": "SaaS",
      "strengths": ["经验丰富", "技术背景"],
      "target_audience": "中小企业主"
    },
    "positioning_report": {
      "tagline": "让每位创始人都有自己的 IP",
      "positioning": "实战型 SaaS 创业导师"
    },
    "copywriting_data": [
      { "version": 1, "title": "创始人 IP 打造方案", "content": "..." },
      { "version": 2, "title": "创始人 IP 打造方案（优化版）", "content": "..." }
    ],
    "created_at": "2026-05-26T01:54:22+08:00",
    "updated_at": "2026-05-26T14:20:00+08:00"
  }
}
```

#### PUT `/user/profile`
更新用户画像数据（分阶段更新）。

**请求**
```json
{
  "current_step": "positioning",
  "interview_data": {
    "q3": { "question": "您最大的失败经历是什么？", "answer": "..." }
  }
}
```

**更新策略**
- `interview_data`、`information_report`、`positioning_report`、`copywriting_data` 使用 **JSONB 合并更新**
- PostgreSQL：`UPDATE user_profiles SET interview_data = interview_data || $1::jsonb`

---

### 2.5 知识库

#### GET `/knowledge-base`
获取知识库列表（管理员/所有用户可读）。

**查询参数**
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | int | 1 | 页码 |
| `pageSize` | int | 20 | 每页数量 |
| `category` | string | null | 分类筛选 |
| `q` | string | null | 关键词搜索（全文检索） |

**响应**
```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "id": "aa0e8400-e29b-41d4-a716-446655440005",
      "title": "2024 年创始人 IP 打造方法论",
      "category": "方法论",
      "source": "upload",
      "file_type": "pdf",
      "created_at": "2026-05-25T09:00:00+08:00"
    }
  ]
}
```

#### POST `/knowledge-base`
上传知识库文档（仅管理员）。

**请求（multipart/form-data）**
| 字段 | 类型 | 说明 |
|------|------|------|
| `file` | File | 上传的文件（txt/md/docx/xlsx/pdf） |
| `title` | string | 文档标题 |
| `category` | string | 分类 |

**后端逻辑**
1. 保存文件到本地存储
2. 提取文本内容（txt 直接读取，docx/xlsx 用 mammoth/xlsx，pdf 用 pdf-parse）
3. 调用 Embedding API 生成向量（1536 维）
4. 写入 `knowledge_base` 表

#### DELETE `/knowledge-base/:id`
删除知识库文档（仅管理员）。

#### POST `/knowledge-base/search`
语义搜索（RAG 检索）。

**请求**
```json
{
  "query": "如何打造个人品牌",
  "topK": 5
}
```

**响应**
```json
{
  "code": 0,
  "message": "success",
  "data": [
    {
      "id": "aa0e8400-e29b-41d4-a716-446655440005",
      "title": "创始人 IP 打造方法论",
      "content": "个人品牌打造的核心是...",
      "similarity": 0.89
    }
  ]
}
```

**后端逻辑**
1. 将 query 文本转换为向量（Embedding API）
2. 使用 pgvector 的 `<=>` 操作符进行余弦相似度搜索：
   ```sql
   SELECT id, title, content, 1 - (embedding <=> $1) AS similarity
   FROM knowledge_base
   ORDER BY embedding <=> $1
   LIMIT $2;
   ```

---

### 2.6 使用统计

#### GET `/usage`
获取当前用户的使用统计。

**查询参数**
| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `startDate` | date | 30天前 | 开始日期 |
| `endDate` | date | 今天 | 结束日期 |

**响应**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "daily": [
      {
        "date": "2026-05-26",
        "conversation_count": 3,
        "message_count": 24,
        "total_input_tokens": 480,
        "total_output_tokens": 3200,
        "duration_seconds": 1800
      }
    ],
    "summary": {
      "total_conversations": 15,
      "total_messages": 120,
      "total_input_tokens": 2400,
      "total_output_tokens": 16000
    }
  }
}
```

---

### 2.7 反馈

#### POST `/feedback`
提交反馈。

**请求**
```json
{
  "type": "bug",
  "title": "登录后页面白屏",
  "content": "在点击登录按钮后，页面显示空白...",
  "contact": "user@example.com"
}
```

#### GET `/feedback`（仅管理员）
获取反馈列表。

#### PUT `/feedback/:id/status`（仅管理员）
更新反馈状态。

**请求**
```json
{
  "status": "in_progress",
  "admin_reply": "已复现，正在修复..."
}
```

---

## 三、数据流图

### 3.1 用户发送消息流程

```
┌─────────┐     POST /conversations/:id/messages      ┌──────────┐
│  前端   │ ──────────────────────────────────────────> │ Express  │
│ (React) │                                           │  后端    │
└─────────┘                                           └────┬─────┘
     ^                                                     │
     │ SSE 流式响应                                         │
     │ <────────────────────────────────────────────────────┤
     │                                                     │
     │              1. 验证 Token + RLS                    │
     │              2. 写入 messages (user)                │
     │              3. 调用 Gemini API                     │
     │              4. 流式返回 AI 回复                    │
     │              5. 写入 messages (assistant)           │
     │              6. 更新 conversations.updated_at       │
     │                                                     │
     │                                              ┌──────┴──────┐
     └──────────────────────────────────────────────┤ PostgreSQL  │
                                                    └─────────────┘
```

### 3.2 RAG 检索流程

```
用户输入 ──> Embedding API ──> 向量 ──> PostgreSQL (pgvector)
                                              │
                                              ▼
                                    SELECT ... ORDER BY embedding <=> query_vector
                                              │
                                              ▼
                                    返回 Top-K 相关文档 ──> 拼接为上下文
                                              │
                                              ▼
                                    调用 Gemini API（带上下文）──> 生成回复
```

---

## 四、错误码定义

| 错误码 | 含义 | 触发场景 |
|--------|------|---------|
| 0 | 成功 | |
| 1001 | Token 无效 | Authing Token 过期或伪造 |
| 1002 | Token 缺失 | 请求头未携带 Authorization |
| 2001 | 资源不存在 | 查询的对话/消息 ID 不存在 |
| 2002 | 资源无权限 | RLS 策略拦截（尝试访问其他用户数据） |
| 3001 | 参数校验失败 | 缺少必填字段或格式错误 |
| 3002 | 内容过长 | 消息内容超过限制（如 50MB） |
| 4001 | AI 服务错误 | Gemini API 调用失败 |
| 4002 | AI 服务限流 | 触发 Gemini 速率限制 |
| 5001 | 数据库错误 | PostgreSQL 连接或查询异常 |
| 5002 | 向量服务错误 | Embedding API 调用失败 |

---

## 五、限流策略

| 接口 | 策略 | 说明 |
|------|------|------|
| `POST /conversations/:id/messages` | 10 req/min/用户 | 防止滥用 AI API |
| `POST /knowledge-base` | 5 req/min/管理员 | 防止大量上传 |
| `POST /knowledge-base/search` | 20 req/min/用户 | 防止滥用向量检索 |
| 其他接口 | 60 req/min/用户 | 通用限流 |

限流实现：内存级 `Map<userId, timestamps>`（开发）→ Redis（生产）。

---

## 六、中间件清单

| 中间件 | 作用 | 优先级 |
|--------|------|--------|
| `cors()` | 跨域支持 | 1 |
| `express.json()` | JSON 请求体解析 | 2 |
| `authMiddleware` | Authing Token 验证 + PostgreSQL 会话变量设置 | 3 |
| `rateLimitMiddleware` | 限流控制 | 4 |
| `errorHandler` | 全局错误处理 | last |

---

## 七、环境变量

```bash
# 服务端口号
PORT=3001

# PostgreSQL 连接
DATABASE_URL=postgresql://aiuser:password@localhost:5432/aichat

# Authing 配置
AUTHING_APP_ID=6a13a72bc34d1d925e777d82
AUTHING_APP_HOST=https://fnbd4tjpcxb5-demo.authing.cn

# AI 服务
GEMINI_API_KEY=your_gemini_api_key
GEMINI_MODEL=gemini-2.5-pro

# Embedding 服务（用于 RAG）
EMBEDDING_API_KEY=your_embedding_key
EMBEDDING_MODEL=text-embedding-004

# 文件上传
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800  # 50MB
```
