/**
 * RAG 核心配置
 * 所有魔法数字集中管理，便于调优
 */

export const RAG_CONFIG = {
  // 文本分块
  chunking: {
    size: parseInt(process.env.CHUNK_SIZE, 10) || 500,
    overlap: parseInt(process.env.CHUNK_OVERLAP, 10) || 50,
    separator: '\n\n', // 优先按段落分割
  },

  // 向量检索
  retrieval: {
    topK: parseInt(process.env.TOP_K, 10) || 5,
    similarityThreshold: 0.7, // 余弦相似度阈值
  },

  // LLM 生成
  generation: {
    maxContextTokens: 3000,
    systemPrompt: `你是一个基于知识库的 AI 助手。回答问题时：
1. 优先使用提供的参考文档内容
2. 如果参考文档不足以回答，明确告知用户
3. 在回答末尾列出引用的文档来源`,
  },

  // 文件限制
  upload: {
    maxFileSize: 10 * 1024 * 1024, // 10MB
    allowedTypes: [
      'text/plain',
      'text/markdown',
      'application/pdf',
      'application/json',
    ],
  },
};
