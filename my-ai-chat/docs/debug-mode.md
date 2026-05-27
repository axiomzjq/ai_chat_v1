# 调试模式（Debug Mode）

## 概述

项目内置了一套调试日志系统，用于在开发和测试阶段快速收集前端运行时信息（控制台输出、网络请求、未捕获异常）。

**所有调试入口和日志拦截器由一个单一开关控制，可一键移除。**

---

## 控制开关

文件：`src/lib/debug.ts`

```typescript
export const DEBUG_MODE = true;   // ← 改成 false 即可关闭所有调试功能
```

### 一键关闭所有调试 UI

1. 打开 `src/lib/debug.ts`
2. 将 `DEBUG_MODE` 从 `true` 改为 `false`
3. 重新构建部署

```bash
npm run build
```

---

## 调试模式开启时（DEBUG_MODE = true）

### 前端 UI 入口

| 位置 | 说明 |
|------|------|
| **登录页底部** | 🐛 "导出调试日志" 按钮，点击直接复制日志到剪贴板 |
| **应用 Header（桌面端）** | 🐛 Bug 图标按钮，点击打开日志弹窗 |
| **应用 Header（移动端）** | 🐛 Bug 图标按钮，点击打开日志弹窗 |
| **日志弹窗** | 黑底绿字的终端风格日志面板，支持「复制全部」和「清空」 |

### 自动捕获的内容

`src/lib/logger.ts` 会拦截并记录：

- `console.log / error / warn / info`
- `fetch` 请求和响应（URL、状态码、响应体前 300 字符）
- `XMLHttpRequest` 请求和响应
- 未捕获的 Promise Rejection
- 全局 JavaScript 错误

### 登录流程关键节点日志

`src/firebase.ts` 中的登录函数已插入结构化日志：

```
[Auth] 开始发送验证码: { phone, scene }
[Auth] 验证码发送成功: { phone, result }
[Auth] 开始手机号登录: { phone, codeLength }
[Auth] 调用 loginByPhoneCode...
[Auth] loginByPhoneCode 返回: { id, hasToken }
[Auth] 保存 token 到 localStorage
[Auth] 登录成功，已设置当前用户: { uid, email }
```

---

## 调试模式关闭时（DEBUG_MODE = false）

### 行为变化

| 项目 | 开启时 | 关闭时 |
|------|--------|--------|
| 日志拦截器 | 启动，拦截 console/fetch/XHR | 完全不启动，浏览器原生行为 |
| 登录页 Bug 按钮 | 显示 | 隐藏 |
| Header Bug 按钮 | 显示 | 隐藏 |
| 日志弹窗 | 可通过按钮打开 | 不可打开（按钮已隐藏） |
| `exportLogs()` 函数 | 返回已收集的日志 | 返回空字符串 |

### 对生产环境的影响

- **零性能开销**：日志拦截器完全不初始化
- **零 UI 污染**：所有调试按钮和弹窗从 DOM 中移除
- **Console 完全原生**：不再经过任何包装层

---

## 日志弹窗手动触发（开发时）

即使不点击 UI 按钮，也可以在浏览器控制台中手动调用：

```javascript
// 复制当前所有日志
navigator.clipboard.writeText(window.__getLogs());

// 获取 JSON 格式的日志
window.__getLogsJSON();

// 清空日志缓存
window.__clearLogs();
```

> 注意：这些全局函数只在 `DEBUG_MODE = true` 时挂载到 `window`。

---

## 文件清单

| 文件 | 职责 |
|------|------|
| `src/lib/debug.ts` | **唯一开关**，控制整个调试系统的启停 |
| `src/lib/logger.ts` | 日志拦截器实现，读取 `DEBUG_MODE` 决定是否启动 |
| `src/main.tsx` | 导入 logger.ts，触发初始化 |
| `src/firebase.ts` | 登录流程关键节点的 `console.log` 调用 |
| `src/App.tsx` | 调试按钮 UI 和日志弹窗，用 `DEBUG_MODE` 条件渲染 |
