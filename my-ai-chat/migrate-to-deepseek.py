#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""将 App.tsx 中的 Google GenAI 调用替换为 DeepSeek 调用"""

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

lines = content.split('\n')
lines = [line + '\n' for line in lines]
if lines:
    lines[-1] = lines[-1].rstrip('\n')

def get_block(start_1based, end_1based):
    return ''.join(lines[start_1based-1:end_1based])

results = []

# === 12. Generate copywriting (2841-2867) ===
old = get_block(2841, 2868)
new = """      const cwText = await deepseek.generateText({
        model: deepseek.MODELS.fast,
        system: COPYWRITING_SYSTEM_PROMPT + "\\n\\n如果背景信息缺失，请基于通用行业最佳实践创作高质量文案。请务必学习并应用【参考语料】中的文案技巧，并结合【个人背景】、【企业背景】、【定位方案】和【上传资料内容】中的所有细节，创作出符合定位且具有高水准的文案。\\n\\n请严格按照 JSON 格式输出，不要输出任何额外的解释文字。",
        prompt: `基于以下信息创作3个标题和1篇口播文案，请务必返回 JSON 格式：

${knowledgeContext ? `【参考语料】：
${knowledgeContext}\n\n` : ""}
【选题/主题】：
${finalTopic || '基于对话整理的思路'}

【对话上下文】：
${chatContext || "（暂无对话）"}

【定位方案】：
${state.positioningReport || "（暂无，请基于通用爆款逻辑创作）"}

【个人背景】：
${state.interviewReport || "（暂无）"}

【企业背景】：
${state.infoReport || "（暂无）"}

【上传资料内容】：
${state.uploadedMaterials.map(m => m.content).join('\\n\\n') || "（暂无）"}`,
      });

      const data = JSON.parse(cwText || '{}');
"""
results.append(("12 generate copywriting", old in content))
if old in content:
    content = content.replace(old, new, 1)

# === 11. Copywriting chat (2790-2806) ===
old = get_block(2790, 2807)
new = """      const chatMsgs: deepseek.ChatMessage[] = [
        { role: 'user', content: `【背景上下文】：
个人背景：${state.interviewReport || "（暂无）"}
企业背景：${state.infoReport || "（暂无）"}
定位方案：${state.positioningReport || "（暂无）"}
上传资料：${state.uploadedMaterials.map(m => m.content).join('\\n\\n') || "（暂无）"}

【特别说明】：如果上述背景信息缺失，请通过对话引导用户提供相关的个人故事、业务亮点或创作意图。` },
        ...state.copywritingMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.text })),
        { role: 'user', content: text }
      ];

      const modelText = await deepseek.chat({
        model: deepseek.MODELS.fast,
        system: COPYWRITING_SYSTEM_PROMPT + "\\n\\n当前处于【思路整理阶段】。请通过对话形式帮用户整理思路，挖掘亮点。" + (knowledgeContext ? `

请参考以下专业语料提升文案水准：
${knowledgeContext}` : "") + "\\n\\n请务必学习并应用【背景上下文】中的所有资料，确保文案符合定位。如果思路已经非常清晰，请告知用户可以开始生成文案了。请保持专业且富有启发性。",
        messages: chatMsgs,
      });
"""
results.append(("11 copywriting chat", old in content))
if old in content:
    content = content.replace(old, new, 1)

# === 10. Copywriting analysis (2726-2745) ===
old = get_block(2726, 2746)
new = """      const analysisText = await deepseek.generateText({
        model: deepseek.MODELS.fast,
        system: "你是一个专业的对话分析助手。请严格按照用户要求的 JSON 格式输出，不要输出任何额外的解释文字。",
        prompt: `请分析以下对话，提取有价值的信息：
用户说：${userText}
AI说：${modelText}

任务：
1. 提取用户提到的行业见解、个人观点、创业故事等，作为访谈报告的补充素材。
2. 识别用户的情绪，判断是否对产品使用有不满或建议。

输出格式：JSON
{
  "supplementaryMaterial": "提取的素材内容，如果没有则为空字符串",
  "feedback": "识别到的产品反馈，如果没有则为空字符串",
  "sentiment": "情绪描述"
}`,
      });

      const analysis = JSON.parse(analysisText || '{}');
"""
results.append(("10 copywriting analysis", old in content))
if old in content:
    content = content.replace(old, new, 1)

# === 9. Modify positioning (2696-2702) ===
old = get_block(2696, 2703)
new = """      const newReport = await deepseek.generateText({
        model: deepseek.MODELS.fast,
        system: "你是一位顶级的IP定位专家，请根据用户的反馈对定位方案进行精准调整和优化。",
        prompt: `当前定位方案：\n${state.positioningReport}\n\n用户修改建议：\n${positioningFeedback}\n\n请根据建议优化该方案，保持专业度。`,
      });
"""
results.append(("9 modify positioning", old in content))
if old in content:
    content = content.replace(old, new, 1)

