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
  chat: 'deepseek-v4-pro',      // 通用对话（高质量）
  fast: 'deepseek-v4-flash',    // 快速响应
} as const;

export type ModelKey = keyof typeof MODELS;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatOptions {
  model?: string;
  system?: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  retries?: number;
}

/**
 * 调用 DeepSeek Chat API
 */
export async function chat(options: ChatOptions): Promise<string> {
  const { model = MODELS.chat, system, messages, temperature = 0.7, max_tokens = 8192, retries = 2 } = options;

  const bodyMessages: ChatMessage[] = [];
  if (system) {
    bodyMessages.push({ role: 'system', content: system });
  }
  // 运行时映射：前端存储的 'model' role 转为 DeepSeek 要求的 'assistant'
  bodyMessages.push(...messages.map(m => ({
    role: ((m as any).role === 'model' ? 'assistant' : m.role) as ChatMessage['role'],
    content: m.content,
  })));

  let lastError: any;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
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
          stream: false,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`DeepSeek API ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const text = data.choices?.[0]?.message?.content || '';
      return text;
    } catch (err: any) {
      lastError = err;
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

/**
 * 简易封装：system + single user message
 */
export async function generateText(options: {
  model?: string;
  system?: string;
  prompt: string;
  temperature?: number;
  max_tokens?: number;
}): Promise<string> {
  return chat({
    model: options.model,
    system: options.system,
    messages: [{ role: 'user', content: options.prompt }],
    temperature: options.temperature,
    max_tokens: options.max_tokens,
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
    async sendMessage(message: string): Promise<string> {
      history.push({ role: 'user', content: message });
      const text = await chat({ model, system, messages: history });
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
