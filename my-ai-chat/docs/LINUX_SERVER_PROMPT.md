# 🐧 Linux 服务器部署提示词

> 本文件是给 Kimi 助手的完整指令。用户在 Linux 服务器上打开 Kimi 后，直接复制以下内容发给 Kimi，Kimi 会按步骤自动完成从克隆到安装依赖的全部工作。

---

## 💬 发给 Kimi 的提示词（直接复制）

```
请帮我在一台 Linux 服务器上部署一个项目。

项目信息：
- GitHub: git@github.com:axiomzjq/ai_chat_v1.git
- 前端：React 19 + TypeScript + Vite（端口 5173，仅开发使用）
- 后端：Express 4.x + PostgreSQL（端口 3001）
- AI：DeepSeek API（后端代理模式）
- 认证：Authing 手机号验证码

你的任务是完成从克隆到安装所有依赖的全部工作，直到可以启动服务为止。

请严格按以下步骤执行，每完成一步告诉我结果：

### Step 1：检查并安装系统依赖
检查系统是否已安装：
- Node.js（要求 ≥ 18，推荐 20 LTS）
- PostgreSQL（推荐 14+）
- Git
- npm

如果任何一项缺失，请使用系统包管理器安装（Ubuntu/Debian 用 apt，CentOS/RHEL 用 yum/dnf）。

### Step 2：克隆代码
```bash
git clone git@github.com:axiomzjq/ai_chat_v1.git
cd ai_chat_v1
```

如果 clone 失败，尝试使用 HTTPS：
```bash
git clone https://github.com/axiomzjq/ai_chat_v1.git
```

### Step 3：安装 Node.js 依赖
```bash
# 前端依赖（项目根目录）
npm install

# 后端依赖（server 目录）
cd server && npm install && cd ..
```

### Step 4：安装并初始化 PostgreSQL
执行以下命令：
```bash
# 启动 PostgreSQL 服务
sudo systemctl start postgresql
sudo systemctl enable postgresql

# 创建数据库和用户
sudo -u postgres psql -c "CREATE DATABASE aichat;"
sudo -u postgres psql -c "CREATE USER aiuser WITH PASSWORD 'aichat_pass_2026';"
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE aichat TO aiuser;"

# 执行建表脚本
cd server
sudo -u postgres psql -U aiuser -d aichat -f schema.sql
cd ..
```

### Step 5：验证安装
```bash
# 验证 Node.js 版本
node --version

# 验证前端依赖
ls node_modules/.package-lock.json 2>/dev/null || echo "前端依赖检查"

# 验证后端依赖
ls server/node_modules/.package-lock.json 2>/dev/null || echo "后端依赖检查"

# 验证数据库表
sudo -u postgres psql -U aiuser -d aichat -c "\dt"
sudo -u postgres psql -U aiuser -d aichat -c "\d users"
```

确认 users 表包含：subscription_start_at, subscription_days, token_quota, token_used

### Step 6：汇报状态
告诉我：
1. 所有系统依赖是否安装成功
2. 前后端 npm install 是否成功
3. PostgreSQL 数据库和表是否创建成功
4. 是否发现任何错误或警告
5. 下一步需要我提供哪些环境变量（.env 配置）

重要规则：
- 不要修改任何源码文件
- 不要启动服务（等用户提供环境变量后再启动）
- 遇到错误立即停止并报告，不要猜测修复
```

---

## 🛠️ Linux 各发行版安装命令参考

如果 Kimi 需要手动安装系统依赖，以下是常用命令：

### Ubuntu / Debian

```bash
# 更新源
sudo apt update

# 安装 Node.js 20 (LTS)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 验证
node --version  # 应显示 v20.x.x
npm --version

# 安装 PostgreSQL
sudo apt install -y postgresql postgresql-contrib

# 安装 Git
sudo apt install -y git

# 启动服务
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### CentOS / RHEL / Rocky Linux

```bash
# 安装 Node.js 20
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs

# 安装 PostgreSQL
sudo yum install -y postgresql-server postgresql-contrib
sudo postgresql-setup initdb
sudo systemctl start postgresql
sudo systemctl enable postgresql

# 安装 Git
sudo yum install -y git
```

---

## ⚠️ 常见问题（给 Kimi 的排错指南）

### 1. `git clone` 失败（SSH 密钥未配置）

```bash
# 方案 A：改用 HTTPS
git clone https://github.com/axiomzjq/ai_chat_v1.git

# 方案 B：生成 SSH 密钥并添加到 GitHub
ssh-keygen -t ed25519 -C "your_email@example.com"
cat ~/.ssh/id_ed25519.pub
# 然后复制公钥到 GitHub Settings -> SSH Keys
```

### 2. `npm install` 失败（权限问题）

```bash
# 不要用 sudo 运行 npm install
# 如果之前用了 sudo，先清理
sudo rm -rf node_modules package-lock.json
npm install
```

### 3. PostgreSQL 连接失败

```bash
# 检查 PostgreSQL 是否运行
sudo systemctl status postgresql

# 检查监听配置
sudo -u postgres psql -c "SHOW listen_addresses;"
# 如果显示 localhost，说明只能本地连接，这是正确的

# 检查用户是否存在
sudo -u postgres psql -c "\du"
```

### 4. `psql -U aiuser` 失败（peer 认证）

PostgreSQL 默认使用 peer 认证，需要修改为 md5：

```bash
# 编辑 pg_hba.conf
sudo nano /etc/postgresql/14/main/pg_hba.conf
# 找到以下行并修改：
# FROM: local   all             all                                     peer
# TO:   local   all             all                                     md5

# 重启 PostgreSQL
sudo systemctl restart postgresql
```

### 5. 端口被占用

```bash
# 检查端口占用
sudo lsof -i :3001
sudo lsof -i :5173

# 如有占用，先停止占用进程
sudo kill -9 <PID>
```

---

## ✅ 安装完成后的验证清单

Kimi 完成安装后，用户应确认以下输出：

```bash
# 1. Node.js 版本
$ node --version
v20.x.x

# 2. 数据库表存在
$ sudo -u postgres psql -U aiuser -d aichat -c "\dt"
         List of relations
 Schema |     Name      | Type  | Owner
--------+---------------+-------+--------
 public | conversations | table | aiuser
 public | feedback      | table | aiuser
 public | knowledge_base| table | aiuser
 public | messages      | table | aiuser
 public | usage_stats   | table | aiuser
 public | user_profiles | table | aiuser
 public | users         | table | aiuser

# 3. users 表字段正确
$ sudo -u postgres psql -U aiuser -d aichat -c "\d users"
# 应包含：subscription_start_at, subscription_days, token_quota, token_used
```

---

## 📦 下一步（环境变量配置）

安装完成后，Kimi 会提示用户提供以下信息来创建 `.env` 文件：

**`server/.env`**：
- `DEEPSEEK_API_KEY`
- `AUTHING_APP_ID`
- `AUTHING_APP_HOST`
- `AUTHING_JWKS_URL`
- `ADMIN_PHONE`（可选，默认 17388978910）
- `DATABASE_URL`（如果修改了数据库用户名/密码）

**`.env.local`**（仅在需要前端开发时）：
- `VITE_AUTHING_APP_ID`
- `VITE_AUTHING_DOMAIN`
- `VITE_AUTHING_USER_POOL_ID`

---

*本文档与代码同步维护。如有系统依赖变更，请更新此处。*
