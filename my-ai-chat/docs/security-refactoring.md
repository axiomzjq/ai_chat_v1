# 🔒 安全架构重构方案

> 文档编号：SEC-001
> 日期：2026-05-22
> 状态：已实施

---

## 一、背景与问题概述

本次安全审计发现了多个 **P0 级（致命）** 安全问题，核心在于**敏感凭据泄露**和**认证机制失效**。这些问题一旦被利用，将导致：

- API Key 被盗用产生高额费用
- 任意用户可伪造身份绕过认证
- 管理员权限被轻易获取

---

## 二、旧方案 vs 新方案对比

### 2.1 DeepSeek API 调用架构

| 维度 | 旧方案 ❌ | 新方案 ✅ |
|------|----------|----------|
| **Key 存储位置** | 前端 `.env.local` + `vite.config.ts` define 注入 | 仅后端 `server/.env` |
| **Key 暴露范围** | 编译到前端 JS bundle，任何用户 F12 可见 | 仅服务端内存，前端不可见 |
| **调用链路** | 浏览器 → DeepSeek API（跨域） | 浏览器 → 后端代理 → DeepSeek API |
| **认证方式** | Bearer `sk-xxx`（前端持有） | Bearer 用户 JWT（后端换 Key） |
| **Rate Limit** | 依赖 DeepSeek 侧限制 | 后端可叠加双层限流 |

**旧方案风险详解：**

Vite 的 `define` 配置会在构建阶段将 `process.env.DEEPSEEK_API_KEY` 直接替换为字符串字面量。这意味着：

```javascript
// 源码
const API_KEY = process.env.DEEPSEEK_API_KEY;

// 编译后（build 产物）
const API_KEY = "sk-065f8f0714cf4c4e8bd0b687eebc50a5";
```

任何打开浏览器的用户，在 Sources 面板搜索 `sk-` 即可立即找到完整 Key。

**新方案设计：**

```
┌─────────────┐     Bearer JWT      ┌─────────────┐     Bearer sk-xxx      ┌─────────────┐
│   浏览器     │ ──────────────────→ │  后端代理    │ ────────────────────→ │ DeepSeek API │
│  (无 Key)   │   (用户身份认证)     │  (持 Key)   │    (后端持有 Key)      │              │
└─────────────┘                     └─────────────┘                        └─────────────┘
```

后端新增 `/api/ai/chat` 和 `/api/ai/chat-stream` 路由，前端仅携带用户 JWT 调用后端，由后端持有 DeepSeek Key 完成实际请求。

---

### 2.2 JWT 认证验证

| 维度 | 旧方案 ❌ | 新方案 ✅ |
|------|----------|----------|
| **验证方式** | base64url 解码 payload（不验签） | `jose` 库 + Authing JWKS 公钥验签 |
| **伪造难度** | 极低（jwt.io 即可生成） | 极高（需 Authing 私钥） |
| **过期检查** | 仅检查 `exp` 字段 | 签名验证 + 过期检查 + 时钟容差 |
| **攻击后果** | 可伪造任意用户 JWT，包括管理员 | 无法伪造，私钥仅 Authing 持有 |

**旧方案风险详解：**

```javascript
// 旧代码：仅 base64 解码，不验证签名
function parseJwtPayload(token) {
  const parts = token.split('.');
  const payload = parts[1];
  const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
  return JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
}
```

JWT 的第三段是签名（Signature），旧代码完全忽略了这一段。攻击者可以：
1. 在 jwt.io 构造任意 payload（如 `sub: fake-admin`, `phone: 17388978910`）
2. 将 alg 设为 `none` 或任意字符串
3. 发送到后端，完全通过认证

**新方案设计：**

```javascript
import { jwtVerify, createRemoteJWKSet } from 'jose';

const jwks = createRemoteJWKSet(new URL(`${AUTHING_APP_HOST}/.well-known/jwks.json`));

const { payload } = await jwtVerify(token, jwks, {
  clockTolerance: 60,
});
```

Authing 使用 RSA 非对称加密签发 JWT，私钥仅 Authing 持有，公钥通过 JWKS endpoint 公开。后端使用公钥验证签名，确保 token 确实由 Authing 签发。

---

### 2.3 Authing 凭据管理

