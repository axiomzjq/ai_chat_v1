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
      prompt_template: `你当前正在进行一场专业对话，以下是从知识库中检索到的参考资料：
"""
{{knowledge}}
"""

用户输入：
"""
{{question}}
"""

要求：
1. 将参考资料中的方法论、框架、技巧和最佳实践作为背景知识消化吸收，自然融入你的回复中。
2. 当用户询问具体概念、流程、标准或行业做法时，优先基于参考资料回答。
3. 当用户的问题是开放性的个人信息（如姓名、经历、观点、偏好等）或需要你来引导对话时，正常进行专业访谈/咨询，不要机械复述文档，也不要告诉用户"该信息不是来自文档"。
4. 回复保持自然、专业、有温度，像一位资深顾问一样与用户交流。

请直接开始回答。`
    }
  }];
}

// POST /api/ai/chat - 非流式对话（后端代理）
router.post('/chat', async (req, res, next) => {
  const startTime = Date.now();
  const userId = req.user?.sub || req.user?.id || 'anonymous';
  try {
    if (!ZHIPU_API_KEY) {
      return res.status(500).json({ code: 5001, message: '智谱AI API Key 未配置', data: null });
    }

    const { model, messages, temperature, max_tokens, system, knowledge_id } = req.body;
    const msgCount = Array.isArray(messages) ? messages.length : 0;

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

    const apiStart = Date.now();
    const response = await fetch(`${ZHIPU_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ZHIPU_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });
    const apiElapsed = Date.now() - apiStart;

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

    const totalElapsed = Date.now() - startTime;
    console.log(`[AI][chat] user=${userId} model=${model || 'glm-5.1'} msgs=${msgCount} kb=${effectiveKnowledgeId ? 'yes' : 'no'} api=${apiElapsed}ms total=${totalElapsed}ms tokens=${JSON.stringify(data.usage || {})}`);

    res.json({
      code: 0,
      message: 'success',
      data: {
        text: data.choices?.[0]?.message?.content || '',
        usage: data.usage || null,
      },
    });
  } catch (err) {
    const totalElapsed = Date.now() - startTime;
    console.error(`[AI][chat] user=${userId} ERROR after ${totalElapsed}ms:`, err.message);
    next(err);
  }
});

// POST /api/ai/chat-stream - 流式对话 SSE（后端代理透传）
router.post('/chat-stream', async (req, res, next) => {
  const startTime = Date.now();
  const userId = req.user?.sub || req.user?.id || 'anonymous';
  let apiStart = 0;
  try {
    if (!ZHIPU_API_KEY) {
      return res.status(500).json({ code: 5001, message: '智谱AI API Key 未配置', data: null });
    }

    const { model, messages, temperature, max_tokens, system, knowledge_id } = req.body;
    const msgCount = Array.isArray(messages) ? messages.length : 0;

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

    apiStart = Date.now();
    const response = await fetch(`${ZHIPU_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ZHIPU_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });
    const apiElapsed = Date.now() - apiStart;

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`智谱AI API error: HTTP ${response.status} ${text.slice(0, 200)}`);
    }

    console.log(`[AI][stream] user=${userId} model=${model || 'glm-5.1'} msgs=${msgCount} kb=${effectiveKnowledgeId ? 'yes' : 'no'} api-first-byte=${apiElapsed}ms`);

    // 透传 SSE 响应头
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let firstChunk = true;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (firstChunk) {
          firstChunk = false;
          const totalElapsed = Date.now() - startTime;
          console.log(`[AI][stream] user=${userId} first-chunk-arrived total=${totalElapsed}ms`);
        }
        res.write(chunk);
      }
    } catch (streamErr) {
      console.error('[AI] Stream error:', streamErr.message);
    } finally {
      const totalElapsed = Date.now() - startTime;
      console.log(`[AI][stream] user=${userId} stream-ended total=${totalElapsed}ms`);
      res.end();
    }
  } catch (err) {
    const totalElapsed = Date.now() - startTime;
    console.error(`[AI][stream] user=${userId} ERROR after ${totalElapsed}ms:`, err.message);
    next(err);
  }
});

export default router;
