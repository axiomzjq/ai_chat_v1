import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware, requireAdmin, requireSuperadmin, isSuperadmin } from '../middleware/auth.js';

const router = Router();

// 所有管理员路由都需要认证 + 管理员权限（admin 或 superadmin）
router.use(authMiddleware, requireAdmin);

// 获取当前用户权限等级
const getRoleLevel = (role) => {
  if (role === 'superadmin') return 2;
  if (role === 'admin') return 1;
  return 0;
};

// GET /api/admin/users - 获取用户列表
// 普通管理员：只能看到普通用户（user），看不到其他管理员和超级管理员
// 超级管理员：可以看到所有用户
router.get('/users', async (req, res, next) => {
  try {
    const isSuper = isSuperadmin(req);
    let whereClause = '';
    const params = [];

    if (!isSuper) {
      // 普通管理员只能看到普通用户
      whereClause = 'WHERE role = $1';
      params.push('user');
    }
    // 超级管理员看到所有用户（不过滤）

    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, parseInt(req.query.pageSize) || 20);
    const search = req.query.search;
    const offset = (page - 1) * pageSize;

    // 搜索条件
    let searchWhere = '';
    const searchParams = [];
    if (search) {
      searchWhere = ` AND (phone ILIKE $${searchParams.length + 1} OR email ILIKE $${searchParams.length + 2} OR display_name ILIKE $${searchParams.length + 3})`;
      searchParams.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const countResult = await db.query(
      `SELECT COUNT(*) FROM users ${whereClause}${searchWhere}`,
      [...params, ...searchParams]
    );
    const total = parseInt(countResult.rows[0].count);

    const queryParams = [...params, ...searchParams, pageSize, offset];
    const result = await db.query(
      `SELECT id, authing_id, email, phone, display_name, avatar_url, role,
              subscription_start_at, subscription_days, token_quota, token_used,
              created_at
       FROM users
       ${whereClause}${searchWhere}
       ORDER BY created_at DESC
       LIMIT $${queryParams.length - 1} OFFSET $${queryParams.length}`,
      queryParams
    );

    res.json({
      code: 0,
      message: 'success',
      data: result.rows,
      isSuperadmin: isSuper,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/users/precreated - 预创建用户（通过手机号）
// 普通管理员：只能预创建普通用户
// 超级管理员：可以预创建任何角色
router.post('/users/precreated', async (req, res, next) => {
  try {
    const { phone, subscription_days = 7, token_quota = 100000, role = 'user' } = req.body;

    if (!phone || phone.length < 11) {
      return res.status(400).json({ code: 4003, message: '请输入有效的手机号码', data: null });
    }

    // 普通管理员只能创建 user 角色
    const isSuper = isSuperadmin(req);
    if (!isSuper && role !== 'user') {
      return res.status(403).json({ code: 2002, message: '普通管理员只能创建普通用户', data: null });
    }

    // 检查手机号是否已存在（包括预创建和正常用户）
    const existing = await db.query('SELECT * FROM users WHERE phone = $1', [phone]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ code: 4091, message: '该手机号已存在', data: existing.rows[0] });
    }

    // 超级管理员预创建时可以使用指定角色，普通管理员只能创建 user
    const finalRole = isSuper ? role : 'user';
    const defaultDays = finalRole === 'superadmin' ? 99999 : finalRole === 'admin' ? 99999 : (parseInt(subscription_days) || 7);
    const defaultTokens = finalRole === 'superadmin' ? 999999999 : finalRole === 'admin' ? 999999999 : (parseInt(token_quota) || 100000);

    const result = await db.query(
      `INSERT INTO users (authing_id, phone, role, subscription_days, token_quota)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [`precreated:${phone}`, phone, finalRole, defaultDays, defaultTokens]
    );

    // 初始化用户画像：临时切换 RLS 上下文为新用户，插入后恢复
    await db.query(`SELECT set_config('app.current_user', $1, false)`, [result.rows[0].id]);
    await db.query('INSERT INTO user_profiles (user_id) VALUES ($1)', [result.rows[0].id]);
    await db.query(`SELECT set_config('app.current_user', $1, false)`, [req.user.id]);

    res.json({ code: 0, message: 'success', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/users/:id/subscription - 修改用户订阅配置
// 普通管理员：只能修改普通用户（user），不能修改管理员和超级管理员
// 超级管理员：可以修改所有用户
router.patch('/users/:id/subscription', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { subscription_days, token_quota, token_used } = req.body;

    // 获取目标用户信息
    const targetUser = await db.query('SELECT id, role FROM users WHERE id = $1', [id]);
    if (targetUser.rows.length === 0) {
      return res.status(404).json({ code: 4041, message: '用户不存在', data: null });
    }

    // 普通管理员不能修改管理员和超级管理员
    const isSuper = isSuperadmin(req);
    if (!isSuper && targetUser.rows[0].role !== 'user') {
      return res.status(403).json({ code: 2002, message: '普通管理员只能修改普通用户的额度', data: null });
    }

    const updates = [];
    const values = [];
    let idx = 1;

    if (subscription_days !== undefined) {
      updates.push(`subscription_days = $${idx++}`);
      values.push(parseInt(subscription_days) || 0);
      // 重新调整剩余天数时，将订阅起始时间重置为当前时间
      updates.push(`subscription_start_at = NOW()`);
    }
    if (token_quota !== undefined) {
      updates.push(`token_quota = $${idx++}`);
      values.push(parseInt(token_quota) || 0);
    }
    if (token_used !== undefined) {
      updates.push(`token_used = $${idx++}`);
      values.push(Math.max(0, parseInt(token_used) || 0));
    }

    if (updates.length === 0) {
      return res.status(400).json({ code: 4001, message: '未提供要更新的字段', data: null });
    }

    values.push(id);
    const result = await db.query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      values
    );

    res.json({ code: 0, message: 'success', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/users/:id/reset-token-used - 重置用户 Token 已用量为 0
router.post('/users/:id/reset-token-used', async (req, res, next) => {
  try {
    const { id } = req.params;

    const result = await db.query(
      `UPDATE users SET token_used = 0, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ code: 4041, message: '用户不存在', data: null });
    }

    res.json({ code: 0, message: 'success', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/users/:id/role - 修改用户角色
// 普通管理员：只能将普通用户提升/降级为普通用户（实际上无意义，但保留接口）
// 超级管理员：可以修改任何用户的角色（包括 admin → superadmin 等）
router.patch('/users/:id/role', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role || !['user', 'admin', 'superadmin'].includes(role)) {
      return res.status(400).json({ code: 4002, message: '角色必须是 user、admin 或 superadmin', data: null });
    }

    // 获取目标用户信息
    const targetUser = await db.query('SELECT id, role FROM users WHERE id = $1', [id]);
    if (targetUser.rows.length === 0) {
      return res.status(404).json({ code: 4041, message: '用户不存在', data: null });
    }

    const isSuper = isSuperadmin(req);
    const currentRole = targetUser.rows[0].role;

    // 普通管理员不能修改任何管理员的角色
    if (!isSuper && (currentRole === 'admin' || currentRole === 'superadmin')) {
      return res.status(403).json({ code: 2002, message: '普通管理员不能修改其他管理员的角色', data: null });
    }

    // 普通管理员只能将用户设为 user（不能设为 admin/superadmin）
    if (!isSuper && role !== 'user') {
      return res.status(403).json({ code: 2002, message: '普通管理员只能设置普通用户角色', data: null });
    }

    const result = await db.query(
      'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [role, id]
    );

    res.json({ code: 0, message: 'success', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
