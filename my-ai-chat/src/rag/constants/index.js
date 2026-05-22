/**
 * RAG 模块常量
 */

export const RAG_CONSTANTS = {
  // API 端点
  ENDPOINTS: {
    UPLOAD: '/api/upload',
    CHAT: '/api/chat',
    KNOWLEDGE_BASE: '/api/kb',
  },

  // 文件限制（与后端保持一致）
  UPLOAD: {
    MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
    ALLOWED_EXTENSIONS: ['.txt', '.md', '.pdf', '.json'],
  },

  // UI 状态
  DOCUMENT_STATUS: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    READY: 'ready',
    ERROR: 'error',
  },

  // 消息类型
  MESSAGE_TYPE: {
    USER: 'user',
    ASSISTANT: 'assistant',
    SYSTEM: 'system',
    SOURCE: 'source',
  },
};
