import { Router } from 'express';
import { db } from '../db.js';

const router = Router();

// GET /api/usage - 获取使用统计
router.get('/', async (req, res, next) => {
  try {
    const endDate = req.query.endDate || new Date().toISOString().split('T')[0];
    const startDate = req.query.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const dailyResult = await db.query(
      `SELECT date, conversation_count, message_count, total_input_tokens, total_output_tokens, duration_seconds
       FROM usage_stats
       WHERE user_id = $1 AND date BETWEEN $2 AND $3
       ORDER BY date DESC`,
      [req.user.id, startDate, endDate]
    );

    const summaryResult = await db.query(
      `SELECT 
        COALESCE(SUM(conversation_count), 0) as total_conversations,
        COALESCE(SUM(message_count), 0) as total_messages,
        COALESCE(SUM(total_input_tokens), 0) as total_input_tokens,
        COALESCE(SUM(total_output_tokens), 0) as total_output_tokens,
        COALESCE(SUM(duration_seconds), 0) as total_duration_seconds
       FROM usage_stats
       WHERE user_id = $1 AND date BETWEEN $2 AND $3`,
      [req.user.id, startDate, endDate]
    );

    res.json({
      code: 0,
      message: 'success',
      data: {
        daily: dailyResult.rows,
        summary: summaryResult.rows[0],
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/usage/track - 记录使用（内部 API，由消息发送时调用）
router.post('/track', async (req, res, next) => {
  try {
    const { date, conversation_count, message_count, input_tokens, output_tokens, duration_seconds } = req.body;
    const today = date || new Date().toISOString().split('T')[0];

    await db.query(
      `INSERT INTO usage_stats (user_id, date, conversation_count, message_count, total_input_tokens, total_output_tokens, duration_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, date)
       DO UPDATE SET
         conversation_count = usage_stats.conversation_count + $3,
         message_count = usage_stats.message_count + $4,
         total_input_tokens = usage_stats.total_input_tokens + $5,
         total_output_tokens = usage_stats.total_output_tokens + $6,
         duration_seconds = usage_stats.duration_seconds + $7`,
      [req.user.id, today, conversation_count || 0, message_count || 0, input_tokens || 0, output_tokens || 0, duration_seconds || 0]
    );

    res.json({ code: 0, message: 'success', data: null });
  } catch (err) {
    next(err);
  }
});

export default router;
