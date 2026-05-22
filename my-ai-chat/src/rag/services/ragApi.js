/**
 * RAG API 服务层
 * 负责与后端 /server 通信
 */

const API_BASE = import.meta.env.VITE_RAG_API_URL || 'http://localhost:3001/api';

/**
 * 上传文档到知识库
 * @param {File} file - 用户选择的文件
 * @returns {Promise<{documentId: string, status: string}>}
 */
export async function uploadDocument(file) {
  const formData = new FormData();
  formData.append('file', file);

  const res = await fetch(`${API_BASE}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Upload failed');
  }

  return res.json();
}

/**
 * 向 RAG 系统提问
 * @param {string} question - 用户问题
 * @param {Object} options - 可选配置
 * @param {string[]} [options.documentIds] - 指定检索的文档 ID
 * @param {number} [options.topK] - 返回的引用数量
 * @returns {Promise<{answer: string, sources: Array}>}
 */
export async function queryRAG(question, options = {}) {
  const res = await fetch(`${API_BASE}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, ...options }),
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Query failed');
  }

  return res.json();
}

/**
 * 获取知识库文档列表
 * @returns {Promise<Array<{id: string, name: string, status: string}>>}
 */
export async function getKnowledgeBase() {
  const res = await fetch(`${API_BASE}/kb`);

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to fetch knowledge base');
  }

  return res.json();
}

/**
 * 删除知识库中的文档
 * @param {string} documentId
 * @returns {Promise<{success: boolean}>}
 */
export async function deleteDocument(documentId) {
  const res = await fetch(`${API_BASE}/kb/${documentId}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Delete failed');
  }

  return res.json();
}
