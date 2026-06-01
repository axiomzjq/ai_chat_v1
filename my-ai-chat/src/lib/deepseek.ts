/**
 * DeepSeek API 客户端（兼容 OpenAI 格式）
 * 替换原有的 Google GenAI SDK
 *
 * 文档: https://api-docs.deepseek.com/
 * Base URL: https://api.deepseek.com
 * 模型: deepseek-v4-pro | deepseek-v4-flash
 */

const API_KEY = process.env.DEEPSEEK_API_KEY || '';
const BASE_URL = 'https://api.deepseek.com';

if (!API_KEY) {
  console.error('[DeepSeek] ❌ API Key 未配置。请检查：\n1. .env.local 文件存在且包含 DEEPSEEK_API_KEY\n2. 修改 .env 后需要重启 npm run dev（Vite 不会热重载环境变量）');
}

// 模型映射：把内部简称映射到 DeepSeek 模型名
export const MODELS = {
  chat: 'deepseek-v4-flash',    // 测试阶段统一用 flash（便宜）
  fast: 'deepseek-v4-flash',    // 快速响应
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
 * 调用 DeepSeek Chat API（非流式）
 */
export async function chat(options: ChatOptions): Promise<string> {
  const { model = MODELS.chat, temperature = 0.7, max_tokens = 8192, retries = 2 } = options;
  const bodyMessages = buildBodyMessages(options);
  const body = JSON.stringify({ model, messages: bodyMessages, temperature, max_tokens, stream: false });

  console.log(`[DeepSeek] Request: model=${model}, messages=${bodyMessages.length}, bodySize=${body.length} chars`);

  let lastError: any;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000); // 定位报告可能很长，给 120s
      const response = await fetch(`${BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        body,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      console.log(`[DeepSeek] Response: HTTP ${response.status} ${response.statusText}`);

      // 防御：先读 text 再 parse，避免 ReadableStream 被拦截器消费后无法读取
      const responseText = await response.text();
      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch (parseErr) {
        console.error('[DeepSeek] JSON parse failed. Raw response:', responseText.slice(0, 500));
        throw new Error(`DeepSeek API returned non-JSON: ${responseText.slice(0, 200)}`);
      }

      if (data.error) {
        throw new Error(`DeepSeek API error: ${data.error.message || JSON.stringify(data.error)}`);
      }
      if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
        console.error('[DeepSeek] Empty choices. Full response:', JSON.stringify(data).slice(0, 500));
        throw new Error('DeepSeek API returned empty choices (possibly context length exceeded or model error)');
      }
      const text = data.choices[0]?.message?.content || '';
      if (options.onUsage && data.usage) {
        options.onUsage({
          prompt_tokens: data.usage.prompt_tokens || 0,
          completion_tokens: data.usage.completion_tokens || 0,
          total_tokens: data.usage.total_tokens || 0,
        });
      }
      return text;
    } catch (err: any) {
      lastError = err;
      console.error(`[DeepSeek] Attempt ${attempt + 1}/${retries + 1} failed:`, err?.message || err);
      const is503 = err.message?.includes('503') || err.message?.includes('UNAVAILABLE');
      if (is503 && attempt < retries) {
        console.warn(`[DeepSeek] 503 retry ${attempt + 1}/${retries}, waiting 2s...`);
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
 * 流式调用 DeepSeek Chat API（SSE）
 * 逐 chunk 回调，适合对话界面打字机效果
 */
export async function chatStream(
  options: Omit<ChatOptions, 'onUsage'> & ChatStreamCallbacks,
): Promise<void> {
  const { model = MODELS.chat, temperature = 0.7, max_tokens = 8192, onChunk, onDone, onError } = options;
  const bodyMessages = buildBodyMessages(options);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120000); // 流式给 120s
    const response = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: bodyMessages,
        temperature,
        max_tokens,
        stream: true,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      let msg = `HTTP ${response.status}`;
      try {
        const errData = JSON.parse(text);
        msg = errData.error?.message || text || msg;
      } catch { /* ignore */ }
      throw new Error(`DeepSeek API error: ${msg}`);
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
      buffer = lines.pop() || ''; // 保留未完整的一行

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const dataStr = trimmed.slice(5).trim();
        if (dataStr === '[DONE]') continue;

        try {
          const data = JSON.parse(dataStr);
          if (data.error) {
            throw new Error(`DeepSeek API error: ${data.error.message || JSON.stringify(data.error)}`);
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
          // 忽略单条解析失败，继续处理后续 chunk
          console.warn('[DeepSeek] SSE parse warn:', parseErr.message, 'line:', trimmed.slice(0, 100));
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
 * 兼容原来 ai.chats.create 的用法
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
console.info('[DeepSeek] 客户端已初始化');
