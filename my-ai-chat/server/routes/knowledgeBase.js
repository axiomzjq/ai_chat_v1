import { Router } from 'express';
import { db } from '../db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = Router();

// GET /api/knowledge-base - 获取知识库列表（所有用户可读）
router.get('/', async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, parseInt(req.query.pageSize) || 20);
    const category = req.query.category;
    const search = req.query.q;
    const offset = (page - 1) * pageSize;

    let whereClause = '';
    const params = [];
    let idx = 1;

    if (category) {
      whereClause += ` AND category = $${idx++}`;
      params.push(category);
    }
    if (search) {
      whereClause += ` AND (title ILIKE $${idx++} OR content ILIKE $${idx++})`;
      params.push(`%${search}%`, `%${search}%`);
    }

    const countResult = await db.query(
      `SELECT COUNT(*) FROM knowledge_base WHERE 1=1 ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    const queryParams = [...params, pageSize, offset];
    const result = await db.query(
      `SELECT id, title, category, source, file_type, created_at, updated_at
       FROM knowledge_base
       WHERE 1=1 ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      queryParams
    );

    res.json({
      code: 0,
      message: 'success',
      data: result.rows,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/knowledge-base - 添加知识库（仅管理员）
router.post('/', requireAdmin, async (req, res, next) => {
  try {
    const { title, content, category, source, file_type, file_path, file_size } = req.body;

    if (!title || !content) {
      return res.status(400).json({ code: 3001, message: '标题和内容不能为空', data: null });
    }

    const result = await db.query(
      `INSERT INTO knowledge_base (title, content, category, source, file_type, file_path, file_size, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [title, content, category, source, file_type, file_path, file_size, req.user.id]
    );

    res.status(201).json({ code: 0, message: 'success', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/knowledge-base/:id - 删除知识库（仅管理员）
router.delete('/:id', requireAdmin, async (req, res, next) => {
  try {
    const result = await db.query(
      'DELETE FROM knowledge_base WHERE id = $1 RETURNING *',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ code: 2001, message: '文档不存在', data: null });
    }
    res.json({ code: 0, message: '文档已删除', data: result.rows[0] });
  } catch (err) {
    next(err);
  }
});

// POST /api/knowledge-base/search - 语义搜索（RAG）
router.post('/search', async (req, res, next) => {
  try {
    const { query, topK = 5 } = req.body;

    if (!query) {
      return res.status(400).json({ code: 3001, message: '搜索词不能为空', data: null });
    }

    // TODO: 接入 Embedding API 将 query 转为向量
    // 当前使用全文搜索作为 fallback
    const result = await db.query(
      `SELECT id, title, content,
        ts_rank(to_tsvector('chinese', content), plainto_tsquery('chinese', $1)) as similarity
       FROM knowledge_base
       WHERE to_tsvector('chinese', content) @@ plainto_tsquery('chinese', $1)
       ORDER BY similarity DESC
       LIMIT $2`,
      [query, topK]
    );

    res.json({
      code: 0,
      message: 'success',
      data: result.rows.map(r => ({
        id: r.id,
        title: r.title,
        content: r.content.substring(0, 500),
        similarity: parseFloat(r.similarity),
      })),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
