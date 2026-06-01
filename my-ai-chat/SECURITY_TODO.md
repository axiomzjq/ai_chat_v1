# 🔒 安全修复任务清单

> 生成时间：2026-05-22
> 基于当前代码库安全审计结果整理

---

## 🔴 P0 — 立即修复（致命风险）

### 1. 撤销并更换 DeepSeek API Key
- [ ] **立即登录 DeepSeek 控制台撤销 Key**：`sk-065f8f0714cf4c4e8bd0b687eebc50a5`
- [ ] 生成新 Key
- [ ] 更新 `server/.env` 和 `.env.local`
- [ ] **绝不将新 Key 提交到 git**
- **风险**：Key 已暴露在源码文件（`.env.local`、`server/.env`）和前端 bundle 中，任何人可复制盗用

### 2. 撤销并更换 Authing App ID
- [ ] **立即登录 Authing 控制台更换 App ID**
- [ ] 更新 `server/.env` 中的 `AUTHING_APP_ID`
- [ ] 更新前端 `.env.local` 中的 `VITE_AUTHING_APP_ID`
- **风险**：App ID + Host 硬编码在 `src/lib/authing.ts` 和多个文档中，可被用于构造钓鱼页

### 3. 将 DeepSeek API 调用全部移到后端
- [ ] 前端 `src/lib/deepseek.ts` 移除直接调用 DeepSeek API 的逻辑
- [ ] 后端新增 `/api/ai/chat` 和 `/api/ai/chat-stream` 路由
- [ ] 后端持有 DeepSeek API Key，前端只调用后端 API
- [ ] 删除 `vite.config.ts` 中的 `define: { 'process.env.DEEPSEEK_API_KEY': ... }`
- **风险**：Vite define 会将 Key 直接编译为前端 JS 字面量，任何用户 F12 即可看到

### 4. 实现 JWT 签名验证
- [ ] 在 `server/middleware/auth.js` 中使用 Authing JWKS 公钥验证 JWT 签名
- [ ] 替换当前的 `parseJwtPayload`（仅 base64 解码）为标准 JWT 库（如 `jose` 或 `jsonwebtoken`）
- [ ] 配置 JWKS endpoint：`https://fnbd4tjpcxb5-demo.authing.cn/.well-known/jwks.json`
- **风险**：当前认证可被完全绕过，任何人可伪造 JWT 冒充任意用户（包括管理员）

### 5. 从 git 历史彻底清除所有凭据
- [ ] 使用 `git filter-repo` 或 BFG Repo-Cleaner 清除历史中的敏感信息
- [ ] 目标文件：`src/lib/authing.ts`、`docs/api-specification.md`、`docs/postgresql-setup.md`、`PROJECT_PROMPT.md`
- [ ] 强制推送到远程仓库（如有）
- [ ] 团队所有成员重新克隆仓库
- **风险**：即使当前文件已修改，git log 中仍可恢复到包含凭据的旧版本

---

## 🟠 P1 — 高优先级（今天完成）

### 6. 清理文档中的敏感信息
- [ ] `docs/api-specification.md` — 删除 Authing App ID 和示例密钥
- [ ] `docs/postgresql-setup.md` — 删除 Authing 配置示例
- [ ] `PROJECT_PROMPT.md` — 删除或脱敏所有凭据
- [ ] `README.md` — 检查是否有残留

### 7. 修复 SQL 拼接（auth.js）
- [ ] `server/middleware/auth.js` 第 113-114 行：`SET "app.current_user"` 和 `SET "app.current_user_role"`
- [ ] 改为安全的参数化方式（PostgreSQL `SET` 不支持 `$1` 参数，需用 `pg-format` 或严格白名单校验）
- **风险**：直接字符串拼接违反安全最佳实践，未来代码变更可能引入 SQL 注入

### 8. 数据库密码安全加固
- [ ] 更换数据库密码 `aichat_pass_2026`
- [ ] 考虑使用 `.env` 文件配合强密码生成器
- [ ] 限制 PostgreSQL 监听地址（`listen_addresses = 'localhost'`）

---

## 🟡 P2 — 中优先级（本周完成）

