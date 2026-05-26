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

// Route imports
import authRoutes from './routes/auth.js';
import conversationRoutes from './routes/conversations.js';
import messageRoutes from './routes/messages.js';
import profileRoutes from './routes/profiles.js';
import knowledgeBaseRoutes from './routes/knowledgeBase.js';
import usageRoutes from './routes/usage.js';
import feedbackRoutes from './routes/feedback.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:5176'],
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
app.use('/api/conversations', authMiddleware, conversationRoutes);
app.use('/api/conversations/:id/messages', authMiddleware, messageRoutes);
app.use('/api/user/profile', authMiddleware, profileRoutes);
app.use('/api/knowledge-base', authMiddleware, knowledgeBaseRoutes);
app.use('/api/usage', authMiddleware, usageRoutes);
app.use('/api/feedback', authMiddleware, feedbackRoutes);

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
