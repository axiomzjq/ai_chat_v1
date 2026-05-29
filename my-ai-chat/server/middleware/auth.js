import { db } from '../db.js';

/**
 * 解析 JWT payload（base64url 解码）
 * Authing 的 access token 是标准 JWT，payload 包含 sub, email, phone, name 等
 */
function parseJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    // base64url -> base64
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = Buffer.from(base64, 'base64').toString('utf-8');
    return JSON.parse(json);
  } catch (e) {
    console.error('[Auth] JWT parse error:', e.message);
    return null;
  }
}

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 1002, message: '缺少 Token', data: null });
  }

  const token = authHeader.slice(7);
  const payload = parseJwtPayload(token);

  if (!payload) {
    return res.status(401).json({ code: 1001, message: 'Token 格式无效', data: null });
  }

  // 检查 token 是否过期
  if (payload.exp && payload.exp * 1000 < Date.now()) {
    return res.status(401).json({ code: 1001, message: 'Token 已过期', data: null });
  }

  try {
    const authingId = payload.sub || payload.id;
    const email = payload.email || null;
    const phone = payload.phone || payload.phone_number || null;
    const displayName = payload.name || payload.nickname || null;
    const avatarUrl = payload.picture || payload.photo || null;

    if (!authingId) {
      return res.status(401).json({ code: 1001, message: 'Token 中缺少用户标识', data: null });
    }

    // 查找或创建本地用户
    let result = await db.query('SELECT * FROM users WHERE authing_id = $1', [authingId]);
    let user = result.rows[0];
    let isNewUser = false;

    if (!user) {
      // 自动创建新用户
      // 管理员标识：手机号 17388978910
      const role = phone === '17388978910' ? 'admin' : 'user';
      // 默认订阅：7天试用期，100K tokens
      const defaultDays = role === 'admin' ? 99999 : 7;
      const defaultTokens = role === 'admin' ? 999999999 : 100000;
      result = await db.query(
        `INSERT INTO users (authing_id, email, phone, display_name, avatar_url, role, subscription_days, token_quota)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [authingId, email, phone, displayName, avatarUrl, role, defaultDays, defaultTokens]
      );
      user = result.rows[0];
      isNewUser = true;

      // 初始化用户画像
      await db.query(
        'INSERT INTO user_profiles (user_id) VALUES ($1)',
        [user.id]
      );
    } else if (!user.subscription_start_at) {
      // 已有用户首次登录：启动订阅计时
      await db.query(
        'UPDATE users SET subscription_start_at = NOW() WHERE id = $1',
        [user.id]
      );
      user.subscription_start_at = new Date().toISOString();
    }

    // 设置 PostgreSQL 会话变量（用于 RLS）
    // 注意：SET 命令不支持参数化查询，需要字符串拼接
    // 参数名必须用双引号包裹，因为 current_user 是 PostgreSQL 保留关键字
    await db.query(`SET "app.current_user" = '${user.id}'`);
    await db.query(`SET "app.current_user_role" = '${user.role}'`);

    req.user = user;
    req.isNewUser = isNewUser;
    next();
  } catch (err) {
    console.error('[Auth] Token verification failed:', err.message);
    return res.status(401).json({ code: 1001, message: 'Token 验证失败', data: null });
  }
}

// 可选：管理员权限检查
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ code: 2002, message: '需要管理员权限', data: null });
  }
  next();
}
