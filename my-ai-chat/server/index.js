import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

import { errorHandler } from './middleware/errorHandler.js';

// Route imports will go here
// import uploadRoutes from './routes/upload.js';
// import chatRoutes from './routes/chat.js';
// import knowledgeBaseRoutes from './routes/knowledgeBase.js';

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'rag-server' });
});

// Routes will be registered here
// app.use('/api/upload', uploadRoutes);
// app.use('/api/chat', chatRoutes);
// app.use('/api/kb', knowledgeBaseRoutes);

// Global error handler
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.listen(PORT, () => {
  console.log(`RAG Server running on http://localhost:${PORT}`);
});
