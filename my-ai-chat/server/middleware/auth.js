import { jwtVerify, createRemoteJWKSet } from 'jose';
import { db } from '../db.js';

const AUTHING_APP_HOST = process.env.AUTHING_APP_HOST;
const AUTHING_APP_ID = process.env.AUTHING_APP_ID;
const AUTHING_JWKS_URL = process.env.AUTHING_JWKS_URL;

let jwks = null;

function getJwks() {
  if (!jwks) {
    const jwksUrl = AUTHING_JWKS_URL || (AUTHING_APP_HOST ? `${AUTHING_APP_HOST}/.well-known/jwks.json` : null);
    if (jwksUrl) {
      jwks = createRemoteJWKSet(new URL(jwksUrl));
    }
  }
  return jwks;
}

/**
 * 验证 Token（优先 JWKS 验签，失败时调用 Authing API 备选验证）
 * authing-js-sdk 的 token 不是标准 JWT，需要 API 验证
 */
async function verifyJwt(token) {
  // 方案 1：JWKS 验签（适用于 @authing/web 的 OIDC id_token）
  try {
    const keySet = getJwks();
    if (keySet) {
      const { payload } = await jwtVerify(token, keySet, {
        clockTolerance: 60,
      });
      return payload;
    }
  } catch (err) {
    console.log('[Auth] JWKS verify failed, trying Authing API fallback:', err.message);
  }

  // 方案 2：Authing API 验证（适用于 authing-js-sdk 的 token）
  try {
    const profileUrl = AUTHING_APP_HOST
      ? `${AUTHING_APP_HOST}/api/v3/get-profile`
      : null;
    if (!profileUrl) return null;

    const response = await fetch(profileUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (data.statusCode !== 200 || !data.data) return null;

    const user = data.data;
    return {
      sub: user.id || user.sub,
      email: user.email || null,
      phone: user.phone || user.phone_number || null,
      name: user.name || user.nickname || null,
      picture: user.photo || user.picture || user.avatar || null,
    };
  } catch (err) {
    console.error('[Auth] Authing API fallback failed:', err.message);
    return null;
  }
}

export async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ code: 1002, message: '缺少 Token', data: null });
  }

  const token = authHeader.slice(7);

  // 开发环境调试 token 支持
  let payload = null;
  if (process.env.NODE_ENV === 'development' && token === 'debug-token-mock') {
    payload = {
      sub: 'debug-admin-17388978910',
      email: '17388978910',
      phone: '17388978910',
      name: '调试管理员',
      picture: null,
    };
  } else {
    payload = await verifyJwt(token);
  }

  if (!payload) {
    return res.status(401).json({ code: 1001, message: 'Token 无效或已过期', data: null });
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
      // 检查是否有同手机号的预创建用户
      let precreated = null;
      if (phone) {
        const preResult = await db.query(
          "SELECT * FROM users WHERE phone = $1 AND authing_id LIKE 'precreated:%'",
          [phone]
        );
        precreated = preResult.rows[0];
      }

      if (precreated) {
        // 将预创建用户转正：更新 authing_id 和其他信息
        result = await db.query(
          `UPDATE users
           SET authing_id = $1, email = $2, display_name = $3, avatar_url = $4,
               subscription_start_at = NOW(), updated_at = NOW()
           WHERE id = $5
           RETURNING *`,
          [authingId, email, displayName, avatarUrl, precreated.id]
        );
        user = result.rows[0];
        isNewUser = true;
      } else {
        // 自动创建新用户
        // 管理员标识：从环境变量读取，默认使用原手机号（生产环境应更换）
        const adminPhone = process.env.ADMIN_PHONE || '17388978910';
        const role = phone === adminPhone ? 'admin' : 'user';
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
      }
    } else if (!user.subscription_start_at) {
      // 已有用户首次登录：启动订阅计时
      await db.query(
        'UPDATE users SET subscription_start_at = NOW() WHERE id = $1',
        [user.id]
      );
      user.subscription_start_at = new Date().toISOString();
    }

    // 设置 PostgreSQL 会话变量（用于 RLS）
    // 使用参数化方式：先做一次安全的字符串转义
    const safeUserId = String(user.id).replace(/[^a-zA-Z0-9_-]/g, '');
    const safeUserRole = String(user.role).replace(/[^a-zA-Z0-9_-]/g, '');
    await db.query(`SET "app.current_user" = '${safeUserId}'`);
    await db.query(`SET "app.current_user_role" = '${safeUserRole}'`);

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
