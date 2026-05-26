import { Router } from 'express';
import { db } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// POST /api/feedback - 提交反馈
router.post('/', async (req, res, next) => {
  try {
    const { type, title, content, contact } = req.body;

    if (!type || !content) {
      return res.status(400).json({ code: 3001, message: '类型和内容不能为空', data: null });
    }

    const result = await db.query(
      `INSERT INTO feedback (user_id, type, title, content, contact)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [req.user?.id || null, type, title, content, contact]
    );

    res.status(201).json({ code: 0, message: '反馈已提交', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// GET /api/feedback - 获取反馈列表（管理员看所有，用户看自己的）
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, parseInt(req.query.pageSize) || 20);
    const status = req.query.status;
    const offset = (page - 1) * pageSize;

    let whereClause = '';
    const params = [];
    let idx = 1;

    if (status) {
      whereClause += ` AND status = $${idx++}`;
      params.push(status);
    }

    const countResult = await db.query(
      `SELECT COUNT(*) FROM feedback WHERE 1=1 ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const queryParams = [...params, pageSize, offset];
    const result = await db.query(
      `SELECT f.*, u.display_name as user_name, u.email as user_email
       FROM feedback f
       LEFT JOIN users u ON f.user_id = u.id
       WHERE 1=1 ${whereClause}
       ORDER BY f.created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      queryParams
    );

    res.json({
      code: 0,
      message: 'success',
      data: result.rows,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/feedback/:id/status - 更新反馈状态（仅管理员）
router.put('/:id/status', requireAdmin, async (req, res, next) => {
  try {
    const { status, admin_reply } = req.body;

    const result = await db.query(
      `UPDATE feedback SET status = $1, admin_reply = $2 WHERE id = $3 RETURNING *`,
      [status, admin_reply, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ code: 2001, message: '反馈不存在', data: null });
    }

    res.json({ code: 0, message: 'success', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
