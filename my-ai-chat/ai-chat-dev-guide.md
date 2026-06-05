# AI 对话网站开发流程指南

> 适合人群：有 C 语言基础、第一次做前端开发的同学

---

## 需要用到的所有工具

| 工具 | 作用 | 类比 |
|---|---|---|
| Node.js + npm | JS 运行环境 + 包管理器 | C 的编译器 |
| VS Code | 代码编辑器 | 记事本的专业版 |
| Git | 代码版本管理 | 存档/回档系统 |
| Vite | 开发服务器 | 自动编译+刷新 |
| Claude Code | AI 写代码 | 会写代码的助手 |
| Vercel | 部署上线 | 把网站放到公网 |

---

## 第一步：安装基础工具

### Node.js（自带 npm）

去 [nodejs.org](https://nodejs.org) 下载 LTS 版本，一路 Next 安装。装完后终端验证：

```bash
node -v    # 应该显示 v20.x.x
npm -v     # 应该显示 10.x.x
```

> npm 不需要单独安装，装了 Node.js 就自动有了。

### VS Code

去 [code.visualstudio.com](https://code.visualstudio.com) 下载安装。装完后在左侧扩展栏搜索安装以下插件：

- `ES7+ React/Redux/React-Native snippets` — React 代码补全
- `Prettier` — 自动格式化代码
- `Chinese (Simplified)` — 界面中文化

### Git

去 [git-scm.com](https://git-scm.com) 下载安装，一路 Next。装完验证：

```bash
git --version    # 显示版本号即可
```

---

## 第二步：安装 Claude Code

Claude Code 是命令行 AI 工具，用 npm 安装：

```bash
npm install -g @anthropic-ai/claude-code
```

装完后登录（需要 Claude 账号）：

```bash
claude
```

首次运行会跳出浏览器让你登录授权，完成后回到终端即可使用。

---

## 第三步：创建项目

```bash
# 进入你想放项目的目录，比如桌面
cd ~/Desktop

# 创建 React + Vite 项目
npm create vite@latest my-ai-chat -- --template react

# 进入项目文件夹
cd my-ai-chat

# 安装依赖
npm install

# 用 VS Code 打开项目
code .
```

### 项目结构说明

```
my-ai-chat/
├── src/
│   ├── main.jsx        ← 程序入口，相当于 main()
│   ├── App.jsx         ← 根组件，主要在这里写界面
│   └── App.css         ← 样式文件
├── index.html          ← 网页骨架
├── package.json        ← 项目配置（依赖列表）
└── vite.config.js      ← 构建工具配置
```

---

## 第四步：开发方式与启动指令

本项目是**前后端分离**架构，开发时需要同时启动前端和后端。

### 环境准备（首次）

1. **安装前后端依赖**
   ```bash
   # 前端依赖
   npm install
   
   # 后端依赖
   cd server && npm install
   ```

2. **配置环境变量**
   项目需要两个环境变量文件（不在 git 中，需手动创建）：
   - 根目录 `.env.local`：Authing 前端配置
   - `server/.env`：后端数据库、Authing、DeepSeek API Key 等
   
   具体配置项请参考 `docs/ONBOARDING.md`。

3. **初始化数据库**
   确保 PostgreSQL 已安装并运行，然后执行：
   ```bash
   # 创建数据库和用户（以 postgres 执行）
   psql -U postgres -c "CREATE DATABASE aichat;"
   psql -U postgres -c "CREATE USER aiuser WITH PASSWORD 'aichat_pass_2026';"
   psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE aichat TO aiuser;"
   psql -U postgres -c "GRANT ALL ON SCHEMA public TO aiuser;"
   
   # 执行建表脚本
   cd server
   psql -U postgres -d aichat -f schema.sql
   ```

### 日常开发：同时开两个终端

VS Code 里按 `` Ctrl+` `` 打开终端，点 `+` 新建第二个。

#### 终端 1 — 前端开发服务器

```bash
npm run dev
```

前端默认运行在 `http://localhost:5173`，代码修改后页面自动刷新。

> **frp 穿透用户注意**：如果需要通过内网穿透（如 SakuraFrp）外网访问，启动时需绑定 IPv4：
> ```bash
> npm run dev -- --host=127.0.0.1 --port=5173
> ```
> 同时 `vite.config.ts` 中已配置 `allowedHosts` 允许 frp 域名访问。

#### 终端 2 — 后端开发服务器

```bash
cd server
npm run dev
```

后端运行在 `http://localhost:3001`，带 `--watch` 自动重载。

### 调试登录（开发环境）

前端登录页在 `DEBUG_MODE=true` 时会显示"调试一键登录"按钮，点击即可免验证码进入应用（自动分配管理员权限）。

> 调试登录会在 `localStorage` 写入 mock token，后端开发环境会识别并放行。

### 典型开发节奏

```
你：帮我加一个角色选择的侧边栏
Claude Code：[修改文件] 已完成...

你：记者那个图标换成麦克风
Claude Code：[修改样式] 已更新...

你：点击角色切换时对话区域要清空
Claude Code：[修改状态逻辑] 已添加...
```

修改后切换到浏览器 `localhost:5173` 查看效果。

---

## 第五步：用 Git 保存进度

把 Git 理解成游戏存档系统，`commit` 是存档，`checkout` 是读档。

```bash
# 第一次使用先初始化
git init
git add .
git commit -m "初始化项目"

# 每做完一个功能就存档
git add .
git commit -m "完成角色选择功能"

# 如果改坏了想回到上一个存档
git checkout .
```

---

## 第六步：部署上线

### 1. 注册账号

- 注册 [GitHub](https://github.com) 账号
- 用 GitHub 登录 [Vercel](https://vercel.com)

### 2. 推送代码到 GitHub

在 GitHub 上新建一个仓库，然后按页面提示执行：

```bash
git remote add origin https://github.com/你的用户名/my-ai-chat.git
git push -u origin main
```

### 3. 在 Vercel 导入项目

点 "Add New Project" → 选你的仓库 → Deploy，两分钟后得到公网地址。

之后每次 `git push`，Vercel 自动重新部署，网站自动更新。

### 4. 配置 API Key

在 Vercel 控制台进入项目 → Settings → Environment Variables，添加：

```
ANTHROPIC_API_KEY = 你的 key
```

---

## 整体流程图

```
写需求
  ↓
Claude Code 修改代码
  ↓
浏览器 localhost:5173 查看效果
  ↓
满意 → git commit 存档 → 继续下一个功能
不满意 → 继续对话调整
  ↓
全部完成 → git push → Vercel 自动上线
```

---

## 常见问题

**`npm install` 很慢**

换国内镜像：

```bash
npm config set registry https://registry.npmmirror.com
```

**`code .` 命令不识别**

打开 VS Code，按 `Cmd+Shift+P`（Mac）或 `Ctrl+Shift+P`（Windows），搜索 `Shell Command: Install 'code' command`，点击安装。

**浏览器没有自动刷新**

确认终端 1 的 `npm run dev` 还在跑且没有报错。

**Claude Code 改了但效果不对**

描述你看到的现象，让它自己排查，不要手动改代码。

---

## 推荐学习顺序

| 时间 | 目标 |
|---|---|
| 第 1-2 天 | 把项目跑起来，改 App.jsx 熟悉 JSX |
| 第 3-4 天 | 加 useState，实现输入框和消息列表 |
| 第 5-6 天 | 接入 Claude API，跑通对话 |
| 第 7-10 天 | 拆组件、加样式、做角色选择 |
| 第 11-14 天 | 部署到 Vercel 上线 |

---

## 附录：服务器 PM2 运维指南

> 以下命令在服务器环境使用，用于守护前后端进程，确保服务稳定运行。

### 安装 PM2

```bash
sudo npm install -g pm2
```

### 将服务加入 PM2

```bash
cd /path/to/ai_chat_v1/my-ai-chat/server
pm2 start index.js --name "ai-chat-backend"

cd /path/to/ai_chat_v1/my-ai-chat
pm2 start "npm run dev" --name "ai-chat-frontend"

# 保存配置，开机自启
pm2 save
pm2 startup
```

### 常用检查指令

| 操作 | 命令 |
|------|------|
| 查看所有进程状态 | `pm2 status` |
| 查看后端实时日志 | `pm2 logs ai-chat-backend` |
| 查看前端实时日志 | `pm2 logs ai-chat-frontend` |
| 重启后端 | `pm2 restart ai-chat-backend` |
| 重启前端 | `pm2 restart ai-chat-frontend` |
| 重启全部 | `pm2 restart all` |
| 停止全部 | `pm2 stop all` |
| 删除进程 | `pm2 delete ai-chat-backend` |

### PostgreSQL 检查

```bash
# 查看状态
sudo systemctl status postgresql-16

# 重启
sudo systemctl restart postgresql-16
```

### 一键健康检查脚本

项目已内置检查脚本，执行即可查看所有服务状态：

```bash
cd /path/to/ai_chat_v1/my-ai-chat
./scripts/check-services.sh
```

输出示例（全部正常）：

```
========================================
  AI Chat 服务健康检查
========================================

[1/5] PostgreSQL 16      ... ✓ 运行中
[2/5] PM2 后端服务      ... ✓ 运行中 (online)
[3/5] PM2 前端服务      ... ✓ 运行中 (online)
[4/5] 端口 3001/5173    ... ✓ 正常监听
[5/5] HTTP 健康检查     ... ✓ 后端+前端均正常

========================================
  检查结果: 全部正常
========================================
```

如果发现问题，脚本会自动提示修复命令。
