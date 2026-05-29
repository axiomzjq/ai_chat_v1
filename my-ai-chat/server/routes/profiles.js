import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

// GET /api/user/profile - 获取当前用户画像
router.get('/', async (req, res, next) => {
  try {
    const result = await db.query(
      'SELECT * FROM user_profiles WHERE user_id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      // 自动创建
      const createResult = await db.query(
        'INSERT INTO user_profiles (user_id) VALUES ($1) RETURNING *',
        [req.user.id]
      );
      return res.json({ code: 0, message: 'success', data: createResult.rows[0] });
    }

    res.json({ code: 0, message: 'success', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// PUT /api/user/profile - 更新用户画像（JSONB 合并）
router.put('/', async (req, res, next) => {
  try {
    const { current_step, interview_data, information_report, positioning_report, copywriting_data } = req.body;
    const updates = [];
    const values = [];
    let idx = 1;

    if (current_step !== undefined) { updates.push(`current_step = $${idx++}`); values.push(current_step); }
    if (interview_data !== undefined) { updates.push(`interview_data = $${idx++}`); values.push(JSON.stringify(interview_data)); }
    if (information_report !== undefined) { updates.push(`information_report = $${idx++}`); values.push(JSON.stringify(information_report)); }
    if (positioning_report !== undefined) { updates.push(`positioning_report = $${idx++}`); values.push(JSON.stringify(positioning_report)); }
    if (copywriting_data !== undefined) { updates.push(`copywriting_data = $${idx++}`); values.push(JSON.stringify(copywriting_data)); }

    if (updates.length === 0) {
      return res.status(400).json({ code: 3001, message: '没有要更新的字段', data: null });
    }

    values.push(req.user.id);
    const result = await db.query(
      `UPDATE user_profiles SET ${updates.join(', ')} WHERE user_id = $${idx} RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      // 不存在则创建
      const createResult = await db.query(
        `INSERT INTO user_profiles (user_id, current_step, interview_data, information_report, positioning_report, copywriting_data)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [req.user.id, current_step || 'interview', 
         JSON.stringify(interview_data || {}), 
         JSON.stringify(information_report || {}), 
         JSON.stringify(positioning_report || {}), 
         JSON.stringify(copywriting_data || {})]
      );
      return res.json({ code: 0, message: 'success', data: createResult.rows[0] });
    }

    res.json({ code: 0, message: 'success', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
