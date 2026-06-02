import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware, requireAdmin } from '../middleware/auth.js';

const router = Router();

// 所有管理员路由都需要认证 + 管理员权限
router.use(authMiddleware, requireAdmin);

// GET /api/admin/users - 获取所有用户列表
router.get('/users', async (req, res, next) => {
  try {
    const result = await db.query(
      `SELECT id, authing_id, email, phone, display_name, avatar_url, role,
              subscription_start_at, subscription_days, token_quota, token_used,
              created_at
       FROM users
       ORDER BY created_at DESC`
    );
    res.json({ code: 0, message: 'success', data: result.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/users/precreated - 预创建用户（通过手机号）
router.post('/users/precreated', async (req, res, next) => {
  try {
    const { phone, subscription_days = 7, token_quota = 100000, role = 'user' } = req.body;

    if (!phone || phone.length < 11) {
      return res.status(400).json({ code: 4003, message: '请输入有效的手机号码', data: null });
    }

    // 检查手机号是否已存在（包括预创建和正常用户）
    const existing = await db.query('SELECT * FROM users WHERE phone = $1', [phone]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ code: 4091, message: '该手机号已存在', data: existing.rows[0] });
    }

    // 预创建用户：authing_id 用占位符，等用户首次登录时替换
    const result = await db.query(
      `INSERT INTO users (authing_id, phone, role, subscription_days, token_quota)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [`precreated:${phone}`, phone, role, parseInt(subscription_days) || 7, parseInt(token_quota) || 100000]
    );

    // 初始化用户画像
    await db.query('INSERT INTO user_profiles (user_id) VALUES ($1)', [result.rows[0].id]);

    res.json({ code: 0, message: 'success', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/users/:id/subscription - 修改用户订阅配置
router.patch('/users/:id/subscription', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { subscription_days, token_quota } = req.body;

    const updates = [];
    const values = [];
    let idx = 1;

    if (subscription_days !== undefined) {
      updates.push(`subscription_days = $${idx++}`);
      values.push(parseInt(subscription_days) || 0);
    }
    if (token_quota !== undefined) {
      updates.push(`token_quota = $${idx++}`);
      values.push(parseInt(token_quota) || 0);
    }

    if (updates.length === 0) {
      return res.status(400).json({ code: 4001, message: '未提供要更新的字段', data: null });
    }

    values.push(id);
    const result = await db.query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${idx} RETURNING *`,
      values
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
router.patch('/users/:id/role', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role || !['user', 'admin'].includes(role)) {
      return res.status(400).json({ code: 4002, message: '角色必须是 user 或 admin', data: null });
    }

    const result = await db.query(
      `UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 RETURNING *`,
      [role, id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ code: 4041, message: '用户不存在', data: null });
    }

    res.json({ code: 0, message: 'success', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
