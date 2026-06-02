import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

import { errorHandler } from './middleware/errorHandler.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rateLimit.js';

// Route imports
import authRoutes from './routes/auth.js';
import conversationRoutes from './routes/conversations.js';
import messageRoutes from './routes/messages.js';
import profileRoutes from './routes/profiles.js';
import knowledgeBaseRoutes from './routes/knowledgeBase.js';
import usageRoutes from './routes/usage.js';
import feedbackRoutes from './routes/feedback.js';
import adminRoutes from './routes/admin.js';
import aiRoutes from './routes/ai.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
const CORS_ORIGINS = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176'];

// 开发环境：如果 NODE_ENV 不是 production，额外允许所有 frp 域名（HTTP 内网穿透测试）
if (process.env.NODE_ENV !== 'production') {
  CORS_ORIGINS.push(/\.frp-air\.com$/);
}

app.use(cors({
  origin: CORS_ORIGINS,
  credentials: true,
}));
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'ai-chat-server', database: 'postgresql' });
});

// Public routes (if any)

// Protected routes
app.use('/api/auth', authRoutes);
app.use('/api/conversations', authMiddleware, rateLimitMiddleware('default'), conversationRoutes);
app.use('/api/conversations/:id/messages', authMiddleware, rateLimitMiddleware('message'), messageRoutes);
app.use('/api/user/profile', authMiddleware, rateLimitMiddleware('default'), profileRoutes);
app.use('/api/knowledge-base', authMiddleware, rateLimitMiddleware('upload'), knowledgeBaseRoutes);
app.use('/api/usage', authMiddleware, rateLimitMiddleware('default'), usageRoutes);
app.use('/api/feedback', authMiddleware, rateLimitMiddleware('default'), feedbackRoutes);
app.use('/api/admin', rateLimitMiddleware('default'), adminRoutes); // adminRoutes 内部已包含 authMiddleware + requireAdmin
app.use('/api/ai', authMiddleware, rateLimitMiddleware('message'), aiRoutes); // AI 代理路由（内部已包含 authMiddleware）

// Global error handler
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`AI Chat Server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
