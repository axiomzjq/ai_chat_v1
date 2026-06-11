import { Router } from 'express';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

// AI 路由需要认证
router.use(authMiddleware);

const ZHIPU_API_KEY = process.env.ZHIPU_API_KEY;
const ZHIPU_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';
const DEFAULT_KNOWLEDGE_ID = process.env.ZHIPU_KNOWLEDGE_ID;

if (!ZHIPU_API_KEY) {
  console.error('[AI] ❌ ZHIPU_API_KEY 未配置，AI 路由将无法使用');
}

/**
 * 构建智谱知识库检索 tools
 * @param {string} knowledgeId - 知识库 ID
 * @returns {Array} tools 数组
 */
function buildRetrievalTools(knowledgeId) {
  if (!knowledgeId) return undefined;
  return [{
    type: 'retrieval',
    retrieval: {
      knowledge_id: knowledgeId,
      prompt_template: '从文档\n"""\n{{knowledge}}\n"""\n中找问题\n"""\n{{question}}\n"""\n的答案，找到答案就仅使用文档语句回答问题，找不到答案就用自身知识回答并且告诉用户该信息不是来自文档。\n不要复述问题，直接开始回答。'
    }
  }];
}

// POST /api/ai/chat - 非流式对话（后端代理）
router.post('/chat', async (req, res, next) => {
  try {
    if (!ZHIPU_API_KEY) {
      return res.status(500).json({ code: 5001, message: '智谱AI API Key 未配置', data: null });
    }

    const { model, messages, temperature, max_tokens, system, knowledge_id } = req.body;

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

    const effectiveKnowledgeId = knowledge_id || DEFAULT_KNOWLEDGE_ID;
    const tools = buildRetrievalTools(effectiveKnowledgeId);

    const requestBody = {
      model: model || 'glm-5.1',
      messages: bodyMessages,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 8192,
      stream: false,
      ...(tools ? { tools } : {}),
    };

    const response = await fetch(`${ZHIPU_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ZHIPU_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    let data;
    try {
      data = JSON.parse(responseText);
    } catch {
      throw new Error(`智谱AI API returned non-JSON: ${responseText.slice(0, 200)}`);
    }

    if (data.error) {
      throw new Error(`智谱AI API error: ${data.error.message || JSON.stringify(data.error)}`);
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
    if (!ZHIPU_API_KEY) {
      return res.status(500).json({ code: 5001, message: '智谱AI API Key 未配置', data: null });
    }

    const { model, messages, temperature, max_tokens, system, knowledge_id } = req.body;

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

    const effectiveKnowledgeId = knowledge_id || DEFAULT_KNOWLEDGE_ID;
    const tools = buildRetrievalTools(effectiveKnowledgeId);

    const requestBody = {
      model: model || 'glm-5.1',
      messages: bodyMessages,
      temperature: temperature ?? 0.7,
      max_tokens: max_tokens ?? 8192,
      stream: true,
      ...(tools ? { tools } : {}),
    };

    const response = await fetch(`${ZHIPU_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ZHIPU_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`智谱AI API error: HTTP ${response.status} ${text.slice(0, 200)}`);
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
