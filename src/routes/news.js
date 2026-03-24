const express = require('express');
const router = express.Router();
const { query } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const upload = require('../middleware/upload');

// GET /api/news - public
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 9, search, featured } = req.query;
    const offset = (page - 1) * limit;
    const conditions = ['is_published = true'];
    const params = [];
    let idx = 1;

    if (search) {
      conditions.push(`(title ILIKE $${idx} OR excerpt ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }
    if (featured === 'true') { conditions.push('is_featured = true'); }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const total = parseInt((await query(`SELECT COUNT(*) FROM news ${where}`, params)).rows[0].count);
    const result = await query(`SELECT * FROM news ${where} ORDER BY published_at DESC, created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`, [...params, parseInt(limit), offset]);

    res.json({
      news: result.rows,
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/news/:slug
router.get('/:slug', async (req, res) => {
  try {
    const result = await query('SELECT * FROM news WHERE slug = $1 AND is_published = true', [req.params.slug]);
    if (!result.rows.length) return res.status(404).json({ error: 'Article not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ADMIN - GET all
router.get('/admin/all', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const total = parseInt((await query('SELECT COUNT(*) FROM news')).rows[0].count);
    const result = await query('SELECT * FROM news ORDER BY created_at DESC LIMIT $1 OFFSET $2', [parseInt(limit), offset]);
    res.json({ news: result.rows, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ADMIN - POST
router.post('/', authMiddleware, upload.fields([{ name: 'cover_image', maxCount: 1 }]), async (req, res) => {
  try {
    const { title, slug, excerpt, content, author, tags, region, is_featured, is_published } = req.body;
    let cover_image = null;
    if (req.files?.cover_image) {
      cover_image = `/uploads/news/${req.files.cover_image[0].filename}`;
    }

    const autoSlug = slug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const published_at = is_published === 'true' ? new Date() : null;

    const result = await query(`
      INSERT INTO news (title, slug, excerpt, content, cover_image, author, tags, region, is_featured, is_published, published_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *
    `, [title, autoSlug, excerpt, content, cover_image, author, tags ? tags.split(',').map(t => t.trim()) : [], region, is_featured === 'true', is_published === 'true', published_at]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Slug already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

// ADMIN - PUT
router.put('/:id', authMiddleware, upload.fields([{ name: 'cover_image', maxCount: 1 }]), async (req, res) => {
  try {
    const existing = await query('SELECT * FROM news WHERE id = $1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });

    const { title, slug, excerpt, content, author, tags, region, is_featured, is_published } = req.body;
    let cover_image = existing.rows[0].cover_image;
    if (req.files?.cover_image) {
      cover_image = `/uploads/news/${req.files.cover_image[0].filename}`;
    }

    const wasPublished = existing.rows[0].is_published;
    const nowPublished = is_published === 'true';
    const published_at = (!wasPublished && nowPublished) ? new Date() : existing.rows[0].published_at;

    const result = await query(`
      UPDATE news SET title=$1, slug=$2, excerpt=$3, content=$4, cover_image=$5, author=$6,
        tags=$7, region=$8, is_featured=$9, is_published=$10, published_at=$11, updated_at=NOW()
      WHERE id=$12 RETURNING *
    `, [title, slug, excerpt, content, cover_image, author, tags ? tags.split(',').map(t => t.trim()) : [], region, is_featured === 'true', nowPublished, published_at, req.params.id]);

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ADMIN - DELETE
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('DELETE FROM news WHERE id = $1 RETURNING *', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Article deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
