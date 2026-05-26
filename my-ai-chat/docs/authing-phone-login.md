# Authing 手机号验证码登录配置文档

## 问题描述
用户反馈：能收到验证码，但登录时提示"无权限登录此应用，请联系管理员"。

## 根本原因分析（已解决）

**错误码 1576 = 应用访问控制限制。**

`sendSmsCode`（发送验证码）和 `loginByPhoneCode`（登录）使用不同的 API：
- `sendSmsCode` → REST API `/api/v2/sms/send` → 用户池级别
- `loginByPhoneCode` → GraphQL API `/graphql/v2` → 应用级别

从 GraphQL 响应可以看到：
- 用户已注册成功（`status: "Activated"`，`registerSource: ["basic:phone-code"]`）
- 但应用级别的访问控制拒绝了该用户的登录请求

### 解决方案

**路径：应用详情 → 访问授权（或"应用访问控制"）**

将访问控制改为：
- **方案 A（推荐）**：**允许所有用户池用户访问**
- **方案 B**：保持白名单，将该用户加入白名单

---

## 配置步骤

### 1. 开启手机号验证码登录
1. 登录 [Authing 控制台](https://console.authing.cn)
2. 进入「应用」→ 选择你的应用（App ID: `6a13a72bc34d1d925e777d82`）
3. 点击「登录控制」
4. 在「登录方式」中找到「手机号验证码」
5. **开启开关**
6. 如果希望新用户自动注册，同时开启「手机号验证码注册」

### 2. 配置访问授权（解决 1576 错误的关键）
1. 在同一应用详情页，找到「访问授权」
2. 将访问控制设为 **「允许所有用户池用户访问」**
3. 保存配置

### 3. 配置短信服务商（如未配置）
1. 进入「用户池」→「设置」→「消息服务」
2. 配置短信服务商（阿里云、腾讯云等）
3. 确保短信模板已审核通过

---

## 技术实现

### SDK 选择
- **发送验证码 / 手机号登录**：使用 `authing-js-sdk` 的 `AuthenticationClient`
- **OAuth / OIDC 登录**：使用 `@authing/web` 的 `Authing` 类

### 关键代码
```typescript
import { AuthenticationClient, SceneType } from 'authing-js-sdk';

const authClient = new AuthenticationClient({
  appId: '6a13a72bc34d1d925e777d82',
  appHost: 'https://fnbd4tjpcxb5-demo.authing.cn',
});

// 发送验证码
await authClient.sendSmsCode('13800138000', '+86', SceneType.SCENE_TYPE_LOGIN);

// 登录（用户不存在时自动注册）
await authClient.loginByPhoneCode('13800138000', '123456', { phoneCountryCode: '+86' });
```

### 错误码对照
| 错误提示 | 错误码 | 原因 | 解决方案 |
|---------|--------|------|---------|
| "无权限登录此应用，请联系管理员" | 1576 | 应用访问授权限制 | 控制台 → 访问授权 → 允许所有用户 |
| "当前应用未开启手机号验证码登录" | - | 登录方式未开启 | 控制台 → 登录控制 → 开启手机号验证码 |
| "用户不存在" / "not exists" | - | 手机号未注册 | 调用 `registerByPhoneCode` 注册 |
| "验证码错误" / "invalid code" | - | 验证码输入错误或已过期 | 重新获取验证码 |

---

## 数据存储迁移说明

**Firestore 已无法使用**（中国大陆网络限制），数据存储已迁移至 **PostgreSQL**。

### 架构变更
| 层级 | 旧方案 | 新方案 |
|------|--------|--------|
| 认证 | Firebase Auth | Authing（手机号验证码） |
| 数据存储 | Firestore | PostgreSQL（本地部署） |
| 后端 | 无（纯前端） | Express.js + PostgreSQL |

### 相关文档
- [数据库 Schema 设计](./database-schema.md)
- [API 规范](./api-specification.md)
- [PostgreSQL 迁移计划](./postgresql-migration-plan.md)
- [PostgreSQL 部署指南](./postgresql-setup.md)

---

## 调试方法
1. 打开浏览器 DevTools → Network 面板
2. 清除现有记录，重新执行登录操作
3. 搜索 `graphql/v2`（注意不是 `loginByPhoneCode`）
4. 查看 POST 请求的 Response 标签页
5. 检查 `errors[0].code` 和 `errors[0].message`
