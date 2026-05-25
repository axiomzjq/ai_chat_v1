# Authing 认证集成方案

## 背景

原系统使用 Firebase Auth + Firestore 实现用户认证与数据持久化。但由于以下原因，需要迁移到 Authing：

1. **网络可达性** — Firebase Auth/Firestore 在中国大陆无法直接访问（被墙）
2. **项目归属** — 当前 Firebase 配置属于 Google AI Studio 临时项目，可能随时失效
3. **本土化** — Authing 支持手机号、微信扫码、企业微信等国内常用登录方式

---

## 技术选型

| 组件 | 原方案 | 新方案 | 说明 |
|------|--------|--------|------|
| 身份认证 | Firebase Auth | **Authing (GenAuth)** | 国内身份云，API 可直达 |
| 用户数据存储 | Firestore | **Firestore / 自建数据库** | 可选保留 Firestore，或完全迁移到自建后端 |
| 前端 SDK | firebase/auth | **@authing/web** + **@authing/guard-react** | 支持内嵌表单和跳转两种模式 |
| 后端验权 | Firebase Admin SDK | **Authing ID Token 验证** | 使用公钥验证 JWT |

---

## Authing 核心概念

### 应用（Application）
Authing 中的"应用"对应一个独立的业务系统。每个应用有独立的：
- App ID（应用 ID，公开）
- App Secret（应用密钥，后端使用）
- 认证域（如 `your-app.authing.cn`）

### 用户池（User Pool）
用户池是用户的集合。一个用户池可以有多个应用。

### 认证流程（前端模式）
```
用户打开登录页
  ↓
调用 Authing SDK（内嵌 Guard 组件 或 跳转托管页）
  ↓
用户在 Authing 完成登录/注册
  ↓
Authing 返回 ID Token（JWT）到前端
  ↓
前端将 ID Token 发送到后端验证
  ↓
后端验证通过后，创建/更新本地用户记录
  ↓
返回自建 JWT / Session，后续请求携带该凭证
```

### ID Token 结构
Authing 返回的 ID Token 是标准 JWT，包含：
- `sub` — 用户唯一标识（Authing User ID）
- `email` — 邮箱
- `name` — 用户名
- `picture` — 头像
- `email_verified` — 邮箱是否验证

---

## SDK 选择

### @authing/web（标准 Web SDK）
适用场景：需要完全自定义 UI，或通过 API 调用登录
```typescript
import { Authing } from '@authing/web';

const authing = new Authing({
  domain: 'your-domain.authing.cn',
  appId: 'your-app-id',
  redirectUri: 'http://localhost:5173/callback',
  scope: 'openid profile email',
});

// 跳转登录
authing.loginWithRedirect();

// 获取登录用户信息
const user = await authing.getUserInfo();
```

### @authing/guard-react（React 组件）
适用场景：希望内嵌登录表单，与原设计更接近
```tsx
import { GuardProvider, Guard } from '@authing/guard-react';

<GuardProvider
  appId="your-app-id"
  host="https://your-domain.authing.cn"
>
  <Guard onLogin={handleLogin} />
</GuardProvider>
```

---

## 迁移策略

### 阶段一：前端接入 Authing（当前）
1. 安装 `@authing/web` 和 `@authing/guard-react`
2. 创建 `src/lib/authing.ts` 配置文件
3. 创建 `src/hooks/useAuthing.ts` 封装认证状态
4. 替换 `Login` 组件中的 Firebase Auth 调用为 Authing Guard
5. 替换 `App.tsx` 中的 `onAuthStateChanged` 为 Authing 的登录状态监听

### 阶段二：后端接入（后续）
1. 在 `server/` 中实现 Authing ID Token 验证
2. 验证通过后，在本地数据库（SQLite/Firestore）中创建用户记录
3. 签发自建 JWT，用于后续 API 鉴权

### 阶段三：数据迁移（可选）
1. 将 Firestore 中的历史数据导出
2. 导入到自建数据库中
3. 完全下线 Firebase

---

## 用户需要准备的配置

在 Authing 控制台 (https://console.authing.cn) 完成以下操作：

1. **注册账号**并登录
2. **创建用户池**（或使用默认用户池）
3. **创建应用**
   - 应用名称：如 "创始人IP定制系统"
   - 认证方式：开启"用户名密码"、"手机号验证码"、"社会化登录"（微信等按需开启）
4. **获取应用配置**
   - App ID
   - App Secret（后端验权用）
   - 认证域（Issuer）
5. **配置登录回调地址**
   - 开发环境：`http://localhost:5173/callback`
   - 生产环境：`https://your-domain.com/callback`
6. **配置登出回调地址**
   - `http://localhost:5173`

---

## 代码结构变更

```
src/
├── lib/
│   ├── authing.ts          # Authing 初始化配置
│   └── firebase.ts         # 保留但逐步替换（Firestore 数据层可保留）
├── hooks/
│   └── useAuth.ts          # 统一认证 Hook（兼容层）
├── components/
│   └── Login.tsx           # 替换为 Authing Guard 组件
└── App.tsx                 # 替换 onAuthStateChanged 逻辑
```

---

## 注意事项

1. **Firebase 初始化错误** — 当前已用 try-catch 保护，即使 Firebase 完全不可用，UI 也能挂载
2. **数据隔离** — Authing 只负责"认证"，用户业务数据（访谈记录、报告等）仍需独立存储
3. **单点登录** — Authing 支持 SSO，如需多应用共享登录态可开启
4. ** pricing** — Authing 免费版有 MAU 限制（通常 5000 人以下免费），需关注用量