| 维度 | 旧方案 ❌ | 新方案 ✅ |
|------|----------|----------|
| **App ID 存储** | 硬编码在 `src/lib/authing.ts`、`src/firebase.ts` | `import.meta.env.VITE_AUTHING_APP_ID` |
| **User Pool ID** | 硬编码在 `src/firebase.ts` | `import.meta.env.VITE_AUTHING_USER_POOL_ID` |
| **Host/Domain** | 硬编码在多处 | `import.meta.env.VITE_AUTHING_DOMAIN` |
| **构建时注入** | Vite define 硬编码 | 运行时从环境变量读取 |

**旧方案风险详解：**

```typescript
// 旧代码
export const AUTHING_APP_ID = '6a13a72bc34d1d925e777d82';
export const AUTHING_HOST = 'https://fnbd4tjpcxb5-demo.authing.cn';
```

即使 `.gitignore` 忽略了 `.env` 文件，硬编码在源码中的凭据仍然：
- 随 git 历史永久留存
- 被提交到任何 fork/clone 的仓库
- 被搜索引擎索引（如果是公开仓库）

**新方案设计：**

```typescript
// 新代码
export const AUTHING_APP_ID = import.meta.env.VITE_AUTHING_APP_ID || '';
export const AUTHING_HOST = `https://${import.meta.env.VITE_AUTHING_DOMAIN || ''}`;
```

Vite 会自动将 `.env.local` 中以 `VITE_` 开头的变量注入到前端，但：
- 不会编译到 bundle 中作为字面量（运行时读取）
- 更换凭据只需修改 `.env.local`，无需重新修改源码
- `.env.local` 在 `.gitignore` 中，不会提交到 git

---

## 三、具体改动清单

### 后端改动

| 文件 | 改动内容 |
|------|----------|
| `server/routes/ai.js` | **新增** AI 代理路由，封装 `/chat`（非流式）和 `/chat-stream`（SSE 流式） |
| `server/index.js` | 挂载 `/api/ai` 路由 |
| `server/middleware/auth.js` | 重写 JWT 验证：引入 `jose` 库，使用 Authing JWKS 公钥验签；管理员手机号改为从 `ADMIN_PHONE` 环境变量读取；SQL SET 语句增加字符白名单过滤 |
| `server/.env` | 新增 `ADMIN_PHONE`；保留 `AUTHING_APP_ID` 和 `AUTHING_APP_HOST`（仅后端可见） |
| `server/package.json` | 新增依赖 `jose` |

### 前端改动

| 文件 | 改动内容 |
|------|----------|
| `src/lib/deepseek.ts` | **重写**：`BASE_URL` 改为 `http://localhost:3001/api/ai`；移除 `API_KEY`；每次请求携带用户 JWT；接口签名保持不变（chat / chatStream / generateText / createChat） |
| `src/lib/authing.ts` | 硬编码改为 `import.meta.env` 读取 |
| `src/firebase.ts` | Authing 初始化配置改为 `import.meta.env` 读取；注释代码中的硬编码也改为环境变量 |
| `vite.config.ts` | **删除** `define: { 'process.env.DEEPSEEK_API_KEY': ... }` |
| `.env.local` | 更新 `VITE_AUTHING_APP_ID`、`VITE_AUTHING_DOMAIN`；新增 `VITE_AUTHING_USER_POOL_ID`；**删除** `DEEPSEEK_API_KEY`（前端不再需要） |

---

## 四、如何规避同类问题

### 4.1 API Key 安全准则

```
❌ 绝不要将第三方 API Key 注入前端
   - 不要 Vite define
   - 不要 process.env 暴露到 window
   - 不要写在任何 .ts/.js 文件中

✅ 始终通过后端代理
   - 前端 → 后端（认证）→ 第三方 API
   - 后端持有 Key，前端仅携带用户身份
```

### 4.2 JWT 验证准则

```
❌ 绝不要只 base64 解码 JWT payload
   - 这等于没有认证
   - 任何人可在 jwt.io 伪造

✅ 始终验证签名
   - 使用标准库（jose/jsonwebtoken）
   - 从 JWKS endpoint 获取公钥
   - 检查 exp / iss / aud
```

### 4.3 凭据管理准则

