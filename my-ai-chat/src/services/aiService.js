/**
 * AI 服务层
 * 封装 AI API 调用，便于切换不同模型提供商
 * 
 * 当前实现：模拟 AI 回复（Mock Mode）
 * 接入真实 API：取消下方注释并填入 API Key
 */

const MOCK_DELAY = 800;

const MOCK_RESPONSES = [
  "这是一个很有趣的问题！让我来详细分析一下...\n\n首先，我们可以从几个角度来看待这个问题。根据现有的信息和最佳实践，我建议你考虑以下几点：\n\n1. **明确目标** — 先确定你想要达成的具体结果\n2. **拆分步骤** — 将大问题拆成可执行的小任务\n3. **持续迭代** — 根据反馈不断调整优化\n\n如果你需要更深入的探讨，随时告诉我！",
  "好的，我来帮你梳理一下思路。\n\n从专业角度来看，这个问题涉及到多个层面。让我用一个简单的类比来解释：\n\n> 就像搭建一座桥梁，你需要同时考虑结构稳定性、材料选择和通行效率。\n\n### 具体建议\n\n| 维度 | 行动项 | 优先级 |\n|------|--------|--------|\n| 短期 | 快速验证核心假设 | 高 |\n| 中期 | 建立标准化流程 | 中 |\n| 长期 | 构建可扩展体系 | 中 |\n\n你觉得哪个方向更适合你当前的情况？",
  "明白你的需求了！基于我的理解，这里有一个可行的方案：\n\n```javascript\n// 示例代码结构\nfunction optimizeProcess(data) {\n  const validated = validateInput(data);\n  const result = transform(validated);\n  return formatOutput(result);\n}\n```\n\n这个方案的核心优势在于：\n- **简洁性** — 代码结构清晰，易于维护\n- **可扩展性** — 每个阶段都可以独立升级\n- **健壮性** — 输入验证确保数据安全\n\n需要我针对某个具体环节展开说明吗？",
  "感谢你的提问！这是一个在行业内经常被讨论的话题。\n\n我的看法是：**没有银弹，只有权衡**。不同的场景适合不同的策略。\n\n**情况 A：追求速度**\n- 采用敏捷方法，快速迭代\n- 接受一定程度的技术债务\n- 优先交付用户价值\n\n**情况 B：追求稳定**\n- 重视架构设计和代码质量\n- 投入时间做自动化测试\n- 长期维护成本更低\n\n你目前更偏向哪种情况？或者你的项目有什么特殊约束？",
];

/**
 * 发送消息到 AI 并获取回复
 * @param {Array<{role:string, text:string}>} messages - 历史消息
 * @param {string} userMessage - 当前用户消息
 * @returns {Promise<string>} AI 回复文本
 */
export async function sendMessageToAI(messages, userMessage) {
  // === 模拟模式 ===
  await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY + Math.random() * 1000));
  const index = Math.floor(Math.random() * MOCK_RESPONSES.length);
  return MOCK_RESPONSES[index];

  // === Google GenAI 接入示例（取消注释使用）===
  /*
  import { GoogleGenAI } from "@google/genai";
  const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });
  
  const chat = ai.chats.create({
    model: "gemini-3-flash-preview",
    history: messages.map(m => ({
      role: m.role,
      parts: [{ text: m.text }]
    }))
  });
  
  const response = await chat.sendMessage({ message: userMessage });
  return response.text || "";
  */

  // === OpenAI 兼容 API 接入示例 ===
  /*
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${import.meta.env.VITE_OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "你是一个专业的 AI 助手。" },
        ...messages.map(m => ({ role: m.role, content: m.text })),
        { role: "user", content: userMessage }
      ]
    })
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
  */
}

/**
 * 流式发送消息（预留接口）
 * @param {Array} messages 
 * @param {string} userMessage 
 * @param {(chunk:string)=>void} onChunk 
 */
export async function streamMessageToAI(messages, userMessage, onChunk) {
  // 模拟流式输出
  const fullText = await sendMessageToAI(messages, userMessage);
  const chunks = fullText.split("");
  for (let i = 0; i < chunks.length; i++) {
    await new Promise((r) => setTimeout(r, 15));
    onChunk(chunks[i]);
  }
}
