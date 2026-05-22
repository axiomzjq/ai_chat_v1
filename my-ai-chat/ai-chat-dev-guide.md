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

## 第四步：日常开发标准姿势

每次开发时，同时开**两个终端**。VS Code 里按 `` Ctrl+` `` 打开终端，点 `+` 新建第二个。

### 终端 1 — 开发服务器（一直保持运行）

```bash
npm run dev
```

看到 `http://localhost:5173` 后，浏览器打开这个地址。后面代码一改，页面自动刷新。

### 终端 2 — Claude Code

```bash
claude
```

进入后直接用中文说需求，例如：

```
> 帮我在 App.jsx 里做一个简单的对话界面，
  上方显示消息列表，下方有输入框和发送按钮，
  用户按回车或点按钮发送消息
```

Claude Code 会读取项目文件，直接修改代码，切换到浏览器即可看到效果。

### 典型对话节奏

```
你：帮我加一个角色选择的侧边栏，有"记者"和"心理咨询师"两个选项
Claude Code：[修改文件] 已完成...

你：记者那个图标换成麦克风，字体颜色改深一点
Claude Code：[修改样式] 已更新...

你：点击角色切换时，右边对话区域要清空重置
Claude Code：[修改状态逻辑] 已添加 resetChat 函数...
```

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
