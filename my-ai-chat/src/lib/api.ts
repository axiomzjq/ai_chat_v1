/**
 * API Client - 前端 HTTP 请求封装
 * 替代 Firestore 的所有数据操作
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

function getToken(): string | null {
  // 从 localStorage 或 Authing 缓存中获取 access token
  // 优先使用 Authing 的 token（如果前端有缓存）
  return localStorage.getItem('authing_access_token');
}

interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

async function request<T>(path: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const json = await response.json().catch(() => null);

  if (!response.ok || json?.code !== 0) {
    const message = json?.message || `HTTP ${response.status}`;
    throw new Error(message);
  }

  return json as ApiResponse<T>;
}

// ==================== Auth ====================
export async function verifyAuth(accessToken: string) {
  const res = await request<{ user: any; isNewUser: boolean }>('/auth/verify', {
    method: 'POST',
    body: JSON.stringify({ accessToken }),
  });
  return res.data;
}

// ==================== Conversations ====================
export async function getConversations(params?: { page?: number; pageSize?: number; status?: string }) {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.pageSize) query.set('pageSize', String(params.pageSize));
  if (params?.status) query.set('status', params.status);
  const res = await request<any>(`/conversations?${query.toString()}`);
  return res;
}

export async function createConversation(data: { title?: string; current_step?: string }) {
  const res = await request<any>('/conversations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res;
}

export async function getConversation(id: string) {
  const res = await request<any>(`/conversations/${id}`);
  return res;
}

export async function updateConversation(id: string, data: { title?: string; current_step?: string; status?: string }) {
  const res = await request<any>(`/conversations/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return res;
}

export async function deleteConversation(id: string) {
  const res = await request<any>(`/conversations/${id}`, { method: 'DELETE' });
  return res;
}

// ==================== Messages ====================
export async function getMessages(conversationId: string, params?: { limit?: number }) {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  const res = await request<any>(`/conversations/${conversationId}/messages?${query.toString()}`);
  return res;
}

export async function sendMessage(conversationId: string, data: { content: string; model?: string }) {
  const res = await request<any>(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res;
}

// ==================== User Profile ====================
export async function getUserProfile() {
  const res = await request<any>('/user/profile');
  return res;
}

export async function updateUserProfile(data: {
  current_step?: string;
  interview_data?: any;
  information_report?: any;
  positioning_report?: any;
  positioning_options?: any;
  topic_pool?: any;
  copywriting_data?: any;
}) {
  const res = await request<any>('/user/profile', {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return res;
}

// ==================== Knowledge Base ====================
export async function getKnowledgeBase(params?: { page?: number; pageSize?: number; category?: string; q?: string }) {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.pageSize) query.set('pageSize', String(params.pageSize));
  if (params?.category) query.set('category', params.category);
  if (params?.q) query.set('q', params.q);
  const res = await request<any>(`/knowledge-base?${query.toString()}`);
  return res;
}

export async function addKnowledgeBase(data: {
  title: string;
  content: string;
  category?: string;
  source?: string;
  file_type?: string;
  file_path?: string;
  file_size?: number;
}) {
  const res = await request<any>('/knowledge-base', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res;
}

export async function deleteKnowledgeBase(id: string) {
  const res = await request<any>(`/knowledge-base/${id}`, { method: 'DELETE' });
  return res;
}

export async function searchKnowledgeBase(query: string, topK: number = 5) {
  const res = await request<any>('/knowledge-base/search', {
    method: 'POST',
    body: JSON.stringify({ query, topK }),
  });
  return res;
}

// ==================== Usage ====================
export async function getUsageStats(params?: { startDate?: string; endDate?: string }) {
  const query = new URLSearchParams();
  if (params?.startDate) query.set('startDate', params.startDate);
  if (params?.endDate) query.set('endDate', params.endDate);
  const res = await request<any>(`/usage?${query.toString()}`);
  return res;
}

export async function trackUsage(data: {
  conversation_count?: number;
  message_count?: number;
  input_tokens?: number;
  output_tokens?: number;
  duration_seconds?: number;
}) {
  const res = await request<any>('/usage/track', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res;
}

// ==================== Feedback ====================
export async function submitFeedback(data: { type: string; title?: string; content: string; contact?: string }) {
  const res = await request<any>('/feedback', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res;
}

export async function getFeedback(params?: { page?: number; pageSize?: number; status?: string }) {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', String(params.page));
  if (params?.pageSize) query.set('pageSize', String(params.pageSize));
  if (params?.status) query.set('status', params.status);
  const res = await request<any>(`/feedback?${query.toString()}`);
  return res;
}

export async function updateFeedbackStatus(id: string, data: { status: string; admin_reply?: string }) {
  const res = await request<any>(`/feedback/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
  return res;
}

// ==================== Admin ====================
export async function getAdminUsers() {
  const res = await request<any>('/admin/users');
  return res;
}

export async function updateUserSubscription(id: string, data: { subscription_days?: number; token_quota?: number; token_used?: number }) {
  const res = await request<any>(`/admin/users/${id}/subscription`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return res;
}

export async function resetUserTokenUsed(id: string) {
  const res = await request<any>(`/admin/users/${id}/reset-token-used`, {
    method: 'POST',
  });
  return res;
}

export async function preCreateUser(data: { phone: string; subscription_days?: number; token_quota?: number; role?: 'user' | 'admin' }) {
  const res = await request<any>('/admin/users/precreated', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res;
}

export async function trackTokenUsage(data: { prompt_tokens: number; completion_tokens: number }) {
  const res = await request<any>('/usage/track', {
    method: 'POST',
    body: JSON.stringify(data),
  });
  return res;
}

export async function getUsageMe() {
  const res = await request<any>('/usage/me');
  return res;
}

export async function updateUserRole(id: string, data: { role: 'user' | 'admin' }) {
  const res = await request<any>(`/admin/users/${id}/role`, {
    method: 'PATCH',
    body: JSON.stringify(data),
  });
  return res;
}
