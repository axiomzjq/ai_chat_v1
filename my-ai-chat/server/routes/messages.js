import { Router } from 'express';
import { db } from '../db.js';

const router = Router({ mergeParams: true });

// GET /api/conversations/:id/messages - 获取消息列表
router.get('/', async (req, res, next) => {
  try {
    const conversationId = req.params.id;
    const limit = Math.min(100, parseInt(req.query.limit) || 20);

    // 验证对话存在且属于当前用户（RLS 会拦截，但提前检查返回更好错误）
    const convResult = await db.query(
      'SELECT id FROM conversations WHERE id = $1',
      [conversationId]
    );
    if (convResult.rows.length === 0) {
      return res.status(404).json({ code: 2001, message: '对话不存在', data: null });
    }

    const result = await db.query(
      `SELECT * FROM messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT $2`,
      [conversationId, limit]
    );

    res.json({ code: 0, message: 'success', data: result.rows });
  } catch (err) {
    next(err);
  }
});

// POST /api/conversations/:id/messages - 发送消息（SSE 流式）
router.post('/', async (req, res, next) => {
  try {
    const conversationId = req.params.id;
    const { content, model = 'gemini-2.5-pro' } = req.body;

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ code: 3001, message: '消息内容不能为空', data: null });
    }

    // 验证对话
    const convResult = await db.query(
      'SELECT id FROM conversations WHERE id = $1',
      [conversationId]
    );
    if (convResult.rows.length === 0) {
      return res.status(404).json({ code: 2001, message: '对话不存在', data: null });
    }

    // 保存用户消息
    const userMsgResult = await db.query(
      `INSERT INTO messages (conversation_id, user_id, role, content, model)
       VALUES ($1, $2, 'user', $3, $4)
       RETURNING *`,
      [conversationId, req.user.id, content, model]
    );

    // 检查是否是流式请求
    const acceptHeader = req.headers.accept || '';
    if (acceptHeader.includes('text/event-stream')) {
      // SSE 流式响应
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const startTime = Date.now();
      const messageId = crypto.randomUUID();

      res.write(`event: message_start\n`);
      res.write(`data: ${JSON.stringify({ message_id: messageId })}\n\n`);

      // TODO: 调用 Gemini API 获取流式回复
      // 当前返回模拟数据，后续接入真实 AI 服务
      const reply = '收到您的消息，AI 回复功能正在开发中...';
      
      res.write(`event: content_delta\n`);
      res.write(`data: ${JSON.stringify({ delta: reply })}\n\n`);

      res.write(`event: message_end\n`);
      res.write(`data: ${JSON.stringify({
        message_id: messageId,
        input_tokens: content.length,
        output_tokens: reply.length,
        latency_ms: Date.now() - startTime,
      })}\n\n`);

      // 保存 AI 回复到数据库
      await db.query(
        `INSERT INTO messages (conversation_id, user_id, role, content, model, input_tokens, output_tokens, latency_ms)
         VALUES ($1, $2, 'assistant', $3, $4, $5, $6, $7)`,
        [conversationId, req.user.id, reply, model, content.length, reply.length, Date.now() - startTime]
      );

      res.end();
    } else {
      // 非流式：直接返回用户消息，AI 回复异步处理
      res.status(201).json({
        code: 0,
        message: 'success',
        data: userMsgResult.rows[0],
      });
    }
  } catch (err) {
    next(err);
  }
});

export default router;