```
❌ 绝不要将凭据硬编码在源码中
   - 不要写死 App ID / Secret / Key
   - 即使是"临时的"也不行
   - 注释中也不要留

✅ 使用环境变量 + .gitignore
   - 前端用 VITE_ 前缀（Vite 自动注入）
   - 后端用 process.env
   - .env / .env.local 必须加入 .gitignore
   - 提交前运行 grep 检查：git diff --cached | grep -E "sk-|secret|password"
```

### 4.4 代码审查 Checklist

每次提交前检查：

- [ ] `grep -r "sk-" src/` 返回空（没有 API Key）
- [ ] `grep -r "http.*authing" src/` 返回空或仅使用环境变量
- [ ] `git diff --cached` 中没有新增 `.env` 文件
- [ ] 新增第三方 API 调用是否经过后端代理
- [ ] JWT 相关代码是否使用了标准验证库

---

## 五、部署前必须执行的操作

### 5.1 更换 DeepSeek API Key

1. 登录 [DeepSeek 开放平台](https://platform.deepseek.com/)
2. 进入 API Keys 管理
3. **撤销**旧 Key：`sk-065f8f0714cf4c4e8bd0b687eebc50a5`
4. 生成新 Key
5. 仅更新 `server/.env` 中的 `DEEPSEEK_API_KEY`

### 5.2 更换 Authing 应用凭据

1. 登录 [Authing 控制台](https://console.authing.cn/)
2. 进入应用详情 → 更换 App ID（或创建新应用）
3. 更新：
   - `server/.env`：`AUTHING_APP_ID`、`AUTHING_APP_HOST`
   - `.env.local`：`VITE_AUTHING_APP_ID`、`VITE_AUTHING_DOMAIN`、`VITE_AUTHING_USER_POOL_ID`
4. 前端重新构建

### 5.3 清除 git 历史

```bash
# 使用 git-filter-repo（推荐）
pip install git-filter-repo
git filter-repo --replace-text <(echo "sk-065f8f0714cf4c4e8bd0b687eebc50a5==>REDACTED")
git filter-repo --replace-text <(echo "6a13a72bc34d1d925e777d82==>REDACTED")

# 或 BFG Repo-Cleaner
java -jar bfg.jar --replace-text replacements.txt
```

> ⚠️ 重写历史后，所有团队成员需重新克隆仓库。

---

## 六、验收测试

### 6.1 API Key 不可见测试

```bash
# 1. 构建前端
npm run build

# 2. 检查产物
grep -r "sk-" dist/ || echo "✅ 产物中无 API Key"

# 3. 启动后端，确认前端调用正常
# 浏览器 Network 面板应只看到 localhost:3001，没有 api.deepseek.com
```

### 6.2 JWT 验证测试

```bash
# 1. 正常登录，获取有效 token
curl -H "Authorization: Bearer <valid_token>" http://localhost:3001/api/usage/me
# → 应返回 200

# 2. 伪造 token（修改 payload 中 sub）
curl -H "Authorization: Bearer <forged_token>" http://localhost:3001/api/usage/me
# → 应返回 401 "Token 无效或已过期"

# 3. 过期 token
curl -H "Authorization: Bearer <expired_token>" http://localhost:3001/api/usage/me
# → 应返回 401 "Token 已过期"
```

### 6.3 凭据检查

```bash
# 源码中不应再有任何硬编码凭据
grep -rE "sk-[a-zA-Z0-9]{20,}" src/ server/src/ || echo "✅ 无 API Key"
grep -rE "6a13a72bc34d1d925e777d82" src/ || echo "✅ 无旧 App ID"
```

---

## 七、后续安全建议

| 优先级 | 事项 | 预计工作量 |
|--------|------|----------|
| P1 | 全局 Rate Limit（Redis） | 2h |
| P1 | Helmet.js 安全响应头 | 30min |
| P1 | 输入校验（Zod/Joi） | 4h |
| P2 | SQL 参数化修复（SET 语句） | 1h |
| P2 | 生产环境 CORS 域名白名单 | 30min |
| P2 | `npm audit` 自动告警 | 30min |
| P3 | 操作日志审计 | 4h |
| P3 | 敏感数据加密（数据库字段级） | 8h |

---

*文档维护：安全重构完成后，任何涉及凭据、认证、API 调用的修改，必须更新本文档并重新跑验收测试。*