### 9. 全局挂载 Rate Limit
- [ ] `server/index.js` 添加全局 rate limit 中间件
- [ ] AI 相关路由（chat、generate）单独设置更严格的限制
- [ ] 生产环境建议接入 Redis 实现分布式限流
- [ ] 当前内存级限流仅开发环境使用

### 10. 确保生产环境关闭 Debug Mode
- [ ] `src/lib/debug.ts` 中 `DEBUG_MODE = false`
- [ ] 关闭后一键登录按钮、一键还原按钮、网络日志拦截器不再生效
- [ ] 添加 CI/CD 检查，阻止 DEBUG_MODE=true 的代码合并到 main

### 11. 网络日志拦截器安全加固
- [ ] `src/lib/logger.ts` 中过滤敏感字段（Authorization、Cookie、密码等）
- [ ] 限制记录的最大长度，防止内存溢出
- [ ] 确保 DEBUG_MODE=false 时拦截器完全不执行

### 12. 知识库搜索端点加认证
- [ ] `server/routes/knowledgeBase.js` 第 95 行 `POST /search` 添加 `authMiddleware`
- [ ] 或至少添加 IP 级别的 rate limit

### 13. Error Handler 安全加固
- [ ] `server/middleware/errorHandler.js` 增加多层保护，确保生产环境绝不返回 stack trace
- [ ] 可考虑：`if (process.env.NODE_ENV !== 'production')` 改为白名单模式

### 14. CORS 生产环境配置
- [ ] 根据实际部署域名配置 `origin`（不要 `*` + `credentials: true`）
- [ ] 不同环境（dev/staging/prod）使用不同的 CORS 配置

---

## 🟢 P3 — 低优先级（后续优化）

### 15. 管理员判断改为数据库/环境变量配置
- [ ] `server/middleware/auth.js` 第 82 行硬编码手机号 `17388978910` → 改为 `ADMIN_PHONE` 环境变量或数据库配置表

### 16. 输入校验强化
- [ ] 所有 API 路由增加严格的输入校验（Joi / Zod）
- [ ] 文件上传增加类型白名单和大小限制的后端校验
- [ ] SQL 查询参数严格类型转换

### 17. 安全响应头
- [ ] 添加 Helmet.js 中间件：
  - `Content-Security-Policy`
  - `X-Frame-Options`
  - `X-Content-Type-Options`
  - `Strict-Transport-Security`

### 18. 备份策略
- [ ] 配置 `pg_dump` 定时备份
- [ ] gzip 压缩 + 7 天本地轮转

### 19. 依赖安全扫描
- [ ] 运行 `npm audit` 检查已知漏洞
- [ ] 配置 Dependabot 自动告警

---

## 📊 风险矩阵

| 问题 | 严重性 | 利用难度 | 业务影响 |
|------|--------|----------|----------|
| DeepSeek API Key 泄露 | 🔴 致命 | 极低（复制即用） | 高额 API 费用、数据泄露 |
| JWT 不验签 | 🔴 致命 | 低（jwt.io 伪造） | 完全认证绕过、管理员冒充 |
| 前端 bundle 含 Key | 🔴 致命 | 极低（F12 查看） | 同上 |
| Authing 凭据硬编码 | 🔴 严重 | 低 | 钓鱼攻击、身份冒用 |
| git 历史凭据残留 | 🟠 高危 | 中 | 历史版本恢复即可泄露 |
| SQL 拼接 | 🟠 高危 | 中（需配合其他漏洞） | 数据泄露/篡改 |
| Rate Limit 缺失 | 🟡 中危 | 低 | DoS、费用攻击 |
| Debug Mode 生产暴露 | 🟡 中危 | 低 | 调试功能被滥用 |

---

## ✅ 验收标准

- [ ] `grep -r "sk-065f8f0714cf4c4e8bd0b687eebc50a5" .` 返回空（已更换 Key）
- [ ] `grep -r "6a13a72bc34d1d925e777d82" .` 返回空（已更换 App ID）
- [ ] `git log --all -S "sk-"` 返回空（历史已清除）
- [ ] 前端 build 产物中搜索不到任何 API Key
- [ ] 伪造 JWT 请求返回 401
- [ ] `npm audit` 无高危漏洞

---

*最后更新：2026-05-22*
