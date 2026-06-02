import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// AI 路由需要认证
router.use(authMiddleware);

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';

if (!DEEPSEEK_API_KEY) {
  console.error('[AI] ❌ DEEPSEEK_API_KEY 未配置，AI 路由将无法使用');
}

// POST /api/ai/chat - 非流式对话（后端代理）
router.post('/chat', async (req, res, next) => {
  try {
    if (!DEEPSEEK_API_KEY) {
      return res.status(500).json({ code: 5001, message: 'DeepSeek API Key 未配置', data: null });
    }

    const { model, messages, temperature, max_tokens, system } = req.body;

    const bodyMessages = [];
    if (system) {
      bodyMessages.push({ role: 'system', content: system });
    }
    if (Array.isArray(messages)) {
      bodyMessages.push(...messages.map(m => ({
        role: m.role === 'model' ? 'assistant' : m.role,
        content: m.content,
      })));
    }

    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: model || 'deepseek-v4-flash',
        messages: bodyMessages,
        temperature: temperature ?? 0.7,
        max_tokens: max_tokens ?? 8192,
        stream: false,
      }),
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(`DeepSeek API returned non-JSON: ${responseText.slice(0, 200)}`);
    }

    if (data.error) {
      throw new Error(`DeepSeek API error: ${data.error.message || JSON.stringify(data.error)}`);
    }

    res.json({
      code: 0,
      message: 'success',
      data: {
        text: data.choices?.[0]?.message?.content || '',
        usage: data.usage || null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/chat-stream - 流式对话 SSE（后端代理透传）
router.post('/chat-stream', async (req, res, next) => {
  try {
    if (!DEEPSEEK_API_KEY) {
      return res.status(500).json({ code: 5001, message: 'DeepSeek API Key 未配置', data: null });
    }

    const { model, messages, temperature, max_tokens, system } = req.body;

    const bodyMessages = [];
    if (system) {
      bodyMessages.push({ role: 'system', content: system });
    }
    if (Array.isArray(messages)) {
      bodyMessages.push(...messages.map(m => ({
        role: m.role === 'model' ? 'assistant' : m.role,
        content: m.content,
      })));
    }

    const response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: model || 'deepseek-v4-flash',
        messages: bodyMessages,
        temperature: temperature ?? 0.7,
        max_tokens: max_tokens ?? 8192,
        stream: true,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`DeepSeek API error: HTTP ${response.status} ${text.slice(0, 200)}`);
    }

    // 透传 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        res.write(chunk);
      }
    } catch (streamErr) {
      console.error('[AI] Stream error:', streamErr.message);
    } finally {
      res.end();
    }
  } catch (err) {
    next(err);
  }
});

export default router;
