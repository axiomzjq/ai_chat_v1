import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.use(authMiddleware);

// POST /api/usage/track - 上报 Token 使用量
router.post('/track', async (req, res, next) => {
  try {
    const { prompt_tokens, completion_tokens } = req.body;
    const total = (parseInt(prompt_tokens) || 0) + (parseInt(completion_tokens) || 0);

    if (total <= 0) {
      return res.status(400).json({ code: 4001, message: 'token 数量无效', data: null });
    }

    const result = await db.query(
      `UPDATE users
       SET token_used = token_used + $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING token_used, token_quota`,
      [total, req.user.id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ code: 4041, message: '用户不存在', data: null });
    }

    res.json({
      code: 0,
      message: 'success',
      data: {
        token_used: result.rows[0].token_used,
        token_quota: result.rows[0].token_quota,
        remaining: result.rows[0].token_quota - result.rows[0].token_used,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/usage/me - 获取当前用户额度状态
router.get('/me', async (req, res, next) => {
  try {
    const user = req.user;
    const start = user.subscription_start_at ? new Date(user.subscription_start_at) : null;
    const now = new Date();
    const days = user.subscription_days || 0;
    const expiresAt = start ? new Date(start.getTime() + days * 24 * 60 * 60 * 1000) : null;
    const isExpired = expiresAt ? now > expiresAt : false;
    const remainingDays = expiresAt ? Math.max(0, Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000))) : 0;

    res.json({
      code: 0,
      message: 'success',
      data: {
        subscription: {
          started_at: user.subscription_start_at,
          days: user.subscription_days,
          expires_at: expiresAt?.toISOString() || null,
          is_expired: isExpired,
          remaining_days: remainingDays,
        },
        tokens: {
          quota: user.token_quota,
          used: user.token_used,
          remaining: Math.max(0, (user.token_quota || 0) - (user.token_used || 0)),
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