# === 8. Positioning report (2654-2673) ===
old = get_block(2654, 2674)
new = """      const text = await deepseek.generateText({
        model: deepseek.MODELS.chat,
        system: POSITIONING_SYSTEM_PROMPT + (knowledgeContext ? `

请参考以上专业语料提升定位方案的专业度。` : "") + "\\n\\n请务必学习并结合【访谈报告】、【企业与行业分析报告】和【上传资料内容】中的所有细节，确保定位方案与创始人的精神内核及业务逻辑高度契合。请务必使用 Markdown 格式，并包含详细的内容规划框架（每个阶段不少于20个选题）。",
        prompt: `基于以下信息生成3个不同维度的定位方案。

【特别说明】：如果以下报告内容为空或信息不足，请根据您的专业知识提供通用的、具有启发性的 ToB 创始人 IP 定位模板，并引导用户在后续对话中补充具体信息。

【个人IP分析报告】：
${state.interviewReport || "（暂无，请基于通用 ToB 创始人画像提供建议）"}

【企业与行业分析报告】：
${state.infoReport || "（暂无，请基于通用 ToB 行业逻辑提供建议）"}

【上传资料内容】：
${state.uploadedMaterials.map(m => m.content).join('\\n\\n') || "（暂无）"}

${knowledgeContext ? `
参考语料：
${knowledgeContext}` : ""}`,
      });

      const positioningOptions = (text || '').split(/(?=###\\s+定位分析|###\\s+定位方案)/).filter(o => o.trim().length > 50);
"""
results.append(("8 positioning report", old in content))
if old in content:
    content = content.replace(old, new, 1)

# === 7. Info report (2616-2633) ===
old = get_block(2616, 2634)
new = """      const text = await deepseek.generateText({
        model: deepseek.MODELS.fast,
        system: INFO_SYSTEM_PROMPT + (knowledgeContext ? `

请参考以上专业语料提升分析深度。` : "") + "\\n\\n请务必学习并结合【访谈报告】和【上传资料内容】中的细节，生成符合创始人定位的分析。",
        prompt: `请根据以下信息生成分析报告：
【访谈报告】：
${state.interviewReport || "（暂无）"}

【上传资料内容】：
${state.uploadedMaterials.map(m => m.content).join('\\n\\n') || "（暂无）"}

【公司基本信息】：
${companyInfo}

${knowledgeContext ? `
参考语料：
${knowledgeContext}` : ""}`,
      });
      setState(prev => ({ ...prev, infoReport: text || '' }));
"""
results.append(("7 info report", old in content))
if old in content:
    content = content.replace(old, new, 1)

# === 6. Interview chat (2563-2572) ===
old = get_block(2563, 2573)
new = """      const chat = deepseek.createChat({
        model: deepseek.MODELS.fast,
        system: INTERVIEW_SYSTEM_PROMPT + (knowledgeContext ? `

【重要：请严格遵循以下管理员提供的专业访谈方法论进行提问】：
${knowledgeContext}` : ""),
        history: messages.map(m => ({
          role: m.role as 'user' | 'assistant',
          content: m.text,
        })),
      });

      const modelText = await chat.sendMessage(input);
"""
results.append(("6 interview chat", old in content))
if old in content:
    content = content.replace(old, new, 1)

# === 5. Interview detailed report (1527-1534) ===
old = get_block(1527, 1535)
new = """        const text = await deepseek.generateText({
          model: deepseek.MODELS.chat,
          system: "你是一位顶级的IP挖掘专家。你的目标是撰写一份极其详尽、逻辑严密、专业且具有文学美感的深度报告。请务必保证内容的丰富度和深度。每一部分必须包含明确的章节小点（使用H3标题），并以高度结构化的方式呈现。请务必在内容中多使用列表、加粗等排版方式，确保逻辑清晰。如果提供了参考知识库，请务必将其中的行业洞察、专业术语或分析逻辑应用到报告中。",
          prompt: `基于以下访谈记录和参考知识库，请撰写报告的【${section}】部分：\n\n访谈记录：\n${messages.map(m => `${m.role}: ${m.text}`).join('\\n')}\n\n参考知识库：\n${relevantKnowledge}`,
        });
"""
results.append(("5 interview report", old in content))
if old in content:
    content = content.replace(old, new, 1)

# === 4. organizeContentWithAI (185-209) ===
old = get_block(185, 210)
new = """const organizeContentWithAI = async (rawText: string) => {
  if (!rawText.trim()) return "";
  try {
    const text = await deepseek.generateText({
      model: deepseek.MODELS.fast,
      system: "你是一个专业的内容整理专家。你的任务是优化文本的结构和排版，但严禁删除、概括或精简任何具体信息。你必须确保整理后的内容包含原始文本中的所有细节。",
      prompt: `请将以下原始文本整理为AI能精确理解的、有序排版的语言。
【核心要求】：
1. 不得删减、遗漏或减少原始文本中的任何信息。
2. 仅进行结构化排版（如使用 Markdown 标题、列表、表格等），使内容更易于被 AI 检索和理解。
3. 保持原始数据的完整性和准确性。
4. 如果是表格数据，请整理为清晰的 Markdown 表格。

原始文本：
${rawText}`,
    });
    return text || rawText;
  } catch (error) {
    console.error("AI Organize Error:", error);
    return rawText;
  }
};
"""
results.append(("4 organize content", old in content))
if old in content:
    content = content.replace(old, new, 1)

# === 3. TTS function (134-183) ===
old = get_block(134, 184)
new = """const playTTS = async (text: string, onStart?: () => void, onEnd?: () => void) => {
  try {
    onStart?.();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => onEnd?.();
    utterance.onerror = () => onEnd?.();
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  } catch (error) {
    console.error("TTS Error:", error);
    onEnd?.();
  }
};
"""
results.append(("3 TTS", old in content))
if old in content:
    content = content.replace(old, new, 1)

# === 2. AI instance (131-132) ===
old = get_block(131, 133)
new = "// TTS: 使用浏览器原生 SpeechSynthesis（DeepSeek 无 TTS 能力）\n\n"
results.append(("2 AI instance", old in content))
if old in content:
    content = content.replace(old, new, 1)

# === 1. Import (9-10) ===
old = get_block(9, 11)
new = "import * as deepseek from './lib/deepseek';\nimport { \n"
results.append(("1 import", old in content))
if old in content:
    content = content.replace(old, new, 1)

with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

for name, ok in results:
    print(f"{'OK' if ok else 'FAIL'}: {name}")
