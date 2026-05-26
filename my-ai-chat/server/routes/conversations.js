import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

// GET /api/conversations - 获取对话列表
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, parseInt(req.query.pageSize) || 20);
    const status = req.query.status || 'active';
    const offset = (page - 1) * pageSize;

    const countResult = await db.query(
      'SELECT COUNT(*) FROM conversations WHERE status = $1',
      [status]
    );
    const total = parseInt(countResult.rows[0].count);

    const result = await db.query(
      `SELECT c.*, COUNT(m.id) as message_count
       FROM conversations c
       LEFT JOIN messages m ON c.id = m.conversation_id
       WHERE c.status = $1
       GROUP BY c.id
       ORDER BY c.updated_at DESC
       LIMIT $2 OFFSET $3`,
      [status, pageSize, offset]
    );

    res.json({
      code: 0,
      message: 'success',
      data: result.rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/conversations - 创建对话
router.post('/', async (req, res, next) => {
  try {
    const { title, current_step = 'interview' } = req.body;
    const result = await db.query(
      `INSERT INTO conversations (user_id, title, current_step)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [req.user.id, title || '新对话', current_step]
    );
    res.status(201).json({ code: 0, message: 'success', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// GET /api/conversations/:id - 获取单个对话
router.get('/:id', async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT * FROM conversations WHERE id = $1',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ code: 2001, message: '对话不存在', data: null });
    }
    res.json({ code: 0, message: 'success', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// PUT /api/conversations/:id - 更新对话
router.put('/:id', async (req, res, next) => {
  try {
    const { title, current_step, status } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    if (title !== undefined) { updates.push(`title = $${idx++}`); values.push(title); }
    if (current_step !== undefined) { updates.push(`current_step = $${idx++}`); values.push(current_step); }
    if (status !== undefined) { updates.push(`status = $${idx++}`); values.push(status); }

    if (updates.length === 0) {
      return res.status(400).json({ code: 3001, message: '没有要更新的字段', data: null });
    }

    values.push(req.params.id);
    const result = await db.query(
      `UPDATE conversations SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ code: 2001, message: '对话不存在', data: null });
    }
    res.json({ code: 0, message: 'success', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/conversations/:id - 软删除
router.delete('/:id', async (req, res, next) => {
  try {
    const result = await db.query(
      "UPDATE conversations SET status = 'deleted' WHERE id = $1 RETURNING *",
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ code: 2001, message: '对话不存在', data: null });
    }
    res.json({ code: 0, message: '对话已删除', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
