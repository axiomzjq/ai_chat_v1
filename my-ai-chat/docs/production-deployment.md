# 生产环境部署指南（域名 + 服务器 + HTTPS）

> 本文档假设你已拥有：
> - 一个域名（如 `yourdomain.com`）
> - 一台云服务器（推荐 Ubuntu 22.04 LTS）
> - 域名 DNS 已解析到服务器公网 IP

---

## 一、整体架构

```
用户浏览器
    ↓ HTTPS (443)
Nginx（反向代理 + SSL 终止 + 静态文件）
    ├── / → 前端静态文件（dist/）
    └── /api → 后端 Express (localhost:3001)
```

**为什么这样设计：**
- 一个域名搞定前后端，无需处理跨域
- Nginx 处理 HTTPS、Gzip、缓存，性能最优
- 后端不直接暴露公网，只接受 Nginx 转发

---

## 二、域名和 DNS 配置

### 方案 A：单域名（推荐）

| 服务 | 地址 |
|------|------|
| 前端 + 后端 API | `https://ai.yourdomain.com` |

Nginx 配置：
- `https://ai.yourdomain.com/` → 前端静态文件
- `https://ai.yourdomain.com/api/` → 后端 3001 端口

### 方案 B：子域名分离

| 服务 | 地址 |
|------|------|
| 前端 | `https://app.yourdomain.com` |
| 后端 API | `https://api.yourdomain.com` |

**方案 A 优点**：无跨域问题，配置简单，Cookie 共享自然  
**方案 B 优点**：前后端可独立扩容、独立部署

---

## 三、服务器准备

### 1. 系统更新 & 安装依赖

```bash
# Ubuntu/Debian
sudo apt update && sudo apt upgrade -y
sudo apt install -y nginx nodejs npm postgresql certbot python3-certbot-nginx

# 安装 Node.js 18+（如果系统自带的太旧）
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
```

### 2. 配置防火墙

```bash
sudo ufw allow 'Nginx Full'   # 80 + 443
sudo ufw allow OpenSSH        # 22
sudo ufw enable
```

---

## 四、PostgreSQL 生产配置

### 1. 创建生产数据库

```bash
sudo -u postgres psql
```

```sql
CREATE DATABASE aichat_prod;
CREATE USER aichat WITH ENCRYPTED PASSWORD 'your_strong_password_here';
GRANT ALL PRIVILEGES ON DATABASE aichat_prod TO aichat;
GRANT ALL ON SCHEMA public TO aichat;
\q
```

### 2. 执行建表脚本

```bash
cd /var/www/my-ai-chat/server
sudo -u postgres psql -d aichat_prod -f schema.sql
```

### 3. 安全加固（必须）

修改 `/etc/postgresql/14/main/pg_hba.conf`：

```conf
# 禁止远程连接，只允许本地
local   all             all                                     scram-sha-256
host    all             all             127.0.0.1/32            scram-sha-256
host    all             all             ::1/128                 scram-sha-256
```

```bash
sudo systemctl restart postgresql
```

---

## 五、后端部署

### 1. 上传代码

```bash
# 在服务器上
cd /var/www
git clone git@github.com:axiomzjq/ai_chat_v1.git my-ai-chat
cd my-ai-chat/server
npm ci --production
```

### 2. 创建生产环境变量

```bash
sudo nano /var/www/my-ai-chat/server/.env
```

```bash
# Server
PORT=3001
NODE_ENV=production

# PostgreSQL（强密码！）
DATABASE_URL=postgresql://aichat:your_strong_password_here@localhost:5432/aichat_prod

# Authing（和开发环境相同）
AUTHING_APP_ID=your_app_id
AUTHING_APP_HOST=https://your-authing-domain.authing.cn
AUTHING_JWKS_URL=https://your-authing-domain.authing.cn/oidc/.well-known/jwks.json

# Admin（更换为真实管理员手机号）
ADMIN_PHONE=your_real_admin_phone

# DeepSeek（生产环境必须使用正式 Key）
DEEPSEEK_API_KEY=sk-your_production_key

# File Upload
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=52428800

# CORS（单域名模式下可省略，因为 Nginx 反向代理已解决跨域）
# CORS_ORIGIN=https://ai.yourdomain.com

# Security
# JWT 过期时间（秒）
JWT_EXPIRES_IN=3600
```

### 3. 使用 PM2 守护进程

```bash
sudo npm install -g pm2
cd /var/www/my-ai-chat/server

# 启动
pm2 start index.js --name "ai-chat-api"
pm2 save
pm2 startup systemd
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u www-data --hp /var/www
```

### 4. 后端安全中间件（必须补充）

安装生产环境安全包：

```bash
cd /var/www/my-ai-chat/server
npm install helmet express-rate-limit
```

修改 `server/index.js` 添加安全中间件：

```javascript
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

// Helmet：安全 HTTP 头
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // React 需要
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// 全局 Rate Limit（生产环境用 Redis 存储）
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 100, // 每个 IP 100 次请求
  standardHeaders: true,
  legacyHeaders: false,
  message: { code: 429, message: '请求过于频繁，请稍后再试' },
});
app.use(globalLimiter);

// AI 对话单独限流（更严格）
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { code: 429, message: 'AI 对话请求过于频繁' },
});
app.use('/api/ai', aiLimiter);
```

