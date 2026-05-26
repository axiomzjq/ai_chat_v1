import { AuthenticationClient } from 'authing-js-sdk';
import { db } from '../db.js';

const authClient = new AuthenticationClient({
  appId: process.env.AUTHING_APP_ID,
  appHost: process.env.AUTHING_APP_HOST,
});

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 1002, message: '缺少 Token', data: null });
  }

  const token = authHeader.slice(7);

  try {
    // 验证 Authing Token 并获取用户信息
    const authingUser = await authClient.getUserInfoByAccessToken(token);
    
    if (!authingUser || authingUser.code) {
      return res.status(401).json({ code: 1001, message: 'Token 无效', data: null });
    }

    const authingId = authingUser.sub || authingUser.id;
    const email = authingUser.email || null;
    const phone = authingUser.phone || null;
    const displayName = authingUser.name || authingUser.nickname || null;
    const avatarUrl = authingUser.photo || null;

    // 查找或创建本地用户
    let result = await db.query('SELECT * FROM users WHERE authing_id = $1', [authingId]);
    let user = result.rows[0];
    let isNewUser = false;

    if (!user) {
      // 自动创建新用户
      const role = email === 'janeeric879@gmail.com' ? 'admin' : 'user';
      result = await db.query(
        `INSERT INTO users (authing_id, email, phone, display_name, avatar_url, role)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [authingId, email, phone, displayName, avatarUrl, role]
      );
      user = result.rows[0];
      isNewUser = true;

      // 初始化用户画像
      await db.query(
        'INSERT INTO user_profiles (user_id) VALUES ($1)',
        [user.id]
      );
    }

    // 设置 PostgreSQL 会话变量（用于 RLS）
    await db.query('SET app.current_user = $1', [user.id]);
    await db.query('SET app.current_user_role = $2', [user.role]);

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
