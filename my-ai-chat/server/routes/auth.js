import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// POST /api/auth/verify - 验证 Token
// 直接复用 authMiddleware，验证成功后返回用户信息
router.post('/verify', authMiddleware, (req, res) => {
  res.json({
    code: 0,
    message: 'success',
    data: {
      user: {
        id: req.user.id,
        authing_id: req.user.authing_id,
        email: req.user.email,
        phone: req.user.phone,
        display_name: req.user.display_name,
        avatar_url: req.user.avatar_url,
        role: req.user.role,
        subscription_start_at: req.user.subscription_start_at,
        subscription_days: req.user.subscription_days,
        token_quota: req.user.token_quota,
        token_used: req.user.token_used,
        created_at: req.user.created_at,
      },
      isNewUser: req.isNewUser,
    },
  });
});

// GET /api/auth/me - 获取当前登录用户信息
router.get('/me', authMiddleware, (req, res) => {
  res.json({
    code: 0,
    message: 'success',
    data: {
      id: req.user.id,
      authing_id: req.user.authing_id,
      email: req.user.email,
      phone: req.user.phone,
      display_name: req.user.display_name,
      avatar_url: req.user.avatar_url,
      role: req.user.role,
      subscription_start_at: req.user.subscription_start_at,
      subscription_days: req.user.subscription_days,
      token_quota: req.user.token_quota,
      token_used: req.user.token_used,
      created_at: req.user.created_at,
    },
  });
});

export default router;
