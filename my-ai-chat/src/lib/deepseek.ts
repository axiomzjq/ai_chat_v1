/**
 * 智谱AI (ZhipuAI) API 客户端（后端代理版）
 * 前端不再直接调用智谱AI API，而是通过后端代理
 * 后端持有 API Key，前端仅携带用户 Token 进行认证
 */

const BASE_URL = `${import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api'}/ai`;

function getAuthToken(): string | null {
  return localStorage.getItem('authing_access_token');
}

// 模型映射：把内部简称映射到智谱AI 模型名
export const MODELS = {
  chat: 'glm-5.1',    // 主力模型
  fast: 'glm-5.1',    // 快速响应
} as const;

export type ModelKey = keyof typeof MODELS;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

interface ChatOptions {
  model?: string;
  system?: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  retries?: number;
  onUsage?: (usage: TokenUsage) => void;
  knowledge_id?: string;
}

function buildBodyMessages(options: ChatOptions): ChatMessage[] {
  const { system, messages } = options;
  const bodyMessages: ChatMessage[] = [];
  if (system) {
    bodyMessages.push({ role: 'system', content: system });
  }
  bodyMessages.push(...messages.map(m => ({
    role: ((m as any).role === 'model' ? 'assistant' : m.role) as ChatMessage['role'],
    content: m.content,
  })));
  return bodyMessages;
}

/**
 * 调用智谱AI Chat API（非流式，后端代理）
 */
export async function chat(options: ChatOptions): Promise<string> {
  const { model = MODELS.chat, temperature = 0.7, max_tokens = 4096, retries = 2, knowledge_id } = options;
  const bodyMessages = buildBodyMessages(options);
  const token = getAuthToken();

  console.log(`[ZhipuAI] Request: model=${model}, messages=${bodyMessages.length}${knowledge_id ? ', knowledge_id=' + knowledge_id : ''}`);

  let lastError: any;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      const response = await fetch(`${BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages: bodyMessages,
          temperature,
          max_tokens,
          ...(knowledge_id ? { knowledge_id } : {}),
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const responseText = await response.text();
      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        console.error('[ZhipuAI] JSON parse failed. Raw response:', responseText.slice(0, 500));
        throw new Error(`AI API returned non-JSON: ${responseText.slice(0, 200)}`);
      }

      if (!response.ok || data.code !== 0) {
        throw new Error(data.message || `HTTP ${response.status}`);
      }

      const text = data.data?.text || '';
      if (options.onUsage && data.data?.usage) {
        options.onUsage({
          prompt_tokens: data.data.usage.prompt_tokens || 0,
          completion_tokens: data.data.usage.completion_tokens || 0,
          total_tokens: data.data.usage.total_tokens || 0,
        });
      }
      return text;
    } catch (err: any) {
      lastError = err;
      console.error(`[ZhipuAI] Attempt ${attempt + 1}/${retries + 1} failed:`, err?.message || err);
      const is503 = err.message?.includes('503') || err.message?.includes('UNAVAILABLE');
      if (is503 && attempt < retries) {
        console.warn(`[ZhipuAI] 503 retry ${attempt + 1}/${retries}, waiting 2s...`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

export interface ChatStreamCallbacks {
  onChunk: (text: string) => void;
  onDone?: (fullText: string, usage?: TokenUsage) => void;
  onError?: (error: Error) => void;
}

/**
 * 流式调用智谱AI Chat API（SSE，后端代理透传）
 * 逐 chunk 回调，适合对话界面打字机效果
 */
export async function chatStream(
  options: Omit<ChatOptions, 'onUsage'> & ChatStreamCallbacks,
): Promise<void> {
  const { model = MODELS.chat, temperature = 0.7, max_tokens = 4096, onChunk, onDone, onError, knowledge_id } = options;
  const bodyMessages = buildBodyMessages(options);
  const token = getAuthToken();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000);
    const response = await fetch(`${BASE_URL}/chat-stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: bodyMessages,
        temperature,
        max_tokens,
        ...(knowledge_id ? { knowledge_id } : {}),
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      let msg = `HTTP ${response.status}`;
      try {
        const errData = JSON.parse(text);
        msg = errData.message || text || msg;
      } catch { /* ignore */ }
      throw new Error(`AI API error: ${msg}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body is not readable');

    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullText = '';
    let lastUsage: TokenUsage | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') continue;

        try {
          const data = JSON.parse(dataStr);
          if (data.error) {
            throw new Error(`智谱AI API error: ${data.error.message || JSON.stringify(data.error)}`);
          }
          const delta = data.choices?.[0]?.delta;
          const chunkText = delta?.content || '';
          if (chunkText) {
            fullText += chunkText;
            onChunk(chunkText);
          }
          if (data.usage) {
            lastUsage = {
              prompt_tokens: data.usage.prompt_tokens || 0,
              completion_tokens: data.usage.completion_tokens || 0,
              total_tokens: data.usage.total_tokens || 0,
            };
          }
        } catch (parseErr: any) {
          console.warn('[ZhipuAI] SSE parse warn:', parseErr.message, 'line:', trimmed.slice(0, 100));
        }
      }
    }

    onDone?.(fullText, lastUsage);
  } catch (err: any) {
    if (onError) {
      onError(err instanceof Error ? err : new Error(String(err)));
    } else {
      throw err;
    }
  }
}

/**
 * 简易封装：system + single user message
 */
export async function generateText(options: {
  model?: string;
  system?: string;
  prompt: string;
  temperature?: number;
  max_tokens?: number;
  onUsage?: (usage: TokenUsage) => void;
}): Promise<string> {
  return chat({
    model: options.model,
    system: options.system,
    messages: [{ role: 'user', content: options.prompt }],
    temperature: options.temperature,
    max_tokens: options.max_tokens,
    onUsage: options.onUsage,
  });
}

/**
 * 多轮对话封装（手动维护历史）
 */
export function createChat(options: {
  model?: string;
  system?: string;
  history?: ChatMessage[];
}) {
  const history: ChatMessage[] = options.history ? [...options.history] : [];
  const model = options.model || MODELS.chat;
  const system = options.system;

  return {
    async sendMessage(message: string, onUsage?: (usage: TokenUsage) => void): Promise<string> {
      history.push({ role: 'user', content: message });
      const text = await chat({ model, system, messages: history, onUsage });
      history.push({ role: 'assistant', content: text });
      return text;
    },
    getHistory(): ChatMessage[] {
      return [...history];
    },
  };
}

// 日志
console.info('[ZhipuAI] 客户端已初始化（后端代理模式）');
