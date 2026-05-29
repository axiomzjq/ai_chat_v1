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
              quota_minutes, used_minutes, created_at
       FROM users
       ORDER BY created_at DESC`
    );
    res.json({ code: 0, message: 'success', data: result.rows });
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