---

## 六、前端构建与部署

### 1. 构建生产包

```bash
cd /var/www/my-ai-chat

# 创建生产环境变量
sudo nano .env.production
```

```bash
# 前端生产环境变量（构建时注入）
VITE_AUTHING_APP_ID=your_app_id
VITE_AUTHING_DOMAIN=your-authing-domain.authing.cn
VITE_AUTHING_USER_POOL_ID=your_user_pool_id
# 后端 API 地址：单域名模式下用相对路径 /api
VITE_API_BASE_URL=/api
```

```bash
npm ci
npm run build
```

构建产物在 `dist/` 目录下。

### 2. Nginx 配置

```bash
sudo nano /etc/nginx/sites-available/ai-chat
```

```nginx
server {
    listen 80;
    server_name ai.yourdomain.com;
    
    # 强制 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name ai.yourdomain.com;

    # SSL 证书（Certbot 会自动配置）
    ssl_certificate /etc/letsencrypt/live/ai.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/ai.yourdomain.com/privkey.pem;
    
    # SSL 安全参数
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;
    ssl_prefer_server_ciphers off;
    
    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml;
    
    # 前端静态文件
    location / {
        root /var/www/my-ai-chat/dist;
        index index.html;
        try_files $uri $uri/ /index.html; # SPA 路由支持
        
        # 缓存静态资源
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }
    }
    
    # 后端 API 反向代理
    location /api/ {
        proxy_pass http://localhost:3001/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 超时设置（AI 流式响应需要较长超时）
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
    
    # 上传文件目录（如果需要直接访问）
    location /uploads/ {
        alias /var/www/my-ai-chat/server/uploads/;
    }
}
```

启用配置：

```bash
sudo ln -s /etc/nginx/sites-available/ai-chat /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

### 3. 申请 HTTPS 证书

```bash
sudo certbot --nginx -d ai.yourdomain.com
# 按提示操作，选择 redirect HTTP to HTTPS
```

Certbot 会自动续期，无需手动维护。

---

## 七、Authing 控制台配置更新

上线前必须在 Authing 控制台更新以下配置：

| 配置项 | 开发环境 | 生产环境 |
|--------|---------|---------|
| **登录回调 URL** | `http://localhost:5173` | `https://ai.yourdomain.com` |
| **退出回调 URL** | `http://localhost:5173` | `https://ai.yourdomain.com` |
| **Allowed Origins** | `http://localhost:5173` | `https://ai.yourdomain.com` |
| **登录控制** | 手机号验证码 | 手机号验证码（确认开启）|

---

## 八、生产环境安全检查清单

### 部署前必须完成

- [ ] `server/.env` 中 `NODE_ENV=production`
- [ ] PostgreSQL 密码是强密码（16位以上，含大小写+数字+符号）
- [ ] DeepSeek API Key 是正式付费 Key（不是免费测试 Key）
- [ ] Admin 手机号已更换为真实管理员号码
- [ ] `.env` 和 `.env.production` 文件权限设置为 `600`（只有所有者可读）
- [ ] 已安装并配置 Helmet 中间件
- [ ] Rate Limit 已启用
- [ ] HTTPS 证书已配置且自动续期
- [ ] Nginx 已禁用服务器版本显示 (`server_tokens off;`)
- [ ] 上传文件目录已限制可执行权限 (`chmod -R 755 uploads/`)
- [ ] 服务器已配置自动安全更新 (`unattended-upgrades`)

### 部署后验证

- [ ] `https://ai.yourdomain.com` 能正常打开
- [ ] `https://ai.yourdomain.com/api/health` 返回 `{"status":"ok"}`
- [ ] 浏览器 DevTools → Security 面板显示证书有效
- [ ] 登录、AI 对话、文件上传等核心功能正常
- [ ] 尝试访问 `http://ai.yourdomain.com` 自动跳转到 HTTPS

---

## 九、监控与运维

### 日志查看

```bash
# PM2 日志
pm2 logs ai-chat-api

# Nginx 访问日志
sudo tail -f /var/log/nginx/access.log

# Nginx 错误日志
sudo tail -f /var/log/nginx/error.log

# PostgreSQL 慢查询日志
sudo tail -f /var/log/postgresql/postgresql-14-main.log
```

### 备份脚本

```bash
# 每天凌晨 3 点备份数据库
0 3 * * * pg_dump -U aichat aichat_prod | gzip > /var/backups/aichat_$(date +\%Y\%m\%d).sql.gz
```

### 健康检查

```bash
# 添加到 crontab 每分钟检查
* * * * * curl -f https://ai.yourdomain.com/api/health || pm2 restart ai-chat-api
```

---

## 十、成本估算（参考）

| 项目 | 月费用（人民币）|
|------|---------------|
| 云服务器（2核4G） | ~50-100 元 |
| 域名（.com） | ~60 元/年 |
| HTTPS 证书（Let's Encrypt）| 免费 |
| DeepSeek API（按量） | 取决于使用量 |
| Authing（免费版）| 免费（用户数 < 5000）|
| **总计** | **~100-200 元/月** |

---

*本文档应与代码同步维护。生产环境配置变更时，请更新此文档。*
